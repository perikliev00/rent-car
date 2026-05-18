// Зареждаме Stripe клиента от config.
const stripe = require('../config/stripe');
// validationResult чете грешките от express-validator в routes.
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
  processStripeWebhookEvent,
} = require('../services/bookingFinalizationService');
const asyncHandler = require('../utils/asyncHandler');
const {
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} = require('../utils/appError');

// Преизгражда order page с view model, CSRF token и status code.
function renderOrderPage(req, res, car, formData, message, options = {}) {
  // Извикваме paymentService да събере view model от car, formData, message.
  const viewModel = buildOrderPageViewModel(car, formData, message, options);

  // Добавяме CSRF token ако middleware го е подготвил.
  if (res.locals && res.locals.csrfToken) {
    viewModel.csrfToken = res.locals.csrfToken;
  }

  // Render с 422 или custom statusCode, връщаме orderMain шаблона.
  return res.status(options.statusCode || 422).render('orderMain', viewModel);
}

// createCheckoutSession – валидира форма, резерва кола, създава Stripe session, redirect.
exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const errors = validationResult(req);           // Събираме validation грешки от route.
  const formData = req.body;                      // Данни от order формата.
  formData.releaseRedirect = req.originalUrl;     // За redirect след release.

  const car = await Car.findById(formData.carId);// Търсим колата по ID.
  if (!car) {
    throw new NotFoundError('Car not found.');
  }

  if (!errors.isEmpty()) {
    const message = errors.array()[0].msg;        // Първата грешка за показ.
    return renderOrderPage(req, res, car, formData, message);
  }

  const {                                        // Валидираме датите чрез bookingValidation.
    isValid,
    errors: bookingErrors,
    startDate,
    endDate,
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

  const start = startDate;                        // Нормализирани Date обекти.
  const end = endDate;

  const sessionId = getSessionId(req);            // Session ID за reservation binding.
  const now = new Date();                         // Текущо време за overlap проверки.

  const pricing = computeBookingPrice(           // Изчисляваме цена server-side.
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

  const trimmedContact = normalizeContactDetails(formData); // Trim на contact полета.

  let reservationDoc = await findActiveReservationBySession(req); // Активен hold за session.
  if (reservationDoc) {
    await reservationDoc.populate('carId', 'name');         // За име в banner.
  }

  let createdReservationThisStep = false;        // Флаг за compensation при Stripe fail.

  if (reservationDoc) {                         // Има активна резервация – проверяваме съвпадение.
    const sameCar =                               // Същата кола ли е?
      String(reservationDoc.carId?._id || reservationDoc.carId) === String(car._id);
    const sameStart =                             // Също начало?
      reservationDoc.pickupDate instanceof Date &&
      reservationDoc.pickupDate.getTime() === start.getTime();
    const sameEnd =                               // Същ край?
      reservationDoc.returnDate instanceof Date &&
      reservationDoc.returnDate.getTime() === end.getTime();

    if (!sameCar || !sameStart || !sameEnd) {    // Различен car/dates – показваме banner.
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

    reservationDoc.fullName = trimmedContact.fullName;     // Обновяваме contact.
    reservationDoc.phoneNumber = trimmedContact.phoneNumber;
    reservationDoc.email = trimmedContact.email;
    reservationDoc.address = trimmedContact.address;
    reservationDoc.hotelName = trimmedContact.hotelName;
    reservationDoc.rentalDays = pricing.rentalDays;       // Обновяваме pricing.
    reservationDoc.deliveryPrice = pricing.deliveryPrice;
    reservationDoc.returnPrice = pricing.returnPrice;
    reservationDoc.totalPrice = pricing.totalPrice;
    extendReservationHold(reservationDoc);                // Удължаваме hold.
    reservationDoc.status = 'pending';
  } else {                                                // Няма активна – търсим availability.
    const { overlappingReservation, bookedOverlap } = await checkCarAvailabilityForRange({
      carId: car._id,
      startDate: start,
      endDate: end,
      now,
    });

    if (overlappingReservation) {                // Друга активна резервация overlap-ва.
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

    if (bookedOverlap) {                         // Car.dates вече има booked период.
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

    reservationDoc = await createPendingReservation({     // Създаваме нов pending hold.
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
    createdReservationThisStep = true;           // За compensation при Stripe fail.
  }

  let stripeSession;
  try {                                          // Опит за създаване на Stripe session.
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
  } catch (err) {                               // Stripe API fail – compensation.
    console.error('Stripe session creation failed:', {
      correlationId: req.correlationId,
      message: err.message,
    });

    if (createdReservationThisStep) {            // Ако току-що създадохме – отменяме.
      await Reservation.findByIdAndUpdate(reservationDoc._id, {
        status: 'cancelled',
        holdExpiresAt: new Date(),
      });
    } else {                                    // Иначе обновяваме съществуващата.
      reservationDoc.status = 'cancelled';
      reservationDoc.holdExpiresAt = new Date();
      await reservationDoc.save();
    }

    return renderOrderPage(                      // Re-render с съобщение за грешка.
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

  reservationDoc.stripeSessionId = stripeSession.id;  // Свързваме с Stripe session.
  reservationDoc.status = 'processing';               // Преди redirect.

  try {
    await reservationDoc.save();                      // Запис – при fail хвърляме.
  } catch (err) {
    throw new ExternalServiceError(
      'Payment was prepared, but the reservation state could not be saved safely.',
      { reservationId: reservationDoc._id.toString() },
      { isOperational: false }
    );
  }

  return res.redirect(303, stripeSession.url);   // 303 See Other към Stripe checkout.
});

// handleCheckoutSuccess – опит за финализация; webhook е authoritative.
exports.handleCheckoutSuccess = asyncHandler(async (req, res) => {
  console.log('💥 /success HIT');

  const stripeSessionId = req.query.session_id;  // Stripe добавя в URL.
  if (!stripeSessionId) {
    throw new ValidationError('Invalid checkout session.');
  }

  try {
    const result = await finalizeReservationByStripeSessionId(stripeSessionId, {
      logPrefix: `🟢 [CheckoutSuccess][${req.correlationId}]`,
    });

    console.log('🔎 Reservation found for this session?', !!result?.reservation);

    if (!result.found) {
      console.warn('⚠️ No reservation found for stripeSessionId in /success:', stripeSessionId);
      return res.render('success', { title: 'Payment Success' });
    }

    return res.render('success', { title: 'Payment Success' });
  } catch (err) {
    console.error('❌ Error finalizing reservation in /success handler:', {
      correlationId: req.correlationId,
      message: err.message,
    });
    return res.render('success', { title: 'Payment Processing' });
  }
});

// handleCheckoutCancel – освобождава резервация при отказ.
exports.handleCheckoutCancel = asyncHandler(async (req, res) => {
  try {
    await releaseActiveReservationForSession(req);
  } catch (err) {
    console.error('Cancel handler error:', {
      correlationId: req.correlationId,
      message: err.message,
    });
  }

  return res.send('Payment cancelled. You can start a new reservation when ready.');
});

// handleStripeWebhook – валидира подпис, обработва checkout.session.completed.
exports.handleStripeWebhook = asyncHandler(async (req, res) => {
  const logPrefix = '🌐 [StripeWebhook]';
  console.log('════════════════════════════════════════════════════');
  console.log(
    `${logPrefix} HIT @ ${new Date().toISOString()} ${req.method} ${req.originalUrl}`
  );
  const sig = req.headers['stripe-signature'];   // Подпис за верификация.
  let event;

  try {
    event = stripe.webhooks.constructEvent(     // Верификация на подписа.
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`${logPrefix} ❌ Webhook signature verification failed:`, err.message);
    throw new ValidationError('Webhook signature verification failed.');
  }

  console.log(`${logPrefix} Parsed event type: ${event.type}`, event.id ? `id=${event.id}` : '');

  if (event.type === 'checkout.session.completed') {  // Единственият обработван тип.
    const session = event.data && event.data.object;  // Checkout session обект.
    if (!session || !session.id) {
      console.error(`${logPrefix} ❌ Webhook session missing id.`);
      return res.status(200).json({ received: true });
    }

    const stripeSessionId = session.id;
    console.log(`${logPrefix} checkout.session.completed for session ${stripeSessionId}`);

    const result = await processStripeWebhookEvent({
      eventId: event.id,
      stripeSessionId,
      logPrefix: `${logPrefix}[${req.correlationId}]`,
    });

    if (result?.reason === 'duplicate_event') {
      console.log(`${logPrefix} ℹ️ Event ${event.id} already processed, skipping`);
      return res.status(200).json({ received: true });
    }

    console.log(`${logPrefix} Reservation lookup result:`, !!result?.reservation);

    if (!result?.found) {
      console.warn(`${logPrefix} ⚠️ No reservation for stripeSessionId ${stripeSessionId}`);
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
  }

  console.log(`${logPrefix} Responding 200 { received: true }`);
  return res.status(200).json({ received: true });
});
