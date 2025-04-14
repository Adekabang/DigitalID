const express = require('express');
const router = express.Router();
// Import the instance exported from the controller file
const identityController = require('../controllers/identity.controller');
const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
    isEthereumAddress,
} = require('../middleware/validation.middleware');
const {
    ValidationError,
    NotFoundError,
} = require('../middleware/error.middleware');
const { body } = require('express-validator'); // Import body for verification route validation

// Protected routes with validation
router.post(
    '/create',
    authMiddleware,
    validate(commonValidations.createIdentity), // Assuming this validation exists
    identityController.createIdentity, // Use the imported instance's method
);

// Route for approving verification - use POST or PUT
router.post(
    '/verify',
    authMiddleware,
    validate([
        body('address')
            .exists()
            .custom(isEthereumAddress) // <-- Use the imported function directly
            .withMessage('Invalid Ethereum address format'), // Keep message for clarity
        body('level')
            .exists()
            .isInt({ min: 0, max: 3 })
            .withMessage('Invalid or missing verification level (must be 0-3)'),
    ]),
    identityController.approveIdentityVerification,
);

router.get(
    '/all',
    authMiddleware,
    validate(commonValidations.pagination), // Assuming this validation exists
    identityController.getAllIdentities, // Use the imported instance's method
);

// Public routes with validation
router.get(
    '/status/:address',
    validate(commonValidations.addressParam), // Assuming this validation exists
    identityController.checkIdentityStatus, // Use the imported instance's method
);

router.get(
    '/tokenURI/:address',
    validate(commonValidations.addressParam), // Assuming this validation exists
    identityController.getTokenURI, // New NFT token URI endpoint
);

// Add a direct image viewer endpoint for the NFT
router.get(
    '/image/:address',
    validate(commonValidations.addressParam),
    async (req, res, next) => {
        try {
            const { address } = req.params;

            if (!ethers.isAddress(address)) {
                throw new ValidationError('Invalid Ethereum address format');
            }

            try {
                // First check if identity exists
                const exists = await blockchainService.hasIdentity(address);
                if (!exists) {
                    throw new ValidationError(
                        `Identity not found for address ${address}`,
                    );
                }

                const tokenURI = await blockchainService.getTokenURI(address);

                // Handle different image formats
                let svgImage;

                if (tokenURI.startsWith('data:application/json;base64,')) {
                    // Base64 encoded JSON with embedded image
                    const base64Data = tokenURI.replace(
                        'data:application/json;base64,',
                        '',
                    );

                    try {
                        const jsonString = Buffer.from(
                            base64Data,
                            'base64',
                        ).toString();
                        const jsonData = JSON.parse(jsonString);

                        // Handle SVG image in different formats
                        if (jsonData.image) {
                            if (
                                jsonData.image.startsWith(
                                    'data:image/svg+xml;base64,',
                                )
                            ) {
                                // Base64 encoded SVG
                                const imageData = jsonData.image.replace(
                                    'data:image/svg+xml;base64,',
                                    '',
                                );
                                svgImage = Buffer.from(
                                    imageData,
                                    'base64',
                                ).toString();
                            } else if (
                                jsonData.image.startsWith('data:image/svg+xml,')
                            ) {
                                // URL encoded SVG
                                const imageData = jsonData.image.replace(
                                    'data:image/svg+xml,',
                                    '',
                                );
                                svgImage = decodeURIComponent(imageData);
                            } else {
                                // Assume it's a direct SVG string
                                svgImage = jsonData.image;
                            }
                        } else {
                            throw new Error('No image found in token metadata');
                        }
                    } catch (parseError) {
                        logger.error(
                            `Error parsing token metadata: ${parseError.message}`,
                        );
                        throw new Error(
                            `Failed to parse token metadata: ${parseError.message}`,
                        );
                    }
                } else {
                    // Direct URI or other format - just return a placeholder
                    throw new Error(
                        `Unsupported tokenURI format: ${tokenURI.substring(
                            0,
                            20,
                        )}...`,
                    );
                }

                // Set SVG content type
                res.setHeader('Content-Type', 'image/svg+xml');
                res.send(svgImage);
            } catch (tokenError) {
                // If we had errors getting the token URI, display a placeholder image
                logger.error(
                    `Error retrieving token URI: ${tokenError.message}`,
                );

                // Create a simple placeholder SVG
                const placeholderSvg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">
                    <rect width="100%" height="100%" fill="#f9f9f9" />
                    <rect x="20" y="20" width="310" height="310" rx="15" fill="white" stroke="#333333" stroke-width="2" />
                    <text x="175" y="175" font-family="Arial" font-size="20" fill="#333333" text-anchor="middle">
                        Identity Not Found or Error
                    </text>
                    <text x="175" y="210" font-family="Arial" font-size="16" fill="#666666" text-anchor="middle">
                        ${address}
                    </text>
                </svg>
                `;

                res.setHeader('Content-Type', 'image/svg+xml');
                res.send(placeholderSvg);
            }
        } catch (error) {
            logger.error(`View NFT image error: ${error.message}`);

            // Don't crash the server, return a placeholder image
            const errorSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">
                <rect width="100%" height="100%" fill="#fff0f0" />
                <rect x="20" y="20" width="310" height="310" rx="15" fill="white" stroke="#cc0000" stroke-width="2" />
                <text x="175" y="175" font-family="Arial" font-size="20" fill="#cc0000" text-anchor="middle">
                    Error Loading Identity
                </text>
                <text x="175" y="210" font-family="Arial" font-size="14" fill="#666666" text-anchor="middle">
                    Please check address format
                </text>
            </svg>
            `;

            res.setHeader('Content-Type', 'image/svg+xml');
            res.status(500).send(errorSvg);
        }
    },
);

// Add a helper HTML page for MetaMask import instructions
router.get(
    '/metamask-import/:address',
    validate(commonValidations.addressParam),
    async (req, res, next) => {
        try {
            const { address } = req.params;

            if (!ethers.isAddress(address)) {
                throw new ValidationError('Invalid Ethereum address format');
            }

            try {
                // Check if identity exists
                const exists = await blockchainService.hasIdentity(address);
                if (!exists) {
                    throw new ValidationError(
                        `Identity not found for address ${address}`,
                    );
                }

                // Get the identity details
                logger.info(`Getting identity details for address: ${address}`);
                const identity = await blockchainService.getIdentity(address);
                const contractAddress =
                    blockchainService.getContract('DigitalIdentityNFT').target;
                const tokenId = identity.tokenId;

                // Add additional logging
                logger.info(
                    `Found identity with token ID ${tokenId} for address ${address}`,
                );

                // Function to get level name
                const getVerificationLevelName = (level) => {
                    const levels = [
                        'UNVERIFIED',
                        'BASIC VERIFIED',
                        'KYC VERIFIED',
                        'FULLY VERIFIED',
                    ];
                    return levels[level] || 'UNKNOWN';
                };

                // Generate an HTML page with the MetaMask import instructions
                const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Import DID NFT to MetaMask</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .card {
                            border: 1px solid #ccc;
                            border-radius: 8px;
                            padding: 20px;
                            margin-bottom: 20px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .nft-image {
                            max-width: 100%;
                            height: auto;
                            border: 1px solid #eee;
                            border-radius: 8px;
                            margin: 20px auto;
                            display: block;
                        }
                        .info {
                            background-color: #f9f9f9;
                            padding: 15px;
                            border-radius: 8px;
                            margin-bottom: 20px;
                        }
                        .field {
                            margin-bottom: 10px;
                        }
                        .field span {
                            font-weight: bold;
                        }
                        .steps li {
                            margin-bottom: 10px;
                        }
                        .copy-btn {
                            background-color: #f0f0f0;
                            border: none;
                            padding: 5px 10px;
                            border-radius: 4px;
                            cursor: pointer;
                            margin-left: 10px;
                        }
                        .copy-btn:hover {
                            background-color: #e0e0e0;
                        }
                    </style>
                </head>
                <body>
                    <h1>Import Your Digital Identity NFT to MetaMask</h1>
                    
                    <div class="card">
                        <h2>Your NFT Details</h2>
                        <img src="/api/identity/image/${address}" class="nft-image" alt="Digital Identity NFT">
                        
                        <div class="info">
                            <div class="field">
                                <span>Owner Address:</span> ${address}
                                <button class="copy-btn" data-value="${address}">Copy</button>
                            </div>
                            <div class="field">
                                <span>Contract Address:</span> ${contractAddress}
                                <button class="copy-btn" data-value="${contractAddress}">Copy</button>
                            </div>
                            <div class="field">
                                <span>Token ID:</span> ${tokenId}
                                <button class="copy-btn" data-value="${tokenId}">Copy</button>
                            </div>
                            <div class="field">
                                <span>DID:</span> ${identity.did}
                            </div>
                            <div class="field">
                                <span>Verification Level:</span> ${getVerificationLevelName(
                                    identity.verificationLevel,
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h2>Steps to Import to MetaMask</h2>
                        <ol class="steps">
                            <li>Open your MetaMask wallet</li>
                            <li>Make sure you're connected to the correct network</li>
                            <li>Click on the "NFTs" tab</li>
                            <li>Click "Import NFTs" button at the bottom</li>
                            <li>Enter the contract address: <strong>${contractAddress}</strong></li>
                            <li>Enter the token ID: <strong>${tokenId}</strong></li>
                            <li>Click "Add" to import your Digital Identity NFT</li>
                        </ol>
                    </div>
                    
                    <script>
                        // Add event listeners after DOM is loaded
                        document.addEventListener('DOMContentLoaded', function() {
                            // Add event listeners to all copy buttons
                            document.querySelectorAll('.copy-btn').forEach(button => {
                                button.addEventListener('click', function() {
                                    const textToCopy = this.getAttribute('data-value');
                                    copyToClipboard(textToCopy);
                                });
                            });
                        });
                        
                        // Function to copy text to clipboard
                        function copyToClipboard(text) {
                            navigator.clipboard.writeText(text)
                                .then(() => {
                                    alert("Copied to clipboard!");
                                })
                                .catch(err => {
                                    console.error('Failed to copy text: ', err);
                                    
                                    // Fallback for browsers that don't support clipboard API
                                    const textarea = document.createElement('textarea');
                                    textarea.value = text;
                                    textarea.style.position = 'fixed';
                                    document.body.appendChild(textarea);
                                    textarea.focus();
                                    textarea.select();
                                    
                                    try {
                                        document.execCommand('copy');
                                        alert("Copied to clipboard!");
                                    } catch (e) {
                                        console.error('Fallback copy failed:', e);
                                        alert("Could not copy text: " + text);
                                    } finally {
                                        document.body.removeChild(textarea);
                                    }
                                });
                        }
                    </script>
                </body>
                </html>
                `;

                // Set headers for HTML content and security
                res.setHeader('Content-Type', 'text/html');
                res.setHeader(
                    'Content-Security-Policy',
                    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'",
                );
                res.send(html);
            } catch (identityError) {
                logger.error(
                    `Error retrieving identity: ${identityError.message}`,
                );

                // Generate an error page
                const errorHtml = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Identity Not Found</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .error-card {
                            border: 1px solid #f5c6cb;
                            border-radius: 8px;
                            padding: 20px;
                            margin-bottom: 20px;
                            background-color: #f8d7da;
                            color: #721c24;
                        }
                        h1 {
                            color: #721c24;
                        }
                        .address {
                            font-family: monospace;
                            background-color: #f8f9fa;
                            padding: 5px 10px;
                            border-radius: 4px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Identity Not Found</h1>
                    
                    <div class="error-card">
                        <p>No identity was found for address:</p>
                        <p class="address">${address}</p>
                        <p>Please check the following:</p>
                        <ul>
                            <li>The address is correct</li>
                            <li>An identity has been created for this address</li>
                            <li>You're connected to the correct network</li>
                        </ul>
                    </div>
                    
                    <div>
                        <p>To create a new identity, use the API endpoint:</p>
                        <pre>POST /api/identity/create</pre>
                        <p>with the required authentication and payload.</p>
                    </div>
                </body>
                </html>
                `;

                res.setHeader('Content-Type', 'text/html');
                res.setHeader(
                    'Content-Security-Policy',
                    "default-src 'self'; style-src 'unsafe-inline'",
                );
                res.status(404).send(errorHtml);
            }
        } catch (error) {
            logger.error(`MetaMask import page error: ${error.message}`);

            // Return a generic error page
            const genericErrorHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .error-card {
                        border: 1px solid #f5c6cb;
                        border-radius: 8px;
                        padding: 20px;
                        margin-bottom: 20px;
                        background-color: #f8d7da;
                        color: #721c24;
                    }
                    h1 {
                        color: #721c24;
                    }
                </style>
            </head>
            <body>
                <h1>Error</h1>
                
                <div class="error-card">
                    <p>An error occurred while processing your request:</p>
                    <p><strong>${error.message || 'Unknown error'}</strong></p>
                </div>
            </body>
            </html>
            `;

            res.setHeader('Content-Type', 'text/html');
            res.setHeader(
                'Content-Security-Policy',
                "default-src 'self'; style-src 'unsafe-inline'",
            );
            res.status(500).send(genericErrorHtml);
        }
    },
);

router.get(
    '/:address',
    validate(commonValidations.addressParam), // Assuming this validation exists
    identityController.getIdentity, // Use the imported instance's method
);

module.exports = router;
