const mongoose = require('mongoose');
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

/**
 * Housekeep reservations whose holds expired or sessions vanished.
 * Marks as expired: active reservations with holdExpiresAt <= now, no sessionId, or sessionId not in active sessions.
 */
async function cleanUpAbandonedReservations() {
  try {
    const nowUTC = new Date();
    const sessionsColl = mongoose.connection.collection('sessions');
    const sessions = await sessionsColl
      .find({ expires: { $gt: nowUTC } }, { projection: { _id: 1 } })
      .toArray();

    const activeSids = sessions.map(s => String(s._id));
    const orCriteria = [
      { holdExpiresAt: { $lte: nowUTC } },
      { sessionId: { $exists: false } },
      { sessionId: null },
    ];
    if (activeSids.length) {
      orCriteria.push({ sessionId: { $nin: activeSids } });
    }

    const updated = await Reservation.updateMany(
      {
        status: { $in: ACTIVE_RESERVATION_STATUSES },
        $or: orCriteria
      },
      { $set: { status: 'expired', holdExpiresAt: nowUTC } }
    );

    if (updated.modifiedCount) {
      console.log(`🧽 Marked ${updated.modifiedCount} reservation(s) as expired or abandoned.`);
    }
  } catch (err) {
    console.error('Cleanup error (abandoned reservations):', err);
  }
}

module.exports = {
  findActiveReservationBySession,
  releaseActiveReservationForSession,
  extendReservationHold,
  checkCarAvailabilityForRange,
  createPendingReservation,
  cleanUpAbandonedReservations,
};

