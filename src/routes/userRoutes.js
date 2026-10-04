const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/me', authenticate, userController.getMe);

module.exports = router;