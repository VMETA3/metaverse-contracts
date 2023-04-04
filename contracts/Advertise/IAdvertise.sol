// contracts/advertise/advertise.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAdvertise {
    /**********
     * Events *
     **********/
    event SetTestTime(uint256 _timestamp);

    event SetAdTime(uint256 _starting_time, uint256 _end_time);

    event SetCapPerPerson(uint256 _cap_per_person);

    event SetUniversal(address token, uint256 amount);

    event SetSurprise(address token, uint256 amount, address nft_token, uint256 nft_token_id);

    event SuperLuckyMan(uint256 nft_token_id);

    /********************
     * Public Functions *
     ********************/
    function setAdTime(uint256 start_, uint256 end_) external;

    function setCapPerPerson(uint256 cap_per_person_) external;

    function setUniversal(address token, uint256 amount) external;

    function setSurprise(
        address token,
        uint256 amount,
        address nft_token,
        uint256 nft_token_id
    ) external;

    function superLuckyMan(uint256 nft_token_id) external;
}
