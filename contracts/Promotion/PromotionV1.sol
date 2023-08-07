// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SafeOwnable} from "../Abstract/SafeOwnable.sol";
import {ParameterError} from "../Error/Error.sol";

contract PromotionV1 is SafeOwnable {
    using SafeERC20 for IERC20;

    bytes32 private DOMAIN;
    enum OpenMethod {
        FCFS,
        LuckyDraw
    }
    enum ReceiveMethod {
        SAME,
        SEPARATE
    }

    uint256 private _id;
    struct Promotion {
        address publisher;
        string name_;
        string description_;
        string time_frame;
        string tasks;
        string conditions;
        Rewards rewards;
    }

    struct Rewards {
        OpenMethod open_method;
        ReceiveMethod receive_method;
        string chain_id;
        string chain_name;
        Prize20SAME prizes_erc20_same;
        Prize20SEPARATE prizes_erc20_separate;
    }
    struct Prize20SAME {
        address[] addr;
        uint256[] number;
    }
    struct Prize20SEPARATE {
        address[] addr;
        uint256[] min;
        uint256[] max;
    }
    mapping(uint256 => Promotion) public List;

    // ERC20 Prize Pool
    mapping(uint256 => mapping(address => uint256)) private _prizesPoolsErc20;

    // Event log
    event ReleasePromotion(address indexed user, uint256 id);
    event ClaimReward(address indexed user, uint256 id, ReceiveMethod receiveMethod, uint256 amount);

    modifier DataCheck() {
        _;
    }

    constructor(address[] memory owners, uint8 signRequired_) SafeOwnable(owners, signRequired_) {
        _id = 1;
        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, _this())
        );
    }

    function current() public view returns (uint256) {
        return _id;
    }

    function releasePromotion(Promotion memory promotion_, Prize20SAME memory prizes_) public {
        depositPrizesErc20(prizes_);
        promotion_.publisher = _msgSender();
        List[_id] = promotion_;
        emit ReleasePromotion(_msgSender(), _id);
        ++_id;
    }

    function getPromotion(uint256 id_) public view returns (Promotion memory) {
        return List[id_];
    }

    function _this() private view returns (address) {
        return address(this);
    }

    function depositPrizesErc20(Prize20SAME memory prize) private {
        // In the most reasonable case, verify that the amount of each currency stored is sufficient for the activity
        uint256 len = prize.addr.length;
        for (uint256 i = 0; i < len; ++i) {
            IERC20(prize.addr[i]).transferFrom(_msgSender(), _this(), prize.number[i]);
            injectionPool(_id, prize.addr[i], prize.number[i]);
        }
    }

    function injectionPool(
        uint256 id,
        address token,
        uint256 amount
    ) private {
        _prizesPoolsErc20[id][token] += amount;
    }

    function deductionPool(
        uint256 id,
        address token,
        uint256 amount
    ) private {
        _prizesPoolsErc20[id][token] -= amount;
    }

    function getRewardSameHash(
        uint256 id_,
        uint256 nonce_,
        address who
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("getRewardSame(uint256, uint256)"), id_, nonce_, who));
    }

    function getRewardSame(
        uint256 id_,
        uint256 nonce_,
        bytes[] memory signs
    ) external onlyMultipleOwnerIndependent(HashToSign(getRewardSameHash(id_, nonce_, _msgSender())), signs) {
        Rewards memory reward = getPromotion(id_).rewards;
        if (reward.receive_method != ReceiveMethod.SAME) revert ParameterError("not have the same type of prize");
        Prize20SAME memory list = reward.prizes_erc20_same;
        if (list.addr.length == 0) revert ParameterError("reward data is incorrect. Please contact the administrator");
        for (uint256 i = 0; i < list.addr.length; ++i) {
            if (_prizesPoolsErc20[id_][list.addr[i]] <= 0) revert ParameterError("reward has been claimed");
            IERC20 token = IERC20(list.addr[i]);
            token.transfer(_msgSender(), list.number[i]);
            deductionPool(id_, list.addr[i], list.number[i]);
            emit ClaimReward(_msgSender(), id_, ReceiveMethod.SAME, list.number[i]);
        }
    }

    function getRewardSeparateHash(
        uint256 id_,
        uint256[] calldata num_,
        uint256 nonce_,
        address who
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("getRewardSeparate(uint256, uint256[], uint256)"),
                    id_,
                    num_,
                    nonce_,
                    who
                )
            );
    }

    function getRewardSeparate(
        uint256 id_,
        uint256[] calldata num_,
        uint256 nonce_,
        bytes[] memory signs
    ) external onlyMultipleOwnerIndependent(HashToSign(getRewardSeparateHash(id_, num_, nonce_, _msgSender())), signs) {
        uint256 id = id_;
        Rewards memory reward = getPromotion(id).rewards;
        if (reward.receive_method != ReceiveMethod.SEPARATE) {
            revert ParameterError("not have the separate type of prize");
        }
        Prize20SEPARATE memory list = reward.prizes_erc20_separate;
        if (list.addr.length == 0) {
            revert ParameterError("reward data is incorrect. Please contact the administrator");
        }
        for (uint256 i = 0; i < list.addr.length; ++i) {
            uint256 remaining = _prizesPoolsErc20[id][list.addr[i]];
            uint256 num = num_[i];
            if (num < remaining) {
                if (num < list.min[i] || num > list.max[i]) revert ParameterError("reward amount does not match");
            } else {
                num = remaining;
            }
            IERC20 token = IERC20(list.addr[i]);
            token.transfer(_msgSender(), num);
            deductionPool(id, list.addr[i], num);
            emit ClaimReward(_msgSender(), id, ReceiveMethod.SEPARATE, num);
        }
    }
}
