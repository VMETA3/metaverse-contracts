// Lib/Prize.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

abstract contract Operators {
    using ECDSA for bytes32;

    address[] operators;

    constructor(address[] memory _operators) {
        require(_operators.length <= 5, "Too many operators");
        for (uint8 i = 0; i < _operators.length; i++) {
            operators[i] = _operators[i];
        }
    }

    function _checkSigs(
        bytes32 txhash,
        bytes[] memory sigs,
        uint8 numSigs
    ) private view returns (bool) {
        uint8 c = 0;
        //emit log_named_uint("sigs len", sigs.length);
        bool[] memory bops = new bool[](operators.length);
        for (uint8 i = 0; i < sigs.length; i++) {
            // emit log_named_bytes("txHash", txHash);
            if (!_findOpt(txhash.recover(sigs[i]), bops)) {
                return false;
            }
            c++;
        }
        //emit log_named_uint("c", c);
        if (c > numSigs) {
            return true;
        } else {
            return false;
        }
    }

    function _findOpt(address sigaddr, bool[] memory bops) private view returns (bool) {
        for (uint8 i = 0; i < operators.length; i++) {
            //emit log_named_address("operators", operators[i]);
            if (operators[i] != address(0x0)) {
                if (bops[i] == false) {
                    if (operators[i] == sigaddr) {
                        //emit log_named_address("find", operators[i]);
                        bops[i] = true;
                        //emit log("set true");
                        return true;
                    }
                }
            } else {
                break;
            }
        }
        return false;
    }
}
