const Car = require('../models/Car');
const { computeBookingPrice } = require('../utils/pricing');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');
const {
  getSessionId,
  buildExistingReservationSummary,
} = require('../utils/reservationHelpers');
const { validateBookingDates } = require('../utils/bookingValidation');
const {
  checkCarAvailabilityForRange,
  createPendingReservation,
  findActiveReservationBySession,
} = require('../services/reservationService');
const {
  buildBaseOrderPayload,
  buildOrderViewModel,
} = require('../services/orderViewModelService');

module.exports.getOrderCar = async (req, res, next) => {
  try {
    const {
      'pickup-date': pickupDateISO,
      'return-date': returnDateISO,
      'pickup-location': pickupLocation,
      'return-location': returnLocation,
      'pickup-time': pickupTime,
      'return-time': returnTime,
      'rental-days': rentalDaysFromForm, // ignored for pricing
      'delivery-price': deliveryPriceFromForm, // ignored
      'return-price': returnPriceFromForm, // ignored
      'total-price': totalPriceFromForm, // ignored
      carId,
    } = req.body || {};

    if (!carId) {
      return res.status(400).send('Car not specified.');
    }

    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).send('Car not found.');
    }

    const {
      isValid,
      errors: bookingErrors,
      startDate,
      endDate,
      rentalDays,
    } = validateBookingDates({
      pickupDate: pickupDateISO,
      returnDate: returnDateISO,
      pickupTime: pickupTime || '00:00',
      returnTime: returnTime || '23:59',
    });

    if (!isValid || !startDate || !endDate) {
      return res.status(400).send('Invalid booking dates.');
    }

    const start = startDate;
    const end = endDate;

    const pricing = computeBookingPrice(car, start, end, pickupLocation, returnLocation);
    if (!pricing || !Number.isFinite(pricing.totalPrice) || pricing.totalPrice <= 0) {
      return res.status(400).send('Unable to calculate price for this rental. Please try again.');
    }

    const pickupDateDisplay = formatDateForDisplay(pickupDateISO);
    const returnDateDisplay = formatDateForDisplay(returnDateISO);
    const pickupLocationDisplay = formatLocationName(pickupLocation);
    const returnLocationDisplay = formatLocationName(returnLocation);
    const sessionId = getSessionId(req);
    const now = new Date();

    const basePayload = buildBaseOrderPayload({
      pickupDateISO,
      returnDateISO,
      pickupTime,
      returnTime,
      pickupLocation,
      returnLocation,
      pickupDateDisplay,
      returnDateDisplay,
      pickupLocationDisplay,
      returnLocationDisplay,
      pricing,
      releaseRedirect: req.originalUrl,
    });

    const renderOrderPage = (overrides = {}, status = 200) => {
      const viewModel = buildOrderViewModel(car, basePayload, {
        message: overrides.message ?? null,
        existingReservation: overrides.existingReservation ?? null,
      });

      // Use CSRF token prepared by route-level middleware
      if (res.locals && res.locals.csrfToken) {
        viewModel.csrfToken = res.locals.csrfToken;
      }

      return res.status(status).render('orderMain', viewModel);
    };

    let existingForSession = await findActiveReservationBySession(req);
    if (existingForSession) {
      await existingForSession.populate('carId', 'name');

      return renderOrderPage({
        message: 'You already have an active reservation. Please complete or release it before starting another.',
        existingReservation: buildExistingReservationSummary(existingForSession),
      });
    }

    const { overlappingReservation, bookedOverlap } = await checkCarAvailabilityForRange({
      carId: car._id,
      startDate: start,
      endDate: end,
      now,
    });

    if (overlappingReservation) {
      return renderOrderPage({
        message: 'Selected car is already reserved in this period. Please choose different dates or a different car.',
      });
    }

    if (bookedOverlap) {
      return renderOrderPage({
        message: 'Selected car is already booked in this period. Please choose different dates or a different car.',
      });
    }

    await createPendingReservation({
      carId: car._id,
      sessionId,
      startDate: start,
      endDate: end,
      pickupTime,
      returnTime,
      pickupLocation,
      returnLocation,
      pricing,
      // no contact provided here – defaults to empty strings
    });

    return renderOrderPage({ message: null, existingReservation: null });
  } catch (err) {
    console.error('getOrderCar error:', err);
    err.publicMessage = 'Unable to prepare reservation.';
    return next(err);
  }
};
