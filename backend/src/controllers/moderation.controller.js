const blockchainService = require('../utils/blockchain');

exports.createCase = async (req, res) => {
    try {
        const { address, actionType, reason } = req.body;
        
        if (!address || actionType === undefined || !reason) {
            return res.status(400).json({ 
                error: 'Address, actionType, and reason are required' 
            });
        }

        const result = await blockchainService.createModerationCase(
            address,
            actionType,
            reason
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getCases = async (req, res) => {
    try {
        const totalCases = await blockchainService.moderatorControl.getTotalCases();
        const cases = [];

        for (let i = 0; i < totalCases; i++) {
            const caseDetails = await blockchainService.moderatorControl.getCaseDetails(i);
            cases.push({
                id: i,
                user: caseDetails[0],
                actionType: caseDetails[1],
                reason: caseDetails[2],
                timestamp: caseDetails[3].toString(),
                moderator: caseDetails[4],
                isResolved: caseDetails[5]
            });
        }

        res.json(cases);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getCaseById = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ 
                error: 'Case ID is required' 
            });
        }

        const caseDetails = await blockchainService.moderatorControl.getCaseDetails(id);
        
        res.json({
            id: parseInt(id),
            user: caseDetails[0],
            actionType: caseDetails[1],
            reason: caseDetails[2],
            timestamp: caseDetails[3].toString(),
            moderator: caseDetails[4],
            isResolved: caseDetails[5]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
