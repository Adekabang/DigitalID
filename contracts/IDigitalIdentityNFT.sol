// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IDigitalIdentityNFT {
    enum VerificationLevel {
        UNVERIFIED,
        BASIC_VERIFIED,
        KYC_VERIFIED,
        FULL_VERIFIED
    }

    function hasIdentity(address user) external view returns (bool);
    function getTokenId(address user) external view returns (uint256);
    function transferIdentity(address from, address to) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}
