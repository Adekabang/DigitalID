const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/error.middleware');

class AppealController {
    async submitAppeal(req, res) {
        try {
            const { reason, evidence, caseId } = req.body;
            const userAddress = req.user.address;

            if (!reason || !evidence || !caseId) {
                throw new ValidationError(
                    'Reason, evidence, and caseId are required',
                );
            }

            const tx = await blockchainService.appealSystem.submitAppeal(
                reason,
                evidence,
                caseId,
            );
            const receipt = await tx.wait();

            logger.info(
                `Appeal submitted for case ${caseId} by ${userAddress}`,
            );

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    appealIndex: receipt.events
                        .find((e) => e.event === 'AppealSubmitted')
                        .args.appealIndex.toString(),
                },
            });
        } catch (error) {
            logger.error('Submit appeal error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getAppealStatus(req, res) {
        try {
            const { address, appealIndex } = req.params;

            if (!address || appealIndex === undefined) {
                throw new ValidationError(
                    'Address and appeal index are required',
                );
            }

            const appealDetails =
                await blockchainService.appealSystem.getAppealDetails(
                    address,
                    appealIndex,
                );

            res.json({
                success: true,
                data: {
                    status: appealDetails.status,
                    timestamp: appealDetails.timestamp.toString(),
                    reason: appealDetails.reason,
                    reviewer: appealDetails.reviewer,
                    reviewNotes: appealDetails.reviewNotes,
                    reviewTimestamp: appealDetails.reviewTimestamp.toString(),
                    appealDeadline: appealDetails.appealDeadline.toString(),
                },
            });
        } catch (error) {
            logger.error('Get appeal status error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getAppealHistory(req, res) {
        try {
            const { address } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            if (!address) {
                throw new ValidationError('Address is required');
            }

            const appealsCount =
                await blockchainService.appealSystem.getUserAppealsCount(
                    address,
                );
            const appeals = [];

            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, appealsCount);

            for (let i = startIndex; i < endIndex; i++) {
                const appeal =
                    await blockchainService.appealSystem.getAppealDetails(
                        address,
                        i,
                    );
                appeals.push({
                    index: i,
                    status: appeal.status,
                    timestamp: appeal.timestamp.toString(),
                    reason: appeal.reason,
                    reviewer: appeal.reviewer,
                    reviewNotes: appeal.reviewNotes,
                    reviewTimestamp: appeal.reviewTimestamp.toString(),
                    appealDeadline: appeal.appealDeadline.toString(),
                });
            }

            res.json({
                success: true,
                data: {
                    appeals,
                    total: appealsCount.toString(),
                    page,
                    pages: Math.ceil(appealsCount / limit),
                },
            });
        } catch (error) {
            logger.error('Get appeal history error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async confirmAppeal(req, res) {
        try {
            const { requestId } = req.params;
            const userAddress = req.user.address;

            if (!requestId) {
                throw new ValidationError('Request ID is required');
            }

            const tx = await blockchainService.appealSystem.confirmRecovery(
                requestId,
            );
            const receipt = await tx.wait();

            logger.info(
                `Appeal confirmation submitted by ${userAddress} for request ${requestId}`,
            );

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    requestId,
                },
            });
        } catch (error) {
            logger.error('Confirm appeal error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
}

module.exports = new AppealController();
