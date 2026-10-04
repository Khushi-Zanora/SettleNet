const express = require('express');
const { validate } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { registerRules, loginRules } = require('../utils/validators');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', validate(registerRules), authController.register);
router.post('/login', validate(loginRules), authController.login);
router.post('/logout', authenticate, authController.logout);

module.exports = router;