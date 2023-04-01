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

    Advertise public AD;
    address public ERC20Reward;

    struct PrizeClaimRecord {
        bool isLucky;
        bool Universal;
        bool SurpriseToken;
        bool SurpriseNFT;
    }
    mapping(uint256 => PrizeClaimRecord) private _prize_claim_status;

    constructor(address ad_address_) {
        AD = Advertise(ad_address_);
    }

    modifier isToken(address token) {
        require((token == AD.getUniversalToken() || token == AD.getSurpriseToken()), "Settlement: invalid token");
        _;
    }

    function getUniversalToken() public view returns (address) {
        return AD.getUniversalToken();
    }

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

    modifier isEnded() {
        require(AD.getEndTime() < AD.getCurrentTime(), "Settlement: is not ended");
        require(AD.getSurpriseStatus(), "Settlement: the lucky man is not revealed");
        _;
    }

    bool internal locked;
    modifier noReentrant() {
        require(!locked, "Settlement: No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier isLucky(uint256 ticket_id) {
        uint256 LuckyMan = AD.getSurpriseLuckyId();
        require(ticket_id == LuckyMan, "Settlement: this ticket did not win the grand prize");
        _;
    }

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

    function _recordPrizeNFT(uint256 ticket_id) private {
        _prize_claim_status[ticket_id].SurpriseNFT = true;
        if (_prize_claim_status[ticket_id].SurpriseToken) {
            AD.burn(ticket_id);
        }
    }

    function _getPrize(uint256 ticket_id, address token) private view returns (address _to, uint256 amount) {
        _to = AD.ownerOf(ticket_id);
        amount = _getAmount(ticket_id, token);
    }

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

    function _getUniversalAmount(address token) private view returns (uint256) {
        if (AD.getUniversalToken() != token) return 0;
        return AD.getUniversalAmount();
    }

    function _getSurpriseAmount(address token) private view returns (uint256 total) {
        if (AD.getSurpriseToken() != token) return 0;
        total += AD.getSurpriseAmount();
        total += _getUniversalAmount(token);
        return total;
    }

    function _getAmount(uint256 ticket_id, address token) private view returns (uint256 amount) {
        amount = 0;
        if (ticket_id == AD.getSurpriseLuckyId()) {
            if (_prize_claim_status[ticket_id].SurpriseToken == false) amount = _getSurpriseAmount(token);
        } else {
            if (_prize_claim_status[ticket_id].Universal == false) amount = _getUniversalAmount(token);
        }
    }

    function settlementERC20(address token, uint256 ticket_id) external override noReentrant isEnded isToken(token) {
        (address _to, uint256 amount) = _getPrize(ticket_id, token);
        require(amount > 0, "Settlement: there are no assets to settle");
        IERC20(token).safeTransfer(_to, amount);
        _recordPrizeAmount(ticket_id, (ticket_id == AD.getSurpriseLuckyId()));
        emit Settlement(_to, token, amount);
    }

    function settlementERC721(uint256 ticket_id) external override noReentrant isEnded isLucky(ticket_id) {
        require(_prize_claim_status[ticket_id].SurpriseNFT == false, "Settlement: there are no assets to settle");
        (address _to, address token, uint256 nft_id) = _getPrizeNFT(ticket_id);
        IERC721(token).safeTransferFrom(address(this), _to, nft_id);
        _recordPrizeNFT(ticket_id);
        emit Settlement(_to, token, nft_id);
    }
}
