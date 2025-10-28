const stripe = require('../config/stripe');
const Car = require('../models/Car');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');


module.exports.createCheckoutSession = async (req, res) => {
    let errors = validationResult(req);
        // 1. Pull & validate form data
        const {
          pickupDate,
          pickupTime,
          returnDate,
          returnTime,
          pickupLocation,
          returnLocation,
          rentalDays,
          deliveryPrice,
          returnPrice,
          totalPrice,
          carId,
          fullName,
          phoneNumber,
          email,
          address,
          hotelName,
          orderId,
          orderIdSig,
        } = req.body;
        // 2. Fetch the car from the database
        let car = await Car.findById(carId);
    
         if (!errors.isEmpty()) {
            const message = errors.array()[0].msg; // Get the first validation error message
            return res.status(422).render('orderMain', {
                title: 'Order Car',
                car,
                message, // Pass the validation error message
                pickupDate,
                pickupDateISO: pickupDate,
                pickupTime,
                returnDate,
                returnDateISO: returnDate,
                returnTime,
                pickupLocation,
                returnLocation,
                rentalDays,
                deliveryPrice,
                returnPrice,
                totalPrice,
                fullName, // Pass user input back to the form
                phoneNumber,
                email,
                address,
                hotelName,
                orderId,
                orderIdSig,
            });
        }

       try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
        currency: 'eur',
        product_data: { name: `Car Rental – ${carId}` },
        unit_amount: Math.round(totalPrice * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${req.protocol}://${req.get('host')}/cancel`
    });
    req.session.stripeSessionId = session.id;

    // stash the order details so /success can use them
    req.session.orderDetails = {
      carId,
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
      pickupLocation,
      returnLocation,
      rentalDays,
      deliveryPrice,
      returnPrice,
      totalPrice,
      fullName,
      phoneNumber,
      email,
      address,
      hotelName
    };
    console.log(req.session.orderDetails);
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing payment');
  }
}