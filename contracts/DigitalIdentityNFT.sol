// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract DigitalIdentityNFT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct Identity {
        string did;
        bool isVerified;
        uint256 creationDate;
    }

    mapping(address => uint256) public addressToTokenId;
    mapping(uint256 => Identity) public identities;
    mapping(address => bool) public hasIdentity;

    event IdentityCreated(
        uint256 indexed tokenId,
        address indexed owner,
        string did
    );
    event IdentityVerified(uint256 indexed tokenId);
    event DebugLog(string message, address user, uint256 tokenId);

    constructor() ERC721("Digital Identity", "DID") {}

    function checkIdentityExists(address user) public view returns (bool) {
        return hasIdentity[user];
    }

    function createIdentity(
        address user,
        string memory did
    ) external onlyOwner returns (uint256) {
        require(!hasIdentity[user], "User already has an identity");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(user, newTokenId);
        identities[newTokenId] = Identity(did, false, block.timestamp);
        hasIdentity[user] = true;
        addressToTokenId[user] = newTokenId;

        emit IdentityCreated(newTokenId, user, did);
        emit DebugLog("Identity created", user, newTokenId);

        return newTokenId;
    }

    function getIdentity(address user) external view returns (Identity memory) {
        require(hasIdentity[user], "Identity does not exist");
        uint256 tokenId = addressToTokenId[user];
        require(tokenId > 0, "Token ID not found");
        return identities[tokenId];
    }

    function getTokenId(address user) external view returns (uint256) {
        require(hasIdentity[user], "Identity does not exist");
        return addressToTokenId[user];
    }

    function verifyIdentity(address user) external onlyOwner {
        require(hasIdentity[user], "Identity does not exist");
        uint256 tokenId = addressToTokenId[user];
        identities[tokenId].isVerified = true;
        emit IdentityVerified(tokenId);
    }

    function setModeratorControl(address moderatorControl) external onlyOwner {
        _transferOwnership(moderatorControl);
    }

    // Override transfer functions to make NFTs non-transferable
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        require(
            from == address(0) || to == address(0),
            "Token not transferable"
        );
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function totalSupply() public view returns (uint256) {
        return _tokenIds.current();
    }
}
