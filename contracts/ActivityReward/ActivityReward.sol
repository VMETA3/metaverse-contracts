// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";
import "hardhat/console.sol";

contract ActivityReward is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable {
    IERC20 public VM3;
    address public spender;
    bytes32 private DOMAIN;
    string constant name = "ActivityReward";
    uint256 constant INTERVAL = 30 days;

    struct SlowlyReleaseReward {
        uint256 firstInjectTime;
        uint256 lastReleaseTime;
        uint256 pool;
    }

    struct ReleaseReward {
        mapping(address => SlowlyReleaseReward) record;
        mapping(address => bool) inserted;
    }
    ReleaseReward private release_reward;

    event GetReward(address account, uint256 amount);
    event WithdrawReleasedReward(address account, uint256 amount);
    event InjectReleaseReward(address account, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        address vm3_,
        address spender_,
        uint256 chainId,
        address[] memory owners,
        uint8 signRequred
    ) public initializer {
        VM3 = IERC20(vm3_);
        spender = spender_;

        __Ownable_init(owners, signRequred);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(
                keccak256("Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                chainId,
                address(this)
            )
        );
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function getFreeReward(uint256 nonce) external onlyOperationPendding(_hashToSign(getFreeRewardHash(nonce))) {
        VM3.transferFrom(spender, msg.sender, 5 * 10**17);
        emit GetReward(msg.sender, 5 * 10**17);
    }

    function getMultipleReward(uint256 nonce)
        external
        onlyOperationPendding(_hashToSign(getMultipleRewardHash(nonce)))
    {
        VM3.transferFrom(msg.sender, spender, 5 * 10**16);

        //TODO: Get random numbers
        uint256 reward = 6 * 10**17;

        VM3.transferFrom(spender, msg.sender, reward);
        emit GetReward(msg.sender, reward);
    }

    function checkReleased() public view returns (uint256) {
        if (
            !release_reward.inserted[msg.sender] ||
            block.timestamp - release_reward.record[msg.sender].firstInjectTime <= INTERVAL
        ) {
            return 0;
        }

        uint8 times = uint8((block.timestamp - release_reward.record[msg.sender].lastReleaseTime) / INTERVAL);
        if (release_reward.record[msg.sender].pool < 5) {
            return release_reward.record[msg.sender].pool;
        }

        uint256 temp = 0;
        for (uint8 i = 0; i < times; i++) {
            if (release_reward.record[msg.sender].pool <= temp) {
                break;
            }
            uint256 income = (release_reward.record[msg.sender].pool - temp) / 10;
            if (income < 5 * 10**18) {
                income = 5 * 10**18;
            }
            temp += income;
        }

        if (temp > release_reward.record[msg.sender].pool) {
            return release_reward.record[msg.sender].pool;
        } else {
            return temp;
        }
    }

    function withdrawReleasedReward() public {
        uint256 amount = checkReleased();
        VM3.transferFrom(spender, msg.sender, amount);
        release_reward.record[msg.sender].lastReleaseTime = block.timestamp;
        release_reward.record[msg.sender].pool -= amount;
        emit WithdrawReleasedReward(msg.sender, amount);
    }

    function injectReleaseReward(
        address receiver,
        uint256 amount,
        bytes[] memory sigs,
        uint256 nonce_
    ) public onlyMultipleOwner(_hashToSign(injectReleaseRewardHash(receiver, amount, nonce_)), sigs) {
        if (release_reward.inserted[receiver]) {
            uint256 income = (release_reward.record[receiver].pool + amount) / 20;
            VM3.transferFrom(spender, receiver, income);
            emit WithdrawReleasedReward(receiver, income);

            release_reward.record[receiver].pool += (amount - income);
        } else {
            uint256 income = amount / 20;
            VM3.transferFrom(spender, receiver, income);
            emit WithdrawReleasedReward(receiver, income);

            release_reward.record[receiver] = SlowlyReleaseReward(block.timestamp, 0, (amount - income));
            release_reward.inserted[receiver] = true;
        }
        emit InjectReleaseReward(receiver, amount);
    }

    // function withdraw(
    //     uint256 amount,
    //     bytes[] memory sigs,
    //     uint256 nonce_
    // ) public onlyMultipleOwner(_hashToSign(withdrawHash(amount, nonce_)), sigs) {
    //     VM3.transferFrom(spender, msg.sender, amount);
    // }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    function getFreeRewardHash(uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("getFreeReward(uint256)"), nonce_));
    }

    function getFreeRewardHashToSign(uint256 nonce_) public view returns (bytes32) {
        return _hashToSign(getFreeRewardHash(nonce_));
    }

    function getMultipleRewardHash(uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("getMultipleReward(uint256)"), nonce_));
    }

    function getMultipleRewardHashToSign(uint256 nonce_) public view returns (bytes32) {
        return _hashToSign(getMultipleRewardHash(nonce_));
    }

    function injectReleaseRewardHash(
        address receiver,
        uint256 amount,
        uint256 nonce_
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("injectReleaseReward(address,uint256,uint256)"),
                    receiver,
                    amount,
                    nonce_
                )
            );
    }

    function withdrawHash(uint256 amount, uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("withdraw(uint256,uint256)"), amount, nonce_));
    }
}
