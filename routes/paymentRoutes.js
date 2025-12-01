const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment');
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
  paymentController.createCheckoutSession
);

router.post('/reservations/release', csrfProtection, paymentController.releaseActiveReservation);
router.get('/success', paymentController.handleCheckoutSuccess);
router.get('/cancel', paymentController.handleCheckoutCancel);

router.get('/webhook/stripe-test', (req, res) => {
  console.log('🚨 TEST: /webhook/stripe-test HIT');
  res.send('Webhook TEST OK');
});

router.post('/webhook/stripe', paymentController.handleStripeWebhook);

module.exports = router;