// filepath: c:\Users\Admin\Desktop\Rent A Car\controllers\orderCar.js
const mongoose = require('mongoose');
const Car = require('../models/Car');
const { validationResult } = require('express-validator');
const stripe = require('../config/stripe');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');

module.exports.getOrderCar = async (req, res) => {
  try {
    // 1. Pull & validate form data from hidden inputs
    const {
      'pickup-date': pickupDate,
      'return-date': returnDate,
      'pickup-location': pickupLocation,
      'return-location': returnLocation,
      'pickup-time': pickupTime,
      'return-time': returnTime,
      'rental-days': rentalDays,
      'delivery-price': deliveryPrice,
      'return-price': returnPrice,
      'total-price': totalPrice,
      carId,
    } = req.body;


    const car = await Car.findById(carId);

    if (!car) {
      return res.status(404).send('Car not found');
    }

    console.log(pickupDate);
    console.log(pickupTime);
    console.log(returnDate);

    // Prepare display helpers
    const pickupDateISO = pickupDate;
    const returnDateISO = returnDate;
    const pickupDateDisplay = formatDateForDisplay(pickupDate);
    const returnDateDisplay = formatDateForDisplay(returnDate);
    const pickupLocationDisplay = formatLocationName(pickupLocation);
    const returnLocationDisplay = formatLocationName(returnLocation);

    res.render('orderMain', {
      title: 'Order Car',
      car,
      pickupDate: pickupDateDisplay,
      pickupTime,
      returnDate: returnDateDisplay,
      returnTime,
      pickupLocation,
      returnLocation,
      pickupLocationDisplay,
      returnLocationDisplay,
      pickupDateISO,
      returnDateISO,
      rentalDays,
      deliveryPrice,
      returnPrice,
      totalPrice,
      fullName: '',
      phoneNumber: '',
      email: '',
      address: '',
      hotelName: '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching car');
  }
};