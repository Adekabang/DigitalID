const express = require('express');
const router = express.Router();
const reputationController = require('../controllers/reputation.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.get('/:address', reputationController.getReputation);
router.post('/update', authMiddleware, reputationController.updateReputation);

module.exports = router;
