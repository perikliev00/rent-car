const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment');
const { body, validationResult } = require('express-validator');
const Car = require('../models/Car'); // Make sure this is at the top
const mongoose = require('mongoose');
const stripe = require('../config/stripe'); // Ensure you have a Stripe config file
const Order = require('../models/Order'); // Ensure you have an Order model

router.post('/create-checkout-session',[body('fullName')
    .notEmpty()
    .withMessage('Please enter your full name'),
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
  body('address')
    .notEmpty()
    .withMessage('Please enter your address'),
  body('hotelName')
    .notEmpty()
    .withMessage('Please enter your hotel name'),
], paymentController.createCheckoutSession);

router.get('/success', async (req, res) => {
  const sessionId       = req.query.session_id;
  const storedSessionId = req.session.stripeSessionId;
  const order           = req.session.orderDetails;   
  if (!sessionId || sessionId !== storedSessionId) {
    return res.status(403).send('Invalid or expired checkout session.');
  }

  // 3) махни го от сесията, за да не може да се ползва повторно
  delete req.session.stripeSessionId;
   // 4) допълнителна валидация със Stripe API
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
    if (stripeSession.payment_status !== 'paid') {
      return res.status(400).send('Payment not completed.');
    }
    if (!order) {
        return res.status(400).send('No order details found.');
    }

    try {
        // Combine pickup and return date with time (assuming a UTC format)
        const pickupDateTime = new Date(`${order.pickupDate}T${order.pickupTime}:00Z`);
        const returnDateTime = new Date(`${order.returnDate}T${order.returnTime}:00Z`);

        // Update the car document by pushing the new booking into the dates array
        await Car.findByIdAndUpdate(
            order.carId,
            {
                $push: {
                    dates: {
                        startDate: pickupDateTime,
                        endDate: returnDateTime,
                    }
                }
            }
        );

        // Mark the session as paid before opening the protected route
        // Optionally clear order details if you no longer need them
        await Order.create({
        carId: order.carId,
        pickupDate: order.pickupDate,
        pickupTime: order.pickupTime,
        returnDate: order.returnDate,
        returnTime: order.returnTime,
        pickupLocation: order.pickupLocation,
        returnLocation: order.returnLocation,
        rentalDays: order.rentalDays,
        deliveryPrice: order.deliveryPrice,
        returnPrice: order.returnPrice,
        totalPrice: order.totalPrice,
        fullName: order.fullName,
        phoneNumber: order.phoneNumber,
        email: order.email,
        address: order.address,
        hotelName: order.hotelName,
      });
        req.session.orderDetails = null;

        // Render success page
        res.render('success', { title: 'Payment Success' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not update booking.');
    }
});
router.get('/cancel', (req, res) => {
    res.send('Payment canceled. Please try again.');
    console.log(req.session.orderDetails);
});
module.exports = router;