const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

// Support routes
router.get('/support/phone', supportController.getPhoneSupport);
router.get('/support/email', supportController.getEmailSupport);
router.get('/support/visit', supportController.getVisitLocation);
router.get('/support/chat', supportController.getLiveChat);
router.post('/support/email', supportController.postEmailSupport);

module.exports = router;


