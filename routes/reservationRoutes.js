const express = require('express');
const { body } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const LOCATIONS = [
  'office', 'sunny-beach', 'sveti-vlas', 'nesebar', 'burgas', 'burgas-airport',
  'sofia', 'sofia-airport', 'varna', 'varna-airport', 'plovdiv', 'eleni', 'ravda',
];

router.post('/orders', csrfProtection, setCsrfToken, bookingController.getOrderCar);
router.post('/reservations/release', csrfProtection, bookingController.releaseActiveReservation);
router.post(
  '/reservations/release-and-rehold',
  csrfProtection,
  [
    body('carId')
      .isMongoId()
      .withMessage('Invalid car id.'),
    body('pickupDate')
      .notEmpty()
      .withMessage('Pickup date is required.'),
    body('returnDate')
      .notEmpty()
      .withMessage('Return date is required.'),
    body('pickupTime')
      .optional({ checkFalsy: true })
      .matches(/^\d{1,2}:\d{2}$/)
      .withMessage('Pickup time must be in HH:MM format.'),
    body('returnTime')
      .optional({ checkFalsy: true })
      .matches(/^\d{1,2}:\d{2}$/)
      .withMessage('Return time must be in HH:MM format.'),
    body('pickupLocation')
      .isIn(LOCATIONS)
      .withMessage('Invalid pickup location.'),
    body('returnLocation')
      .isIn(LOCATIONS)
      .withMessage('Invalid return location.'),
  ],
  bookingController.releaseAndReholdReservation
);

module.exports = router;
