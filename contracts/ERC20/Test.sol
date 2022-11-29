// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC20 is ERC20Burnable, Ownable {
    constructor() ERC20("TST", "Test Token") {
        _mint(msg.sender, 100000000000000000 * (10**18));
        _transferOwnership(msg.sender);
    }
}
