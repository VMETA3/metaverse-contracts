// contracts/advertise/advertise.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/* Interface Imports */
import {IAdvertise} from "./IAdvertise.sol";

/* Library Imports */
import {Time} from "../Lib/Time.sol";
import {Prize} from "../Lib/Prize.sol";

/* Contract Imports */
import {ERC721Ticket} from "./ERC721Ticket.sol";

contract Advertise is IAdvertise, ERC721Ticket {
    // Control timestamp
    using Time for Time.Timestamp;
    Time.Timestamp private _timestamp;

    // Prizes for current ad
    using Prize for Prize.Universal;
    Prize.Universal private Universal;
    using Prize for Prize.Surprise;
    Prize.Surprise private Surprise;

    // Used to manage NFT transactions and settlements
    uint256 public starting_time;
    uint256 public end_time;
    uint256 public cap_per_person = 0; // Maximum amount of prizes held per account, 0 means no limit

    address private settlement;

    constructor(
        string memory name,
        string memory symbol,
        uint256 total
    ) ERC721Ticket(name, symbol, total) {}

    modifier isActive() {
        uint256 time = _timestamp._getCurrentTime();
        require((time >= starting_time && time <= end_time), "isActive: Not at the specified time");
        _;
    }

    modifier revealRewards() {
        uint256 time = _timestamp._getCurrentTime();
        require((time > end_time), "revealRewards: It's not time to reveal the rewards");
        _;
    }

    modifier onlySettlement() {
        require(msg.sender == settlement, "onlySettlement: Permission denied");
        _;
    }

    function setSettlement(address addr_) external onlyOwner {
        settlement = addr_;
    }

    function setTestTime(uint256 timestamp_) external override onlyOwner {
        _timestamp._setCurrentTime(timestamp_);
        emit SetTestTime(timestamp_);
    }

    function setAdTime(uint256 start_, uint256 end_) external override onlyOwner {
        require(start_ < end_, "invalid time");
        starting_time = start_;
        end_time = end_;
        emit SetAdTime(starting_time, end_time);
    }

    function setCapPerPerson(uint256 cap_per_person_) external override onlyOwner {
        cap_per_person = cap_per_person_;
        emit SetCapPerPerson(cap_per_person);
    }

    function setUniversal(address token, uint256 amount) external override onlyOwner {
        Universal._setUniversal(token, amount);
        emit SetUniversal(token, amount);
    }

    function setSurprise(
        address token,
        uint256 amount,
        address nft_token,
        uint256 nft_token_id
    ) external override onlyOwner {
        Surprise._setSurprise(token, amount, nft_token, nft_token_id);
        emit SetSurprise(token, amount, nft_token, nft_token_id);
    }

    function superLuckyMan(uint256 nft_token_id) external override onlyOwner {
        require(!Surprise.is_revealed, "cannot be repeated");
        Surprise._superLuckyMan(nft_token_id);
        emit SuperLuckyMan(nft_token_id);
    }

    // The transfer must be within the validity period
    function _transfer(
        address from,
        address to,
        uint256 ticket_id
    ) internal virtual override onlyOwner isActive {
        uint256 balance = super.balanceOf(to);
        if (cap_per_person > 0) {
            require(balance < cap_per_person, "Transfer:The account holding has reached the upper limit");
        }
        super._transfer(from, to, ticket_id);
    }

    function getCurrentTime() public view returns (uint256) {
        return _timestamp._getCurrentTime();
    }

    function getEndTime() public view returns (uint256) {
        return end_time;
    }

    function getUniversalToken() public view returns (address) {
        return Universal.universal_token();
    }

    function getUniversalAmount() public view returns (uint256) {
        return Universal.universal_amount();
    }

    function getSurpriseToken() public view returns (address) {
        return Surprise.surprise_token();
    }

    function getSurpriseAmount() public view returns (uint256) {
        return Surprise.surprise_amount();
    }

    function getSurpriseNftToken() public view returns (address) {
        return Surprise.surprise_nft_token();
    }

    function getSurpriseNftId() public view returns (uint256) {
        return Surprise.surprise_nft_id();
    }

    function getSurpriseLuckyId() public view returns (uint256) {
        return Surprise.surprise_surprise_id();
    }

    function getSurpriseStatus() public view returns (bool) {
        return Surprise.surprise_is_revealed();
    }

    function burn(uint256 token_id) public onlySettlement {
        super._burn(token_id);
    }
}
