// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../Chainlink/VRFConsumerBaseV2Upgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Time} from "../Lib/Time.sol";
import "../Abstract/SafeOwnableUpgradeable.sol";

struct InvestmentAccount {
    address addr;
    uint8 level;
}

interface IInvestment {
    function getLatestList() external view returns (InvestmentAccount[] memory);
}

interface IERC721 {
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);
}

contract DrawingGame is Initializable, UUPSUpgradeable, SafeOwnableUpgradeable, VRFConsumerBaseV2Upgradeable {
    uint256 public constant SECONDS_FOR_WEEK = 60 * 60 * 24 * 7;
    uint256 public constant SECONDS_FOR_DAY = 60 * 60 * 24;

    address public investmentAddress;
    bytes32 public DOMAIN;

    struct NFTInfo {
        address contractAddress;
        uint256 tokenId;
    }
    mapping(address => NFTInfo) public wonNFT;
    mapping(address => bool) public won;
    NFTInfo[] public nfts; //nft token id list
    mapping(address => mapping(uint256 => bool)) nftExistPrizePool;

    uint256 public distributedNFTs;
    uint256 public drawRounds; // how many round draw
    mapping(address => uint256) public addressWeightMap;

    uint256 public startTime;
    uint256 public endTime;

    // Control timestamp
    using Time for Time.Timestamp;
    Time.Timestamp private _timestamp;

    event Draw(
        address indexed from,
        address[] winners,
        address[] contactAddressList,
        uint256[] tokenIdList,
        uint256 requestId
    );

    //chainlink configure
    VRFCoordinatorV2Interface COORDINATOR;
    bytes32 public keyHash;
    uint32 public callbackGasLimit;
    uint64 public subscriptionId;
    uint16 requestConfirmations;
    //chainlink related parameter
    uint256 public lastRequestId;
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public requests; // requestId --> requestStatus

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function initialize(
        address[] memory owners,
        uint8 signRequred,
        address vrfCoordinatorAddress_
    ) public initializer {
        //chainlink
        __VRFConsumerBaseV2_init(vrfCoordinatorAddress_);
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorAddress_);

        __Ownable_init(owners, signRequred);

        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );
    }

    modifier checkDrawTime() {
        uint256 time = _timestamp._getCurrentTime();
        require(startTime > 0 && time > startTime, "DrawingGame: activity not start");
        require(time < endTime, "DrawingGame: activity ended");
        //require(getWeekday(time) == 0, "DrawingGame: only sunday can draw");
        //require(getHourInDay(time) == 9, "DrawingGame: only nince am can draw");
        //require(time - startTime > 3 * SECONDS_FOR_DAY, "DrawingGame: wait for next week");
        //require(time - lastDrawTime >= SECONDS_FOR_WEEK, "DrawingGame: has been drawn recently");
        _;
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

    function setInvestment(address investmentAddress_) public onlyOwner {
        investmentAddress = investmentAddress_;
    }

    function depositNFTs(address[] memory contractAddresses, uint256[] memory tokenIds) external onlyOwner {
        require(contractAddresses.length == tokenIds.length);
        for (uint256 i = 0; i < contractAddresses.length; i++) {
            NFTInfo memory nftInfo = NFTInfo(contractAddresses[i], tokenIds[i]);
            require(nftExistPrizePool[contractAddresses[i]][tokenIds[i]] == false, "DrawingGame: NFT added");

            IERC721(contractAddresses[i]).transferFrom(msg.sender, address(this), tokenIds[i]);
            nftExistPrizePool[contractAddresses[i]][tokenIds[i]] = true;

            nfts.push(nftInfo);
        }
    }

    function withdrawNFTs(uint256 amount, address recipient) external onlyOwner {
        require(nfts.length > distributedNFTs, "DrawingGame:no nfts left");

        uint256 count = 0;
        while (nfts.length > distributedNFTs && count < amount) {
            NFTInfo storage nftInfo = nfts[nfts.length - 1];
            IERC721(nftInfo.contractAddress).transferFrom(address(this), recipient, nftInfo.tokenId);
            nfts.pop();
            nftExistPrizePool[nftInfo.contractAddress][nftInfo.tokenId] = false;
            count++;
        }
    }

    function _draw(uint256 requestId, uint256[] memory randomNumbers) internal checkDrawTime {
        (address[] memory participants, uint256 totalWeight) = getParticipants();

        address[] memory contractAddressList = new address[](randomNumbers.length);
        uint256[] memory tokenIdList = new uint256[](randomNumbers.length);
        address[] memory winners = new address[](randomNumbers.length);
        for (uint256 i = 0; i < randomNumbers.length && nfts.length > distributedNFTs; i++) {
            if (totalWeight == 0) {
                break;
            }

            uint256 num = randomNumbers[i] % totalWeight;
            address winner = whoWin(participants, num);
            totalWeight -= addressWeightMap[winner];

            NFTInfo memory nft = nfts[distributedNFTs];
            IERC721(nft.contractAddress).transferFrom(address(this), winner, nft.tokenId);
            won[winner] = true;
            winners[i] = winner;

            contractAddressList[i] = nfts[distributedNFTs].contractAddress;
            tokenIdList[i] = nfts[distributedNFTs].tokenId;
            distributedNFTs++;
        }

        drawRounds++;
        emit Draw(msg.sender, winners, contractAddressList, tokenIdList, requestId);
    }

    function getParticipants() internal returns (address[] memory, uint256) {
        InvestmentAccount[] memory accounts = IInvestment(investmentAddress).getLatestList();
        uint256 totalWeight = 0;
        uint256 totalParticipants = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (won[accounts[i].addr]) {
                continue;
            }
            totalParticipants++;
            addressWeightMap[accounts[i].addr] = calculteWeight(accounts[i].level);
            totalWeight += calculteWeight(accounts[i].level);
        }

        address[] memory addressList = new address[](totalParticipants);
        uint256 j = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (won[accounts[i].addr]) {
                continue;
            }

            addressList[j] = accounts[i].addr;
            j++;
        }

        return (addressList, totalWeight);
    }

    function getTotalNFT() public view returns (uint256) {
        return nfts.length;
    }

    function whoWin(address[] memory accounts, uint256 num) internal view returns (address) {
        uint256 count = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) {
                continue;
            }

            count += addressWeightMap[accounts[i]];
            if (count >= num) {
                address winner = accounts[i];
                delete accounts[i];
                return (winner);
            }
        }

        return (address(0));
    }

    function calculteWeight(uint8 level) internal pure returns (uint256) {
        if (level == 3) {
            return 15;
        }

        if (level == 2) {
            return 5;
        }

        return 1;
    }

    function getWeekday(uint256 timestamp) internal pure returns (uint8) {
        return uint8((timestamp / SECONDS_FOR_DAY + 4) % 7);
    }

    function getHourInDay(uint256 timestamp) internal pure returns (uint8) {
        return uint8((timestamp / 60 / 60) % 24);
    }

    //general setting
    function setStartTime(uint256 startTime_) external onlyOwner {
        require(startTime_ <= endTime, "DrawingGame: startTime must be less than endTime");

        startTime = startTime_;
    }

    function setEndTime(uint256 endTime_) external onlyOwner {
        require(endTime_ > startTime, "DrawingGame: endTime must be greater than startTime");
        endTime = endTime_;
    }

    // chainlink
    function requestRandomWordsForDraw(uint32 numWords) external checkDrawTime onlyOwner returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false});
        lastRequestId = requestId;
        emit RequestSent(requestId, numWords);
        return requestId;
    }

    function fulfillRandomWords(uint256 requestId_, uint256[] memory randomWords_) internal override {
        require(requests[requestId_].exists, "DrawingGame: request not found");
        requests[requestId_].fulfilled = true;
        requests[requestId_].randomWords = randomWords_;
        _draw(requestId_, randomWords_);
        emit RequestFulfilled(requestId_, randomWords_);
    }

    function setCurrentTime(uint256 timestamp_) external onlyOwner {
        _timestamp._setCurrentTime(timestamp_);
    }

    function getCurrentTime() external view returns (uint256) {
        return _timestamp._getCurrentTime();
    }
}
