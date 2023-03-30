// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../Chainlink/ChainlinkClientUpgradeable.sol";
import "./ElfV1.sol";

contract VM3Elf is VM3ElfV1, ChainlinkClientUpgradeable {
    event UpdateTokenUri(uint256 tokenId, string tokenUri);

    using Chainlink for Chainlink.Request;
    bytes32 private jobId;
    uint256 private fee;
    mapping(bytes32 => uint256) private _requestIds; // requestId => tokenId
    string public requestApi;
    string public requestPath;

    // Convert uint256 to string
    function uint2str(uint256 _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len - 1;
        while (_i != 0) {
            bstr[k--] = bytes1(uint8(48 + (_i % 10)));
            _i /= 10;
        }
        return string(bstr);
    }

    // Concatenate strings and uint256
    function concat(string memory a, uint256 b) internal pure returns (string memory) {
        return string(abi.encodePacked(a, uint2str(b)));
    }

    function getUpdateTokenUriHash(uint256 tokenId, uint256 nonce_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, keccak256("updateTokenUri(uint256,uint256)"), tokenId, nonce_));
    }

    function updateTokenUri(uint256 tokenId, uint256 nonce_) external returns (bytes32 requestId) {
        return _updateTokenUri(tokenId, nonce_);
    }

    function _updateTokenUri(uint256 tokenId, uint256 nonce_)
        private
        onlyOperationPendding(HashToSign(getUpdateTokenUriHash(tokenId, nonce_)))
        returns (bytes32 requestId)
    {
        require(ownerOf(tokenId) == _msgSender(), "Elf: Only token id owner can update token uri");
        Chainlink.Request memory req = buildChainlinkRequest(jobId, address(this), this.fulfill.selector);
        req.add("get", concat(requestApi, tokenId));
        req.add("path", requestPath);
        requestId = sendChainlinkRequest(req, fee);
        _requestIds[requestId] = tokenId;
        return requestId;
    }

    function fulfill(bytes32 _requestId, string memory _tokenUri) public recordChainlinkFulfillment(_requestId) {
        uint256 tokenId = _requestIds[_requestId];
        require(_exists(tokenId), "Elf: Updated token id does not exist");
        _tokenURIs[tokenId] = _tokenUri;
        emit UpdateTokenUri(tokenId, _tokenUri);
    }

    function withdrawLink() public onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
        require(link.transfer(msg.sender, link.balanceOf(address(this))), "Elf: Unable to transfer");
    }

    function setRequestApi(string memory api) public onlyOwner {
        requestApi = api;
    }

    function setRequestPath(string memory path) public onlyOwner {
        requestPath = path;
    }

    function setChainlink(
        address token,
        address oracle,
        bytes32 jobId_,
        uint256 fee_
    ) public onlyOwner {
        setChainlinkToken(token);
        setChainlinkOracle(oracle);
        jobId = jobId_;
        fee = fee_;
    }
}
