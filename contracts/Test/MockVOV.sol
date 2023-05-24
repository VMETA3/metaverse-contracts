// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../ERC20/VOV.sol";

contract MockVOV is VOV {
    uint64 public time;

    constructor(address admin, address minter) VOV(admin, minter) {}

    function _blockTimestamp() internal view override returns (uint64) {
        if (time == 0) {
            return uint64(block.timestamp);
        }

        return uint64(time);
    }

    function setTimestamp(uint64 time_) external {
        time = time_;
    }

    function increaseTimestamp(uint64 time_) external {
        time += time_;
    }
}
