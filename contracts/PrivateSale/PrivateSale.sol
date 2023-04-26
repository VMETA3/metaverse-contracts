// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import {SafeOwnable} from "../Abstract/SafeOwnable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function decimals() external view returns (uint8);

    function balanceOf(address account) external view returns (uint256);
}

contract PrivateSale is SafeOwnable, ReentrancyGuard {
    /*
     * constant
     */
    uint64 public constant MONTH = 60 * 60 * 24 * 30;

    /*
     * events
     */
    event SaleCreated(address from, uint256 indexed saleNumber, uint256 limitAmount, uint256 price);
    event BuyVM3(
        address indexed from,
        uint256 indexed saleNumber,
        address paymentToken,
        uint256 amount,
        uint256 totalVM3
    );
    event WithdrawVM3(address indexed recipient, uint256 indexed saleNumber, uint256 amount);
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
        uint256 price; // USD, decimal is 18
        uint64 startTime;
        uint64 endTime;
        uint64 releaseStartTime;
        uint32 releaseTotalMonths;
        // who can buy this vm3 sale
        mapping(address => bool) whiteList;
        // max/min sell vm3 amount for everyone
        uint256 maxBuy;
        uint256 minBuy;
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
    address public VM3;
    bytes32 public DOMAIN;
    // USDT（0x55d398326f99059fF775485246999027B3197955）
    // BUSD（0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56）
    mapping(address => bool) public paymentTokenMap;
    mapping(uint256 => SaleInfo) public saleInfoMap;
    uint256[] public saleNumberList;
    //  user=>saleNumber=>AssetInfo
    mapping(address => mapping(uint256 => AssetInfo)) public userAssetInfos;
    bool public enableWhiteList = true;

    constructor(
        address[] memory owners,
        uint8 signRequired,
        address vm3,
        address usdt
    ) SafeOwnable(owners, signRequired) {
        DOMAIN = keccak256(
            abi.encode(keccak256("Domain(uint256 chainId,address verifyingContract)"), block.chainid, address(this))
        );

        VM3 = vm3;

        //initialize payment token
        paymentTokenMap[usdt] = true;
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
        require(paymentTokenMap[paymentToken], "PrivateSale:PaymentToken is not supported");
        _;
    }
    modifier onlySaleInProgress(uint256 saleNumber) {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        require(
            _blockTimestamp() >= saleInfo.startTime && _blockTimestamp() <= saleInfo.endTime,
            "PrivateSale: Sale is not in progress"
        );
        _;
    }
    modifier onlyInWhiteList(uint256 saleNumber) {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        require(saleInfo.whiteList[msg.sender] || !enableWhiteList, "PrivateSale:user not in whiteList");
        _;
    }
    modifier onlySaleNotPuased(uint256 saleNumber) {
        require(!saleInfoMap[saleNumber].paused, "PrivateSale:sale paused");
        _;
    }
    modifier onlyUserReleaseNotPaused(address user, uint256 saleNumber) {
        require(!userAssetInfos[user][saleNumber].paused, "PrivateSale:user asset paused");
        _;
    }
    modifier onlySaleReleaseStart(uint256 saleNumber) {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        require(saleInfo.releaseStartTime < _blockTimestamp(), "PrivateSale:sale release not start");
        _;
    }

    function createSale(
        uint256 saleNumber,
        uint256 limitAmount,
        uint256 price,
        uint256 maxBuy,
        uint256 minBuy,
        uint64[3] memory times, // startTime, endTime, releaseStartTime
        uint32 releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256(
                            "createSale(uint256 saleNumber,uint256 limitAmount,uint256 price,uint256 maxBuy,uint256 minBuy,uint64 startTime,uint64 endTime,uint64 releaseStartTime,uint32 releaseTotalMonths)"
                        ),
                        saleNumber,
                        limitAmount,
                        price,
                        maxBuy,
                        minBuy,
                        times[0],
                        times[1],
                        times[2],
                        releaseTotalMonths,
                        nonce
                    )
                )
            ),
            sigs
        )
    {
        require(saleNumber > 0 && saleInfoMap[saleNumber].number == 0);

        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        saleInfo.number = saleNumber;
        saleInfo.limitAmount = limitAmount;
        saleInfo.price = price;
        saleInfo.maxBuy = maxBuy;
        saleInfo.minBuy = minBuy;
        saleInfo.startTime = times[0];
        saleInfo.endTime = times[1];
        saleInfo.releaseStartTime = times[2];
        saleInfo.releaseTotalMonths = releaseTotalMonths;

        saleNumberList.push(saleNumber);
        emit SaleCreated(msg.sender, saleNumber, limitAmount, price);
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
        onlySaleNotPuased(saleNumber)
    {
        SaleInfo storage saleInfo = saleInfoMap[saleNumber];
        if (paymentToken == address(0)) {
            amount = msg.value;
        } else {
            IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        }

        uint256 gotVM3 = _canGotVM3(paymentToken, amount, saleInfo.price);
        require(gotVM3 + saleInfo.soldAmount < saleInfo.limitAmount, "PrivateSale: Exceed sale limit");
        require(gotVM3 > saleInfo.minBuy);
        saleInfo.soldAmount += gotVM3;

        //modify user asset
        AssetInfo storage assetInfo = userAssetInfos[msg.sender][saleNumber];
        if (assetInfo.saleNumber == 0) {
            assetInfo.saleNumber = saleNumber;
            assetInfo.releaseTotalMonths = saleInfo.releaseTotalMonths;
        }
        assetInfo.amount += gotVM3;
        require(assetInfo.amount < saleInfo.maxBuy);
        emit BuyVM3(msg.sender, saleNumber, paymentToken, amount, gotVM3);
    }

    ///@dev user take out VM3
    function withdrawVM3(uint64[] memory saleNumbers, address recipient) external nonReentrant {
        for (uint64 i = 0; i < saleNumbers.length; i++) {
            _witdrawVM3(saleNumbers[i], recipient);
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
        IERC20(VM3).transfer(msg.sender, amount);
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
        token.transfer(receipt, token.balanceOf(address(this)));
    }

    //settings
    function setSaleStatus(
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
                        keccak256("setSaleStatus(uint256 saleNumber,bool paused)"),
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

    function setUserReleaseMonths(
        address user,
        uint256 saleNumber,
        uint32 releaseTotalMonths,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("setUserReleaseMonths(address user,uint256 saleNumber,uint32 releaseTotalMonths)"),
                        user,
                        saleNumber,
                        releaseTotalMonths,
                        nonce
                    )
                )
            ),
            sigs
        )
        onlyAssetExist(user, saleNumber)
    {
        require(userAssetInfos[user][saleNumber].withdrawnMonths < releaseTotalMonths);
        userAssetInfos[user][saleNumber].releaseTotalMonths = releaseTotalMonths;
    }

    function setEnableWhiteList(
        bool enable,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(abi.encodePacked(DOMAIN, keccak256("setEnableWhiteList(bool enable)"), enable, nonce))
            ),
            sigs
        )
    {
        enableWhiteList = enable;
    }

    function setPaymentToken(
        address paymentToken,
        bool enable,
        bytes[] memory sigs
    )
        external
        onlyMultipleOwner(
            _hashToSign(
                keccak256(
                    abi.encodePacked(
                        DOMAIN,
                        keccak256("setPaymentToken(address paymentToken,bool enable)"),
                        paymentToken,
                        enable,
                        nonce
                    )
                )
            ),
            sigs
        )
    {
        paymentTokenMap[paymentToken] = enable;
    }

    /// dev calculate how many VM3 user can got if he pay amount paymentToken.
    function _canGotVM3(address paymentToken, uint256 payAmount, uint256 vm3Price) internal view returns (uint256) {
        uint8 paymentTokenDecimals = 18;
        if (paymentToken != address(0)) {
            paymentTokenDecimals = IERC20(paymentToken).decimals();
        }

        if (paymentTokenDecimals < 18) {
            payAmount *= 10 ** (18 - paymentTokenDecimals);
        } else if (paymentTokenDecimals > 18) {
            payAmount /= 10 ** (paymentTokenDecimals - 18);
        }

        uint256 gotVM3 = (payAmount * 10 ** 18) / vm3Price;
        require(gotVM3 > 0, "PrivateSale: buy zero VM3");

        return gotVM3;
    }

    ///@dev user release VM3 to his account
    function _witdrawVM3(
        uint256 saleNumber,
        address user
    )
        internal
        onlyAssetExist(user, saleNumber)
        onlySaleNotPuased(saleNumber)
        onlyUserReleaseNotPaused(user, saleNumber)
        onlySaleReleaseStart(saleNumber)
    {
        (uint16 canWithdrawMonths, uint256 withdrawAmount) = _canWithdrawVM3(user, saleNumber);
        require(withdrawAmount > 0);
        IERC20(VM3).transfer(user, withdrawAmount);

        AssetInfo storage assetInfo = userAssetInfos[user][saleNumber];
        assetInfo.amountWithdrawn += withdrawAmount;
        assetInfo.latestWithdrawTime = _blockTimestamp();
        assetInfo.withdrawnMonths += canWithdrawMonths;

        emit WithdrawVM3(user, saleNumber, withdrawAmount);
    }

    function _canWithdrawVM3(
        address user,
        uint256 saleNumber
    ) internal view returns (uint16 canWithdrawMonths, uint256 withdrawAmount) {
        AssetInfo memory assetInfo = userAssetInfos[user][saleNumber];
        if (assetInfo.latestWithdrawTime > 0) {
            require(_blockTimestamp() - assetInfo.latestWithdrawTime > MONTH, "PrivateSale: has withdraw recently");
        }

        if (assetInfo.latestWithdrawTime == 0) {
            canWithdrawMonths = uint16((_blockTimestamp() - saleInfoMap[saleNumber].releaseStartTime) / MONTH);
        } else {
            canWithdrawMonths = uint16((_blockTimestamp() - assetInfo.latestWithdrawTime) / MONTH);
        }

        withdrawAmount =
            ((assetInfo.amount - assetInfo.amountWithdrawn) /
                (assetInfo.releaseTotalMonths - assetInfo.withdrawnMonths)) *
            canWithdrawMonths;
    }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    /// @dev Returns the block timestamp truncated to 64 bits, i.e. mod 2**64. This method is overridden in tests.
    function _blockTimestamp() internal view virtual returns (uint64) {
        return uint64(block.timestamp); // truncation is desired
    }

    /*
     * query
     */
    function totalSale() external view returns (uint256) {
        return (saleNumberList.length);
    }

    function canGotVM3(address paymentToken, uint256 payAmount, uint256 vm3Price) external view returns (uint256) {
        return _canGotVM3(paymentToken, payAmount, vm3Price);
    }

    function canWithdrawVM3(address user, uint256 saleNumber) external view returns (uint16, uint256) {
        return _canWithdrawVM3(user, saleNumber);
    }

    function getUserAssetInfo(
        address user,
        uint256 saleNumber
    )
        external
        view
        returns (
            uint256 amount,
            uint256 amountWithdrawn,
            uint64 latestWithdrawTime,
            uint32 withdrawnMonths,
            uint32 releaseTotalMonths
        )
    {
        amount = userAssetInfos[user][saleNumber].amount;
        amountWithdrawn = userAssetInfos[user][saleNumber].amountWithdrawn;
        latestWithdrawTime = userAssetInfos[user][saleNumber].latestWithdrawTime;
        withdrawnMonths = userAssetInfos[user][saleNumber].withdrawnMonths;
        releaseTotalMonths = userAssetInfos[user][saleNumber].releaseTotalMonths;
    }
}
