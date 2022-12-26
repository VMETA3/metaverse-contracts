// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.9;

contract MockAggregatorV3 {
    struct Data {
        uint80 roundId;
        int256 answer;
        uint256 startAt;
        uint256 updatedAt;
        uint80 anseredInRound;
    }
    Data[] public dataList;

    uint8 internal _decimals;
    string internal _description;
    uint256 internal _version;

    constructor(
        uint8 decimals_,
        string memory description_,
        uint256 version_
    ) {
        _decimals = decimals_;
        _description = description_;
        _version = version_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function version() external view returns (uint256) {
        return _version;
    }

    function setRoundData(int256 answer) external {
        uint80 roundId = uint80(dataList.length);
        Data memory data = Data(roundId, answer, block.timestamp, block.timestamp, roundId);
        dataList.push(data);
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {}

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(dataList.length > 0);

        roundId = uint80(dataList.length - 1);
        Data memory data = dataList[roundId];

        return (roundId, data.answer, data.startAt, data.updatedAt, data.anseredInRound);
    }
}
