// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract Land is ERC721URIStorage, AccessControl {
    event Activation(uint256 tokenId, uint256 active, bool status);
    event EnableMintRequest();
    event ActiveConditionRequest(uint256 newCondition);

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
    uint256 private activeCondition;
    uint256 public minimumInjectionQuantity;

    // Minting and active condition modification control
    bool private enableMintStatus;
    uint256 public enableMintRequestTime;
    uint256 private newActiveCondition;
    uint256 public activeConditionRequestTime;

    constructor(
        string memory name_,
        string memory symbol_,
        address vov,
        address admin_,
        address minter_,
        uint256 activeCondition_,
        uint256 minimumInjectionQuantity_
    ) ERC721(name_, symbol_) {
        VOV = IERC20(vov);
        admin = admin_;
        minter = minter_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);

        activeCondition = activeCondition_;
        minimumInjectionQuantity = minimumInjectionQuantity_;
        // Set the initial mint status enable
        enableMintStatus = true;
    }

    /**
     * @dev Award an item to a player
     * @param player The address of the player to award the item to
     * @param tokenURI_ The URI of the token
     * @return newItemId The ID of the newitem
     */
    function awardItem(address player, string memory tokenURI_) public onlyRole(MINTER_ROLE) returns (uint256) {
        require(getEnableMintStatus(), "Land: Minting is disabled");

        uint256 newItemId = _tokenIdCounter;
        _safeMint(player, newItemId);
        _setTokenURI(newItemId, tokenURI_);
        _active_value[newItemId].conditions = getActiveCondition();
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

    function getEnableMintStatus() public view returns (bool) {
        if (enableMintStatus == true && block.timestamp > enableMintRequestTime + 2 days) {
            return true;
        } else {
            return false;
        }
    }

    function getActiveCondition() public view returns (uint256) {
        if (newActiveCondition > 0 && block.timestamp > activeConditionRequestTime + 2 days) {
            return newActiveCondition;
        } else {
            return activeCondition;
        }
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

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return ERC721.supportsInterface(interfaceId) || AccessControl.supportsInterface(interfaceId);
    }

    function enableMint() public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!enableMintStatus, "Land: mint already enabled");
        enableMintRequestTime = block.timestamp;
        enableMintStatus = true;
        emit EnableMintRequest();
    }

    function disableMint() public onlyRole(DEFAULT_ADMIN_ROLE) {
        enableMintStatus = false;
    }

    function setActiveCondition(uint256 newActiveCondition_) public onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldActiveCondition = getActiveCondition();
        require(newActiveCondition_ > oldActiveCondition, "Land: new active condition must be greater than current");

        // The last condition will be recorded.
        activeCondition = oldActiveCondition;
        newActiveCondition = newActiveCondition_;
        activeConditionRequestTime = block.timestamp;
        emit ActiveConditionRequest(newActiveCondition);
    }
}
