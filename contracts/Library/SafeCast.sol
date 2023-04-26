// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
    /// @notice Cast a uint256 to a int256, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type int256
    function toInt256(uint256 y) internal pure returns (int256 z) {
        require(y < 2**255);
        z = int256(y);
    }

    /// @notice Cast a uint256 to a uint64, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type uint64
    function toUint64(uint256 y) internal pure returns (uint64 z) {
        require(y < 2**64);
        z = uint64(y);
    }
}
