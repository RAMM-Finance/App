pragma solidity ^0.8.4;

import "./owned.sol";
import "./DS.sol"; 
import "./DSS.sol";
import "../ERC20/IERC20.sol";
import "../ERC20/SafeERC20.sol";
import "hardhat/console.sol";
import "./ILendingPool.sol";
import "./IController.sol";


//borrowers borrow and repay from this lendingpool 
contract LendingPool is ILendingPool, Owned {
    using SafeERC20 for IERC20;

    // addresses
    address private collateral_address; 
    address private creator_address; 
    address private timelock_address;
    IController private controller;
    DS private DScontract;
    DSS private DSScontract;


    // pool parameters
    uint256 pool_ceiling;
    uint256 bonus_rate;
    uint256 redemption_delay;
    uint256 minting_fee;
    uint256 redemption_fee;
    uint256 buyback_fee;
    uint256 recollat_fee;
    uint256 missing_decimals; 
    uint256 private constant PRICE_PRECISION = 1e6;
    uint256 total_borrowed_amount;
    uint256 accrued_interest;
    uint256 immutable MAX_LOANS = 1;
    uint256 immutable MAX_PROPOSALS = 1;
    uint256 immutable public proposal_fee = 1e10;

    // mint/redeem
    mapping (address => uint256) public redeemDSSBalances;
    mapping (address => uint256) public redeemCollateralBalances;
    uint256 public unclaimedPoolCollateral;
    uint256 public unclaimedPoolDSS;
    mapping (address => uint256) public lastRedeemed;

    // loan 
    mapping(address=>bool) public override is_borrower;
    mapping(address=>uint256) public override borrower_allowance; 
    mapping(address=>uint256) public override borrower_debt; 
    mapping(address=>LoanMetadata[]) public current_loan_data;
    mapping(address => uint256) public override num_loans;
    mapping(address => uint256) public override num_proposals;
    address[] public borrowers_array;

    modifier onlyByOwnGov() {
        require(msg.sender == timelock_address || msg.sender == owner, "Not owner or timelock");
        _;
    }

    modifier onlyController(){
        require(address(controller) == msg.sender, "is not controller"); 
        _;
    }

    modifier onlyBorrower(){
        require(is_borrower[msg.sender], "is not borrower"); 
        _;

    }

    modifier onlyVerified() {
        require(controller.verified(msg.sender), "sender not verified");
        _;
    }

    constructor (
        address _ds_address,
        address _dss_address,
        address _collateral_address,
        address _creator_address,
        address _timelock_address
    ) public Owned(_creator_address){
        require(
            (_ds_address != address(0))
            && (_dss_address != address(0))
            && (_collateral_address != address(0))
            && (_creator_address != address(0))
            && (_timelock_address != address(0))
        , "Zero address detected"); 

        DScontract = DS(_ds_address);
        DSScontract = DSS(_dss_address);
        collateral_address = _collateral_address; 
        creator_address = _creator_address;
        timelock_address = _timelock_address;
        missing_decimals = uint(0);
    }


    //Currently ds decimals is 6, same as USDC, so collateral amount should also be decimal 6
    function mintDS(uint256 collateral_amount, uint256 DS_out_min) external override {
        uint256 collateral_amount_d18 = collateral_amount * (10 ** missing_decimals);
      
        uint256 DS_amount_18 = collateral_amount_d18; //1to1
        DS_amount_18 = DS_amount_18 * (1e6 - minting_fee) / 1e6;  // (DS_amount_18.mul(uint(1e6).sub(minting_fee))).div(uint(1e6));
        require(DS_out_min <= DS_amount_18); 

        IERC20(collateral_address).safeTransferFrom(msg.sender, address(this), collateral_amount);
        //TransferHelper.safeTransferFrom(collateral_address, msg.sender, address(this), collateral_amount);
        DScontract.pool_mint(msg.sender, DS_amount_18);
        
    }

    function redeemDS(uint256 DS_amount, uint256 DSS_out_min, uint256 COLLATERAL_out_min) external override {
        uint256 dss_price = DScontract.dss_price();
        uint256 collateral_ratio = DScontract.get_collateral_ratio(); 
        uint256 DS_amount_18 = DS_amount * 10**missing_decimals;// DS_amount.mul(10**missing_decimals);

        uint256 DS_amount_post_fee = DS_amount * (1e6 - redemption_fee) / 1e6;// (DS_amount.mul(uint(1e6).sub(redemption_fee))).div(uint(1e6)); 
        uint256 dss_dollar_value = DS_amount_post_fee - (DS_amount_post_fee * collateral_ratio / PRICE_PRECISION); // DS_amount_post_fee.sub(DS_amount_post_fee.mul(collateral_ratio).div(PRICE_PRECISION)); 
        uint256 dss_amount = dss_dollar_value * PRICE_PRECISION / dss_price; // dss_dollar_value.mul(PRICE_PRECISION).div(dss_price); 

        uint256 DS_amount_precision = DS_amount_post_fee;
        uint256 collateral_dollar_value = DS_amount_precision * collateral_ratio / PRICE_PRECISION;// DS_amount_precision.mul(collateral_ratio).div(PRICE_PRECISION);
        uint256 collateral_amount = collateral_dollar_value;//.mul(10**missing_decimals); //for now assume collateral is stable 

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender] + collateral_amount; // redeemCollateralBalances[msg.sender].add(collateral_amount);
        unclaimedPoolCollateral = unclaimedPoolCollateral + collateral_amount; // unclaimedPoolCollateral.add(collateral_amount);

        redeemDSSBalances[msg.sender] = redeemDSSBalances[msg.sender] + dss_amount; // redeemDSSBalances[msg.sender].add(dss_amount);
        unclaimedPoolDSS = unclaimedPoolDSS + dss_amount; // unclaimedPoolDSS.add(dss_amount);

        lastRedeemed[msg.sender] = block.number; 
        DScontract.pool_burn(msg.sender, DS_amount_18);
        DSScontract.pool_mint(address(this), dss_amount); 
    }

    function collectRedemption(uint256 col_idx) external override returns (uint256 dss_amount, uint256 collateral_amount) {
        // require(redeemPaused[col_idx] == false, "Redeeming is paused");
        // require((lastRedeemed[msg.sender].add(redemption_delay)) <= block.number, "Too soon");
        bool sendDSS = false; 
        bool sendCollateral = false; 

        if (redeemDSSBalances[msg.sender]>0){
            dss_amount = redeemDSSBalances[msg.sender]; 
            redeemDSSBalances[msg.sender] = 0; 
            unclaimedPoolDSS = unclaimedPoolDSS - dss_amount; // unclaimedPoolDSS.sub(dss_amount); 
            sendDSS = true;
        }

        if (redeemCollateralBalances[msg.sender]>0){
            collateral_amount = redeemCollateralBalances[msg.sender]; 
            redeemCollateralBalances[msg.sender] = 0; 
            unclaimedPoolCollateral = unclaimedPoolCollateral - collateral_amount;// unclaimedPoolCollateral.sub(collateral_amount);
            sendCollateral = true;
        }

        if (sendDSS){
            //TransferHelper.safeTransfer(address(DSScontract), msg.sender, dss_amount);
            IERC20(address(DSScontract)).safeTransfer(msg.sender, dss_amount);
        }

        if (sendCollateral){
            //TransferHelper.safeTransfer(collateral_address, msg.sender, collateral_amount);
            IERC20(address(collateral_address)).safeTransfer(msg.sender, collateral_amount);
        }

    }

    function setPoolParameters(uint256 new_ceiling, uint256 new_bonus_rate, uint256 new_redemption_delay, uint256 new_mint_fee, uint256 new_redeem_fee, uint256 new_buyback_fee, uint256 new_recollat_fee) external override onlyByOwnGov {
        pool_ceiling = new_ceiling;
        bonus_rate = new_bonus_rate;
        redemption_delay = new_redemption_delay;
        minting_fee = new_mint_fee;
        redemption_fee = new_redeem_fee;
        buyback_fee = new_buyback_fee;
        recollat_fee = new_recollat_fee;

        //emit PoolParametersSet(new_ceiling, new_bonus_rate, new_redemption_delay, new_mint_fee, new_redeem_fee, new_buyback_fee, new_recollat_fee);
    }



    //Controller Functions

    function setController(address _controller) external override onlyByOwnGov{
        controller = IController(_controller); 
    }

    function controllerMintDS(uint256 amount) external override onlyController {
        DScontract.pool_mint(msg.sender, amount);

    }

    function controllerBurnDS(uint256 amount) external override onlyController {
        DScontract.pool_burn(msg.sender, amount);

    }

    //TODO external for now, but needs to be internal+called when borrower proposes
    function addValidator(address validator) external override {
        controller.addValidator(validator);
    }




    // loan functions
    function addProposal(
        string calldata _id,
        uint256 _principal,
        uint256 _duration,
        uint256 _totalDebt,
        string calldata _description
    ) external onlyVerified override {
        require(num_proposals[msg.sender] < MAX_PROPOSALS, "proposal limit reached");
        require(_principal >= 10**DScontract.decimals(), "Needs to be in decimal format"); 
        bytes32 hashed_id = keccak256(abi.encodePacked(_id));
        for (uint i = 0; i < num_proposals[msg.sender]; i++) {
            require(current_loan_data[msg.sender][i].id != hashed_id, "Loan ID must be unique");
        }

        num_proposals[msg.sender]++;

        current_loan_data[msg.sender].push(LoanMetadata({
            id: hashed_id,
            principal: _principal,
            totalDebt: _totalDebt,
            duration: _duration,
            amountRepaid: 0,
            description: _description,
            approved: false,
            repaymentDate: 0
        }));
        emit LoanProposal(msg.sender, _id);
    }

    function removeProposal(string calldata id) onlyVerified external override returns (bool) {
        return _removeProposal(msg.sender, keccak256(abi.encodePacked(id)));
    }

    function removeProposal(address recipient, string calldata id) onlyByOwnGov external override returns (bool) {
        return _removeProposal(recipient, keccak256(abi.encodePacked(id)));
    }

    function _removeProposal(address recipient, bytes32 id) internal returns (bool) {
        for (uint i = 0; i < num_proposals[recipient]; i++) {
            if (id == current_loan_data[recipient][i].id){
                emit LoanProposalRemoval(recipient, current_loan_data[recipient][i]);
                _removeLoan(recipient, i);
                num_proposals[recipient]--;
                return true;
            }
        }
        return false;
    }

    function _removeLoan(address addr, uint i) private {
        require(i < current_loan_data[addr].length, "invalid array index");
        uint256 terminal_index = current_loan_data[addr].length - 1;
        current_loan_data[addr][i] = current_loan_data[addr][terminal_index];
        current_loan_data[addr].pop();
    }

    function retrieveLoan(address borrower, string calldata id) public view override returns (LoanMetadata memory) {
        bytes32 hashed_id = keccak256(abi.encodePacked(id));
        for (uint i = 0; i < current_loan_data[borrower].length; i++) {
            if (hashed_id == current_loan_data[borrower][i].id) {
                return current_loan_data[borrower][i];
            }
        }
        revert("loan not found");
    }

    function isApproved(address borrower, uint256 idx) public view returns(bool){
        LoanMetadata memory loan = current_loan_data[borrower][idx]; 
        return loan.approved; 
    }

    // called by controller
    function approveLoan(address recipient, string calldata id) onlyController public override returns (bool) {
        require(num_loans[recipient] < MAX_LOANS, "max number of loans reached");
        bytes32 hashed_id = keccak256(abi.encodePacked(id));
        for (uint i = 0; i < current_loan_data[recipient].length; i++) {
            if (hashed_id == current_loan_data[recipient][i].id) {
                require(!current_loan_data[recipient][i].approved, "loan already approved");
                LoanMetadata storage loan = current_loan_data[recipient][i];
                emit LoanApproval(recipient, current_loan_data[recipient][i]);
                loan.approved = true;
                loan.repaymentDate = block.timestamp + loan.duration;
                
                if (!is_borrower[recipient]) {
                    is_borrower[recipient] = true;
                    borrowers_array.push(recipient);
                }
                
                num_loans[recipient]++;
                num_proposals[recipient]--;
                borrower_allowance[recipient] += loan.principal;
                borrower_debt[recipient] += loan.principal;
                return true;
            }
        }
        return false; 
    }

    function removeBorrower(address borrower) private {
        uint length = borrowers_array.length;
        for (uint i = 0; i < length; i++) {
            if (borrower == borrowers_array[i]) {
                borrowers_array[i] = borrowers_array[length - 1];
                borrowers_array.pop();
            }
        }
    }


    function borrow(uint256 amount) external onlyBorrower onlyVerified override {
        require(amount <= borrower_allowance[msg.sender], "Exceeds borrow allowance");
        require(amount > 0, "amount must be greater than 0");
        
        borrower_allowance[msg.sender] = borrower_allowance[msg.sender] - amount;

        IERC20(collateral_address).safeTransfer(msg.sender, amount);
        borrower_debt[msg.sender] = borrower_debt[msg.sender] + amount;
        total_borrowed_amount = total_borrowed_amount + amount;
        emit FundsBorrowed(msg.sender, amount);
    }

    function repay(uint256 repay_principal, uint256 repay_interest, string calldata loan_id) external onlyBorrower override returns (bool) {
        uint256 total_repayment = repay_principal + repay_interest;
        bytes32 hashed_id = keccak256(abi.encodePacked(loan_id));
        for (uint i = 0; i< current_loan_data[msg.sender].length; i++) {
            if (hashed_id == current_loan_data[msg.sender][i].id) {
                LoanMetadata storage loan = current_loan_data[msg.sender][i];
                require(loan.amountRepaid + total_repayment <= loan.principal, "overpaid for specified loan");
                require(loan.repaymentDate > block.timestamp, "Loan has already reached maturity");

                loan.amountRepaid += total_repayment;
                borrower_debt[msg.sender] = borrower_debt[msg.sender] - repay_principal;
                accrued_interest += repay_interest;
                console.log('total_borrowed_amount', total_borrowed_amount);
                total_borrowed_amount = total_borrowed_amount - repay_principal;

                //TransferHelper.safeTransferFrom(collateral_address, msg.sender, address(this), total_repayment); 
                IERC20(collateral_address).safeTransferFrom(msg.sender, address(this), total_repayment);

                if (loan.amountRepaid == loan.totalDebt) {
                    emit FullRepayment(msg.sender, loan);
                    
                    controller.resolveMarket(msg.sender, hashed_id, false);
                    
                    num_loans[msg.sender]--;
                    
                    _removeLoan(msg.sender, i);
                    
                    if (num_loans[msg.sender] == 0) {
                        is_borrower[msg.sender] = false;
                        removeBorrower(msg.sender);
                    }
                }
                return true;
            }
        }
        return false;
    }

    // restrictions on acccess?
    function fullDefaultCheck() public override {
        for (uint i = 0; i < borrowers_array.length; i++) {
            address borrower = borrowers_array[i];
            LoanMetadata[] storage loans = current_loan_data[borrower];
            uint length = loans.length;
            for (uint j = 0; j < length; j++) {
                checkDefault(borrower, j);
            }
        }   
    }

    function checkDefault(address recipient, uint256 index) public {
        LoanMetadata storage loan = current_loan_data[recipient][index];

        if (loan.repaymentDate < block.timestamp && loan.amountRepaid < loan.totalDebt) {
            emit Default(recipient, loan);
            
            controller.resolveMarket(recipient, loan.id, true);

            num_loans[recipient]--;

            _removeLoan(msg.sender, index);
            
            if (num_loans[msg.sender] == 0) {
                is_borrower[msg.sender] = false;
            
                removeBorrower(msg.sender);
            }
            
            // default logic handler => resolve cds market (loan id => marketID)
        }
    }

    // restrictions on access?
    function addressCheckDefault(address recipient) public override {
        for (uint i = 0; i < current_loan_data[recipient].length; i++) {
            checkDefault(recipient, i);
        }
    }

    function getBorrowerLoanData(address recipient) public view override returns(LoanMetadata memory){
        uint256 id = 0; //get first loandata
        return current_loan_data[recipient][id];

        }

    function getLoanData() public view override returns(LoanData memory){
        LoanData memory loandata = LoanData({
            _total_borrowed_amount: total_borrowed_amount, 
            _accrued_interest : accrued_interest
            });
        return loandata;
    }

    event LoanProposal(address indexed recipient, string loan_id);
    event LoanApproval(address indexed recipient, LoanMetadata loan);
    event FullRepayment(address indexed recipient, LoanMetadata loan);
    event Default(address indexed defaultor, LoanMetadata loan);
    event LoanProposalRemoval(address indexed recipient, LoanMetadata loan);
    event FundsBorrowed(address indexed recipient, uint256 amount);
}