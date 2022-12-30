// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct InvestmentAccount {
    address addr;
    uint8 level;
}

interface IInvestment {
    function getLatestList() external view returns (InvestmentAccount[] memory);
}

interface IERC721 {
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);
}

contract DrawingGame is VRFConsumerBaseV2, Ownable {
    uint256 public constant SECONDS_FOR_WEEK = 60 * 60 * 24 * 7;
    uint256 public constant SECONDS_FOR_DAY = 60 * 60 * 24;
    address public immutable investmentAddress;

    struct NFTInfo {
        address contractAddress;
        uint256 tokenId;
    }
    mapping(address => NFTInfo) public wonNFT;
    mapping(address => bool) private won;
    NFTInfo[] public nfts; //nft token id list
    mapping(address => mapping(uint256 => bool)) nftExistPrizePool;

    uint256 public distributedNFTs;
    uint256 public drawRounds; // how many round draw
    uint256 public lastDrawTime = 0;
    mapping(address => uint256) public addressWeightMap;

    uint256 public startTime;
    uint256 public endTime;

    event Draw(address indexed from, uint256 indexed time);
    event TakeOutNFT(address indexed from, address contractAddress, uint256 tokenId);

    //chainlink configure
    uint64 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit;
    VRFCoordinatorV2Interface COORDINATOR;
    uint32 public numWords = 1;
    uint16 requestConfirmations = 3;
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

    constructor(
        address investmentAddress_,
        //chainlink config
        address vrfCoordinatorAddress_,
        uint32 callbackGasLimit_,
        uint64 subscribeId_,
        bytes32 keyHash_
    ) VRFConsumerBaseV2(vrfCoordinatorAddress_) {
        investmentAddress = investmentAddress_;

        callbackGasLimit = callbackGasLimit_;
        keyHash = keyHash_;
        subscriptionId = subscribeId_;
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorAddress_);
    }

    modifier checkDrawTime() {
        require(block.timestamp < endTime, "DrawingGame: activity ended");
        require(getWeekday(block.timestamp) == 0, "DrawingGame: only sunday can draw");
        require(getHourInDay(block.timestamp) == 9, "DrawingGame: only nince am can draw");
        require(getWeekday(block.timestamp - startTime) > 3, "DrawingGame: wait for next week");
        require(block.timestamp - lastDrawTime > SECONDS_FOR_WEEK, "DrawingGame: has been drawn recently");
        _;
    }

    function depositNFTs(address[] memory contractAddresses, uint256[] memory tokenIds) external onlyOwner {
        require(contractAddresses.length == tokenIds.length);
        for (uint256 i = 0; i < contractAddresses.length; i++) {
            require(nftExistPrizePool[contractAddresses[i]][tokenIds[i]] == false, "DrawingGame: NFT added");

            IERC721(contractAddresses[i]).transferFrom(address(this), address(this), tokenIds[i]);
            nftExistPrizePool[contractAddresses[i]][tokenIds[i]] = true;
        }
    }

    function withdrawNFTs(uint256 toIndex) external onlyOwner {
        require(nfts.length > distributedNFTs, "DrawingGame:no nfts left");
        if (toIndex > nfts.length - 1) {
            toIndex = nfts.length - 1;
        }

        for (uint256 i = toIndex; i > distributedNFTs; i--) {
            NFTInfo storage nftInfo = nfts[i];
            IERC721(nftInfo.contractAddress).safeTransferFrom(address(this), msg.sender, nftInfo.tokenId);
            nfts.pop();
        }
    }

    function drawByManager(address[] memory winners) external checkDrawTime onlyOwner {
        require(winners.length <= 30, "DrawingGame: limit 30 winners per round");
        for (uint256 i = 0; i < winners.length && nfts.length > distributedNFTs; i++) {
            if (won[winners[i]]) {
                // ignore people who have won NFT
                continue;
            }

            wonNFT[winners[i]] = NFTInfo(nfts[distributedNFTs].contractAddress, nfts[distributedNFTs].tokenId);
            nftExistPrizePool[wonNFT[winners[i]].contractAddress][wonNFT[winners[i]].tokenId] = false;
            distributedNFTs++;
        }

        emit Draw(msg.sender, block.timestamp);
    }

    function _draw(uint256 seed) internal checkDrawTime {
        (address[] memory paticipants, uint256 totalWeight) = getParticipants();
        uint256 left = paticipants.length;
        for (uint256 i = 0; i < 30 && left > 0 && nfts.length > distributedNFTs; i++) {
            uint256 num = seed % totalWeight;
            (address addr, uint256 index) = whoWin(paticipants, num);
            wonNFT[addr] = nfts[distributedNFTs];
            totalWeight -= addressWeightMap[addr];
            paticipants[index] = paticipants[paticipants.length - 1];

            delete paticipants[paticipants.length - 1];
            nftExistPrizePool[wonNFT[addr].contractAddress][wonNFT[addr].tokenId] = false;
            distributedNFTs++;
            left--;
            seed = uint256(keccak256(abi.encodePacked(seed)));
        }

        lastDrawTime = block.timestamp;
        drawRounds++;
        emit Draw(msg.sender, block.timestamp);
    }

    function takeOutNFT() external {
        NFTInfo memory nftInfo = wonNFT[msg.sender];
        require(nftInfo.contractAddress != address(0), "DrawingGame: you not won nft");
        require(
            IERC721(nftInfo.contractAddress).ownerOf(nftInfo.tokenId) != msg.sender,
            "DrawingGame: you have taken nft"
        );

        IERC721(nftInfo.contractAddress).safeTransferFrom(address(this), msg.sender, nftInfo.tokenId);
        delete wonNFT[msg.sender];
        emit TakeOutNFT(msg.sender, nftInfo.contractAddress, nftInfo.tokenId);
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

    function whoWin(address[] memory accounts, uint256 num) internal view returns (address, uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < accounts.length && accounts[i] != address(0); i++) {
            count += addressWeightMap[accounts[i]];
            if (count >= num) {
                return (accounts[i], i);
            }
        }

        return (address(0), 0);
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
        require(startTime == 0, "DrawingGame: start time already set");

        startTime = startTime_;
    }

    function setEndTime(uint256 endTime_) external onlyOwner {
        require(endTime_ > block.timestamp);
        endTime = endTime_;
    }

    // chainlink
    function requestRandomWordsForDraw() external onlyOwner returns (uint256 requestId) {
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
        _draw(randomWords_[0]);
        emit RequestFulfilled(requestId_, randomWords_);
    }
}
