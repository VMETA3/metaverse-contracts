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
     * @param is_universal A boolean indicating whether the prize is the universal token.
     */
    function _recordPrizeAmount(uint256 ticket_id, bool is_universal) private {
        bool burn = true;

        if (is_universal) {
            _prize_claim_status[ticket_id].Universal = true;
        } else {
            _prize_claim_status[ticket_id].SurpriseToken = true;
        }

        if (ticket_id == AD.getSurpriseLuckyId()) {
            burn = false;
            if (
                _prize_claim_status[ticket_id].Universal &&
                _prize_claim_status[ticket_id].SurpriseToken &&
                _prize_claim_status[ticket_id].SurpriseNFT
            ) {
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
     * @dev Settle an ERC20 prize for a given ticket ID.
     * @param ticket_id The ID of the ticket to settle the prize for.
     * @param token The address of the ERC20 token to settle.
     * @param amount The amount of the ERC20 token to settle.
     */
    function _settle(
        uint256 ticket_id,
        address token,
        uint256 amount
    ) private {
        require(amount > 0, "Settlement: there are no assets to settle");
        address _to = AD.ownerOf(ticket_id);
        IERC20(token).safeTransfer(_to, amount);
        emit Settlement(_to, token, amount);
    }

    /**
     * @dev Settle the universal token prize for a given ticket ID.
     * @param ticket_id The ID of the ticket to settle the prize for.
     */
    function _universalSettlement(uint256 ticket_id) private {
        require(_prize_claim_status[ticket_id].Universal == false, "Settlement: the prize has been claimed");
        _settle(ticket_id, AD.getUniversalToken(), AD.getUniversalAmount());
        _prize_claim_status[ticket_id].Universal = true;
    }

    /**
     * @dev Settle the surprise token prize for a given ticket ID.
     * @param ticket_id The ID of the ticket to settle the prize for.
     */
    function _surpriseSettlement(uint256 ticket_id) private {
        require(
            _prize_claim_status[ticket_id].SurpriseToken == false,
            "Settlement: the surprise prize has been claimed"
        );
        _settle(ticket_id, AD.getSurpriseToken(), AD.getSurpriseAmount());
        _prize_claim_status[ticket_id].SurpriseToken = true;
    }

    /**
     * @dev Settle the universal token prize for a given ticket ID and record the prize claim status.
     * @param ticket_id The ID of the ticket to settle the prize for.
     */
    function universalSettlementERC20(uint256 ticket_id) external override noReentrant isEnded {
        _universalSettlement(ticket_id);
        _recordPrizeAmount(ticket_id, true);
    }

    /**
     * @dev Settle the surprise token prize for a given ticket ID and record the prize claim status.
     * @param ticket_id The ID of the ticket to settle the prize for.
     */
    function luckySettlementERC20(uint256 ticket_id) external override noReentrant isEnded isLucky(ticket_id) {
        if (!_prize_claim_status[ticket_id].Universal) {
            _universalSettlement(ticket_id);
        }
        _surpriseSettlement(ticket_id);
        _recordPrizeAmount(ticket_id, false);
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
