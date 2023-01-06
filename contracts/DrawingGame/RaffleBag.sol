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

    uint256[] private BCardTokenIds;
    uint256[] private CCardTokenIds;

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

    bool internal locked;
    modifier lock() {
        require(!locked, "No re-entrancy");
        locked = true;
        _;
        locked = false;
    }
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
    event Draw(address to, PrizeKind prizeKind, uint256 amount);

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
        prizePool.push(Prize(PrizeKind.BCard, 1, 4));
        prizePool.push(Prize(PrizeKind.CCard, 1, 8));
        prizePool.push(Prize(PrizeKind.DCard, 1, 400));
        prizePool.push(Prize(PrizeKind.VM3, 8 * 10**17, 6000));
        prizePool.push(Prize(PrizeKind.VM3, 6 * 10**17, 12000));
        prizePool.push(Prize(PrizeKind.VM3, 3 * 10**17, 18000));
        prizePool.push(Prize(PrizeKind.VM3, 2 * 10**17, 30000));
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

    function drawHash(address to, uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("drawHash(address,uint256)"), to, nonce_));
    }

    function draw(address to, uint256 nonce_) external onlyOperationPendding(HashToSign(drawHash(to, nonce_))) {
        _randomNumber(to, 1);
    }

    // Active gift package rule
    function _active_rule(uint256 random) internal view returns (Prize memory) {
        uint256 totalWeight;
        for (uint256 i = 0; i < prizePool.length; i++) {
            totalWeight += prizePool[i].weight;
        }

        Prize memory winPrize;
        uint256 num = random % totalWeight;

        uint256 minimum = 0;
        for (uint256 i = 0; i < prizePool.length; i++) {
            if (i != 0) {
                minimum += prizePool[i - 1].weight;
            }
            if (num >= minimum && num < prizePool[i].weight + minimum) {
                winPrize = prizePool[i];
            }
        }
        return winPrize;
    }

    function _withdraw_prize(address to, Prize memory prize) internal lock {
        if (prize.prizeKind == PrizeKind.VM3) {
            VM3.transferFrom(spender, to, prize.amount);
        }
        if (prize.prizeKind == PrizeKind.BCard) {
            BCard.safeTransferFrom(spender, to, BCardTokenIds[BCardTokenIds.length - 1]);
            BCardTokenIds.pop();

            // Remove null prize
            if (BCardTokenIds.length == 0) {
                for (uint256 i = 0; i < prizePool.length; i++) {
                    if (prizePool[i].prizeKind == PrizeKind.BCard) {
                        _removePrizePoolElement(i);
                        break;
                    }
                }
            }
        }
        if (prize.prizeKind == PrizeKind.CCard) {
            CCard.safeTransferFrom(spender, to, CCardTokenIds[CCardTokenIds.length - 1]);
            CCardTokenIds.pop();

            // Remove null prize
            if (CCardTokenIds.length == 0) {
                for (uint256 i = 0; i < prizePool.length; i++) {
                    if (prizePool[i].prizeKind == PrizeKind.CCard) {
                        _removePrizePoolElement(1);
                        break;
                    }
                }
            }
        }
    }

    function _draw(uint256 requestId) internal {
        require(requests[requestId].randomWord > 0, "RaffleBag: The randomWords number cannot be 0");
        Prize memory winPrize = _active_rule(requests[requestId].randomWord);

        address userAddress = requests[requestId].user;
        _withdraw_prize(userAddress, winPrize);
        emit Draw(userAddress, winPrize.prizeKind, winPrize.amount);
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

    function setPrizePool(
        PrizeKind prizeKind,
        uint256 amount,
        uint256 weight
    ) external onlyOwner {
        prizePool.push(Prize(prizeKind, amount, weight));
    }

    function setPrizePools(
        PrizeKind[] calldata prizeKind,
        uint256[] calldata amount,
        uint256[] calldata weight
    ) external onlyOwner {
        require(
            prizeKind.length == amount.length && amount.length == weight.length,
            "RaffleBag: Incorrect number of arrays"
        );
        for (uint256 i = 0; i < amount.length; i++) {
            prizePool.push(Prize(prizeKind[i], amount[i], weight[i]));
        }
    }

    function cleanPrizePool() external onlyOwner {
        for (uint256 i = 0; i < prizePool.length; i++) {
            prizePool.pop();
        }
    }

    function getPrizePool() external view returns (Prize[] memory) {
        return prizePool;
    }

    function setBCardTokenIds(uint256[] memory tokenIds) external onlyOwner {
        BCardTokenIds = tokenIds;
    }

    function getBCardTokenIds() external view returns (uint256[] memory) {
        return BCardTokenIds;
    }

    function setCCardTokenIds(uint256[] memory tokenIds) external onlyOwner {
        CCardTokenIds = tokenIds;
    }

    function getCCardTokenIds() external view returns (uint256[] memory) {
        return CCardTokenIds;
    }
}
