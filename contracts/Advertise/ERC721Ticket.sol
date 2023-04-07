// contracts/Advertise.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract ERC721Ticket is ERC721URIStorage, Ownable {
    event mint(address indexed from, uint256 tokenId);

    // Control NFTIDs
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds; // Counter for tracking NFT IDs
    uint256 public total; // Total number of NFTs that can be minted

    constructor(
        string memory name,
        string memory symbol,
        uint256 total_
    ) ERC721(name, symbol) {
        total = total_ - 1;
    }

    /**
     * @dev Award a single NFT to a player
     * @param player The address of the player to receive the NFT
     * @param tokenURI The URI of the NFT metadata
     * @return The ID of the newly minted NFT
     */
    function awardItem(address player, string memory tokenURI) public onlyOwner returns (uint256) {
        uint256 newItemId = _tokenIds.current();
        require(newItemId <= total, "UpperLimit: the limit has been reached");
        _mint(player, newItemId);
        _setTokenURI(newItemId, tokenURI);

        _tokenIds.increment();
        emit mint(player, newItemId);
        return newItemId;
    }

    /**
     * @dev Award multiple NFTs to a player
     * @param player The address of the player to receive the NFTs
     * @param tokenURI The URI of the NFT metadata
     * @param total_ The number of NFTs to award
     * @return True if the operation was successful
     */
    function batchAwardItem(
        address player,
        string memory tokenURI,
        uint256 total_
    ) public onlyOwner returns (bool) {
        require(((_tokenIds.current() + total_) - 1) <= total, "UpperLimit: the limit has been reached");
        for (uint256 i = 0; i < total_; i++) {
            awardItem(player, tokenURI);
        }
        return true;
    }
}
