// Lib/Prize.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library Prize {
    // Rewards for every winner
    struct Universal {
        address token; // Address of the token for the Universal reward
        uint256 amount; // Amount of the Universal reward
    }
    // Rewards only available to the luckiest winners
    struct Surprise {
        bool is_revealed; // Whether the Surprise reward has been revealed
        address token; // Address of the token for the Surprise reward
        uint256 amount; // Amount of the Surprise reward
        address nft_token; // Address of the NFT token for the Surprise reward
        uint256 nft_token_id; // ID of the NFT token for the Surprise reward
        uint256 surprise_id; // ID of the Surprise reward
    }

    // Public Functions
    /**
     * @dev Returns the address of the token for the Universal reward
     */
    function universal_token(Universal storage _universal) public view returns (address) {
        return _universal.token;
    }

    /**
     * @dev Returns the amount of the Universal reward
     */
    function universal_amount(Universal storage _universal) public view returns (uint256) {
        return _universal.amount;
    }

    /**
     * @dev Returns the address of the token for the Surprise reward
     */
    function surprise_token(Surprise storage _surprise) public view returns (address) {
        return _surprise.token;
    }

    /**
     * @dev Returns the amount of the Surprise reward
     */
    function surprise_amount(Surprise storage _surprise) public view returns (uint256) {
        return _surprise.amount;
    }

    /**
     * @dev Returns the address of the NFT token for the Surprise reward
     */
    function surprise_nft_token(Surprise storage _surprise) public view returns (address) {
        return _surprise.nft_token;
    }

    /**
     * @dev Returns the ID of the NFT token for the Surprise reward
     */
    function surprise_nft_id(Surprise storage _surprise) public view returns (uint256) {
        return _surprise.nft_token_id;
    }

    /**
     * @dev Returns the ID of the Surprise reward
     * @notice This function can only be called after the Surprise reward has been revealed
     */
    function surprise_surprise_id(Surprise storage _surprise) public view returns (uint256) {
        require(_surprise.is_revealed, "Prize: Not yet revealed");
        return _surprise.surprise_id;
    }

    /**
     * @dev Returns whether the Surprise reward has been revealed
     */
    function surprise_is_revealed(Surprise storage _surprise) public view returns (bool) {
        return _surprise.is_revealed;
    }

    // Internal Functions
    /**
     * @dev Sets the Universal reward
     */
    function _setUniversal(
        Universal storage _universal,
        address token_,
        uint256 amount_
    ) internal {
        _universal.token = token_;
        _universal.amount = amount_;
    }

    /**
     * @dev Sets the Surprise reward
     */
    function _setSurprise(
        Surprise storage _surprise,
        address token_,
        uint256 amount_,
        address nft_token_,
        uint256 nft_token_id_
    ) internal {
        _surprise.token = token_;
        _surprise.amount = amount_;
        _surprise.nft_token = nft_token_;
        _surprise.nft_token_id = nft_token_id_;
    }

    /**
     * @dev Reveals the Surprise reward and sets its ID
     */
    function _superLuckyMan(Surprise storage _surprise, uint256 surprise_id_) internal {
        _surprise.is_revealed = true;
        _surprise.surprise_id = surprise_id_;
    }
}
