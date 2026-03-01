const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const homeController = require('../controllers/homeController');
const availableCarsController = require('../controllers/availableCarsController');
const aboutController = require('../controllers/aboutController');
const contactController = require('../controllers/contactController');
const { contactLimiter } = require('../middleware/rateLimit');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');
// Categories feature removed

// Get all cars or filter cars based on query parameters
router.get('/', csrfProtection, setCsrfToken, homeController.getHome);
router.post('/postSearchCars', csrfProtection, setCsrfToken,[
    body('pickup-time')
      .notEmpty()
      .withMessage('Please choose a pick-up time'),
    body('return-time')
      .notEmpty()
      .withMessage('Please choose a return time'),
], availableCarsController.postSearchCars);
// Pagination-friendly GET for search results (links use query params)
// removed GET pagination route per user request
router.get('/about', aboutController.getAbout);
router.get('/contacts', csrfProtection, setCsrfToken, contactController.getContacts);
router.post(
  '/contact',
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

// Category page
// category routes removed

 

module.exports = router;