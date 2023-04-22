// contracts/advertise/advertise.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/* Interface Imports */
import {IAdvertise} from "./IAdvertise.sol";

/* Library Imports */
import {Prize} from "../Lib/Prize.sol";

/* Contract Imports */
import {ERC721Ticket} from "./ERC721Ticket.sol";

contract Advertise is IAdvertise, ERC721Ticket {
    // Prizes for current ad
    using Prize for Prize.Universal;
    Prize.Universal private Universal; // Prize for universal token
    using Prize for Prize.Surprise;
    Prize.Surprise private Surprise; // Prize for surprise prize

    // Used to manage NFT transactions and settlements
    uint256 public starting_time; // Start time of the advertisement
    uint256 public end_time; // End time of the advertisement
    uint256 public cap_per_person = 0; // Maximum amount of prizes held per account, 0 means no limit

    address private settlement; // Address of the settlement contract

    constructor(
        string memory name,
        string memory symbol,
        uint256 total
    ) ERC721Ticket(name, symbol, total) {}

    /**
     * @dev Modifier to check if the current time is within the advertisement period
     */
    modifier isActive() {
        require(
            (block.timestamp >= starting_time && block.timestamp <= end_time),
            "isActive: Not at the specified time"
        );
        _;
    }

    /**
     * @dev Modifier to check if the current time is after the advertisement period
     */
    modifier revealRewards() {
        require((block.timestamp > end_time), "revealRewards: It's not time to reveal the rewards");
        _;
    }

    /**
     * @dev Modifier to restrict function access to the settlement contract only
     */
    modifier onlySettlement() {
        require(msg.sender == settlement, "onlySettlement: Permission denied");
        _;
    }

    /**
     * @dev Set the address of the settlement contract
     * @param addr_ The address of the settlement contract
     */
    function setSettlement(address addr_) external onlyOwner {
        settlement = addr_;
    }

    /**
     * @dev Set the start and end time of the advertisement
     * @param start_ The start time of the advertisement
     * @param end_ The end time of the advertisement
     */
    function setAdTime(uint256 start_, uint256 end_) external override onlyOwner {
        require(start_ < end_, "invalid time");
        starting_time = start_;
        end_time = end_;
        emit SetAdTime(starting_time, end_time);
    }

    /**
     * @dev Set the maximum amount of prizes held per account
     * @param cap_per_person_ The maximum amount of prizes held per account
     */
    function setCapPerPerson(uint256 cap_per_person_) external override onlyOwner {
        cap_per_person = cap_per_person_;
        emit SetCapPerPerson(cap_per_person);
    }

    /**
     * @dev Set the address and amount of the universal token
     * @param token The address of the universal token
     * @param amount The amount of the universal token
     */
    function setUniversal(address token, uint256 amount) external override onlyOwner {
        Universal._setUniversal(token, amount);
        emit SetUniversal(token, amount);
    }

    /**
     * @dev Set the address, amount, NFT token address, and NFT token ID of the surprise prize
     * @param token The address of the surprise prize token
     * @param amount The amount of the surprise prize token
     * @param nft_token The address of the NFT token
     * @param nft_token_id The ID of the NFT token
     */
    function setSurprise(
        address token,
        uint256 amount,
        address nft_token,
        uint256 nft_token_id
    ) external override onlyOwner {
        Surprise._setSurprise(token, amount, nft_token, nft_token_id);
        emit SetSurprise(token, amount, nft_token, nft_token_id);
    }

    /**
     * @dev Set the NFT token ID of the super lucky man
     * @param nft_token_id The ID of the NFT token
     */
    function superLuckyMan(uint256 nft_token_id) external override onlyOwner {
        require(!Surprise.is_revealed, "cannot be repeated");
        Surprise._superLuckyMan(nft_token_id);
        emit SuperLuckyMan(nft_token_id);
    }

    /**
     * @dev Transfer the ticket to the specified address
     * @param from The address of the sender
     * @param to The address of the receiver
     * @param ticket_id The ID of the ticket
     */
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

    /**
     * @dev Get the end time of the advertisement
     * @return The end time of the advertisement
     */
    function getEndTime() public view returns (uint256) {
        return end_time;
    }

    /**
     * @dev Get the address of the universal token
     * @return The address of the universal token
     */
    function getUniversalToken() public view returns (address) {
        return Universal.universal_token();
    }

    /**
     * @dev Get the amount of the universal token
     * @return The amount of the universal token
     */
    function getUniversalAmount() public view returns (uint256) {
        return Universal.universal_amount();
    }

    /**
     * @dev Get the address of the surprise prize token
     * @return The address of the surprise prize token
     */
    function getSurpriseToken() public view returns (address) {
        return Surprise.surprise_token();
    }

    /**
     * @dev Get the amount of the surprise prize token
     * @return The amount of the surprise prize token
     */
    function getSurpriseAmount() public view returns (uint256) {
        return Surprise.surprise_amount();
    }

    /**
     * @dev Get the address of the NFT token of the surprise prize
     * @return The address of the NFT token of the surprise prize
     */
    function getSurpriseNftToken() public view returns (address) {
        return Surprise.surprise_nft_token();
    }

    /**
     * @dev Get the ID of the NFT token of the surprise prize
     * @return The ID of the NFT token of the surprise prize
     */
    function getSurpriseNftId() public view returns (uint256) {
        return Surprise.surprise_nft_id();
    }

    /**
     * @dev Get the ID of the super lucky man
     * @return The ID of the super lucky man
     */
    function getSurpriseLuckyId() public view returns (uint256) {
        return Surprise.surprise_surprise_id();
    }

    /**
     * @dev Get the status of the surprise prize
     * @return The status of the surprise prize
     */
    function getSurpriseStatus() public view returns (bool) {
        return Surprise.surprise_is_revealed();
    }

    /**
     * @dev Burn the ticket with the specified ID
     * @param token_id The ID of the ticket
     */
    function burn(uint256 token_id) public onlySettlement {
        super._burn(token_id);
    }
}
