// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract promotion {
    using SafeERC20 for IERC20;

    uint256 private _id;
    struct Promotion {
        address publisher;
        string name_;
        string description_;
        string time_frame;
        string tasks;
        string conditions;
        Rewords rewords;
    }

    struct Rewords {
        string open_method;
        string receive_method;
        string chain_id;
        string chain_name;
        string prizes_erc20;
        string prizes_erc721;
        string prizes_wlist;
        string prizes_wlist_str;
    }
    struct Prize20 {
        address addr;
        uint256 number;
    }
    struct Prize721 {
        address addr;
        string tokenURI;
    }
    struct WhiteList {
        address[] addrs;
    }
    struct WhiteListStr {
        string w_type;
        string[] addrs;
    }
    mapping(uint256 => Promotion) public List;

    // ERC20 Prize Pool
    mapping(uint256 => mapping(address => uint256)) private _prizesPoolsErc20;

    event ReleasePromotion(address indexed user, uint256 id);

    constructor() {
        _id = 1;
    }

    function current() public view returns (uint256) {
        return _id;
    }

    function releasePromotion(Promotion memory promotion_, Prize20[] memory prize20_) public {
        uint256 len = prize20_.length;
        uint256 id = current();
        if (len > 0) {
            for (uint256 i = 0; i < len; ++i) {
                Prize20 memory prize = prize20_[i];
                depositPrizesErc20(prize);
                injectionPool(id, prize.addr, prize.number);
            }
        }
        promotion_.publisher = _msgSender();
        List[id] = promotion_;
        emit ReleasePromotion(_msgSender(), id);
        ++_id;
    }

    function getPromotion(uint256 id_) public view returns (Promotion memory) {
        return List[id_];
    }

    function _msgSender() private view returns (address) {
        return msg.sender;
    }

    function _this() private view returns (address) {
        return address(this);
    }

    function depositPrizesErc20(Prize20 memory prize_) private {
        IERC20 token = IERC20(prize_.addr);
        token.transferFrom(_msgSender(), _this(), prize_.number);
    }

    function injectionPool(
        uint256 id,
        address token,
        uint256 amount
    ) private {
        _prizesPoolsErc20[id][token] += amount;
    }
}
