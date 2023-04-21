// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import {SafeOwnable} from "../Abstract/SafeOwnable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../Library/SafeCast.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function decimals() external view returns (uint8);

    function balanceOf(address account) external view returns (uint256);
}

contract PrivateSale is SafeOwnable, ReentrancyGuard {
    /*
     * library
     */
    using SafeCast for uint256;

    /*
     * constant
     */
    uint64 public constant MONTH = 60 * 60 * 24 * 30;
    uint256 public constant DefaultMaxSell = 100000 * 10 ** 18;
    uint256 public constant DefaultMinSell = 10 ** 18;

    /*
     * events
     */
    event SaleCreated(address from, uint256 indexed saleNumber, uint256 limitAmount, uint256 exchangeRate);
    event BuyVM3(
        address indexed from,
        uint256 indexed saleNumber,
        address paymentToken,
        uint256 amount,
        uint256 totalVM3
    );
    event WithdrawVM3(address indexed from, uint256 indexed saleNumber, uint256 amount);
    event NewPaymentTokenAdded(address paymentToken, address paymentTokenPriceFeed);
    event SetWhiteList(uint256 indexed saleNumber, address[] users, bool added);

    /*
     * custom struct
     */
    struct SaleInfo {
        uint256 number;
        // release paused or not
        bool paused;
        uint256 limitAmount;
        uint256 soldAmount;
        uint256 exchangeRate; // VM3:USD, decimal is 18
        uint64 startTime;
        uint64 endTime;
        uint64 releaseStartTime;
        uint32 releaseTotalMonths;
        // who can buy this vm3 sale
        mapping(address => bool) whiteList;
        // max/min sell vm3 amount for everyone
        uint256 maxSell;
        uint256 minSell;
    }
    struct AssetInfo {
        uint256 saleNumber; // which sale  user buy
        // release puased or not
        bool paused;
        uint256 amount;
        uint256 amountWithdrawn;
        uint64 latestWithdrawTime;
        uint32 withdrawnMonths;
        uint32 releaseTotalMonths;
    }

    /*
     * storage
     */
    address public USDT;
    address public VM3;
    bytes32 public DOMAIN;
    // BNB（0x0000000000000000000000000000000000000000）
    // USDT（0x55d398326f99059fF775485246999027B3197955）
    // BUSD（0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56）
    // WBNB（0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c）
    // ETH（0x2170Ed0880ac9A755fd29B2688956BD959F933F8）
    mapping(address => address) public paymentTokenPriceFeedMap;
    mapping(uint256 => SaleInfo) public saleInfoMap;
    uint256[] public saleNumberList;
    //  user=>saleNumber=>AssetInfo
    mapping(address => mapping(uint256 => AssetInfo)) public userAssetInfos;

    constructor(
        address[] memory owners,
        uint8 signRequired,
        address vm3,
        address usdt
    ) SafeOwnable(owners, signRequired) {
        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );

        USDT = usdt;
        VM3 = vm3;
    }

    modifier onlyAssetExist(address user, uint256 saleNumber) {
        require(userAssetInfos[user][saleNumber].saleNumber > 0, "PrivateSale: Asset is not exist");
        _;
    }
    modifier onlySaleExist(uint256 saleNumber) {
        require(saleInfoMap[saleNumber].number > 0, "PrivateSale: Sale is not exist");
        _;
    }
    modifier onlySupportedPaymentToken(address paymentToken) {
        require(paymentTokenPriceFeedMap[paymentToken] != address(0));
        _;
    }
    modifier onlySaleInProgress(uint256 saleNumber) {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        require(
            saleInfo.startTime > block.timestamp && saleInfo.endTime < block.timestamp,
            "PrivateSale: Sale is not in progress"
        );
        _;
    }
    modifier onlyInWhiteList(uint256 saleNumber) {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        require(saleInfo.whiteList[msg.sender], "PrivateSale:user not in whiteList");
        _;
    }
    modifier onlySaleReleaseNotPuased(uint256 saleNumber) {
        require(!saleInfoMap[saleNumber].paused, "PrivateSale:sale release paused");
        _;
    }
    modifier onlyUserReleaseNotPaused(address user, uint256 saleNumber) {
        require(!userAssetInfos[user][saleNumber].paused, "PrivateSale:user release paused");
        _;
    }

    ///@dev create a sale
    ///@param saleNumber the number of the sale
    ///@param limitAmount_ total VM3 that will be  sold
    ///@param exchangeRate_ VM3 price, VM3/USD
    function createSale(
        uint256 saleNumber,
        uint256 limitAmount_,
        uint256 exchangeRate_,
        bytes[] memory sigs
    ) external onlyMultipleOwner(_hashToSign(_createSaleHash(saleNumber, limitAmount_, exchangeRate_, nonce)), sigs) {
        require(saleNumber > 0);
        require(saleInfoMap[saleNumber].number == 0);

        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        saleInfo.number = saleNumber;
        saleInfo.limitAmount = limitAmount_;
        saleInfo.exchangeRate = exchangeRate_;
        saleInfo.minSell = DefaultMinSell;
        saleInfo.maxSell = DefaultMaxSell;

        saleNumberList.push(saleNumber);
        emit SaleCreated(msg.sender, saleNumber, limitAmount_, exchangeRate_);
    }

    ///@dev buy VM3
    ///@param saleNumber number of sale
    ///@param paymentToken which token user want to pay
    ///@param amount amount of token you pay to buy VM3
    function buy(
        uint256 saleNumber,
        address paymentToken,
        uint256 amount
    )
        external
        payable
        nonReentrant
        onlySaleExist(saleNumber)
        onlyInWhiteList(saleNumber)
        onlySaleInProgress(saleNumber)
        onlySupportedPaymentToken(paymentToken)
    {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        if (paymentToken == address(0)) {
            amount = msg.value;
        } else {
            IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        }

        uint256 gotVM3 = _canGotVM3(
            paymentToken,
            amount,
            saleInfo.exchangeRate,
            paymentTokenPriceFeedMap[paymentToken]
        );
        require(gotVM3 + saleInfo.soldAmount < saleInfo.limitAmount, "PrivateSale: Exceed sale limit");
        require(gotVM3 > saleInfo.minSell);
        saleInfo.soldAmount += gotVM3;

        //modify user asset
        AssetInfo storage assetInfo = userAssetInfos[msg.sender][saleNumber];
        if (assetInfo.saleNumber == 0) {
            assetInfo.saleNumber = saleNumber;
            assetInfo.releaseTotalMonths = saleInfo.releaseTotalMonths;
        }
        assetInfo.amount += gotVM3;
        require(assetInfo.amount < saleInfo.maxSell);
        emit BuyVM3(msg.sender, saleNumber, paymentToken, amount, gotVM3);
    }

    ///@dev user take out VM3
    function withdrawVM3(uint64[] memory saleNumbers) external nonReentrant {
        for (uint64 i = 0; i < saleNumbers.length; i++) {
            _witdrawVM3(saleNumbers[i]);
        }
    }

    ///@dev manager take out VM3
    function withdrawAllSaleVM3(
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(keccak256(abi.encodePacked(DOMAIN, keccak256("withdrawAllSaleVM3()"), nonce))),
            sigs
        )
    {
        uint256 amount = IERC20(VM3).balanceOf(address(this));
        IERC20(VM3).transferFrom(address(this), msg.sender, amount);
    }

    ///@dev manager take out sale volume
    function withdrawSaleVolume(
        address receipt,
        address tokenAddress,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(DOMAIN, keccak256("withdrawSaleVolume(address receipt,address token)"), nonce)
                )
            ),
            sigs
        )
    {
        if (tokenAddress == address(0)) {
            (bool sent, ) = receipt.call{value: address(this).balance}("");
            require(sent);
            return;
        }

        IERC20 token = IERC20(tokenAddress);
        token.transferFrom(address(this), receipt, token.balanceOf(address(this)));
    }

    //settings
    function addPaymentToken(
        address paymentToken,
        address paymentTokenPriceFeed,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("addPaymentToken(address paymentToken,address paymentTokenPriceFeed)"),
                        paymentToken,
                        paymentTokenPriceFeed,
                        nonce
                    )
                )
            ),
            sigs
        )
    {
        (, int256 price, , , ) = AggregatorV3Interface(paymentTokenPriceFeed).latestRoundData();
        require(price > 0, "PrivateSale: priceFeed not exist");
        paymentTokenPriceFeedMap[paymentToken] = paymentTokenPriceFeed;

        emit NewPaymentTokenAdded(paymentToken, paymentTokenPriceFeed);
    }

    function setSaleTime(
        uint64 saleNumber,
        uint64 startTime,
        uint64 endTime,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(_hashToSign(_setSaleTimeHash(saleNumber, startTime, endTime, nonce)), sigs)
        onlySaleExist(saleNumber)
    {
        require(startTime < endTime);
        saleInfoMap[saleNumber].startTime = startTime;
        saleInfoMap[saleNumber].endTime = endTime;
    }

    function setSaleExchangeRate(
        uint64 saleNumber,
        uint256 exchangeRate,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(_hashToSign(_setSaleExchangeRateHash(saleNumber, exchangeRate, nonce)), sigs)
        onlySaleExist(saleNumber)
    {
        saleInfoMap[saleNumber].exchangeRate = exchangeRate;
    }

    function setReleaseParams(
        uint256 saleNumber,
        uint64 releaseStartTime,
        uint32 releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(_setReleaseParamsHash(saleNumber, releaseStartTime, releaseTotalMonths, nonce)),
            sigs
        )
        onlySaleExist(saleNumber)
    {
        saleInfoMap[saleNumber].releaseStartTime = releaseStartTime;
        saleInfoMap[saleNumber].releaseTotalMonths = releaseTotalMonths;
    }

    function setSaleReleaseStatus(
        uint256 saleNumber,
        bool paused, // true pused; false not paused
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("setSaleReleaseStatus(uint256 saleNumber,bool paused)"),
                        saleNumber,
                        paused,
                        nonce
                    )
                )
            ),
            sigs
        )
        onlySaleExist(saleNumber)
    {
        saleInfoMap[saleNumber].paused = paused;
    }

    function setUserReleaseStatus(
        uint256 saleNumber,
        bool paused // true pused; false not paused
    ) external onlyAssetExist(msg.sender, saleNumber) {
        userAssetInfos[msg.sender][saleNumber].paused = paused;
    }

    function setWhiteList(
        uint256 saleNumber,
        address[] memory users,
        bool added, // true add; false remove
        bytes[] memory sigs
    )
        external
        onlySaleExist(saleNumber)
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("setWhiteList(uint256 saleNumber,address[] users,bool added)"),
                        saleNumber,
                        users,
                        added,
                        nonce
                    )
                )
            ),
            sigs
        )
    {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        for (uint256 i = 0; i < users.length; i++) {
            saleInfo.whiteList[users[i]] = added;
        }
        emit SetWhiteList(saleNumber, users, added);
    }

    function setSaleMaxAndMinSell(
        uint256 saleNumber,
        uint256 maxSell,
        uint256 minSell,
        bytes[] memory sigs
    )
        external
        onlySaleExist(saleNumber)
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("setSaleMaxAndMinSell(uint256 saleNumber,uint256 maxSell,uint256 minSell)"),
                        saleNumber,
                        maxSell,
                        minSell,
                        nonce
                    )
                )
            ),
            sigs
        )
    {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        saleInfo.maxSell = maxSell;
        saleInfo.minSell = minSell;
    }

    function setUserReleaseMonths(
        address user,
        uint256 saleNumber,
        uint32 releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(_hashToSign(_setUserReleaseMonthsHash(user, saleNumber, releaseTotalMonths, nonce))),
            sigs
        )
        onlyAssetExist(user, saleNumber)
    {
        require(userAssetInfos[user][saleNumber].withdrawnMonths < releaseTotalMonths);
        userAssetInfos[user][saleNumber].releaseTotalMonths = releaseTotalMonths;
    }

    function _canGotVM3(
        address paymentToken,
        uint256 amount,
        uint256 exchangeRate,
        address priceFeed
    ) internal view returns (uint256) {
        int256 price = 10 ** 18;
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
            price *= (10 ** (18 - usdDecimals)).toInt256();
        } else if (usdDecimals > 18) {
            price /= (10 ** (usdDecimals - 18)).toInt256();
        }

        if (tokenDecimals < 18) {
            amount *= 10 ** (18 - tokenDecimals);
        } else if (tokenDecimals > 18) {
            amount /= 10 ** (usdDecimals - 18);
        }

        uint256 gotVM3 = (amount * uint256(price) * 10 ** 18) / exchangeRate;
        require(gotVM3 > 0, "PrivateSale: gotVM3 is zero");

        return gotVM3;
    }

    ///@dev user release VM3 to his account
    function _witdrawVM3(
        uint256 saleNumber
    )
        internal
        onlyAssetExist(msg.sender, saleNumber)
        onlySaleReleaseNotPuased(saleNumber)
        onlyUserReleaseNotPaused(msg.sender, saleNumber)
    {
        AssetInfo memory assetInfo = userAssetInfos[msg.sender][saleNumber];
        require(block.timestamp - assetInfo.latestWithdrawTime > MONTH, "PrivateSale: has withdraw recently");

        if (assetInfo.latestWithdrawTime == 0) {
            assetInfo.latestWithdrawTime = saleInfoMap[assetInfo.saleNumber].releaseStartTime;
        }
        uint16 canWithdrawMonths = uint16((block.timestamp - assetInfo.latestWithdrawTime) / MONTH);

        uint256 withdrawAmount = ((assetInfo.amount - assetInfo.amountWithdrawn) /
            (assetInfo.releaseTotalMonths - assetInfo.withdrawnMonths)) * canWithdrawMonths;
        IERC20(VM3).transferFrom(address(this), msg.sender, withdrawAmount);

        assetInfo.amountWithdrawn += withdrawAmount;
        assetInfo.latestWithdrawTime = block.timestamp.toUint64();
        assetInfo.withdrawnMonths += canWithdrawMonths;
    }

    /*
     * calculate hash,just for safeOwnable, internal function
     */
    function _createSaleHash(
        uint256 saleNumber_,
        uint256 limitAmount_,
        uint256 exchangeRate_,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("createSale(uint256 saleNumber,uint256 limitAmount,uint256 exchangeRate)"),
                    saleNumber_,
                    limitAmount_,
                    exchangeRate_,
                    nonce_
                )
            );
    }

    function _setSaleTimeHash(
        uint256 saleNumber_,
        uint64 startTime_,
        uint64 endTime_,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setSaleTime(uint256 saleNumber,uint64 startTime,uint64 endTime)"),
                    saleNumber_,
                    startTime_,
                    endTime_,
                    nonce_
                )
            );
    }

    function _setSaleExchangeRateHash(
        uint256 saleNumber_,
        uint256 exchangeRate_,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setSaleExchangeRate(uint256 saleNumber,uint256 exchangeRate)"),
                    saleNumber_,
                    exchangeRate_,
                    nonce_
                )
            );
    }

    function _setReleaseParamsHash(
        uint256 saleNumber,
        uint64 releaseStartTime,
        uint32 releaseTotalMonths,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setReleaseParams(uint256 saleNumber,uint64 releaseStartTime,uint32 releaseTotalMonths)"),
                    saleNumber,
                    releaseStartTime,
                    releaseTotalMonths,
                    nonce_
                )
            );
    }

    function _setUserReleaseMonthsHash(
        address user,
        uint256 saleNumber,
        uint32 releaseTotalMonths,
        uint256 nonce_
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("setUserReleaseMonths(address user,uint256 saleNumber,uint32 releaseTotalMonths)"),
                    user,
                    saleNumber,
                    releaseTotalMonths,
                    nonce_
                )
            );
    }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    /*
     * query
     */
    function totalSale() external view returns (uint256) {
        return (saleNumberList.length);
    }
}
