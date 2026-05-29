// Mongoose – за модели и raw sessions колекция при cleanup.
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Car = require('../models/Car');
const {
  ACTIVE_RESERVATION_STATUSES,
  HOLD_WINDOW_MS,
  getSessionId,
} = require('../utils/reservationHelpers');

// Find the current session's active reservation hold, if one still exists and has not expired.
async function findActiveReservationBySession(req) {
  // Reservation holds are keyed by the same session ID used everywhere else in the booking flow.
  const sessionId = getSessionId(req);
  // Holds are only active while their expiration timestamp is still in the future.
  const now = new Date();

  // Query for one non-expired reservation owned by this session and still in an active state.
  const reservation = await Reservation.findOne({
    sessionId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: now },
  });

  // Return `null` instead of `undefined` for a cleaner caller contract.
  return reservation || null;
}

// Cancel the current session's active reservation hold, if one exists.
async function releaseActiveReservationForSession(req) {
  // Reuse the helper above so the release logic stays aligned with what counts as "active".
  const reservation = await findActiveReservationBySession(req);

  // No active hold means there is nothing to cancel.
  if (!reservation) {
    return { cancelled: false, reservation: null };
  }

  // Mark the hold as cancelled so it no longer blocks availability.
  reservation.status = 'cancelled';
  // Expire the hold immediately.
  reservation.holdExpiresAt = new Date();
  // Persist the cancellation.
  await reservation.save();

  // Return both a boolean and the reservation document for callers that want more context.
  return { cancelled: true, reservation };
}

// Extend an in-memory reservation document's hold window into the future.
function extendReservationHold(reservation) {
  // Defensive guard: allow callers to pass a falsy value without crashing.
  if (!reservation) {
    return reservation;
  }

  // Push expiration forward by the configured hold timeout.
  reservation.holdExpiresAt = new Date(Date.now() + HOLD_WINDOW_MS);
  // Return the same document so callers can keep chaining/mutating it.
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
  // The service expects a concrete car plus normalized Date objects.
  if (!carId || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error('checkCarAvailabilityForRange: invalid arguments');
  }

  // Find overlapping temporary holds that are still active.
  const overlappingReservation = await Reservation.findOne({
    carId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: now },
    pickupDate: { $lt: endDate },
    returnDate: { $gt: startDate },
  }).lean();

  // Separately check `Car.dates` for already booked/confirmed periods.
  const bookedOverlap = await Car.findOne({
    _id: carId,
    dates: {
      $elemMatch: {
        startDate: { $lt: endDate },
        endDate: { $gt: startDate },
      },
    },
  }).lean();

  // Return both kinds of conflict so callers can tailor messages/behavior.
  return {
    overlappingReservation,
    bookedOverlap,
  };
}

// Create a brand-new pending reservation hold tied to a visitor session.
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
  // Contact fields are optional at this stage because some holds are created before checkout details exist.
  const {
    fullName = '',
    phoneNumber = '',
    email = '',
    address = '',
    hotelName = '',
  } = contact;

  // Persist the pending reservation with pricing, location, contact, and hold-expiration metadata.
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
    // New holds automatically expire after the configured hold window if the user does not continue checkout.
    holdExpiresAt: new Date(Date.now() + HOLD_WINDOW_MS),
  });
}

/**
 * Housekeep reservations whose holds expired or sessions vanished.
 * Marks as expired: active reservations with holdExpiresAt <= now, no sessionId, or sessionId not in active sessions.
 */
async function cleanUpAbandonedReservations() {
  try {
    // Snapshot "now" once so all comparisons within this cleanup pass are consistent.
    const nowUTC = new Date();
    // Read the raw session store collection to learn which session IDs are still alive.
    const sessionsColl = mongoose.connection.collection('sessions');
    const sessions = await sessionsColl
      .find({ expires: { $gt: nowUTC } }, { projection: { _id: 1 } })
      .toArray();

    // Convert active Mongo session documents into plain string IDs for comparison.
    const activeSids = sessions.map(s => String(s._id));
    // Holds should expire when the timer elapsed or when the backing session disappeared.
    const orCriteria = [
      { holdExpiresAt: { $lte: nowUTC } },
      { sessionId: { $exists: false } },
      { sessionId: null },
    ];
    // Only add the `$nin` branch when there are active sessions to compare against.
    if (activeSids.length) {
      orCriteria.push({ sessionId: { $nin: activeSids } });
    }

    // Bulk-mark all matching active reservations as expired.
    const updated = await Reservation.updateMany(
      {
        status: { $in: ACTIVE_RESERVATION_STATUSES },
        $or: orCriteria
      },
      { $set: { status: 'expired', holdExpiresAt: nowUTC } }
    );

    // Log only when something actually changed.
    if (updated.modifiedCount) {
      console.log(`🧽 Marked ${updated.modifiedCount} reservation(s) as expired or abandoned.`);
    }
  } catch (err) {
    // Cleanup failures should be visible in logs but should not crash the server.
    console.error('Cleanup error (abandoned reservations):', err);
  }
}

// Export the reservation service API used by controllers and bootstrap jobs.
module.exports = {
  findActiveReservationBySession,
  releaseActiveReservationForSession,
  extendReservationHold,
  checkCarAvailabilityForRange,
  createPendingReservation,
  cleanUpAbandonedReservations,
};

