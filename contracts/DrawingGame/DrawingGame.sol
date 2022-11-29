// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
}

contract DrawingGame {
    mapping(address => uint256) private won; // address=>tokenId
    address public immutable nftContractAddress;
    address public immutable investmentAddress;

    uint256 public constant SECONDS_FOR_WEEK = 60 * 60 * 24 * 7;
    uint256 public constant SECONDS_FOR_DAY = 60 * 60 * 24;
    uint16 public constant DRAW_NFTS = 300; // total nfts for drawing game
    uint16 private distributedNFTs;
    uint16 private drawRounds; // how many round draw
    uint256 private lastDrawTime = 0;
    uint256[DRAW_NFTS + 1] private nfts; //nft token id list
    mapping(address => uint256) private addressWeightMap;

    uint256 public immutable startTime = block.timestamp;
    uint256 public immutable endTime;

    event Draw(address indexed from, uint256 indexed time);
    event TakeOutNFT(address indexed from, address indexed recipient, uint256 indexed tokenId);

    constructor(
        address nftContractAddress_,
        address investmentAddress_,
        uint256 endTime_
    ) {
        for (uint256 i = 1; i <= DRAW_NFTS; i++) {
            nfts[i] = i;
        }
        nftContractAddress = nftContractAddress_;
        investmentAddress = investmentAddress_;
        endTime = endTime_;
    }

    modifier checkDrawTime() {
        require(block.timestamp < endTime, "DrawingGame: activity ended");
        require(getWeekday(block.timestamp) == 6, "DrawingGame: only sunday can draw");
        require(getHourInDay(block.timestamp) == 9, "DrawingGame: only nince am can draw");
        require(getWeekday(block.timestamp - startTime) > 3, "DrawingGame: wait for next week");
        require(block.timestamp - lastDrawTime > SECONDS_FOR_WEEK, "DrawingGame: has been drawn recently");
        _;
    }

    function draw() external checkDrawTime {
        (address[] memory paticipants, uint256 totalWeight) = getParticipants();
        uint256 left = paticipants.length;
        for (uint256 i = 0; i < 30 && left > 0; i++) {
            uint256 num = randomNumber(i, drawRounds, totalWeight);
            (address addr, uint256 index) = whoWin(paticipants, num);
            won[addr] = nfts[distributedNFTs++];
            totalWeight -= addressWeightMap[addr];
            paticipants[index] = paticipants[paticipants.length - 1];
            delete paticipants[paticipants.length - 1];
            left--;
        }

        lastDrawTime = block.timestamp;
        drawRounds++;
        emit Draw(msg.sender, block.timestamp);
    }

    function takeOutNFT(address recipient) external {
        uint256 tokenId = won[msg.sender];
        require(tokenId > 0, "DrawingGame: you not won nft");

        IERC721(nftContractAddress).safeTransferFrom(address(this), recipient, tokenId);
        emit TakeOutNFT(msg.sender, recipient, tokenId);
    }

    function randomNumber(
        uint256 index,
        uint256 drawRound,
        uint256 n
    ) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(index, drawRound, blockhash(block.number)))) / n;
    }

    function getNFT(uint16 index) external view returns (uint256 tokenId) {
        return nfts[index];
    }

    function distributedNFTsNumber() external view returns (uint16) {
        return distributedNFTs;
    }

    function getWonNFT(address addr) external view returns (uint256 tokenId) {
        return won[addr];
    }

    function getParticipants() internal returns (address[] memory, uint256) {
        InvestmentAccount[] memory accounts = IInvestment(investmentAddress).getLatestList();
        uint256 totalWeight = 0;
        uint256 totalParticipants = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (won[accounts[i].addr] > 0) {
                continue;
            }
            totalParticipants++;
            addressWeightMap[accounts[i].addr] = calculteWeight(accounts[i].level);
            totalWeight += calculteWeight(accounts[i].level);
        }

        address[] memory addressList = new address[](totalParticipants);
        uint256 j = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (won[accounts[i].addr] > 0) {
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

    function getDay(uint256 timestamp) internal pure returns (uint32) {
        return uint32(timestamp / SECONDS_FOR_DAY);
    }
}
