// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../../Abstract/SafeOwnableUpgradeable.sol";

contract Land is Initializable, ERC721Upgradeable, UUPSUpgradeable, SafeOwnableUpgradeable {
    event Activation(uint256 tokenId, uint256 active, bool status);

    struct activeValue {
        bool status;
        uint256 conditions;
        uint256 total;
        mapping(address => uint256) injection_details;
    }

    uint256 public _tokenIdCounter;
    mapping(uint256 => string) tokenURIs;
    bytes32 private DOMAIN;
    mapping(uint256 => activeValue) _active_value;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        uint256 chainId,
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
                chainId,
                address(this)
            )
        );
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function awardItem(
        address player,
        uint256 conditions,
        string memory tokenURI_
    ) public onlyOwner returns (uint256) {
        uint256 newItemId = _tokenIdCounter;
        _mint(player, newItemId);
        tokenURIs[newItemId] = tokenURI_;
        _active_value[newItemId].conditions = conditions;
        _active_value[newItemId].status = false;
        _increment();
        return newItemId;
    }

    function _increment() private onlyOwner {
        unchecked {
            _tokenIdCounter += 1;
        }
    }

    function getInjectActiveHash(
        uint256 tokenId,
        uint256 active,
        address to,
        uint256 nonce_
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    DOMAIN,
                    keccak256("injectActive(uint256,uint256,uint256)"),
                    tokenId,
                    active,
                    to,
                    nonce_
                )
            );
    }

    function getInjectActiveHashToSign(
        uint256 tokenId,
        uint256 active,
        address to,
        uint256 nonce_
    ) public view returns (bytes32) {
        return _hashToSign(getInjectActiveHash(tokenId, active, to, nonce_));
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return tokenURIs[tokenId];
    }

    function getLandStatus(uint256 tokenId) public view returns (bool) {
        return _active_value[tokenId].status;
    }

    function getLandConditions(uint256 tokenId) public view returns (uint256) {
        return _active_value[tokenId].conditions;
    }

    function getLandTotal(uint256 tokenId) public view returns (uint256) {
        return _active_value[tokenId].total;
    }

    function getLandInjectionDetails(uint256 tokenId, address account) public view returns (uint256) {
        return _active_value[tokenId].injection_details[account];
    }

    function injectActive(
        uint256 tokenId,
        uint256 active,
        uint256 nonce
    ) public {
        _injectActive(tokenId, active, _msgSender(), nonce);
    }

    function injectActiveTo(
        uint256 tokenId,
        uint256 active,
        address to,
        uint256 nonce
    ) public {
        _injectActive(tokenId, active, to, nonce);
    }

    function _injectActive(
        uint256 tokenId,
        uint256 active,
        address account,
        uint256 nonce
    ) private onlyOperationPendding(_hashToSign(getInjectActiveHash(tokenId, active, account, nonce))) {
        require(
            _active_value[tokenId].total + active <= _active_value[tokenId].conditions,
            "Land: too many active values"
        );
        _active_value[tokenId].total += active;
        _active_value[tokenId].injection_details[account] += active;

        if (_active_value[tokenId].total == _active_value[tokenId].conditions) _active_value[tokenId].status = true;

        emit Activation(tokenId, active, _active_value[tokenId].status);
    }

    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }
}
