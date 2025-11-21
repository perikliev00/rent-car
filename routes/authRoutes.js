const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { requireGuest, requireAuth } = require('../middleware/auth');
const csrf = require('csurf');
const { authLimiter } = require('../middleware/rateLimit');

const csrfProtection = csrf();
const setCsrfToken = (req, res, next) => {
	if (typeof req.csrfToken === 'function') {
		try {
			res.locals.csrfToken = req.csrfToken();
		} catch (err) {
			return next(err);
		}
	}
	return next();
};

router.get('/login', requireGuest, csrfProtection, setCsrfToken, authController.getLogin);
router.post(
	'/login',
	requireGuest,
	authLimiter,
	csrfProtection,
	setCsrfToken,
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
router.get('/signup', requireGuest, csrfProtection, setCsrfToken, authController.getSignup);
router.post(
	'/signup',
	requireGuest,
	authLimiter,
	csrfProtection,
	setCsrfToken,
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

