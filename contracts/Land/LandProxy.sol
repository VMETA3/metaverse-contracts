// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract LandProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address admin,
        bytes memory _data
    ) payable TransparentUpgradeableProxy(_logic, admin, _data) {}
}
