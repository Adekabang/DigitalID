// backend/src/middleware/auth.middleware.js
const { ethers } = require('ethers');

exports.authMiddleware = async (req, res, next) => {
    try {
        const signature = req.headers['x-signature'];
        const address = req.headers['x-address'];
        const timestamp = req.headers['x-timestamp'];

        if (!signature || !address || !timestamp) {
            return res.status(401).json({ 
                error: 'Missing authentication headers' 
            });
        }

        // Verify the signature is recent (within 5 minutes)
        // const now = Math.floor(Date.now() / 1000);
        // if (now - parseInt(timestamp) > 300) {
        //     return res.status(401).json({ 
        //         error: 'Signature expired' 
        //     });
        // }

        // Verify the signature using ethers v6 syntax
        const message = `Authenticate to Identity System: ${timestamp}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ 
                error: 'Invalid signature' 
            });
        }

        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};
