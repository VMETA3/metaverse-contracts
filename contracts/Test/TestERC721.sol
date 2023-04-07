// contracts/GameItem.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract TestERC721 is ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds; // Counter for tracking the number of tokens

    constructor() ERC721("GameItem", "ITM") {}

    /**
     * @dev Award an item to a player
     * @param player The address of the player to award the item to
     * @param tokenURI The URI of the token
     * @return The ID of the newly created token
     */
    function awardItem(address player, string memory tokenURI) public returns (uint256) {
        uint256 newItemId = _tokenIds.current();
        _mint(player, newItemId);
        _setTokenURI(newItemId, tokenURI);

        _tokenIds.increment();
        return newItemId;
    }
}
