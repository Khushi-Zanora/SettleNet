const express = require('express');
const { validate } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { rateLimit } = require('../middleware/rateLimitMiddleware');
const { registerRules, loginRules } = require('../utils/validators');
const authController = require('../controllers/authController');

const router = express.Router();

// 30 attempts per 15 minutes per IP, shared by register and login.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many attempts. Please try again later.',
});

router.post('/register', authLimiter, validate(registerRules), authController.register);
router.post('/login', authLimiter, validate(loginRules), authController.login);
router.post('/logout', authenticate, authController.logout);

module.exports = router;