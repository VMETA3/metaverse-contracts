// contracts/advertise/Settlement.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/* Interface Imports */
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ISettlement} from "./ISettlement.sol";
import {Advertise} from "./Advertise.sol";

/* Library Imports */
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Prize} from "../Lib/Prize.sol";

/* Contract Imports */
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract Settlement is ISettlement, Ownable {
    using SafeERC20 for IERC20;

    Advertise public AD; // Advertise contract instance
    address public ERC20Reward; // ERC20 reward address

    // Struct to record the prize claim status for a given ticket ID
    struct PrizeClaimRecord {
        bool isLucky; // Indicates whether the ticket won the grand prize
        bool Universal; // Indicates whether the universal token has been claimed
        bool SurpriseToken; // Indicates whether the surprise token has been claimed
        bool SurpriseNFT; // Indicates whether the surprise NFT has been claimed
    }
    mapping(uint256 => PrizeClaimRecord) private _prize_claim_status; // Mapping of ticket ID to prize claim record

    constructor(address ad_address_) {
        AD = Advertise(ad_address_);
    }

    /**
     * @dev Modifier to check if the token is valid.
     * @param token The token to check.
     */
    modifier isToken(address token) {
        require((token == AD.getUniversalToken() || token == AD.getSurpriseToken()), "Settlement: invalid token");
        _;
    }

    /**
     * @dev Get the address of the universal token.
     * @return The address of the universal token.
     */
    function getUniversalToken() public view returns (address) {
        return AD.getUniversalToken();
    }

    /**
     * @dev Modifier to check if there are enough tokens.
     * @param token The token to check.
     * @param num The number of tokens to check.
     */
    modifier isEnough(address token, uint256 num) {
        uint256 total = 0;
        address universal_token = AD.getUniversalToken();
        address surprise_token = AD.getSurpriseToken();
        if (universal_token == token) {
            total += ((AD.total() + 1) * AD.getUniversalAmount());
        }
        if (surprise_token == token) {
            total += AD.getSurpriseAmount();
        }
        require(total == num, "Settlement: Not enough tokens");
        _;
    }

    /**
     * @dev Modifier to check if the Advertise contract has ended.
     */
    modifier isEnded() {
        require(AD.getEndTime() < block.timestamp, "Settlement: is not ended");
        require(AD.getSurpriseStatus(), "Settlement: the lucky man is not revealed");
        _;
    }

    bool internal locked;

    /**
     * @dev Modifier to prevent re-entrancy.
     */
    modifier noReentrant() {
        require(!locked, "Settlement: No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    /**
     * @dev Modifier to check if the ticket won the grand prize.
     * @param ticket_id The ID of the ticket to check.
     */
    modifier isLucky(uint256 ticket_id) {
        uint256 LuckyMan = AD.getSurpriseLuckyId();
        require(ticket_id == LuckyMan, "Settlement: this ticket did not win the grand prize");
        _;
    }

    /**
     * @dev Record the prize amount for a given ticket ID and update the prize claim status.
     * @param ticket_id The ID of the ticket to record the prize amount for.
     * @param is_lucky A boolean indicating whether the ticket is the grand prize winner.
     */
    function _recordPrizeAmount(uint256 ticket_id, bool is_lucky) private {
        _prize_claim_status[ticket_id].Universal = true;
        bool burn = true;
        if (is_lucky) {
            burn = false;
            _prize_claim_status[ticket_id].SurpriseToken = true;
            if (_prize_claim_status[ticket_id].SurpriseNFT) {
                burn = true;
            }
        }
        if (burn) {
            AD.burn(ticket_id);
        }
    }

    /**
     * @dev Record the prize NFT for a given ticket ID and update the prize claim status.
     * @param ticket_id The ID of the ticket to record the prize NFT for.
     */
    function _recordPrizeNFT(uint256 ticket_id) private {
        _prize_claim_status[ticket_id].SurpriseNFT = true;
        if (_prize_claim_status[ticket_id].SurpriseToken) {
            AD.burn(ticket_id);
        }
    }

    /**
     * @dev Get the prize amount and recipient for a given ticket ID and token.
     * @param ticket_id The ID of the ticket to get the prize for.
     * @param token The token to get the prize in.
     * @return _to The recipient of the prize.
     * @return amount The amount of the prize.
     */
    function _getPrize(uint256 ticket_id, address token) private view returns (address _to, uint256 amount) {
        _to = AD.ownerOf(ticket_id);
        amount = _getAmount(ticket_id, token);
    }

    /**
     * @dev Get the prize NFT and recipient for a given ticket ID.
     * @param ticket_id The ID of the ticket to get the prize NFT for.
     * @return _to The recipient of the prize NFT.
     * @return nft_token The address of the NFT token.
     * @return nft_id The ID of the NFT.
     */
    function _getPrizeNFT(uint256 ticket_id)
        private
        view
        returns (
            address _to,
            address nft_token,
            uint256 nft_id
        )
    {
        _to = AD.ownerOf(ticket_id);
        nft_token = AD.getSurpriseNftToken();
        nft_id = AD.getSurpriseNftId();
    }

    /**
     * @dev Get the amount of universal tokens for a given token.
     * @param token The token to get the universal amount for.
     * @return The amount of universal tokens.
     */
    function _getUniversalAmount(address token) private view returns (uint256) {
        if (AD.getUniversalToken() != token) return 0;
        return AD.getUniversalAmount();
    }

    /**
     * @dev Get the amount of surprise tokens and universal tokens for a given token.
     * @param token The token to get the amount for.
     * @return total The amount of surprise tokens and universal tokens.
     */
    function _getSurpriseAmount(address token) private view returns (uint256 total) {
        if (AD.getSurpriseToken() != token) return 0;
        total += AD.getSurpriseAmount();
        total += _getUniversalAmount(token);
        return total;
    }

    /**
     * @dev Get the amount of tokens for a given ticket ID and token.
     * @param ticket_id The ID of the ticket to get the amount for.
     * @param token The token to get the amount in.
     * @return amount The amount of tokens.
     */
    function _getAmount(uint256 ticket_id, address token) private view returns (uint256 amount) {
        amount = 0;
        if (ticket_id == AD.getSurpriseLuckyId()) {
            if (_prize_claim_status[ticket_id].SurpriseToken == false) amount = _getSurpriseAmount(token);
        } else {
            if (_prize_claim_status[ticket_id].Universal == false) amount = _getUniversalAmount(token);
        }
    }

    /**
     * @dev Transfer the prize tokens for a given ticket ID to the recipient, record the prize amount, and emit a Settlement event.
     * @param token The token to transfer the prize in.
     * @param ticket_id The ID of the ticket to transfer the prize for.
     */
    function settlementERC20(address token, uint256 ticket_id) external override noReentrant isEnded isToken(token) {
        (address _to, uint256 amount) = _getPrize(ticket_id, token);
        require(amount > 0, "Settlement: there are no assets to settle");
        IERC20(token).safeTransfer(_to, amount);
        _recordPrizeAmount(ticket_id, (ticket_id == AD.getSurpriseLuckyId()));
        emit Settlement(_to, token, amount);
    }

    /**
     * @dev Transfer the prize NFT for a given ticket ID to the recipient, record the prize NFT, and emit a Settlement event.
     * @param ticket_id The ID of the ticket to transfer the prize NFT for.
     */
    function settlementERC721(uint256 ticket_id) external override noReentrant isEnded isLucky(ticket_id) {
        require(_prize_claim_status[ticket_id].SurpriseNFT == false, "Settlement: there are no assets to settle");
        (address _to, address token, uint256 nft_id) = _getPrizeNFT(ticket_id);
        IERC721(token).safeTransferFrom(address(this), _to, nft_id);
        _recordPrizeNFT(ticket_id);
        emit Settlement(_to, token, nft_id);
    }
}
