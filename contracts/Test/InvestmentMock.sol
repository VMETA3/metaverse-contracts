// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract InvestmentMock {
    uint256 private interestWarehouse;
    uint256 private unreturnedInterest;

    // Cumulative upper limit of individual investment
    uint256 constant INDIVIDUAL_INVESTMENT_LIMIT = 50000 * 10**18;
    uint256 constant INTERVAL = 30 days;

    uint256 public activityStartTime;
    uint256 public activityEndTime;

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
    event Withdraw(address account, uint256 amount);

    constructor(
        address _interestToken,
        address _interestAddr,
        uint256 _activityStartTime,
        uint256 _activityEndTime
    ) {
        activityStartTime = _activityStartTime;
        activityEndTime = _activityEndTime;
    }

    function deposit(uint256 amount) public {
        _pushMapInvestor(amount);
        mapInvestor.inserted[msg.sender] = true;
        mapInvestor.keys.push(msg.sender);

        emit Deposit(msg.sender, amount);
    }

    function _pushMapInvestor(uint256 amount) internal {
        (uint8 level, uint8 times) = _calculation_level_and_times(amount);
        uint256 interest = _calculation_interest(amount, times);

        mapInvestor.values[msg.sender].push(InvestorInfo(amount, block.timestamp, times, level));
        unreturnedInterest += interest;
    }

    function _calculation_interest(uint256 amount, uint8 times) internal pure returns (uint256) {
        return (amount / 10) * times;
    }

    // Return `level` and `return times`
    function _calculation_level_and_times(uint256 amount) internal pure returns (uint8 level, uint8 times) {
        if (amount >= 100 * 10**18 && amount <= 999 * 10**18) {
            return (1, 12);
        } else if (amount >= 1000 * 10**18 && amount <= 9999 * 10**18) {
            return (2, 15);
        } else if (amount >= 10000 * 10**18 && amount <= 50000 * 10**18) {
            return (3, 18);
        } else {
            return (0, 0);
        }
    }

    function _calculation_times(uint8 level) internal pure returns (uint8) {
        if (level == 1) {
            return 12;
        } else if (level == 2) {
            return 15;
        } else if (level == 3) {
            return 18;
        } else {
            return 0;
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
}
