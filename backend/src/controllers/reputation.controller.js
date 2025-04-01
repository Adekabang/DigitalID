const blockchainService = require('../utils/blockchain');

exports.getReputation = async (req, res) => {
    try {
        const { address } = req.params;
        
        if (!address) {
            return res.status(400).json({ 
                error: 'Address is required' 
            });
        }

        const reputation = await blockchainService.getUserReputation(address);
        res.json(reputation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateReputation = async (req, res) => {
    try {
        const { address, points } = req.body;
        
        if (!address || points === undefined) {
            return res.status(400).json({ 
                error: 'Address and points are required' 
            });
        }

        // Call the moderator control contract instead of reputation system directly
        const tx = await blockchainService.moderatorControl.updateUserReputation(
            address,
            points
        );
        await tx.wait();

        const updatedReputation = await blockchainService.getUserReputation(
            address
        );
        
        res.json({
            success: true,
            transactionHash: tx.hash,
            updatedReputation
        });
    } catch (error) {
        console.error('Update reputation error:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
};
