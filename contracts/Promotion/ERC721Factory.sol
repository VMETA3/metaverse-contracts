// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/Clones.sol";

interface IMultiSigERC721 {
    function init(string memory name_, string memory symbol_, address[] memory owners, uint8 signRequred) external;
}

contract ERC721Factory {
    address public multiSigERC721Template;

    event NewMultiERC721(address erc721, address creator);

    constructor(address multiSigERC721Template_) {
        multiSigERC721Template = multiSigERC721Template_;
    }

    function createMultiSigERC721(
        string memory name_,
        string memory symbol_,
        address[] memory owners,
        uint8 signRequred
    ) external {
        address newERC721 = Clones.clone(multiSigERC721Template);
        IMultiSigERC721(newERC721).init(name_, symbol_, owners, signRequred);

        emit NewMultiERC721(newERC721, msg.sender);
    }
}
