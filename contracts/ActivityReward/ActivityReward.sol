// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {VRFConsumerBaseV2Upgradeable} from "../Chainlink/VRFConsumerBaseV2Upgradeable.sol";
import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";

contract ActivityReward is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable, VRFConsumerBaseV2Upgradeable {
    event GetReward(address account, uint256 amount);
    event WithdrawReleasedReward(address account, uint256 amount);
    event InjectReleaseReward(address account, uint256 amount);
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);

    IERC20 public ERC20Token;
    address private spender;
    bytes32 private DOMAIN;
    uint256 constant INTERVAL = 30 days;

    //chainlink configure
    uint64 public subscriptionId;
    VRFCoordinatorV2Interface COORDINATOR;
    bytes32 public keyHash;
    uint32 public callbackGasLimit;
    uint16 requestConfirmations;
    struct RequestStatus {
        address user;
        uint256 randomWord;
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
    }
    mapping(uint256 => RequestStatus) public requests; // requestId --> requestStatus

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

    struct FutureReleaseData {
        uint256 date;
        uint256 amount;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    bool internal locked;
    modifier lock() {
        require(!locked, "No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        address[] memory owners,
        uint8 signRequred,
        address vrfCoordinatorAddress_
    ) public initializer {
        __Ownable_init(owners, signRequred);

        __VRFConsumerBaseV2_init(vrfCoordinatorAddress_);
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorAddress_);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );
    }

    function setChainlink(
        uint32 callbackGasLimit_,
        uint64 subscribeId_,
        bytes32 keyHash_,
        uint16 requestConfirmations_
    ) external onlyOwner {
        callbackGasLimit = callbackGasLimit_;
        subscriptionId = subscribeId_;
        keyHash = keyHash_;
        requestConfirmations = requestConfirmations_;
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function getFreeReward(uint256 nonce_) external {
        _freeReward(_msgSender(), nonce_);
    }

    function getFreeRewardTo(address to, uint256 nonce_) external {
        _freeReward(to, nonce_);
    }

    function _freeReward(address to, uint256 nonce_)
        private
        onlyOperationPendding(HashToSign(getFreeRewardHash(to, nonce_)))
    {
        _rewardERC20(to, 5 * (10**17));
    }

    function getMultipleReward(uint256 nonce_) external {
        _multipleReward(_msgSender(), nonce_);
    }

    function getMultipleRewardTo(address to, uint256 nonce_) external {
        _multipleReward(to, nonce_);
    }

    function _multipleReward(address to, uint256 nonce_)
        private
        onlyOperationPendding(HashToSign(getMultipleRewardHash(to, nonce_)))
    {
        // ERC20Token.transferFrom(to, address(this), 5 * (10**16));
        _randomNumber(to, 1);
    }

    function _multiple(uint256 requestId) private {
        require(requests[requestId].randomWord > 0, "ActivityReward: The randomWords number cannot be 0");
        uint256 num = requests[requestId].randomWord % 11170;
        require(num > 0 && num <= 11170, "ActivityReward: The remainder algorithm is wrong");
        uint256 radix = 1 * (10**17);
        uint256 multiple = 0;
        if (num < 2000) {
            multiple = 2;
        } else if (num < 4500) {
            multiple = 5;
        } else if (num < 7500) {
            multiple = 8;
        } else if (num < 9300) {
            multiple = 10;
        } else if (num < 10300) {
            multiple = 15;
        } else if (num < 10800) {
            multiple = 20;
        } else if (num < 11000) {
            multiple = 40;
        } else if (num < 11100) {
            multiple = 100;
        } else {
            multiple = 150;
        }
        uint256 reward = radix * multiple;
        _rewardERC20(requests[requestId].user, reward);
    }

    function _rewardERC20(address to, uint256 reward) private lock {
        ERC20Token.transferFrom(spender, to, reward);
        emit GetReward(to, reward);
    }

    function checkReleased(address receiver) public view returns (uint256) {
        if (
            !release_reward.inserted[receiver] ||
            block.timestamp - release_reward.record[receiver].firstInjectTime <= INTERVAL
        ) {
            return 0;
        }

        uint256 result;
        FutureReleaseData[] memory data = _futureReleaseData(receiver);

        for (uint256 i = 0; i < data.length; ++i) {
            if (data[i].date > block.timestamp || data[i].date == 0) {
                break;
            }
            result += data[i].amount;
        }
        return result;
    }

    function _withdrawReleasedReward(address receiver) internal {
        uint256 amount = checkReleased(receiver);
        ERC20Token.transferFrom(spender, receiver, amount);
        release_reward.record[receiver].lastReleaseTime = block.timestamp;
        release_reward.record[receiver].pool -= amount;
        emit WithdrawReleasedReward(receiver, amount);
    }

    function withdrawReleasedReward() public {
        _withdrawReleasedReward(msg.sender);
    }

    function withdrawReleasedRewardTo(address to) public onlyOwner {
        _withdrawReleasedReward(to);
    }

    function injectionIncomeAndPool(address receiver, uint256 amount)
        public
        view
        returns (uint256 income, uint256 pool)
    {
        if (release_reward.inserted[receiver]) {
            amount = (release_reward.record[receiver].pool + amount);
        }

        income = amount / 20;
        if (income < 5 * 10**17) {
            income = 5 * 10**17;
        }

        if (amount - income < 0) {
            return (pool, 0);
        } else {
            pool = amount - income;
        }

        return (income, pool);
    }

    function injectReleaseReward(
        address receiver,
        uint256 amount,
        uint256 nonce
    ) public onlyOperationPendding(HashToSign(injectReleaseRewardHash(receiver, amount, nonce))) {
        (uint256 income, uint256 pool) = injectionIncomeAndPool(receiver, amount);

        if (pool < 5 * 10**17) {
            income = pool;
            pool = 0;
        } else if (income < 5 * 10**17) {
            income = 5 * 10**17;
        }

        ERC20Token.transferFrom(spender, receiver, income);
        emit WithdrawReleasedReward(receiver, income);

        if (release_reward.inserted[receiver]) {
            release_reward.record[receiver].pool = pool;
        } else {
            release_reward.record[receiver] = SlowlyReleaseReward(block.timestamp, block.timestamp, pool);
            release_reward.inserted[receiver] = true;
        }
        emit InjectReleaseReward(receiver, amount);
    }

    function HashToSign(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    function getFreeRewardHash(address to, uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("getFreeReward(address, uint256)"), to, nonce_));
    }

    function getMultipleRewardHash(address to, uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("getMultipleReward(address, uint256)"), to, nonce_));
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

    function _randomNumber(address user, uint32 numWords) private returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        requests[requestId] = RequestStatus({randomWord: uint256(0), exists: true, fulfilled: false, user: user});
        emit RequestSent(requestId, numWords);
        return requestId;
    }

    function fulfillRandomWords(uint256 requestId_, uint256[] memory randomWords_) internal override {
        require(requests[requestId_].exists, "ActivityReward: request not found");
        require(!requests[requestId_].fulfilled, "ActivityReward: request has been processed");
        requests[requestId_].randomWord = randomWords_[0];
        _multiple(requestId_);
        requests[requestId_].fulfilled = true;
        emit RequestFulfilled(requestId_, randomWords_);
    }

    function Spender() public view returns (address) {
        return spender;
    }

    function setSpender(address newSpender) external onlyOwner {
        spender = newSpender;
    }

    function setERC20(address token) public onlyOwner {
        ERC20Token = IERC20(token);
    }

    function releaseRewardRecord(address user) public view returns (SlowlyReleaseReward memory) {
        return release_reward.record[user];
    }

    function releaseRewardInserted(address user) public view returns (bool) {
        return release_reward.inserted[user];
    }

    function setReleaseRewardRecord(
        address user,
        uint256 firstInjectTime,
        uint256 lastReleaseTime,
        uint256 pool
    ) public onlyOwner {
        release_reward.record[user] = SlowlyReleaseReward(firstInjectTime, lastReleaseTime, pool);
    }

    function setReleaseRewardInserted(address user, bool isInserted) public onlyOwner {
        release_reward.inserted[user] = isInserted;
    }

    function releaseRewardInfo(address user) external view returns (uint256 firstInjectTime, uint256 pool) {
        return (release_reward.record[user].firstInjectTime, release_reward.record[user].pool);
    }

    function _futureReleaseData(address user) internal view returns (FutureReleaseData[] memory) {
        uint256 firstInjectTime = release_reward.record[user].firstInjectTime;
        uint256 lastReleaseTime = release_reward.record[user].lastReleaseTime;
        uint256 pool = release_reward.record[user].pool;

        uint8 index;
        FutureReleaseData[] memory result = new FutureReleaseData[](100);

        while (true) {
            firstInjectTime += INTERVAL;
            if (firstInjectTime <= lastReleaseTime) {
                continue;
            }

            if (pool < 2 * 10**18) {
                result[index] = FutureReleaseData(firstInjectTime, pool);
                break;
            }

            uint256 income = pool / 10;
            if (income < 2 * 10**18) {
                income = 2 * 10**18;
            }
            result[index] = FutureReleaseData(firstInjectTime, income);

            pool -= income;
            ++index;
        }

        return result;
    }

    function futureReleaseData(address user) external view returns (FutureReleaseData[] memory) {
        return _futureReleaseData(user);
    }
}
