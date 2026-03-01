const stripe = require('../config/stripe');
const { validationResult } = require('express-validator');

const Car = require('../models/Car');
const Reservation = require('../models/Reservation');
const { computeBookingPrice } = require('../utils/pricing');
const {
  getSessionId,
  buildExistingReservationSummary,
} = require('../utils/reservationHelpers');
const { validateBookingDates } = require('../utils/bookingValidation');
const { buildOrderPageViewModel, normalizeContactDetails } = require('../services/paymentService');
const {
  findActiveReservationBySession,
  releaseActiveReservationForSession,
  extendReservationHold,
  checkCarAvailabilityForRange,
  createPendingReservation,
} = require('../services/reservationService');
const {
  finalizeReservationByStripeSessionId,
} = require('../services/bookingFinalizationService');
const ProcessedStripeEvent = require('../models/ProcessedStripeEvent');

function renderOrderPage(req, res, car, formData, message, options = {}) {
  const viewModel = buildOrderPageViewModel(car, formData, message, options);

  // Use CSRF token prepared by route-level middleware
  if (res.locals && res.locals.csrfToken) {
    viewModel.csrfToken = res.locals.csrfToken;
  }

  return res.status(options.statusCode || 422).render('orderMain', viewModel);
}

exports.createCheckoutSession = async (req, res, next) => {
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
    console.error('Error loading car information.', err);
    err.publicMessage = 'Error loading car information.';
    return next(err);
  }

  if (!errors.isEmpty()) {
    const message = errors.array()[0].msg;
    return renderOrderPage(req, res, car, formData, message);
  }

  const {
    isValid,
    errors: bookingErrors,
    startDate,
    endDate,
    rentalDays,
  } = validateBookingDates({
    pickupDate: formData.pickupDate,
    returnDate: formData.returnDate,
    pickupTime: formData.pickupTime || '00:00',
    returnTime: formData.returnTime || '23:59',
  });

  if (!isValid || !startDate || !endDate) {
    const message =
      bookingErrors[0] || 'Invalid booking dates. Please choose a different range.';
    return renderOrderPage(req, res, car, formData, message);
  }

  const start = startDate;
  const end = endDate;

  const sessionId = getSessionId(req);
  const now = new Date();

  try {
    const pricing = computeBookingPrice(
      car,
      start,
      end,
      formData.pickupLocation,
      formData.returnLocation
    );
    if (!pricing || !Number.isFinite(pricing.totalPrice) || pricing.totalPrice <= 0) {
      return renderOrderPage(
        req,
        res,
        car,
        formData,
        'Unable to calculate price for this rental. Please try again.',
      );
    }

    const trimmedContact = normalizeContactDetails(formData);

    let reservationDoc = await findActiveReservationBySession(req);
    if (reservationDoc) {
      await reservationDoc.populate('carId', 'name');
    }

    let createdReservationThisStep = false;

    if (reservationDoc) {
      const sameCar =
        String(reservationDoc.carId?._id || reservationDoc.carId) === String(car._id);
      const sameStart =
        reservationDoc.pickupDate instanceof Date &&
        reservationDoc.pickupDate.getTime() === start.getTime();
      const sameEnd =
        reservationDoc.returnDate instanceof Date &&
        reservationDoc.returnDate.getTime() === end.getTime();

      if (!sameCar || !sameStart || !sameEnd) {
        return renderOrderPage(
          req,
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
      extendReservationHold(reservationDoc);
      reservationDoc.status = 'pending';
    } else {
      const { overlappingReservation, bookedOverlap } = await checkCarAvailabilityForRange({
        carId: car._id,
        startDate: start,
        endDate: end,
        now,
      });

      if (overlappingReservation) {
        return renderOrderPage(
          req,
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

      if (bookedOverlap) {
        return renderOrderPage(
          req,
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

      reservationDoc = await createPendingReservation({
        carId: car._id,
        sessionId,
        startDate: start,
        endDate: end,
        pickupTime: formData.pickupTime,
        returnTime: formData.returnTime,
        pickupLocation: formData.pickupLocation,
        returnLocation: formData.returnLocation,
        pricing,
        contact: trimmedContact,
      });
      createdReservationThisStep = true;
    }

    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: { name: `Car Rental – ${car.name}` },
              unit_amount: Math.round(Number(pricing.totalPrice) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel?session_id={CHECKOUT_SESSION_ID}`,
      });
    } catch (err) {
      console.error('Stripe session creation failed:', err);
      if (createdReservationThisStep) {
        await Reservation.findByIdAndUpdate(reservationDoc._id, {
          status: 'cancelled',
          holdExpiresAt: new Date(),
        });
      } else {
        reservationDoc.status = 'cancelled';
        reservationDoc.holdExpiresAt = new Date();
        await reservationDoc.save();
      }
      return renderOrderPage(
        req,
        res,
        car,
        formData,
        'Unable to start payment. Please try again in a minute.',
        {
          rentalDays: pricing.rentalDays,
          deliveryPrice: pricing.deliveryPrice,
          returnPrice: pricing.returnPrice,
          totalPrice: pricing.totalPrice,
        }
      );
    }

    reservationDoc.stripeSessionId = stripeSession.id;
    reservationDoc.status = 'processing';
    await reservationDoc.save();

    res.redirect(303, stripeSession.url);
  } catch (err) {
    console.error('Error processing checkout.', err);
    err.publicMessage = 'Error processing checkout.';
    return next(err);
  }
};

exports.handleCheckoutSuccess = async (req, res, next) => {
  console.log('💥 /success HIT');

  const stripeSessionId = req.query.session_id;
  if (!stripeSessionId) {
    console.error('❌ /success called without session_id in query');
    return res.status(400).send('Invalid checkout session.');
  }

  try {
    let result;
    try {
      result = await finalizeReservationByStripeSessionId(stripeSessionId);
    } catch (err) {
      console.error('❌ Error finalizing reservation in /success handler:', err);
      return res.render('success', { title: 'Payment Processing' });
    }

    console.log('🔎 Reservation found for this session?', !!result?.reservation);

    if (!result.found) {
      console.warn('⚠️ No reservation found for stripeSessionId in /success:', stripeSessionId);
      // Показваме success, за да не плаши клиента, но логваме проблема
      return res.render('success', { title: 'Payment Success' });
    }

    if (!result.finalized && result.reservation?.status === 'confirmed') {
      console.log(
        'ℹ️ Reservation already confirmed in /success:',
        result.reservation._id.toString()
      );
      return res.render('success', { title: 'Payment Success' });
    }

    // 5) Показваме success страница
    return res.render('success', { title: 'Payment Success' });
  } catch (err) {
    console.error('Success handler error:', err);
    err.publicMessage = 'Could not load booking status.';
    return next(err);
  }
};


exports.handleCheckoutCancel = async (req, res) => {
    try {
    await releaseActiveReservationForSession(req);
    } catch (err) {
      console.error('Cancel handler error:', err);
  }

  res.send('Payment cancelled. You can start a new reservation when ready.');
};



exports.handleStripeWebhook = async (req, res) => {
  const logPrefix = '🌐 [StripeWebhook]';
  console.log('════════════════════════════════════════════════════');
  console.log(
    `${logPrefix} HIT @ ${new Date().toISOString()} ${req.method} ${req.originalUrl}`
  );
  // Do not log req.headers (contains cookie, user-agent, etc.)
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // req.body тук е Buffer, защото маршрутът в server.js е с express.raw() — нужен е за проверка на подписа
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`${logPrefix} ❌ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`${logPrefix} Parsed event type: ${event.type}`, event.id ? `id=${event.id}` : '');

  if (event.type === 'checkout.session.completed') {
    const session = event.data && event.data.object;
    if (!session || !session.id) {
      console.error(`${logPrefix} ❌ Webhook session missing id.`);
      return res.status(200).json({ received: true });
    }

    const stripeSessionId = session.id;
    console.log(`${logPrefix} checkout.session.completed for session ${stripeSessionId}`);

    // ——— Идемпотентност по event.id ———
    // Опит за запис на този event в ProcessedStripeEvent. Ако event вече е бил обработен
    // (напр. Stripe retry), insert ще върне duplicate key (11000) и пропускаме финализацията.
    try {
      await ProcessedStripeEvent.create({
        eventId: event.id,
        stripeSessionId,
        processedAt: new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        console.log(`${logPrefix} ℹ️ Event ${event.id} already processed (duplicate key), skipping`);
        return res.status(200).json({ received: true });
      }
      throw err;
    }

    try {
      const result = await finalizeReservationByStripeSessionId(stripeSessionId, {
        logPrefix,
        requireActiveStatus: true,
      });

      console.log(`${logPrefix} Reservation lookup result:`, !!result?.reservation);

      if (!result.found) {
        console.warn(
          `${logPrefix} ⚠️ No reservation for stripeSessionId ${stripeSessionId}`
        );
        return res.status(200).json({ received: true });
      }

      if (result.reason === 'status_not_active' && result.reservation) {
        console.warn(
          `${logPrefix} ⚠️ Reservation status is not active`,
          result.reservation._id.toString(),
          'status=',
          result.reservation.status
        );
        return res.status(200).json({ received: true });
      }
    } catch (err) {
      console.error(`${logPrefix} ❌ Error inside webhook handler:`, err);
    }
  }

  console.log(`${logPrefix} Responding 200 { received: true }`);
  return res.status(200).json({ received: true });
};