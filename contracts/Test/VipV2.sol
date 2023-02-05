// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../Investment/Vip.sol";

contract VipV2 is Vip {

   ///@dev returns the contract version
   function vipVersion() external pure returns (uint256) {
       return 2;
   }
}