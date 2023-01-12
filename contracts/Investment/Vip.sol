// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Time} from "../Lib/Time.sol";

contract Vip is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable {
    IERC20 public ERC20Token;
    address public spender;
    uint256 public activityStartTime;
    uint256 public activityEndTime;
    uint256 constant INTERVAL = 30 days;

    bytes32 public DOMAIN;

    // Control timestamp
    using Time for Time.Timestamp;
    Time.Timestamp private _timestamp;

    struct VipInfo {
        uint256 amount;
        uint256 startTime;
        uint8 level;
    }
    struct MapVip {
        address[] keys;
        mapping(address => VipInfo) values;
        mapping(address => bool) inserted;
    }
    MapVip private mapVip;

    struct Level {
        uint8 level;
        uint256 threshold;
        uint256 numberLimit;
        uint256 currentNumber;
    }
    Level[] private levelArray;

    struct LatestList {
        address addr;
        uint8 level;
    }

    event Deposit(address account, uint256 amount);

    function _authorizeUpgrade(address newImplementation) internal virtual override {}

    function initialize(address[] memory owners, uint8 signRequred) public initializer {
        __Ownable_init(owners, signRequred);
        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );
    }

    function deposit(uint256 amount) external {
        _deposit(msg.sender, amount);
    }

    function depositTo(address to, uint256 amount) external {
        _deposit(to, amount);
    }

    function _deposit(address to, uint256 amount) internal {
        uint256 time = _timestamp._getCurrentTime();
        require(time > activityStartTime, "Vip: The activity has not started");
        require(time < activityEndTime, "Vip: The activity has ended");

        uint256 levelIndex;
        if (mapVip.inserted[to]) {
            VipInfo memory info = mapVip.values[to];
            uint256 newAmount = info.amount + amount;
            require(time - info.startTime < INTERVAL, "Vip: Upgrade must be within 30 days");

            levelIndex = _handle(newAmount);
            require(levelIndex > _get_level_index(info.level), "Vip: level threshold not reached");

            info.amount = newAmount;
            info.level = levelArray[levelIndex].level;
            mapVip.values[to] = info;
        } else {
            levelIndex = _handle(amount);
            mapVip.values[to] = VipInfo(amount, time, levelArray[levelIndex].level);
            mapVip.inserted[to] = true;
            mapVip.keys.push(to);
        }
        ERC20Token.transferFrom(to, spender, amount);
        emit Deposit(to, amount);
    }

    function _handle(uint256 amount) internal returns (uint256 levelIndex) {
        levelIndex = _calculation_level_index(amount);
        Level memory currentLevel = levelArray[levelIndex];
        require(currentLevel.currentNumber < currentLevel.numberLimit, "Vip: exceed the number of people limit");
        levelArray[levelIndex].currentNumber += 1;
    }

    function _get_level_index(uint256 level) internal view returns (uint256 levelIndex) {
        for (uint8 i = 0; i < levelArray.length; ++i) {
            if (levelArray[i].level == level) {
                levelIndex = i;
                break;
            }
        }
    }

    function _calculation_level_index(uint256 amount) internal view returns (uint256 levelIndex) {
        uint256 lv1Index;
        uint256 lv2Index;
        uint256 lv3Index;
        for (uint8 i = 0; i < levelArray.length; ++i) {
            if (levelArray[i].level == 1) {
                lv1Index = i;
            }
            if (levelArray[i].level == 2) {
                lv2Index = i;
            }
            if (levelArray[i].level == 3) {
                lv3Index = i;
            }
        }

        if (amount >= levelArray[lv3Index].threshold) {
            return lv3Index;
        } else if (amount >= levelArray[lv2Index].threshold && amount < levelArray[lv3Index].threshold) {
            return lv2Index;
        } else if (amount >= levelArray[lv1Index].threshold && amount < levelArray[lv2Index].threshold) {
            return lv1Index;
        } else {
            require(false, "Vip: level threshold not reached");
        }
    }

    function getLatestList() external view returns (LatestList[] memory) {
        LatestList[] memory list = new LatestList[](mapVip.keys.length);
        for (uint256 i = 0; i < mapVip.keys.length; ++i) {
            address key = mapVip.keys[i];
            list[i] = LatestList(key, mapVip.values[key].level);
        }
        return list;
    }

    function getLevel(address target) external view returns (uint8 level) {
        return mapVip.values[target].level;
    }

    function setERC20(address token) public onlyOwner {
        ERC20Token = IERC20(token);
    }

    function setSpender(address spender_) public onlyOwner {
        spender = spender_;
    }

    function setActivityStartTime(uint256 time) external onlyOwner {
        activityStartTime = time;
    }

    function setActivityEndTime(uint256 time) external onlyOwner {
        activityEndTime = time;
    }

    function setCurrentTime(uint256 timestamp_) external onlyOwner {
        _timestamp._setCurrentTime(timestamp_);
    }

    function getCurrentTime() external view returns (uint256) {
        return _timestamp._getCurrentTime();
    }

    function setLevelArray(
        uint8 level,
        uint256 threshold,
        uint256 numberLimit,
        uint256 currentNumber
    ) external onlyOwner {
        _setLevelArray(level, threshold, numberLimit, currentNumber);
    }

    function setLevelArrayAll(
        uint8[] memory levels_,
        uint256[] memory thresholds_,
        uint256[] memory numberLimits_,
        uint256[] memory currentNumbers_
    ) external onlyOwner {
        uint256 len = levels_.length;
        require(
            (thresholds_.length == len && numberLimits_.length == len && currentNumbers_.length == len),
            "Vip: length of the data is different"
        );
        for (uint256 i = 0; i < len; ++i) {
            _setLevelArray(levels_[i], thresholds_[i], numberLimits_[i], currentNumbers_[i]);
        }
    }

    function _setLevelArray(
        uint8 level,
        uint256 threshold,
        uint256 numberLimit,
        uint256 currentNumber
    ) internal {
        levelArray.push(Level(level, threshold, numberLimit, currentNumber));
    }

    function cleanLevelArray(uint256 number) external onlyOwner {
        _cleanLevelArray(number);
    }

    function cleanLevelArrayAll() external onlyOwner {
        for (uint256 i = 0; i < levelArray.length; ++i) {
            levelArray.pop();
        }
    }

    function _cleanLevelArray(uint256 number) private {
        uint256 last = levelArray.length - 1;
        if (number != last) {
            for (uint256 i = number; i < last; ++i) {
                levelArray[i] = levelArray[i + 1];
            }
        }
        levelArray.pop();
    }

    function getLevelArray() external view returns (Level[] memory) {
        return levelArray;
    }
}
