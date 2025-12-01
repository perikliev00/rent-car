const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');

// Support routes
router.get('/support/phone', supportController.getPhoneSupport);
router.get('/support/email', csrfProtection, setCsrfToken, supportController.getEmailSupport);
router.get('/support/visit', supportController.getVisitLocation);
router.get('/support/chat', supportController.getLiveChat);
router.post('/support/email', csrfProtection, setCsrfToken, supportController.postEmailSupport);

module.exports = router;


