const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const { body } = require('express-validator');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');

router.post(
  '/create-checkout-session',
  csrfProtection,
  setCsrfToken,
  [
    body('fullName').notEmpty().withMessage('Please enter your full name'),
    body('phoneNumber')
      .notEmpty()
      .withMessage('Please enter your phone number')
      .isMobilePhone('any')
      .withMessage('Please enter a valid phone number'),
    body('email')
      .notEmpty()
      .withMessage('Please enter your email')
      .isEmail()
      .withMessage('Please enter a valid email address'),
    body('address').notEmpty().withMessage('Please enter your address'),
    body('hotelName').notEmpty().withMessage('Please enter your hotel name'),
  ],
  checkoutController.createCheckoutSession
);
router.get('/success', checkoutController.handleCheckoutSuccess);
router.get('/cancel', checkoutController.handleCheckoutCancel);

router.get('/webhook/stripe-test', (req, res) => {
  console.log('🚨 TEST: /webhook/stripe-test HIT');
  res.send('Webhook TEST OK');
});

// Webhook is mounted in server.js with express.raw()

module.exports = router;