// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SafeOwnable} from "../Abstract/SafeOwnable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract VM3 is SafeOwnable, ERC20Burnable {
    using ECDSA for bytes32;
    uint256 constant TotalAmount = 80000000000000000000000000;

    bytes32 public immutable DOMAIN;

    constructor(
        uint256 initialSupply,
        address mintAddr,
        address[] memory owners,
        uint8 signRequred
    ) ERC20("VMeta3", "VM3") SafeOwnable(owners, signRequred) {
        _mint(mintAddr, initialSupply * (10**18));
        DOMAIN = keccak256(
            abi.encode(
                keccak256("Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name())),
                block.chainid,
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

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    function mint(
        address to,
        uint256 amount,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(getMintHash(to, amount, nonce)), sigs) {
        _mint(to, amount);
    }

    function _mint(address account, uint256 amount) internal virtual override {
        require(amount + totalSupply() <= TotalAmount, "VMeta3: the total amount issued exceeded the TotalAmout");
        super._mint(account, amount);
    }
}
