// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

contract Land is Initializable, ERC721URIStorageUpgradeable, UUPSUpgradeable, AccessControlUpgradeable {
    event Activation(uint256 tokenId, uint256 active, bool status);
    event EnableMintRequest();
    event ActiveThresholdRequest(uint256 newThreshold);

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

    // Permission control
    IERC20 public VOV; // Vitality of VMeta3 token
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    address public admin;
    address public minter;

    // Land status modification conditions
    uint256 public activeThreshold;
    uint256 public minimumInjectionQuantity;

    // Minting and active threshold modification control
    bool public enableMintStatus;
    uint256 public enableMintRequestTime;
    uint256 public newActiveThreshold;
    uint256 public activeThresholdRequestTime;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    modifier checkMint() {
        if (enableMintRequestTime > 0 && block.timestamp > enableMintRequestTime + 2 days) {
            enableMintStatus = true;
            enableMintRequestTime = 0;
        }
        _;
    }

    modifier checkActiveThreshold() {
        if (activeThresholdRequestTime > 0 && block.timestamp > activeThresholdRequestTime + 2 days) {
            activeThreshold = newActiveThreshold;
            activeThresholdRequestTime = 0;
        }
        require(activeThreshold > 0, "Land: Activation thresholds not set");
        _;
    }

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        string memory name_,
        string memory symbol_,
        address vov,
        address admin_,
        address minter_,
        uint256 activeThreshold_,
        uint256 minimumInjectionQuantity_
    ) public initializer {
        __ERC721_init(name_, symbol_);

        __UUPSUpgradeable_init();

        DOMAIN = keccak256(
            abi.encode(
                keccak256("Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name())),
                block.chainid,
                address(this)
            )
        );

        VOV = IERC20(vov);
        admin = admin_;
        minter = minter_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        activeThreshold = activeThreshold_;
        minimumInjectionQuantity = minimumInjectionQuantity_;
        // Set the initial mint status enable
        enableMintStatus = true;
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /**
     * @dev Award an item to a player
     * @param player The address of the player to award the item to
     * @param tokenURI_ The URI of the token
     * @return newItemId The ID of the newitem
     */
    function awardItem(
        address player,
        string memory tokenURI_
    ) public onlyRole(MINTER_ROLE) checkMint checkActiveThreshold returns (uint256) {
        require(enableMintStatus, "Land: Minting is disabled");

        uint256 newItemId = _tokenIdCounter;
        _safeMint(player, newItemId);
        _setTokenURI(newItemId, tokenURI_);
        _active_value[newItemId].conditions = activeThreshold;
        _increment();
        return newItemId;
    }

    /**
     * @dev Increment the token ID counter
     */
    function _increment() private onlyRole(MINTER_ROLE) {
        unchecked {
            _tokenIdCounter += 1;
        }
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
     */
    function injectActive(uint256 tokenId, uint256 active) public {
        _injectActive(tokenId, active, _msgSender());
    }

    /**
     * @dev Inject an active value to a land token for a specific address
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param to The address to inject the active value to
     */
    function injectActiveTo(uint256 tokenId, uint256 active, address to) public {
        _injectActive(tokenId, active, to);
    }

    /**
     * @dev Internal function to inject an active value to a land token
     * @param tokenId The ID of the token
     * @param active The active value to inject
     * @param account The account to inject the active value to
     */
    function _injectActive(uint256 tokenId, uint256 active, address account) private {
        require(!_active_value[tokenId].status, "Land: already active");
        require(
            active >= minimumInjectionQuantity,
            "Land: active value must be greater than minimum injection quantity"
        );
        require(
            _active_value[tokenId].total + active <= _active_value[tokenId].conditions,
            "Land: too many active values"
        );

        VOV.transferFrom(msg.sender, address(this), active);

        _active_value[tokenId].total += active;
        _active_value[tokenId].injection_details[account] += active;

        if (_active_value[tokenId].total == _active_value[tokenId].conditions) _active_value[tokenId].status = true;

        emit Activation(tokenId, active, _active_value[tokenId].status);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721Upgradeable, AccessControlUpgradeable) returns (bool) {
        return
            ERC721Upgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    function enableMint() public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!enableMintStatus, "Land: mint already enabled");
        enableMintRequestTime = block.timestamp;
        emit EnableMintRequest();
    }

    function disableMint() public onlyRole(DEFAULT_ADMIN_ROLE) {
        enableMintStatus = false;
    }

    function setActiveThreshold(uint256 newActiveThreshold_) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newActiveThreshold_ > activeThreshold, "Land: new active threshold must be greater than current");
        newActiveThreshold = newActiveThreshold_;
        activeThresholdRequestTime = block.timestamp;
        emit ActiveThresholdRequest(newActiveThreshold);
    }
}
