// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../PrivateSale/PrivateSale.sol";

contract MockPrivateSale is PrivateSale {
    uint64 public time;

    constructor(
        address[] memory owners,
        uint8 signRequired,
        address vm3,
        address usdt
    ) PrivateSale(owners, signRequired, vm3, usdt) {}

    function _blockTimestamp() internal view override returns (uint64) {
        return uint64(time);
    }

    function setTimestamp(uint64 time_) external {
        time = time_;
    }
}
