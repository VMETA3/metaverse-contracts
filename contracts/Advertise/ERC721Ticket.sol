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
    Counters.Counter private _tokenIds;
    uint256 public total;

    constructor(
        string memory name,
        string memory symbol,
        uint256 total_
    ) ERC721(name, symbol) {
        total = total_ - 1;
    }

    function awardItem(address player, string memory tokenURI) public onlyOwner returns (uint256) {
        uint256 newItemId = _tokenIds.current();
        require(newItemId <= total, "UpperLimit: the limit has been reached");
        _mint(player, newItemId);
        _setTokenURI(newItemId, tokenURI);

        _tokenIds.increment();
        emit mint(player, newItemId);
        return newItemId;
    }

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
