const Order = require('../../../models/Order');
const Car = require('../../../models/Car');
const { computeBookingPrice } = require('../../../utils/pricing');
const { parseSofiaDate } = require('../../../utils/timeZone');
const { purgeExpired, addRange } = require('../../../utils/bookingSync');
const { findActiveReservationHold } = require('../reservationAdminService');
const {
  trimContactDetails,
  contactFieldsIncomplete,
} = require('../../contactService');
const {
  CONTACT_REQUIRED_MESSAGE,
  RESERVATION_CONFLICT_MESSAGE,
  OrderFormError,
  parseDateRange,
  runWithOptionalTransaction,
} = require('./orderShared');
const { buildOrderNewErrorResult } = require('./orderFormService');

// Check whether a car is available for a specific range in the admin UI.
async function getCarAvailability(carId, query = {}) {
  const { pickupDate, pickupTime, returnDate, returnTime } = query;

  if (!carId || !pickupDate || !returnDate) {
    return {
      status: 400,
      body: { ok: false, error: 'Missing required parameters' },
    };
  }

  // Parse the requested range using Sofia-local business rules.
  const start = parseSofiaDate(pickupDate, pickupTime || '00:00');
  const end = parseSofiaDate(returnDate, returnTime || '23:59');

  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    return {
      status: 400,
      body: { ok: false, error: 'Invalid date/time range' },
    };
  }

  // Look for overlapping booked ranges in `Car.dates`.
  const conflictDoc = await Car.findOne({
    _id: carId,
    dates: {
      $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } },
    },
  }).lean();

  let conflicts = [];
  if (conflictDoc && Array.isArray(conflictDoc.dates)) {
    // Return the exact overlapping date ranges so the admin UI can show details if needed.
    conflicts = conflictDoc.dates
      .filter(
        (d) =>
          new Date(d.startDate) < end && new Date(d.endDate) > start
      )
      .map((d) => ({
        startDate: new Date(d.startDate).toISOString(),
        endDate: new Date(d.endDate).toISOString(),
      }));
  }

  return {
    status: 200,
    body: { ok: true, available: !conflictDoc, conflicts },
  };
}

// Public admin create-order entry point: normalize input, validate, then delegate to the transactional core.
async function createOrder(payload) {
  // Clean contact strings before validation.
  const trimmedContact = trimContactDetails(payload);
  if (contactFieldsIncomplete(trimmedContact)) {
    return buildOrderNewErrorResult(payload, CONTACT_REQUIRED_MESSAGE);
  }

  let range;
  try {
    // Parse and validate the requested booking range.
    range = parseDateRange(
      payload.pickupDate,
      payload.pickupTime,
      payload.returnDate,
      payload.returnTime
    );
  } catch (err) {
    if (err.isOrderFormError) {
      return buildOrderNewErrorResult(payload, err.message);
    }
    throw err;
  }

  // Build a smaller command object that contains only the fields needed by the core logic.
  const command = {
    carId: payload.carId,
    pickupLocation: payload.pickupLocation,
    returnLocation: payload.returnLocation,
    pickupTime: payload.pickupTime,
    returnTime: payload.returnTime,
    hotelName: payload.hotelName,
    contact: trimmedContact,
  };

  try {
    // Use a transaction when possible so Order + Car.dates stay synchronized.
    await runWithOptionalTransaction((session) =>
      createOrderCore({
        command,
        range,
        session,
      })
    );
    return { success: true };
  } catch (err) {
    // Recoverable form errors return a re-render payload instead of throwing upward.
    if (err.isOrderFormError) {
      return buildOrderNewErrorResult(payload, err.message);
    }
    throw err;
  }
}

// Transactional core for admin order creation.
async function createOrderCore({ command, range, session }) {
  // Admin must choose a car before creating an order.
  if (!command.carId) {
    throw new OrderFormError('CAR_REQUIRED', 'Car selection is required.');
  }

  // Remove expired car ranges first so they do not create false overlap conflicts.
  await purgeExpired(command.carId, session);
  const carQuery = Car.findById(command.carId);
  if (session) {
    carQuery.session(session);
  }
  const car = await carQuery.lean();
  if (!car) {
    const err = new Error('Car not found');
    err.code = 'CAR_NOT_FOUND';
    throw err;
  }

  // Check overlap against confirmed/booked car date windows.
  const overlapQuery = Car.findOne({
    _id: command.carId,
    dates: {
      $elemMatch: {
        startDate: { $lt: range.end },
        endDate: { $gt: range.start },
      },
    },
  });
  if (session) {
    overlapQuery.session(session);
  }
  const overlapDoc = await overlapQuery.lean();
  if (overlapDoc) {
    throw new OrderFormError(
      'OVERLAP',
      'Selected car is already booked in the specified period. Please choose different dates or a different car.'
    );
  }

  // Also block admin creation when an active online reservation hold overlaps the same range.
  const reservationConflict = await findActiveReservationHold(
    command.carId,
    range.start,
    range.end,
    session
  );
  if (reservationConflict) {
    throw new OrderFormError('RESERVATION_CONFLICT', RESERVATION_CONFLICT_MESSAGE);
  }

  // Compute the authoritative price on the server side.
  const pricing = computeBookingPrice(
    car,
    range.start,
    range.end,
    command.pickupLocation,
    command.returnLocation
  );

  // Build the final order payload to be persisted.
  const orderPayload = {
    carId: command.carId,
    pickupDate: range.start,
    pickupTime: command.pickupTime,
    returnDate: range.end,
    returnTime: command.returnTime,
    pickupLocation: command.pickupLocation,
    returnLocation: command.returnLocation,
    rentalDays: pricing.rentalDays,
    deliveryPrice: pricing.deliveryPrice,
    returnPrice: pricing.returnPrice,
    totalPrice: pricing.totalPrice,
    fullName: command.contact.fullName,
    phoneNumber: command.contact.phoneNumber,
    email: command.contact.email,
    address: command.contact.address,
    hotelName: command.hotelName,
  };

  // Create the order either inside the transaction or normally, depending on environment support.
  if (session) {
    await Order.create([orderPayload], { session });
  } else {
    await Order.create(orderPayload);
  }

  // Finally mirror the new booking range into `Car.dates`.
  await addRange(command.carId, range.start, range.end, session);
}

module.exports = {
  createOrder,
  createOrderCore,
  getCarAvailability,
};
