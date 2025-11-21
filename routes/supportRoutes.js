const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const csrf = require('csurf');

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

// Support routes
router.get('/support/phone', supportController.getPhoneSupport);
router.get('/support/email', csrfProtection, setCsrfToken, supportController.getEmailSupport);
router.get('/support/visit', supportController.getVisitLocation);
router.get('/support/chat', supportController.getLiveChat);
router.post('/support/email', csrfProtection, setCsrfToken, supportController.postEmailSupport);

module.exports = router;


