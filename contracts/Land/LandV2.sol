// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Land} from "./Land.sol";

contract LandV2 is Land {
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return tokenURIs[tokenId];
    }
}
