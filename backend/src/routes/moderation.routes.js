const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderation.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.post('/case', authMiddleware, moderationController.createCase);
router.get('/cases', authMiddleware, moderationController.getCases);
router.get('/case/:id', authMiddleware, moderationController.getCaseById);

module.exports = router;
