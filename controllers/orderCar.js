const mongoose = require('mongoose');
const Car = require('../models/Car');
const { validationResult } = require('express-validator');
const stripe = require('../config/stripe');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');
const Reservation = require('../models/Reservation');

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

    // ⚙️ Upsert a single "in process" reservation per session (UPDATE carId too)
    const currentSid = (req.session && (req.session._sid || req.sessionID)) || null;
    console.log('🧩 currentSid:', currentSid);
    console.log('🆕 requested carId (raw):', carId);

    // validate + cast to ObjectId to ensure it really updates
    if (!mongoose.Types.ObjectId.isValid(String(carId))) {
      return res.status(400).send('Invalid car ID');
    }
    const carObjectId = new mongoose.Types.ObjectId(String(carId));

    // For visibility, fetch any existing "in process" for this session
    const existing = await Reservation.findOne({ sessionId: currentSid, mode: 'in process' }).select('carId').lean();
    console.log('🔎 existing reservation for session:', existing ? { _id: String(existing._id), carId: String(existing.carId) } : null);

    const updateDoc = {
      carId: carObjectId,            // <-- ensure ObjectId is set
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
      pickupLocation,
      returnLocation,
      mode: 'in process',
      price: totalPrice,
      sessionId: currentSid
    };

    const upserted = await Reservation.findOneAndUpdate(
      { sessionId: currentSid, mode: 'in process' },          // find existing "in process" for this session
      { $set: updateDoc, $currentDate: { updatedAt: true } }, // set fields + bump updatedAt
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    console.log('✅ Reservation upserted (one per session):', {
      _id: upserted._id.toString(),
      carId_before: existing ? String(existing.carId) : null,
      carId_after: String(upserted.carId),
      mode: upserted.mode,
      sessionId: upserted.sessionId
    });

    // Safety fallback: very rare—but if carId somehow didn't change, force it.
    if (!upserted.carId || String(upserted.carId) !== String(carObjectId)) {
      console.warn('⚠️ carId mismatch after upsert; forcing explicit update...');
      await Reservation.updateOne(
        { _id: upserted._id },
        { $set: { carId: carObjectId }, $currentDate: { updatedAt: true } }
      );
      const check = await Reservation.findById(upserted._id).select('carId').lean();
      console.log('🔁 carId after forced update:', check ? String(check.carId) : null);
    }

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
