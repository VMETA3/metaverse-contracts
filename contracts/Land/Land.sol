// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Open Zeppelin libraries for controlling upgradability and access.
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Land is Initializable, ERC721Upgradeable, UUPSUpgradeable, OwnableUpgradeable {
    uint256 public _tokenIdCounter;
    mapping(uint256 => string) tokenURIs;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    // Upgradeable contracts should have an initialize method in place of the constructor, and the initializer keyword ensures that the contract is initialized only once
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner
    ) public initializer {
        __ERC721_init(name_, symbol_);

        _transferOwnership(owner);

        __UUPSUpgradeable_init();
    }

    // This approach is needed to prevent unauthorized upgrades because in UUPS mode, the upgrade is done from the implementation contract, while in the transparent proxy model, the upgrade is done through the proxy contract
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function awardItem(address player, string memory tokenURI_) public onlyOwner returns (uint256) {
        uint256 newItemId = _tokenIdCounter;
        _mint(player, newItemId);
        tokenURIs[newItemId] = tokenURI_;
        _increment();
        return newItemId;
    }

    function _increment() private onlyOwner {
        unchecked {
            _tokenIdCounter += 1;
        }
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return tokenURIs[tokenId];
    }
}
