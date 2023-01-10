// contracts/advertise/Settlement.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISettlement {
    /**********
     * Events *
     **********/
    event VM3Deposit(address indexed from, uint256 amount, bytes data);

    event ERC20Deposit(address indexed from, address token, uint256 amount);

    /********************
     * Public Functions *
     ********************/
    function depositVM3(bytes calldata data) external payable;

    function depositERC20(address token, uint256 amount) external;
}
