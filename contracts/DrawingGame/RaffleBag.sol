// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../Chainlink/VRFConsumerBaseV2Upgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";

contract RaffleBag is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable, VRFConsumerBaseV2Upgradeable {
    using SafeERC20Upgradeable for IERC20;

    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
    event Draw(address to, PrizeKind prizeKind, uint256 value);

    address public spender;
    IERC20 public ERC20Token;
    IERC721Upgradeable public BCard;
    IERC721Upgradeable public CCard;
    bytes32 public DOMAIN;

    enum PrizeKind {
        BCard,
        CCard,
        DCard,
        ERC20Token
    }
    struct Prize {
        PrizeKind prizeKind;
        uint256 amount;
        uint256 weight;
        uint256[] tokens;
    }
    Prize[] private prizePool;

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

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function initialize(
        address[] memory owners,
        uint8 signRequred,
        address vrfCoordinatorAddress_
    ) public initializer {
        __Ownable_init(owners, signRequred);

        __VRFConsumerBaseV2_init(vrfCoordinatorAddress_);
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorAddress_);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );
    }

    function setSpender(address spender_) public onlyOwner {
        spender = spender_;
    }

    function setERC20(address token) public onlyOwner {
        ERC20Token = IERC20(token);
    }

    function setBCard(address bCard_) public onlyOwner {
        BCard = IERC721Upgradeable(bCard_);
    }

    function setCCard(address cCard_) public onlyOwner {
        CCard = IERC721Upgradeable(cCard_);
    }

    function setAsset(
        address spender_,
        address token,
        address bCard_,
        address cCard_
    ) external onlyOwner {
        setSpender(spender_);
        setERC20(token);
        setBCard(bCard_);
        setCCard(cCard_);
    }

    function setPrize(
        PrizeKind prizeKind_,
        uint256 amount_,
        uint256 weight_,
        uint256[] memory tokens_
    ) external onlyOwner {
        _setPrizes(prizeKind_, amount_, weight_, tokens_);
    }

    function setPrizes(
        PrizeKind[] memory prizeKinds_,
        uint256[] memory amounts_,
        uint256[] memory weights_,
        uint256[][] memory tokensList_
    ) external onlyOwner {
        uint256 len = prizeKinds_.length;
        require(
            (prizeKinds_.length == len &&
                amounts_.length == len &&
                weights_.length == len &&
                tokensList_.length == len),
            "RaffleBag: length of the data is different"
        );
        for (uint256 i = 0; i < len; ++i) {
            _setPrizes(prizeKinds_[i], amounts_[i], weights_[i], tokensList_[i]);
        }
    }

    function _setPrizes(
        PrizeKind prizeKind_,
        uint256 amount_,
        uint256 weight_,
        uint256[] memory tokens_
    ) private {
        prizePool.push(Prize(prizeKind_, amount_, weight_, tokens_));
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

    function draw(uint256 nonce_) external {
        _goDraw(_msgSender(), nonce_);
    }

    function drawTo(address to, uint256 nonce_) external {
        _goDraw(to, nonce_);
    }

    function _goDraw(address to, uint256 nonce_) private onlyOperationPendding(HashToSign(drawHash(to, nonce_))) {
        _randomNumber(to, 1);
    }

    // Active gift package rule
    function _active_rule(uint256 random) internal view returns (uint256 number) {
        uint256 totalWeight;
        for (uint256 i = 0; i < prizePool.length; ++i) {
            totalWeight += prizePool[i].weight;
        }

        // Set a default value, at least no longer reward ranges
        number = prizePool.length + 1;

        uint256 num = random % totalWeight;

        uint256 minimum = 0;
        for (uint256 i = 0; i < prizePool.length; ++i) {
            if (i != 0) minimum += prizePool[i - 1].weight;
            if (num >= minimum && num < prizePool[i].weight + minimum) number = i;
        }
        require(number < prizePool.length, "RaffleBag: There is an error in taking random numbers");
        return number;
    }

    function _draw(uint256 requestId) internal lock {
        require(requests[requestId].randomWord > 0, "RaffleBag: The randomWords number cannot be 0");
        address to = requests[requestId].user;
        uint256 number = _active_rule(requests[requestId].randomWord);
        uint256 value;
        if (prizePool[number].prizeKind == PrizeKind.ERC20Token) {
            value = prizePool[number].amount;
            ERC20Token.transferFrom(spender, to, value);
        } else if (prizePool[number].prizeKind != PrizeKind.DCard) {
            IERC721Upgradeable e;
            if (prizePool[number].prizeKind == PrizeKind.BCard) {
                e = BCard;
            } else {
                e = CCard;
            }

            // Send the prize and remove it
            value = prizePool[number].tokens[prizePool[number].tokens.length - 1];
            e.safeTransferFrom(spender, to, value);
            prizePool[number].tokens.pop();

            // Remove null prize
            if (prizePool[number].tokens.length == 0) _cleanPrizePool(number);
        }
        emit Draw(to, prizePool[number].prizeKind, value);
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

    function fulfillRandomWords(uint256 requestId_, uint256[] calldata randomWords_) internal override {
        require(requests[requestId_].exists, "RaffleBag: request not found");
        require(!requests[requestId_].fulfilled, "RaffleBag: request has been processed");
        requests[requestId_].fulfilled = true;
        requests[requestId_].randomWord = randomWords_[0];
        _draw(requestId_);
        emit RequestFulfilled(requestId_, randomWords_);
    }

    function cleanPrizePool(uint256 number) external onlyOwner {
        _cleanPrizePool(number);
    }

    function cleanPrizePoolAll() external onlyOwner {
        for (uint256 i = 0; i < prizePool.length; ++i) {
            prizePool.pop();
        }
    }

    function _cleanPrizePool(uint256 number) private {
        if (number != prizePool.length - 1) prizePool[number] = prizePool[number + 1];
        prizePool.pop();
    }

    function getPrizePool() external view returns (Prize[] memory) {
        return prizePool;
    }
}
