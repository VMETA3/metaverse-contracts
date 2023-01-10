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
    uint256 public lv1NumberLimit;
    uint256 public lv2NumberLimit;
    uint256 public lv3NumberLimit;
    uint256 public l1Threshold;
    uint256 public l2Threshold;
    uint256 public l3Threshold;
    uint256 public activityStartTime;
    uint256 public activityEndTime;
    uint256 constant INTERVAL = 30 days;

    bytes32 public DOMAIN;

    // Control timestamp
    using Time for Time.Timestamp;
    Time.Timestamp private _timestamp;

    struct InvestorInfo {
        uint256 amount;
        uint256 startTime;
        uint8 residualTimes;
        uint8 level;
    }

    struct MapInvestor {
        address[] keys;
        mapping(address => InvestorInfo[]) values;
        mapping(address => bool) inserted;
    }
    MapInvestor private mapInvestor;

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

    function deposit(uint256 amount) public {
        uint256 time = _timestamp._getCurrentTime();
        require(time > activityStartTime, "Vip: The activity has not started");
        require(time < activityEndTime, "Vip: The activity has ended");

        if (mapInvestor.inserted[msg.sender]) {
            uint256 len = mapInvestor.values[msg.sender].length;
            // Calculate the date before the last pledge, and increase the quantity within 30 days.
            // If it exceeds, it will be regarded as a new round of investment.
            if (len != 0 && time - mapInvestor.values[msg.sender][len - 1].startTime < INTERVAL) {
                (uint8 level, uint8 times) = _calculation_level_and_times(
                    mapInvestor.values[msg.sender][len - 1].amount + amount
                );
                mapInvestor.values[msg.sender][len - 1].amount += amount;
                mapInvestor.values[msg.sender][len - 1].level = level;
                mapInvestor.values[msg.sender][len - 1].residualTimes = times;
            } else {
                _pushMapInvestor(amount);
            }
        } else {
            _pushMapInvestor(amount);
            mapInvestor.inserted[msg.sender] = true;
            mapInvestor.keys.push(msg.sender);
        }

        ERC20Token.transferFrom(msg.sender, spender, amount);
        emit Deposit(msg.sender, amount);
    }

    function _pushMapInvestor(uint256 amount) internal {
        (uint8 level, uint8 times) = _calculation_level_and_times(amount);
        mapInvestor.values[msg.sender].push(InvestorInfo(amount, _timestamp._getCurrentTime(), times, level));
    }

    function _calculation_level_and_times(uint256 amount) internal pure returns (uint8 level, uint8 times) {
        if (amount >= 100 * 10**18 && amount < 1000 * 10**18) {
            return (1, 12);
        } else if (amount >= 1000 * 10**18 && amount < 10000 * 10**18) {
            return (2, 14);
        } else if (amount >= 10000 * 10**18) {
            return (3, 18);
        } else {
            return (0, 0);
        }
    }

    function getLatestList() external view returns (LatestList[] memory) {
        LatestList[] memory list = new LatestList[](mapInvestor.keys.length);
        for (uint256 i = 0; i < mapInvestor.keys.length; i++) {
            address key = mapInvestor.keys[i];
            list[i] = LatestList(key, mapInvestor.values[key][mapInvestor.values[key].length - 1].level);
        }
        return list;
    }

    function getLevel(uint8 index) external view returns (uint8 level) {
        if (mapInvestor.inserted[msg.sender] && index < mapInvestor.values[msg.sender].length) {
            level = mapInvestor.values[msg.sender][index].level;
        }
    }

    function setERC20(address token) public onlyOwner {
        ERC20Token = IERC20(token);
    }

    function setSpender(address spender_) public onlyOwner {
        spender = spender_;
    }

    function setLv1NumberLimit(uint256 number) external onlyOwner {
        lv1NumberLimit = number;
    }

    function setLv2NumberLimit(uint256 number) external onlyOwner {
        lv2NumberLimit = number;
    }

    function setLv3NumberLimit(uint256 number) external onlyOwner {
        lv3NumberLimit = number;
    }

    function setL1Threshold(uint256 amount) external onlyOwner {
        l1Threshold = amount;
    }

    function setL2Threshold(uint256 amount) external onlyOwner {
        l2Threshold = amount;
    }

    function setL3Threshold(uint256 amount) external onlyOwner {
        l3Threshold = amount;
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
}
