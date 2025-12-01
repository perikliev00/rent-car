const Reservation = require('../models/Reservation');
const Car = require('../models/Car');
const {
  ACTIVE_RESERVATION_STATUSES,
  HOLD_WINDOW_MS,
  getSessionId,
} = require('../utils/reservationHelpers');

async function findActiveReservationBySession(req) {
  const sessionId = getSessionId(req);
  const now = new Date();

  const reservation = await Reservation.findOne({
    sessionId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: now },
  });

  return reservation || null;
}

async function releaseActiveReservationForSession(req) {
  const reservation = await findActiveReservationBySession(req);

  if (!reservation) {
    return { cancelled: false, reservation: null };
  }

  reservation.status = 'cancelled';
  reservation.holdExpiresAt = new Date();
  await reservation.save();

  return { cancelled: true, reservation };
}

function extendReservationHold(reservation) {
  if (!reservation) {
    return reservation;
  }

  reservation.holdExpiresAt = new Date(Date.now() + HOLD_WINDOW_MS);
  return reservation;
}

/**
 * Check if a specific car is available for the given date range.
 *
 * See controller docs for exact overlap/active semantics.
 */
async function checkCarAvailabilityForRange({
  carId,
  startDate,
  endDate,
  now = new Date(),
}) {
  if (!carId || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error('checkCarAvailabilityForRange: invalid arguments');
  }

  const overlappingReservation = await Reservation.findOne({
    carId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: now },
    pickupDate: { $lt: endDate },
    returnDate: { $gt: startDate },
  }).lean();

  const bookedOverlap = await Car.findOne({
    _id: carId,
    dates: {
      $elemMatch: {
        startDate: { $lt: endDate },
        endDate: { $gt: startDate },
      },
    },
  }).lean();

  return {
    overlappingReservation,
    bookedOverlap,
  };
}

async function createPendingReservation({
  carId,
  sessionId,
  startDate,
  endDate,
  pickupTime,
  returnTime,
  pickupLocation,
  returnLocation,
  pricing,
  contact = {},
}) {
  const {
    fullName = '',
    phoneNumber = '',
    email = '',
    address = '',
    hotelName = '',
  } = contact;

  return Reservation.create({
    carId,
    sessionId,
    pickupDate: startDate,
    pickupTime,
    returnDate: endDate,
    returnTime,
    pickupLocation,
    returnLocation,
    rentalDays: pricing.rentalDays,
    deliveryPrice: pricing.deliveryPrice,
    returnPrice: pricing.returnPrice,
    totalPrice: pricing.totalPrice,
    fullName,
    phoneNumber,
    email,
    address,
    hotelName,
    status: 'pending',
    holdExpiresAt: new Date(Date.now() + HOLD_WINDOW_MS),
  });
}

module.exports = {
  findActiveReservationBySession,
  releaseActiveReservationForSession,
  extendReservationHold,
  checkCarAvailabilityForRange,
  createPendingReservation,
};

