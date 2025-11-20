const express = require('express');
const expressValidator = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { requireGuest, requireAuth } = require('../middleware/auth');

const loginLimiter = rateLimit({
	windowMs: 3 * 60 * 1000,
	max: 10,
	message: 'Too many login attempts from this IP, please try again later.',
	standardHeaders: true,
	legacyHeaders: false
});

router.get('/login', requireGuest, authController.getLogin);
router.post(
	'/login',
	requireGuest,
	loginLimiter,
	[
		body('email')
			.trim()
			.isEmail()
			.withMessage('Please enter a valid email address')
			.normalizeEmail(),
		body('password')
			.isLength({ min: 6 })
			.withMessage('Password must be at least 6 characters long')
	],
	authController.postLogin
);

// Signup routes
router.get('/signup', requireGuest, authController.getSignup);
router.post(
	'/signup',
	requireGuest,
	loginLimiter,
	[
		body('email')
			.trim()
			.isEmail()
			.withMessage('Please enter a valid email address')
			.normalizeEmail(),
		body('password')
			.isLength({ min: 6 })
			.withMessage('Password must be at least 6 characters long')
	],
	authController.postSignup
);

// Logout
router.get('/logout', requireAuth, authController.getLogout);

module.exports = router;

