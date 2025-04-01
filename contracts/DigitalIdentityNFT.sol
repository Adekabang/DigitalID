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

    mapping(uint256 => Identity) public identities;
    mapping(address => bool) public hasIdentity;

    event IdentityCreated(
        uint256 indexed tokenId,
        address indexed owner,
        string did
    );
    event IdentityVerified(uint256 indexed tokenId);

    constructor() ERC721("Digital Identity", "DID") {}

    function createIdentity(
        address user,
        string memory did
    ) external returns (uint256) {
        require(!hasIdentity[user], "User already has an identity");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(user, newTokenId);
        identities[newTokenId] = Identity(did, false, block.timestamp);
        hasIdentity[user] = true;

        emit IdentityCreated(newTokenId, user, did);
        return newTokenId;
    }

    function verifyIdentity(uint256 tokenId) external onlyOwner {
        require(_exists(tokenId), "Identity does not exist");
        identities[tokenId].isVerified = true;
        emit IdentityVerified(tokenId);
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

    // Remove onlyOwner from createIdentity and add it to other functions as needed
    function getIdentity(
        uint256 tokenId
    ) external view returns (Identity memory) {
        require(_exists(tokenId), "Identity does not exist");
        return identities[tokenId];
    }
}
