const express = require('express');
const expressValidator = require('express-validator');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { requireGuest, requireAuth } = require('../middleware/auth');

router.get('/login', requireGuest, authController.getLogin);
router.post(
	'/login',
	requireGuest,
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

