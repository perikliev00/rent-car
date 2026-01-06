const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const contactController = require('../controllers/contactController');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');
const { contactLimiter } = require('../middleware/rateLimit');

// Support routes
router.get('/support/phone', supportController.getPhoneSupport);
// Redirect email support to contacts page
router.get('/support/email', csrfProtection, setCsrfToken, contactController.getContacts);
router.get('/support/visit', supportController.getVisitLocation);
router.get('/support/chat', supportController.getLiveChat);
// Redirect POST email support to contacts form submission
router.post('/support/email', contactLimiter, csrfProtection, setCsrfToken, contactController.postContact);

// Chat API routes
router.get('/api/chat/cars-summary', supportController.getCarsSummary);
router.get('/api/chat/cars-by-filter', supportController.getCarsByFilter);
router.get('/api/chat/pricing-info', supportController.getPricingInfo);
router.get('/api/chat/car-details/:carId', supportController.getCarDetails);

module.exports = router;


