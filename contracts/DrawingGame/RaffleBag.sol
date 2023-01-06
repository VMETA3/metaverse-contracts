// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../Chainlink/VRFConsumerBaseV2Upgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Time} from "../Lib/Time.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";

contract RaffleBag is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable, VRFConsumerBaseV2Upgradeable {
    // Control timestamp
    using Time for Time.Timestamp;
    Time.Timestamp private _timestamp;

    address private spender;
    IERC20 public VM3;
    IERC721 public BCard;
    IERC721 public CCard;
    bytes32 public DOMAIN;

    uint256 public totalNumberOfBCard;
    uint256 public totalNumberOfCCard;

    enum PrizeKind {
        BCard,
        CCard,
        DCard,
        VM3
    }
    struct Prize {
        PrizeKind prizeKind;
        uint256 amount;
        uint256 weight;
    }
    Prize[] private prizePool;

    struct WinPrize {
        PrizeKind prizeKind;
        uint256 amount;
        uint256 tokenId; // Only used for Cards
    }
    mapping(address => WinPrize[]) private winRecord;

    bool internal locked;
    modifier lock() {
        require(!locked, "No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    //chainlink configure
    uint64 public subscriptionId;
    VRFCoordinatorV2Interface COORDINATOR;
    bytes32 public keyHash;
    uint32 public callbackGasLimit;
    uint16 requestConfirmations;
    struct RequestStatus {
        address user;
        uint256 randomWord;
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
    }
    mapping(uint256 => RequestStatus) public requests; // requestId --> requestStatus

    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
    event Draw(address to, PrizeKind prizeKind, uint256 amount);
    event WithdrawWin(address to, PrizeKind prizeKind, uint256 amount);

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function initialize(
        address spender_,
        address vm3_,
        address bCard_,
        address cCard_,
        address[] memory owners,
        uint8 signRequred,
        address vrfCoordinatorAddress_
    ) public initializer {
        spender = spender_;
        VM3 = IERC20(vm3_);
        BCard = IERC721(bCard_);
        CCard = IERC721(cCard_);

        initPrizePool();

        __Ownable_init(owners, signRequred);

        __VRFConsumerBaseV2_init(vrfCoordinatorAddress_);
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorAddress_);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );
    }

    function initPrizePool() private {
        totalNumberOfBCard = 6;
        totalNumberOfCCard = 15;
        prizePool.push(Prize(PrizeKind.BCard, 1, 4));
        prizePool.push(Prize(PrizeKind.CCard, 1, 8));
        prizePool.push(Prize(PrizeKind.DCard, 1, 400));
        prizePool.push(Prize(PrizeKind.VM3, 8 * 10**17, 6000));
        prizePool.push(Prize(PrizeKind.VM3, 6 * 10**17, 12000));
        prizePool.push(Prize(PrizeKind.VM3, 3 * 10**17, 18000));
        prizePool.push(Prize(PrizeKind.VM3, 2 * 10**17, 30000));
    }

    function getPrizePool() external view returns (Prize[] memory) {
        return prizePool;
    }

    function setChainlink(
        uint32 callbackGasLimit_,
        uint64 subscribeId_,
        bytes32 keyHash_,
        uint16 requestConfirmations_
    ) public onlyOwner {
        callbackGasLimit = callbackGasLimit_;
        subscriptionId = subscribeId_;
        keyHash = keyHash_;
        requestConfirmations = requestConfirmations_;
    }

    function HashToSign(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    function drawHash(uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("drawHash(uint256)"), nonce_));
    }

    function draw(uint256 nonce_) external onlyOperationPendding(HashToSign(drawHash(nonce_))) {
        _randomNumber(msg.sender, 1);
    }

    function _draw(uint256 requestId) internal {
        require(requests[requestId].randomWord > 0, "RaffleBag: The randomWords number cannot be 0");
        WinPrize memory prize = _active_rule(requests[requestId].randomWord);
        winRecord[requests[requestId].user].push(prize);
        emit Draw(requests[requestId].user, prize.prizeKind, prize.amount);
    }

    // Active gift package rule
    function _active_rule(uint256 random) internal returns (WinPrize memory) {
        uint256 totalWeight;
        for (uint256 i = 0; i < prizePool.length; i++) {
            totalWeight += prizePool[i].weight;
        }

        WinPrize memory winPrize;
        uint256 num = random % totalWeight;

        for (uint256 i = 0; i < prizePool.length; i++) {
            uint256 minimum = 0;
            if (i != 0) {
                minimum = prizePool[i - 1].weight;
            }
            if (num >= minimum && num < prizePool[i].weight) {
                winPrize.prizeKind = prizePool[i].prizeKind;
                winPrize.amount = prizePool[i].amount;
            }
        }

        // If the prize is a BCard or a CCard, record tokenid and deduct a quantity
        if (winPrize.prizeKind == PrizeKind.BCard) {
            winPrize.tokenId = totalNumberOfBCard;
            totalNumberOfBCard -= winPrize.amount;

            // Remove card from the prizePool
            if (totalNumberOfBCard == 0) {
                _removePrizePoolElement(0);
            }
        }
        if (winPrize.prizeKind == PrizeKind.CCard) {
            winPrize.tokenId = totalNumberOfCCard;
            totalNumberOfCCard -= winPrize.amount;

            if (totalNumberOfCCard == 0) {
                _removePrizePoolElement(1);
            }
        }
        return winPrize;
    }

    function _removePrizePoolElement(uint256 index) internal {
        if (index >= prizePool.length) return;

        for (uint256 i = index; i < prizePool.length - 1; i++) {
            prizePool[i] = prizePool[i + 1];
        }
        prizePool.pop();
    }

    function _randomNumber(address user, uint32 numWords) private returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        requests[requestId] = RequestStatus({randomWord: uint256(0), exists: true, fulfilled: false, user: user});
        emit RequestSent(requestId, numWords);
        return requestId;
    }

    function fulfillRandomWords(uint256 requestId_, uint256[] memory randomWords_) internal override {
        require(requests[requestId_].exists, "RaffleBag: request not found");
        require(!requests[requestId_].fulfilled, "RaffleBag: request has been processed");
        requests[requestId_].randomWord = randomWords_[0];
        _draw(requestId_);
        requests[requestId_].fulfilled = true;
        emit RequestFulfilled(requestId_, randomWords_);
    }

    function checkWin() external view returns (WinPrize[] memory) {
        return winRecord[msg.sender];
    }

    function withdrawWin() external lock {
        for (uint256 i = 0; i < winRecord[msg.sender].length; i++) {
            WinPrize memory prize = winRecord[msg.sender][i];
            if (prize.prizeKind == PrizeKind.VM3) {
                VM3.transferFrom(spender, msg.sender, prize.amount);
                emit WithdrawWin(msg.sender, prize.prizeKind, prize.amount);
            }
            if (prize.prizeKind == PrizeKind.BCard) {
                BCard.safeTransferFrom(spender, msg.sender, prize.tokenId);
                emit WithdrawWin(msg.sender, prize.prizeKind, prize.amount);
            }
            if (prize.prizeKind == PrizeKind.CCard) {
                CCard.safeTransferFrom(spender, msg.sender, prize.tokenId);
                emit WithdrawWin(msg.sender, prize.prizeKind, prize.amount);
            }
            if (prize.prizeKind == PrizeKind.DCard) {
                emit WithdrawWin(msg.sender, prize.prizeKind, prize.amount);
            }
        }
    }
}
