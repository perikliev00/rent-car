const stripe = require('../config/stripe');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Car = require('../models/Car');
const Reservation = require('../models/Reservation');
const Order = require('../models/Order');
const { computeBookingPrice } = require('../utils/pricing');
const { parseSofiaDate } = require('../utils/timeZone');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');
const { addRange } = require('../utils/bookingSync');
const {
  ACTIVE_RESERVATION_STATUSES,
  HOLD_WINDOW_MS,
  getSessionId,
  buildExistingReservationSummary,
} = require('../utils/reservationHelpers');

const TXN_OPTIONS = { readPreference: 'primary', readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };

function renderOrderPage(res, car, formData, message, options = {}) {
  if (!formData.releaseRedirect) {
    formData.releaseRedirect = options.releaseRedirect || '';
  }
  const pickupDateISO = formData.pickupDate;
  const returnDateISO = formData.returnDate;
  const pickupDateDisplay = formatDateForDisplay(formData.pickupDate);
  const returnDateDisplay = formatDateForDisplay(formData.returnDate);
  const pickupLocationDisplay = formatLocationName(formData.pickupLocation);
  const returnLocationDisplay = formatLocationName(formData.returnLocation);

  return res.status(options.statusCode || 422).render('orderMain', {
                title: 'Order Car',
                car,
    message,
    pickupDate: pickupDateDisplay,
    pickupTime: formData.pickupTime,
    returnDate: returnDateDisplay,
    returnTime: formData.returnTime,
    pickupLocation: formData.pickupLocation,
    returnLocation: formData.returnLocation,
    pickupLocationDisplay,
    returnLocationDisplay,
    pickupDateISO,
    returnDateISO,
    rentalDays: options.rentalDays ?? formData.rentalDays,
    deliveryPrice: options.deliveryPrice ?? formData.deliveryPrice,
    returnPrice: options.returnPrice ?? formData.returnPrice,
    totalPrice: options.totalPrice ?? formData.totalPrice,
    fullName: formData.fullName,
    phoneNumber: formData.phoneNumber,
    email: formData.email,
    address: formData.address,
    hotelName: formData.hotelName,
    existingReservation: options.existingReservation || null,
    releaseRedirect: options.releaseRedirect || formData.releaseRedirect || formData.currentUrl || ''
  });
}

exports.createCheckoutSession = async (req, res) => {
  const errors = validationResult(req);
  const formData = req.body;
  formData.releaseRedirect = req.originalUrl;

  let car;
  try {
    car = await Car.findById(formData.carId);
    if (!car) {
      return res.status(404).send('Car not found');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error loading car information.');
  }

  if (!errors.isEmpty()) {
    const message = errors.array()[0].msg;
    return renderOrderPage(res, car, formData, message);
  }

  const start = parseSofiaDate(formData.pickupDate, formData.pickupTime || '00:00');
  const end = parseSofiaDate(formData.returnDate, formData.returnTime || '23:59');
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return renderOrderPage(res, car, formData, 'Invalid booking dates. Please choose a different range.');
  }

  const sessionId = getSessionId(req);
  const now = new Date();

  try {
    const pricing = computeBookingPrice(car, start, end, formData.pickupLocation, formData.returnLocation);
    if (!pricing || !Number.isFinite(pricing.totalPrice) || pricing.totalPrice <= 0) {
      return renderOrderPage(res, car, formData, 'Unable to calculate price for this rental. Please try again.');
    }

    const trimmedContact = {
      fullName: (formData.fullName || '').trim(),
      phoneNumber: (formData.phoneNumber || '').trim(),
      email: (formData.email || '').trim(),
      address: (formData.address || '').trim(),
      hotelName: (formData.hotelName || '').trim(),
    };

    let reservationDoc = await Reservation.findOne({
      sessionId,
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      holdExpiresAt: { $gt: now },
    }).populate('carId', 'name');

    let createdReservationThisStep = false;

    if (reservationDoc) {
      const sameCar = String(reservationDoc.carId?._id || reservationDoc.carId) === String(car._id);
      const sameStart =
        reservationDoc.pickupDate instanceof Date && reservationDoc.pickupDate.getTime() === start.getTime();
      const sameEnd =
        reservationDoc.returnDate instanceof Date && reservationDoc.returnDate.getTime() === end.getTime();

      if (!sameCar || !sameStart || !sameEnd) {
        return renderOrderPage(
          res,
          car,
          formData,
          'You already have an active reservation. Please complete or release it before starting another.',
          {
            existingReservation: buildExistingReservationSummary(reservationDoc),
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
            releaseRedirect: req.originalUrl,
          }
        );
      }

      reservationDoc.fullName = trimmedContact.fullName;
      reservationDoc.phoneNumber = trimmedContact.phoneNumber;
      reservationDoc.email = trimmedContact.email;
      reservationDoc.address = trimmedContact.address;
      reservationDoc.hotelName = trimmedContact.hotelName;
      reservationDoc.rentalDays = pricing.rentalDays;
      reservationDoc.deliveryPrice = pricing.deliveryPrice;
      reservationDoc.returnPrice = pricing.returnPrice;
      reservationDoc.totalPrice = pricing.totalPrice;
      reservationDoc.holdExpiresAt = new Date(Date.now() + HOLD_WINDOW_MS);
      reservationDoc.status = 'pending';
    } else {
      const overlappingReservation = await Reservation.findOne({
        carId: car._id,
        status: { $in: ACTIVE_RESERVATION_STATUSES },
        holdExpiresAt: { $gt: now },
        pickupDate: { $lt: end },
        returnDate: { $gt: start },
      }).lean();

      if (overlappingReservation) {
        return renderOrderPage(
          res,
          car,
          formData,
          'Selected car is already reserved in this period. Please choose different dates or a different car.',
          {
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
          }
        );
      }

      const bookedOverlap = await Car.findOne({
        _id: car._id,
        dates: { $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } } }
      }).lean();
      if (bookedOverlap) {
        return renderOrderPage(
          res,
          car,
          formData,
          'Selected car is already booked in this period. Please choose different dates or a different car.',
          {
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
          }
        );
      }

      reservationDoc = await Reservation.create({
        carId: car._id,
        sessionId,
        pickupDate: start,
        pickupTime: formData.pickupTime,
        returnDate: end,
        returnTime: formData.returnTime,
        pickupLocation: formData.pickupLocation,
        returnLocation: formData.returnLocation,
        rentalDays: pricing.rentalDays,
        deliveryPrice: pricing.deliveryPrice,
        returnPrice: pricing.returnPrice,
        totalPrice: pricing.totalPrice,
        fullName: trimmedContact.fullName,
        phoneNumber: trimmedContact.phoneNumber,
        email: trimmedContact.email,
        address: trimmedContact.address,
        hotelName: trimmedContact.hotelName,
        status: 'pending',
        holdExpiresAt: new Date(Date.now() + HOLD_WINDOW_MS),
      });
      createdReservationThisStep = true;
    }

    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
        currency: 'eur',
            product_data: { name: `Car Rental – ${car.name}` },
            unit_amount: Math.round(Number(pricing.totalPrice) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel?session_id={CHECKOUT_SESSION_ID}`,
      });
    } catch (err) {
      console.error('Stripe session creation failed:', err);
      if (createdReservationThisStep) {
        await Reservation.findByIdAndUpdate(reservationDoc._id, { status: 'cancelled', holdExpiresAt: new Date() });
      } else {
        reservationDoc.status = 'cancelled';
        reservationDoc.holdExpiresAt = new Date();
        await reservationDoc.save();
      }
      return renderOrderPage(res, car, formData, 'Unable to start payment. Please try again in a minute.', {
        rentalDays: pricing.rentalDays,
        deliveryPrice: pricing.deliveryPrice,
        returnPrice: pricing.returnPrice,
        totalPrice: pricing.totalPrice,
      });
    }

    reservationDoc.stripeSessionId = stripeSession.id;
    reservationDoc.status = 'processing';
    await reservationDoc.save();

    res.redirect(303, stripeSession.url);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error processing checkout.');
  }
};

exports.handleCheckoutSuccess = async (req, res) => {
  const stripeSessionId = req.query.session_id;
  if (!stripeSessionId) {
    return res.status(400).send('Invalid checkout session.');
  }

  try {
    const reservation = await Reservation.findOne({ stripeSessionId }).populate('carId');
    if (!reservation) {
      return res.status(404).send('Reservation not found.');
    }

    if (reservation.status === 'confirmed') {
      return res.render('success', { title: 'Payment Success' });
    }

    if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status) || reservation.holdExpiresAt <= new Date()) {
      return res.status(400).send('Reservation has expired or been cancelled.');
    }

    const stripeSessionData = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (!stripeSessionData || stripeSessionData.payment_status !== 'paid') {
      return res.status(400).send('Payment not completed.');
    }

    const mongoSession = await mongoose.startSession();
    await mongoSession.withTransaction(async () => {
      const carId = reservation.carId?._id || reservation.carId;
      await addRange(carId, reservation.pickupDate, reservation.returnDate, mongoSession);

      await Order.create([{
        carId,
        pickupDate: reservation.pickupDate,
        pickupTime: reservation.pickupTime,
        returnDate: reservation.returnDate,
        returnTime: reservation.returnTime,
        pickupLocation: reservation.pickupLocation,
        returnLocation: reservation.returnLocation,
        rentalDays: reservation.rentalDays,
        deliveryPrice: reservation.deliveryPrice,
        returnPrice: reservation.returnPrice,
        totalPrice: reservation.totalPrice,
        fullName: reservation.fullName,
        phoneNumber: reservation.phoneNumber,
        email: reservation.email,
        address: reservation.address,
        hotelName: reservation.hotelName,
      }], { session: mongoSession });

      reservation.status = 'confirmed';
      reservation.holdExpiresAt = new Date();
      await reservation.save({ session: mongoSession });
    }, TXN_OPTIONS);
    await mongoSession.endSession();

    res.render('success', { title: 'Payment Success' });
  } catch (err) {
    console.error('Success handler error:', err);
    res.status(500).send('Could not finalize booking.');
  }
};

exports.handleCheckoutCancel = async (req, res) => {
  const stripeSessionId = req.query.session_id;
  if (stripeSessionId) {
    try {
      await Reservation.findOneAndUpdate(
        { stripeSessionId, status: { $in: ACTIVE_RESERVATION_STATUSES } },
        { status: 'cancelled', holdExpiresAt: new Date() }
      );
    } catch (err) {
      console.error('Cancel handler error:', err);
    }
  }

  res.send('Payment cancelled. You can start a new reservation when ready.');
};

exports.releaseActiveReservation = async (req, res) => {
  const sessionId = getSessionId(req);
  const now = new Date();
  const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
  const redirectTo = req.body.redirect || req.get('referer') || '/';

  try {
    const reservation = await Reservation.findOne({
      sessionId,
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      holdExpiresAt: { $gt: now },
    });

    if (!reservation) {
      if (wantsJson) {
        return res.status(404).json({ ok: false, message: 'No active reservation.' });
      }
      return res.redirect(redirectTo);
    }

    reservation.status = 'cancelled';
    reservation.holdExpiresAt = new Date();
    await reservation.save();

    if (wantsJson) {
      return res.json({ ok: true });
    }
    return res.redirect(redirectTo);
  } catch (err) {
    console.error('Release reservation error:', err);
    if (wantsJson) {
      return res.status(500).json({ ok: false, message: 'Failed to release reservation.' });
    }
    return res.redirect(redirectTo);
  }
};