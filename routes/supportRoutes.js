const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const contactController = require('../controllers/contactController');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');
const { contactLimiter } = require('../middleware/rateLimit');
const { body, query, param } = require('express-validator');

// Support routes
router.get('/support/phone', supportController.getPhoneSupport);
// Redirect email support to contacts page
router.get('/support/email', csrfProtection, setCsrfToken, contactController.getContacts);
router.get('/support/visit', supportController.getVisitLocation);
router.get('/support/chat', supportController.getLiveChat);
// Redirect POST email support to contacts form submission
router.post(
  '/support/email',
  contactLimiter,
  csrfProtection,
  setCsrfToken,
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Please enter your full name (2–100 characters).'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please enter a valid email address.')
      .isLength({ max: 150 })
      .withMessage('Email address is too long.'),
    body('phone')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 50 })
      .withMessage('Phone number is too long.'),
    body('subject')
      .trim()
      .isIn(['booking', 'existing', 'fleet', 'pricing', 'support', 'other'])
      .withMessage('Please select a valid subject.'),
    body('message')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Message must be between 10 and 1000 characters.'),
  ],
  contactController.postContact
);

// Chat API routes
router.get('/api/chat/cars-summary', supportController.getCarsSummary);
router.get(
  '/api/chat/cars-by-filter',
  [
    query('fuelType')
      .optional()
      .isIn(['Petrol', 'Diesel', 'Hybrid', 'Electric'])
      .withMessage('Invalid fuel type.'),
    query('transmission')
      .optional()
      .isIn(['Automatic', 'Manual'])
      .withMessage('Invalid transmission.'),
    query('seatsMin')
      .optional()
      .isInt({ min: 2, max: 9 })
      .withMessage('seatsMin must be an integer between 2 and 9.'),
    query('seatsMax')
      .optional()
      .isInt({ min: 2, max: 9 })
      .withMessage('seatsMax must be an integer between 2 and 9.'),
  ],
  supportController.getCarsByFilter
);
router.get('/api/chat/pricing-info', supportController.getPricingInfo);
router.get(
  '/api/chat/car-details/:carId',
  [
    param('carId')
      .isMongoId()
      .withMessage('Invalid car id.'),
  ],
  supportController.getCarDetails
);

module.exports = router;


