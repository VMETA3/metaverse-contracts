// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import {SafeOwnable} from "../Abstract/SafeOwnable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
    /// @notice Cast a uint256 to a int256, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type int256
    function toInt256(uint256 y) internal pure returns (int256 z) {
        require(y < 2**255);
        z = int256(y);
    }

    /// @notice Cast a uint256 to a uint64, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type uint64
    function toUint64(uint256 y) internal pure returns (uint64 z) {
        require(y < 2**64);
        z = uint64(y);
    }
}

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function decimals() external view returns (uint8);

    function balanceOf(address account) external view returns (uint256);
}

contract PrivateSale is SafeOwnable, ReentrancyGuard {
    using SafeCast for uint256;

    event BuyVM3(address indexed from, uint64 indexed saleNumber, uint256 amount);
    event WithdrawVM3(address indexed from, uint64 indexed saleNumber, uint256 amount);
    event AddTokens(address indexed from, address[] tokens, address[] priceFeeds);

    address public USDT;
    address public VM3;
    uint64 public constant MONTH = 60 * 60 * 24 * 30;
    bytes32 public DOMAIN;
    // BNB（0x0000000000000000000000000000000000000000）
    // USDT（0x55d398326f99059fF775485246999027B3197955）
    // BUSD（0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56）
    // WBNB（0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c）
    // ETH（0x2170Ed0880ac9A755fd29B2688956BD959F933F8）
    mapping(address => bool) public supportToken;
    mapping(address => address) public tokenPriceFeed;

    struct SaleInfo {
        uint64 number;
        bool puased;
        uint256 limitAmount;
        uint256 soldAmount;
        uint256 exchangeRate; // VM3/USD
        uint64 startTime;
        uint64 endTime;
        uint64 releaseStartTime;
        uint32 releaseTotalMonths;
    }
    SaleInfo[] public saleList;

    struct AssetInfo {
        uint64 saleNumber; // which sale  user buy
        bool puased;
        uint256 amount;
        uint256 amountWithdrawn;
        uint64 latestWithdrawTime;
        uint32 withdrawnMonths;
        uint32 releaseTotalMonths;
    }
    mapping(address => mapping(uint256 => AssetInfo)) public userAssertInfos;

    constructor(
        uint256 chainId,
        address[] memory owners,
        uint8 signRequired,
        address vm3,
        address usdt
    ) SafeOwnable(owners, signRequired) {
        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), chainId, address(this))
        );
        if (saleList.length == 0) {
            saleList.push();
        }

        USDT = usdt;
        VM3 = vm3;
    }

    modifier onlyAssetExist(address user, uint64 saleNumber) {
        require(userAssertInfos[user][saleNumber].saleNumber > 0, "PrivateSale: Asset is not exist");
        _;
    }
    modifier onlySaleExist(uint64 saleNumber) {
        require(saleList.length > saleNumber, "PrivateSale: Sale is not exist");
        _;
    }

    function createSale(
        uint256 limitAmount_,
        uint256 exchangeRate,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(_createSaleHash(limitAmount_, exchangeRate, nonce)), sigs) {
        SaleInfo memory saleInfo = SaleInfo(uint64(saleList.length), false, limitAmount_, 0, exchangeRate, 0, 0, 0, 0);
        saleList.push(saleInfo);
    }

    function totalSale() external view returns (uint256) {
        return (saleList.length);
    }

    function buy(
        uint64 saleNumber,
        address paymentToken,
        uint256 amount
    ) external payable nonReentrant {
        require(supportToken[paymentToken], "PrivateSale: PaymentToken is not supported");
        SaleInfo memory saleInfo = saleList[saleNumber];
        require(!saleInfo.puased, "PrivateSale: Sale puased");
        require(
            saleInfo.startTime > block.timestamp && saleInfo.endTime < block.timestamp,
            "PrivateSale: Sale is not in progress"
        );

        if (paymentToken == address(0)) {
            amount = msg.value;
        } else {
            IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        }

        uint256 gotVM3 = _canGotVM3(paymentToken, amount, saleInfo.exchangeRate, tokenPriceFeed[paymentToken]);
        require(gotVM3 + saleInfo.soldAmount < saleInfo.limitAmount, "PrivateSale: Exceed sale limit");
        saleList[saleNumber].soldAmount += gotVM3;

        AssetInfo memory assetInfo = userAssertInfos[msg.sender][saleNumber];
        if (assetInfo.saleNumber == 0) {
            assetInfo.saleNumber = saleNumber;
            assetInfo.releaseTotalMonths = saleInfo.releaseTotalMonths;
        }
        assetInfo.amount += gotVM3;

        userAssertInfos[msg.sender][saleNumber] = assetInfo;
    }

    function withdrawVM3(uint64[] memory saleNumbers) external nonReentrant {
        for (uint64 i = 0; i < saleNumbers.length; i++) {
            _witdrawVM3(saleNumbers[i]);
        }
    }

    function withdrawAllSaleVM3(bytes[] memory sigs)
        external
        onlyMultipleOwner(_hashToSign(_withdrawAllSaleVM3Hash(nonce)), sigs)
    {
        uint256 amount = IERC20(VM3).balanceOf(address(this));
        IERC20(VM3).transferFrom(address(this), msg.sender, amount);
    }

    //settings
    function addTokens(
        address[] memory tokens,
        address[] memory priceFeeds,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(_addTokensHash(tokens, priceFeeds, nonce)), sigs) {
        require(tokens.length == priceFeeds.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            _addToken(tokens[i], priceFeeds[i]);
        }

        emit AddTokens(msg.sender, tokens, priceFeeds);
    }

    function setSaleTime(
        uint64 saleNumber,
        uint64 startTime,
        uint64 endTime,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(_setSaleTimeHash(saleNumber, startTime, endTime, nonce)), sigs) {
        require(startTime < endTime);
        _setStartAndEndTime(saleNumber, startTime, endTime);
    }

    function setSaleExchangeRate(
        uint64 saleNumber,
        uint256 exchangeRate,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(_setSaleExchangeRateHash(saleNumber, exchangeRate, nonce)), sigs) {
        _setExchangeRate(saleNumber, exchangeRate);
    }

    function setReleaseParams(
        uint64[] memory saleNumber,
        uint64[] memory releaseStartTime,
        uint32[] memory releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(_setReleaseParamsHash(saleNumber, releaseStartTime, releaseTotalMonths, nonce)),
            sigs
        )
    {
        for (uint64 i = 0; i < saleNumber.length; i++) {
            _setReleaseParams(saleNumber[i], releaseStartTime[i], releaseTotalMonths[i]);
        }
    }

    function puaseSale(uint64 saleNumber, bytes[] memory sigs)
        external
        onlyMultipleOwner(_hashToSign(_puaseSaleHash(saleNumber, nonce)), sigs)
    {
        _pauseSale(saleNumber);
    }

    function setUserReleaseMonths(
        address[] memory users,
        uint64[] memory saleNumber,
        uint32[] memory releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(_hashToSign(_setUserReleaseMonthsHash(users, saleNumber, releaseTotalMonths, nonce))),
            sigs
        )
    {
        for (uint256 i = 0; i < users.length; i++) {
            _setUserAssertReleaseMonths(users[i], saleNumber[i], releaseTotalMonths[i]);
        }
    }

    function _canGotVM3(
        address paymentToken,
        uint256 amount,
        uint256 exchangeRate,
        address priceFeed
    ) internal view returns (uint256) {
        int256 price = 10**18;
        if (paymentToken != USDT) {
            (, price, , , ) = AggregatorV3Interface(priceFeed).latestRoundData();
        }

        uint8 usdDecimals = AggregatorV3Interface(priceFeed).decimals();

        // convert all to decimal 18
        uint8 tokenDecimals = 18;
        if (paymentToken != address(0)) {
            tokenDecimals = IERC20(paymentToken).decimals();
        }

        if (usdDecimals < 18) {
            price *= (10**(18 - usdDecimals)).toInt256();
        } else if (usdDecimals > 18) {
            price /= (10**(usdDecimals - 18)).toInt256();
        }

        if (tokenDecimals < 18) {
            amount *= 10**(18 - tokenDecimals);
        } else if (tokenDecimals > 18) {
            amount /= 10**(usdDecimals - 18);
        }

        uint256 gotVM3 = (amount * uint256(price) * 10**18) / exchangeRate;
        require(gotVM3 > 0, "PrivateSale: gotVM3 is zero");

        return gotVM3;
    }

    function _witdrawVM3(uint64 saleNumber) internal {
        AssetInfo memory assetInfo = userAssertInfos[msg.sender][saleNumber];
        require(assetInfo.saleNumber > 0, "PrivateSale: not exist");
        require(!assetInfo.puased, "PrivateSale: withdraw puased");
        require(!saleList[assetInfo.saleNumber].puased, "PrivateSale: sale puased");
        require(saleList[assetInfo.saleNumber].releaseStartTime > 0, "PrivateSale: release is not started");
        require(block.timestamp - assetInfo.latestWithdrawTime > MONTH, "PrivateSale: has withdraw recently");

        if (assetInfo.latestWithdrawTime == 0) {
            assetInfo.latestWithdrawTime = saleList[assetInfo.saleNumber].releaseStartTime;
        }
        uint16 canWithdrawMonths = uint16((block.timestamp - assetInfo.latestWithdrawTime) / MONTH);

        uint256 withdrawAmount = ((assetInfo.amount - assetInfo.amountWithdrawn) /
            (assetInfo.releaseTotalMonths - assetInfo.withdrawnMonths)) * canWithdrawMonths;
        IERC20(VM3).transferFrom(address(this), msg.sender, withdrawAmount);

        assetInfo.amountWithdrawn += withdrawAmount;
        assetInfo.latestWithdrawTime = block.timestamp.toUint64();
        assetInfo.withdrawnMonths += canWithdrawMonths;
    }

    function _setStartAndEndTime(
        uint64 number,
        uint64 startTime,
        uint64 endTime
    ) internal onlySaleExist(number) {
        saleList[number].startTime = startTime;
        saleList[number].endTime = endTime;
    }

    function _setExchangeRate(uint64 number, uint256 exchangeRate) internal onlySaleExist(number) {
        saleList[number].exchangeRate = exchangeRate;
    }

    function _pauseSale(uint64 number) internal onlySaleExist(number) {
        saleList[number].puased = true;
    }

    function _addToken(address token, address priceFeed) internal {
        require(!supportToken[token], "PrivateSale: token already added");
        supportToken[token] = true;
        (, int256 price, , , ) = AggregatorV3Interface(priceFeed).latestRoundData();
        require(price > 0, "PrivateSale: Bad priceFeed");
        tokenPriceFeed[token] = priceFeed;
    }

    function _puaseUserAsset(address user, uint64 saleNumber) internal onlyAssetExist(user, saleNumber) {
        userAssertInfos[user][saleNumber].puased = true;
    }

    function _setUserAssertReleaseMonths(
        address user,
        uint64 saleNumber,
        uint32 releaseMonths
    ) internal onlyAssetExist(user, saleNumber) {
        require(userAssertInfos[user][saleNumber].withdrawnMonths < releaseMonths, "");
        userAssertInfos[user][saleNumber].releaseTotalMonths = releaseMonths;
    }

    function _setReleaseParams(
        uint64 number,
        uint64 releaseStartTime,
        uint32 releaseTotalMonths
    ) internal onlySaleExist(number) {
        saleList[number].releaseStartTime = releaseStartTime;
        saleList[number].releaseTotalMonths = releaseTotalMonths;
    }

    // safeOwanble
    function _withdrawAllSaleVM3Hash(uint256 nonce_) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("withdrawAllSaleVM3()"), nonce_));
    }

    function _addTokensHash(
        address[] memory tokens,
        address[] memory priceFeeds,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(DOMAIN, keccak256("addTokens(address[], address[])"), tokens, priceFeeds, nonce_)
            );
    }

    function _createSaleHash(
        uint256 limitAmount_,
        uint256 exchangeRate,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(DOMAIN, keccak256("createSale(uint256,uint256)"), limitAmount_, exchangeRate, nonce_)
            );
    }

    function _setSaleTimeHash(
        uint64 saleNumber,
        uint64 startTime,
        uint64 endTime,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setSaleTime(uint64,uint64,uint64)"),
                    saleNumber,
                    startTime,
                    endTime,
                    nonce_
                )
            );
    }

    function _setSaleExchangeRateHash(
        uint64 saleNumber,
        uint256 exchangeRate,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setSaleExchangeRate(uint64,uint256)"),
                    saleNumber,
                    exchangeRate,
                    nonce_
                )
            );
    }

    function _setReleaseParamsHash(
        uint64[] memory saleNumber,
        uint64[] memory releaseStartTime,
        uint32[] memory releaseTotalMonths,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setReleaseParams(uint64[],uint64[],uint32[])"),
                    saleNumber,
                    releaseStartTime,
                    releaseTotalMonths,
                    nonce_
                )
            );
    }

    function _puaseSaleHash(uint64 saleNumber, uint256 nonce_) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("puaseSale(uint64)"), saleNumber, nonce_));
    }

    function _setUserReleaseMonthsHash(
        address[] memory users,
        uint64[] memory saleNumber,
        uint32[] memory releaseTotalMonths,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setUserReleaseMonths(address[],uint64[],uint32[])"),
                    users,
                    saleNumber,
                    releaseTotalMonths,
                    nonce_
                )
            );
    }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    //hash function
    function withdrawAllSaleVM3Hash(uint256 nonce_) external view returns (bytes32) {
        return _withdrawAllSaleVM3Hash(nonce_);
    }

    function addTokensHash(
        address[] memory tokens,
        address[] memory priceFeeds,
        uint256 nonce_
    ) external view returns (bytes32) {
        return _addTokensHash(tokens, priceFeeds, nonce_);
    }

    function createSaleHash(
        uint256 limitAmount_,
        uint256 exchangeRate,
        uint256 nonce_
    ) external view returns (bytes32) {
        return _createSaleHash(limitAmount_, exchangeRate, nonce_);
    }

    function setSaleTimeHash(
        uint64 saleNumber,
        uint64 startTime,
        uint64 endTime,
        uint256 nonce_
    ) external view returns (bytes32) {
        return _setSaleTimeHash(saleNumber, startTime, endTime, nonce_);
    }

    function setSaleExchangeRateHash(
        uint64 saleNumber,
        uint256 exchangeRate,
        uint256 nonce_
    ) external view returns (bytes32) {
        return _setSaleExchangeRateHash(saleNumber, exchangeRate, nonce_);
    }

    function setReleaseParamsHash(
        uint64[] memory saleNumber,
        uint64[] memory releaseStartTime,
        uint32[] memory releaseTotalMonths,
        uint256 nonce_
    ) external view returns (bytes32) {
        return _setReleaseParamsHash(saleNumber, releaseStartTime, releaseTotalMonths, nonce_);
    }

    function puaseSaleHash(uint64 saleNumber, uint256 nonce_) external view returns (bytes32) {
        return _puaseSaleHash(saleNumber, nonce_);
    }

    function setUserReleaseMonthsHash(
        address[] memory users,
        uint64[] memory saleNumber,
        uint32[] memory releaseTotalMonths,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return _setUserReleaseMonthsHash(users, saleNumber, releaseTotalMonths, nonce_);
    }
}
