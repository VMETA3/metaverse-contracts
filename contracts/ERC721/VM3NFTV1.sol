// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../Abstract/SafeOwnableUpgradeable.sol";

contract VM3NFTV1 is Initializable, ERC721Upgradeable, UUPSUpgradeable, SafeOwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20;

    event Build(address indexed user, uint256 tokenId);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event Refund(address indexed user, uint256 amount, bool Disposal);

    IERC20 public ERC20Token;
    bytes32 private DOMAIN;
    uint256 private locked;
    uint256 private _tokenIdCounter;
    uint256 private totalERC20Token;
    uint256 private _costs;
    uint256 private atDisposal;
    mapping(uint256 => string) private _tokenURIs;
    mapping(address => uint256) private _depositAmounts;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    modifier lock() {
        require(locked == 0, "VM3NFT: LOCKED");
        locked = 1;
        _;
        locked = 0;
    }

    modifier deduct() {
        require(_depositAmounts[_msgSender()] >= _costs, "VM3NFT: Insufficient deposits");
        _depositAmounts[_msgSender()] -= _costs;
        atDisposal += _costs;
        _;
    }

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        string memory name_,
        string memory symbol_,
        address[] memory owners,
        uint8 signRequred
    ) public initializer {
        __ERC721_init(name_, symbol_);

        __Ownable_init(owners, signRequred);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(
                keccak256("Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name())),
                block.chainid,
                address(this)
            )
        );
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setERC20(address token) public onlyOwner {
        ERC20Token = IERC20(token);
    }

    function setCosts(uint256 costs_) public onlyOwner {
        _costs = costs_;
    }

    function getBuildHash(
        address to,
        string memory tokenURI_,
        uint256 nonce_
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("build(string,bytes[])"), to, tokenURI_, nonce_));
    }

    function getRefundHash(
        address to,
        uint256 amount,
        uint256 nonce_
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("refund(address,uint256)"), to, amount, nonce_));
    }

    function getrefundAtDisposalHash(
        address to,
        uint256 amount,
        uint256 nonce_
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("refundAtDisposal(address,uint256)"), to, amount, nonce_));
    }

    function build(string memory tokenURI_, uint256 nonce_) external deduct returns (uint256) {
        return _build(_msgSender(), tokenURI_, nonce_);
    }

    function buildTo(
        address to,
        string memory tokenURI_,
        uint256 nonce_
    ) external deduct returns (uint256) {
        return _build(to, tokenURI_, nonce_);
    }

    function _increment() private {
        unchecked {
            _tokenIdCounter += 1;
        }
    }

    function _build(
        address to,
        string memory tokenURI_,
        uint256 nonce_
    ) private onlyOperationPendding(HashToSign(getBuildHash(to, tokenURI_, nonce_))) returns (uint256) {
        uint256 newItemId = _tokenIdCounter;
        _mint(to, newItemId);
        _tokenURIs[newItemId] = tokenURI_;
        _increment();
        emit Build(to, newItemId);
        return newItemId;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return _tokenURIs[tokenId];
    }

    function deposit(uint256 amount) external lock {
        _deposit(_msgSender(), amount);
    }

    function depositTo(address to, uint256 amount) external lock {
        _deposit(to, amount);
    }

    function _deposit(address to, uint256 amount) private {
        require(amount > 0, "VM3NFT: Amount is zero");
        ERC20Token.transferFrom(_msgSender(), address(this), amount);
        totalERC20Token += amount;
        _depositAmounts[to] += amount;
        emit Deposit(to, amount);
    }

    function withdraw(uint256 amount) external lock {
        _withdraw(_msgSender(), _msgSender(), amount);
    }

    function withdrawTo(address to, uint256 amount) external lock {
        _withdraw(_msgSender(), to, amount);
    }

    function _withdraw(
        address from,
        address to,
        uint256 amount
    ) private {
        require(amount > 0, "VM3NFT: amount is zero");
        require(_depositAmounts[from] >= amount, "VM3NFT: Insufficient balance");
        _depositAmounts[from] -= amount;
        ERC20Token.transfer(to, amount);
        emit Withdraw(to, amount);
    }

    function refund(
        address to,
        uint256 amount,
        uint256 nonce_
    ) public lock onlyOperationPendding(HashToSign(getRefundHash(to, amount, nonce_))) {
        require(_depositAmounts[to] >= amount, "VM3NFT: Insufficient user balance");
        _depositAmounts[to] -= amount;
        _refund(to, amount, false);
    }

    function refundAtDisposal(
        address to,
        uint256 amount,
        uint256 nonce_
    ) public lock onlyOperationPendding(HashToSign(getrefundAtDisposalHash(to, amount, nonce_))) {
        require(atDisposal >= amount, "VM3NFT: Insufficient atDisposal");
        atDisposal -= amount;
        _refund(to, amount, true);
    }

    function _refund(
        address to,
        uint256 amount,
        bool disposal
    ) private onlyOwner {
        require(amount > 0, "VM3NFT: amount is zero");
        require(ERC20Token.balanceOf(address(this)) >= amount, "");
        ERC20Token.transfer(to, amount);
        emit Refund(to, amount, disposal);
    }

    function HashToSign(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }

    function costs() public view returns (uint256) {
        return _costs;
    }

    function balanceOfERC20(address account) public view returns (uint256) {
        return _depositAmounts[account];
    }
}
