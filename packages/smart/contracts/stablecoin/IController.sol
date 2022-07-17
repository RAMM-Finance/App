pragma solidity ^0.8.4;


//controller contract responsible for providing initial liquidity to the
//borrower cds market, collect winnings when default, and burn the corresponding DS
interface IController  {
    
    function addPool(address pool_address) external;

    function addValidator(address validator_address) external;

    function initiateMarket(address ammFactoryAddress,
             address marketFactoryAddress, uint256 liquidityAmountUSD,
             string calldata description, string[] calldata names, 
             uint256[] calldata odds) external ;


    function resolveMarket(address ammFactoryAddress, address marketFactoryAddress, uint256 marketID, bool isDefault) external;
    function verified(address _addr) external returns (bool);

}