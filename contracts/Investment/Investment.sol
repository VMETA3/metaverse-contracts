// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Investment is Ownable {
    ERC20 interestToken;
    address interestAddr;
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
        interestToken = ERC20(_interestToken);
        interestAddr = _interestAddr;
        activityStartTime = _activityStartTime;
        activityEndTime = _activityEndTime;
    }

    function deposit(uint256 amount) public {
        require(
            block.timestamp > activityStartTime && block.timestamp < activityEndTime,
            "Investment: The activity has not started or has ended"
        );

        if (mapInvestor.inserted[msg.sender]) {
            uint256 len = mapInvestor.values[msg.sender].length;

            uint256 total;
            for (uint8 i = 0; i < len; i++) {
                total += mapInvestor.values[msg.sender][i].amount;
            }
            require(total + amount < INDIVIDUAL_INVESTMENT_LIMIT, "Investment: Exceeding investment limit (Inserted)");

            // Calculate the date before the last pledge, and increase the quantity within 30 days.
            // If it exceeds, it will be regarded as a new round of investment.
            if (len != 0 && block.timestamp - mapInvestor.values[msg.sender][len - 1].startTime < INTERVAL) {
                uint256 originalInterest = _calculation_interest(
                    mapInvestor.values[msg.sender][len - 1].amount,
                    mapInvestor.values[msg.sender][len - 1].residualTimes
                );

                uint256 newValue = mapInvestor.values[msg.sender][len - 1].amount + amount;
                (uint8 level, uint8 times) = _calculation_level_and_times(newValue);
                uint256 newInterest = _calculation_interest(newValue, times);

                require(
                    newInterest + unreturnedInterest < interestWarehouse,
                    "Investment: Insufficient interest warehouse (Inserted)"
                );

                interestToken.transferFrom(msg.sender, address(this), amount);

                mapInvestor.values[msg.sender][len - 1].amount = newValue;
                mapInvestor.values[msg.sender][len - 1].level = level;
                mapInvestor.values[msg.sender][len - 1].residualTimes = times;

                unreturnedInterest += (newInterest - originalInterest);
            } else {
                _pushMapInvestor(amount);
            }
        } else {
            _pushMapInvestor(amount);
            mapInvestor.inserted[msg.sender] = true;
            mapInvestor.keys.push(msg.sender);
        }

        emit Deposit(msg.sender, amount);
    }

    function _pushMapInvestor(uint256 amount) internal {
        require(amount < INDIVIDUAL_INVESTMENT_LIMIT, "Investment: Exceeding investment limit");

        (uint8 level, uint8 times) = _calculation_level_and_times(amount);
        uint256 interest = _calculation_interest(amount, times);

        require(interest + unreturnedInterest < interestWarehouse, "Investment: Insufficient interest warehouse");

        interestToken.transferFrom(msg.sender, address(this), amount);

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

    function _calculation_can_return_times() internal view returns (uint8[3] memory times, uint256 total) {
        for (uint8 i = 0; i < mapInvestor.values[msg.sender].length; i++) {
            // Less than 30 days, failing to meet the distribution conditions
            if (block.timestamp - mapInvestor.values[msg.sender][i].startTime <= INTERVAL) {
                break;
            }

            uint8 totalTimes = _calculation_times(mapInvestor.values[msg.sender][i].level);
            uint8 gotTimes = totalTimes - mapInvestor.values[msg.sender][i].residualTimes;
            uint256 shouldGetTimes = (block.timestamp - mapInvestor.values[msg.sender][i].startTime) / INTERVAL;

            if (shouldGetTimes - gotTimes > 0) {
                times[i] = uint8(shouldGetTimes - gotTimes);
                total += (shouldGetTimes - gotTimes) * (mapInvestor.values[msg.sender][i].amount / 10);
            }
        }
    }

    function canWithdraw() public view returns (uint256 total) {
        (, total) = _calculation_can_return_times();
    }

    function withdraw() public {
        (uint8[3] memory times, uint256 amount) = _calculation_can_return_times();
        if (amount != 0) {
            interestToken.transferFrom(interestAddr, msg.sender, amount);
            interestWarehouse -= amount;
            unreturnedInterest -= amount;
            for (uint8 i = 0; i < times.length; i++) {
                mapInvestor.values[msg.sender][i].residualTimes -= times[i];
            }
            emit Withdraw(msg.sender, amount);
        }
    }

    //After approval, call this function
    function updateInterestWarehouse() public onlyOwner {
        interestWarehouse = interestToken.allowance(interestAddr, address(this));
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
