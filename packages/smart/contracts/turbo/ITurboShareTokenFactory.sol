pragma solidity 0.5.15;
pragma experimental ABIEncoderV2;

import "./ITurboShareToken.sol";


interface ITurboShareTokenFactory {
    function createShareTokens(bytes32[] calldata _names, string[] calldata _symbols) external returns (ITurboShareToken[] memory tokens);
}