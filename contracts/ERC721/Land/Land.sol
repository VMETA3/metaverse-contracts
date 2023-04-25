// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";

import "../../Abstract/SafeOwnableUpgradeable.sol";

contract Land is Initializable, ERC721URIStorageUpgradeable, UUPSUpgradeable, SafeOwnableUpgradeable {
    event Activation(uint256 tokenId, uint256 active, bool status);

    // Struct to hold active value details for a token
    struct activeValue {
        bool status; // Whether the token is active or not
        uint256 conditions; // The maximum number of active values allowed for the token
        uint256 total; // The current total of active values for the token
        mapping(address => uint256) injection_details; // Details of active value injections for each address
    }

    uint256 public _tokenIdCounter; // Counter for token IDs
    bytes32 private DOMAIN; // Domain hash for signature verification
    mapping(uint256 => activeValue) _active_value; // Mapping of token IDs to active value details

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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

    /**
     * @dev Award an item to a player
     * @param player The address of the player to award the item to
     * @param conditions The conditions of the item
     * @param tokenURI_ The URI of the token
     * @return newItemId The ID of the newitem
     */
    function awardItem(
        address player,
        uint256 conditions,
        string memory tokenURI_
    ) public onlyOwner returns (uint256) {
        uint256 newItemId = _tokenIdCounter;
        _safeMint(player, newItemId);
        _setTokenURI(newItemId, tokenURI_);
        _active_value[newItemId].conditions = conditions;
        _active_value[newItemId].status = (conditions == 0) ? true : false;
        _increment();
        return newItemId;
    }

    /**
     * @dev Increment the token ID counter
     */
    function _increment() private onlyOwner {
        unchecked {
            _tokenIdCounter += 1;
        }
    }

    /**
     * @dev Get the hash for injecting an active value
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param to The address to inject the active value to
     * @param nonce_ The nonce for the transaction
     * @return The hash for injecting an active value
     */
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
                    keccak256("injectActive(uint256,uint256,address,uint256)"),
                    tokenId,
                    active,
                    to,
                    nonce_
                )
            );
    }

    /**
     * @dev Get the hash to sign for injecting an active value
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param to The address to inject the active value to
     * @param nonce_ The nonce for the transaction
     * @return The hash to sign for injecting an active value
     */
    function getInjectActiveHashToSign(
        uint256 tokenId,
        uint256 active,
        address to,
        uint256 nonce_
    ) public view returns (bytes32) {
        return _hashToSign(getInjectActiveHash(tokenId, active, to, nonce_));
    }

    /**
     * @dev Get the status of a land token
     * @param tokenId The ID of the token
     * @return The status of the land token
     */
    function getLandStatus(uint256 tokenId) public view returns (bool) {
        return _active_value[tokenId].status;
    }

    /**
     * @dev Get the conditions of a land token
     * @param tokenId The ID of the token
     * @return The conditions of the land token
     */
    function getLandConditions(uint256 tokenId) public view returns (uint256) {
        return _active_value[tokenId].conditions;
    }

    /**
     * @dev Get the total active value of a land token
     * @param tokenId The ID of the token
     * @return The total active value of the land token
     */
    function getLandTotal(uint256 tokenId) public view returns (uint256) {
        return _active_value[tokenId].total;
    }

    /**
     * @dev Get the injection details of a land token for a specific account
     * @param tokenId The ID of the token
     * @param account The account to get the injection details for
     * @return The injection details of the land token for the specified account
     */
    function getLandInjectionDetails(uint256 tokenId, address account) public view returns (uint256) {
        return _active_value[tokenId].injection_details[account];
    }

    /**
     * @dev Inject an active value to a land token
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param nonce The nonce for the transaction
     */
    function injectActive(
        uint256 tokenId,
        uint256 active,
        uint256 nonce
    ) public {
        _injectActive(tokenId, active, _msgSender(), nonce);
    }

    /**
     * @dev Inject an active value to a land token for a specific address
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param to The address to inject the active value to
     * @param nonce The nonce for the transaction
     */
    function injectActiveTo(
        uint256 tokenId,
        uint256 active,
        address to,
        uint256 nonce
    ) public {
        _injectActive(tokenId, active, to, nonce);
    }

    /**
     * @dev Internal function to inject an active value to a land token
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param account The account to inject the active value to
     * @param nonce The nonce for the transaction
     */
    function _injectActive(
        uint256 tokenId,
        uint256 active,
        address account,
        uint256 nonce
    ) private onlyOperationPending(_hashToSign(getInjectActiveHash(tokenId, active, account, nonce))) {
        require(active > 0, "Land: active value must be greater than zero");
        require(
            _active_value[tokenId].total + active <= _active_value[tokenId].conditions,
            "Land: too many active values"
        );
        _active_value[tokenId].total += active;
        _active_value[tokenId].injection_details[account] += active;

        if (_active_value[tokenId].total == _active_value[tokenId].conditions) _active_value[tokenId].status = true;

        emit Activation(tokenId, active, _active_value[tokenId].status);
    }

    /**
     * @dev Internal function to get the hash to sign for injecting an active value
     * @param data The data to hash
     * @return The hash to sign for injecting an active value
     */
    function _hashToSign(bytes32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }
}
