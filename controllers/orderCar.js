const Car = require('../models/Car');
const Reservation = require('../models/Reservation');
const { parseSofiaDate } = require('../utils/timeZone');
const { computeBookingPrice } = require('../utils/pricing');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');

const HOLD_WINDOW_MS = 20 * 60 * 1000;
const ACTIVE_RESERVATION_STATUSES = ['pending', 'processing'];

function getSessionId(req) {
  return (req.session && (req.session._sid || req.sessionID)) || req.sessionID;
}

function buildExistingReservationSummary(reservation) {
  if (!reservation) return null;
  const carName = reservation.carId && reservation.carId.name ? reservation.carId.name : 'Reserved car';
  const totalPrice =
    reservation.totalPrice != null && typeof reservation.totalPrice === 'number'
      ? reservation.totalPrice.toFixed(2)
      : null;

  return {
    carName,
    pickupDate: formatDateForDisplay(reservation.pickupDate),
    returnDate: formatDateForDisplay(reservation.returnDate),
    totalPrice,
  };
}

function buildBasePayload({
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
  releaseRedirect,
}) {
  return {
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
    rentalDays: pricing.rentalDays,
    deliveryPrice: pricing.deliveryPrice,
    returnPrice: pricing.returnPrice,
    totalPrice: pricing.totalPrice,
    releaseRedirect,
  };
}

function buildViewModel(car, basePayload, overrides = {}) {
  return {
    title: 'Order Car',
    car,
    pickupDate: basePayload.pickupDateDisplay,
    pickupTime: basePayload.pickupTime || '',
    returnDate: basePayload.returnDateDisplay,
    returnTime: basePayload.returnTime || '',
    pickupLocation: basePayload.pickupLocation,
    returnLocation: basePayload.returnLocation,
    pickupLocationDisplay: basePayload.pickupLocationDisplay,
    returnLocationDisplay: basePayload.returnLocationDisplay,
    pickupDateISO: basePayload.pickupDateISO,
    returnDateISO: basePayload.returnDateISO,
    rentalDays: basePayload.rentalDays,
    deliveryPrice: basePayload.deliveryPrice,
    returnPrice: basePayload.returnPrice,
    totalPrice: basePayload.totalPrice,
    fullName: '',
    phoneNumber: '',
    email: '',
    address: '',
    hotelName: '',
    existingReservation: null,
    releaseRedirect: basePayload.releaseRedirect,
    message: null,
    ...overrides,
  };
}

module.exports.getOrderCar = async (req, res) => {
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

    const start = parseSofiaDate(pickupDateISO, pickupTime || '00:00');
    const end = parseSofiaDate(returnDateISO, returnTime || '23:59');

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return res.status(400).send('Invalid booking dates.');
    }

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

    const basePayload = buildBasePayload({
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

    const renderOrderPage = (overrides = {}, status = 200) =>
      res.status(status).render('orderMain', buildViewModel(car, basePayload, overrides));

    const existingForSession = await Reservation.findOne({
      sessionId,
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      holdExpiresAt: { $gt: now },
    }).populate('carId', 'name');

    if (existingForSession) {
      return renderOrderPage({
        message: 'You already have an active reservation. Please complete or release it before starting another.',
        existingReservation: buildExistingReservationSummary(existingForSession),
      });
    }

    const overlappingReservation = await Reservation.findOne({
      carId: car._id,
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      holdExpiresAt: { $gt: now },
      pickupDate: { $lt: end },
      returnDate: { $gt: start },
    }).lean();

    if (overlappingReservation) {
      return renderOrderPage({
        message: 'Selected car is already reserved in this period. Please choose different dates or a different car.',
      });
    }

    const bookedOverlap = await Car.findOne({
      _id: car._id,
      dates: {
        $elemMatch: {
          startDate: { $lt: end },
          endDate: { $gt: start },
        },
      },
    }).lean();

    if (bookedOverlap) {
      return renderOrderPage({
        message: 'Selected car is already booked in this period. Please choose different dates or a different car.',
      });
    }

    await Reservation.create({
      carId: car._id,
      sessionId,
      pickupDate: start,
      pickupTime,
      returnDate: end,
      returnTime,
      pickupLocation,
      returnLocation,
      rentalDays: pricing.rentalDays,
      deliveryPrice: pricing.deliveryPrice,
      returnPrice: pricing.returnPrice,
      totalPrice: pricing.totalPrice,
      fullName: '',
      phoneNumber: '',
      email: '',
      address: '',
      hotelName: '',
      status: 'pending',
      holdExpiresAt: new Date(Date.now() + HOLD_WINDOW_MS),
    });

    return renderOrderPage({ message: null, existingReservation: null });
  } catch (err) {
    console.error('getOrderCar error:', err);
    return res.status(500).send('Unable to prepare reservation.');
  }
};
