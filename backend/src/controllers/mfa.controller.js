const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/error.middleware');

class MFAController {
    async enableMFA(req, res) {
        try {
            const { factors } = req.body;
            const userAddress = req.user.address;

            if (!factors || !Array.isArray(factors) || factors.length === 0) {
                throw new ValidationError(
                    'At least one factor must be specified',
                );
            }

            const tx = await blockchainService.multiFactorAuth.enableMFA(
                factors,
            );
            const receipt = await tx.wait();

            logger.info(
                `MFA enabled for ${userAddress} with factors: ${factors.join(
                    ', ',
                )}`,
            );

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    factors,
                },
            });
        } catch (error) {
            logger.error('Enable MFA error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async startAuthSession(req, res) {
        try {
            const userAddress = req.user.address;

            const tx =
                await blockchainService.multiFactorAuth.startAuthSession();
            const receipt = await tx.wait();

            const sessionId = receipt.events.find(
                (e) => e.event === 'SessionCreated',
            ).args.sessionId;

            logger.info(`Auth session started for ${userAddress}`);

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    sessionId,
                },
            });
        } catch (error) {
            logger.error('Start auth session error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async verifyFactor(req, res) {
        try {
            const { factor, challenge, signature } = req.body;
            const userAddress = req.user.address;

            if (!factor || !challenge || !signature) {
                throw new ValidationError(
                    'Factor, challenge, and signature are required',
                );
            }

            const tx = await blockchainService.multiFactorAuth.verifyFactor(
                factor,
                challenge,
                signature,
            );
            const receipt = await tx.wait();

            logger.info(`Factor ${factor} verified for ${userAddress}`);

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    factor,
                    verified: true,
                },
            });
        } catch (error) {
            logger.error('Verify factor error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getMFAStatus(req, res) {
        try {
            const { address } = req.params;

            if (!address) {
                throw new ValidationError('Address is required');
            }

            const status = await blockchainService.multiFactorAuth.getMFAStatus(
                address,
            );

            res.json({
                success: true,
                data: {
                    enabledFactors: status.enabledFactors,
                    sessionStatus: {
                        isValid: status.sessionStatus.isValid,
                        timestamp: status.sessionStatus.timestamp.toString(),
                        expiryTime: status.sessionStatus.expiryTime.toString(),
                        completedFactors: status.sessionStatus.completedFactors,
                    },
                },
            });
        } catch (error) {
            logger.error('Get MFA status error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async manageFactor(req, res) {
        try {
            const { factor } = req.body;
            const { action } = req.params; // 'add' or 'remove'
            const userAddress = req.user.address;

            if (!factor) {
                throw new ValidationError('Factor is required');
            }

            const tx = await blockchainService.multiFactorAuth[
                action === 'add' ? 'addFactor' : 'removeFactor'
            ](factor);
            const receipt = await tx.wait();

            logger.info(`Factor ${factor} ${action}ed for ${userAddress}`);

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    factor,
                    action,
                },
            });
        } catch (error) {
            logger.error('Manage factor error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async disableMFA(req, res) {
        try {
            const userAddress = req.user.address;

            const tx = await blockchainService.multiFactorAuth.disableMFA();
            const receipt = await tx.wait();

            logger.info(`MFA disabled for ${userAddress}`);

            res.json({
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    message: 'MFA has been disabled',
                },
            });
        } catch (error) {
            logger.error('Disable MFA error:', error);
            res.status(error instanceof ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
}

module.exports = new MFAController();
