// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SafeOwnable} from "../Lib/SafeOwnable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract TestMultipleSigERC20 is SafeOwnable, ERC20Burnable {
    using ECDSA for bytes32;
    event AdjustTheUpperLimit(uint256 upperLimit);

    bytes32 public immutable DOMAIN;

    constructor(
        uint256 chainId,
        uint256 initialSupply,
        address mintAddr,
        address[] memory owners,
        uint8 signRequred
    ) ERC20("TestMultipleSigERC20", "TestMultipleSigERC20") SafeOwnable(owners, signRequred) {
        _mint(mintAddr, initialSupply * (10**18));

        DOMAIN = keccak256(
            abi.encode(
                keccak256("Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name())),
                chainId,
                address(this)
            )
        );
    }

    function getMintHash(
        address to,
        uint256 amount,
        uint256 nonce_
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("mint(address,uint256,uint256)"), to, amount, nonce_));
    }

    function mint(
        address to,
        uint256 amount,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(getMintHash(to, amount, nonce)), sigs) {
        _mint(to, amount);
    }

    function mint2(address to, uint256 amount)
        external
        onlyOperationPendding(_hashToSign(getMintHash(to, amount, nonce - 1)))
    {
        _mint(to, amount);
    }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }
}
