// contracts/advertise/Settlement.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISettlement {
    /**********
     * Events *
     **********/
    event Settlement(address indexed from, address token, uint256 amount);

    /********************
     * Public Functions *
     ********************/
    function universalSettlementERC20(uint256 ticket_id) external;

    function luckySettlementERC20(uint256 ticket_id) external;

    function settlementERC721(uint256 ticket_id) external;
}
