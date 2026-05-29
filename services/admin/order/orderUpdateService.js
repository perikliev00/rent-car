const Order = require('../../../models/Order');
const Car = require('../../../models/Car');
const { computeBookingPrice } = require('../../../utils/pricing');
const { parseSofiaDate } = require('../../../utils/timeZone');
const { updateRange, moveRange } = require('../../../utils/bookingSync');
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
  sessionOptions,
  runWithOptionalTransaction,
} = require('./orderShared');
const { buildOrderEditErrorResult } = require('./orderFormService');

// Try to recover the exact stored `Car.dates` range that corresponds to an order's previous booking.
function extractStoredRange(carDoc, prevStart, prevEnd) {
  if (!carDoc || !Array.isArray(carDoc.dates) || !carDoc.dates.length) {
    return { storedStart: prevStart, storedEnd: prevEnd };
  }
  const candidate = carDoc.dates.find((d) => {
    const s = new Date(d.startDate);
    const e = new Date(d.endDate);
    return s < prevEnd && e > prevStart;
  });
  if (candidate) {
    return {
      storedStart: new Date(candidate.startDate),
      storedEnd: new Date(candidate.endDate),
    };
  }
  return { storedStart: prevStart, storedEnd: prevEnd };
}

// Public admin order-update entry point.
async function updateOrder(orderId, payload) {
  // Normalize contact fields first.
  const trimmedContact = trimContactDetails(payload);
  if (contactFieldsIncomplete(trimmedContact)) {
    return buildOrderEditErrorResult(
      orderId,
      payload,
      CONTACT_REQUIRED_MESSAGE
    );
  }

  let range;
  try {
    // Parse and validate the edited date range.
    range = parseDateRange(
      payload.pickupDate,
      payload.pickupTime,
      payload.returnDate,
      payload.returnTime
    );
  } catch (err) {
    if (err.isOrderFormError) {
      return buildOrderEditErrorResult(orderId, payload, err.message);
    }
    throw err;
  }

  try {
    // Run the update inside a transaction when available.
    await runWithOptionalTransaction((session) =>
      updateOrderCore({
        orderId,
        payload,
        contact: trimmedContact,
        range,
        session,
      })
    );
    return { success: true };
  } catch (err) {
    // Convert recoverable domain errors into edit-form re-render payloads.
    if (err.isOrderFormError) {
      let message = err.message || 'Error saving order';
      if (err.code === 'RESERVATION_CONFLICT') {
        message = RESERVATION_CONFLICT_MESSAGE;
      } else if (err.code === 'OVERLAP') {
        message =
          'Selected car is already booked in the specified period. Please choose different dates or a different car.';
      } else if (err.code === 'MISSING_CONTACT') {
        message = CONTACT_REQUIRED_MESSAGE;
      }
      return buildOrderEditErrorResult(orderId, payload, message);
    }
    throw err;
  }
}

// Transactional core for admin order updates, including `Car.dates` synchronization.
async function updateOrderCore({ orderId, payload, contact, range, session }) {
  // Load the existing order first.
  const orderQuery = Order.findById(orderId);
  if (session) {
    orderQuery.session(session);
  }
  const existingOrder = await orderQuery;
  if (!existingOrder) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  // Capture the old car/date range so car availability can be updated correctly if anything changes.
  const prevCarId = existingOrder.carId;
  const prevStart =
    existingOrder.pickupDate instanceof Date
      ? existingOrder.pickupDate
      : parseSofiaDate(existingOrder.pickupDate, existingOrder.pickupTime || '00:00');
  const prevEnd =
    existingOrder.returnDate instanceof Date
      ? existingOrder.returnDate
      : parseSofiaDate(existingOrder.returnDate, existingOrder.returnTime || '23:59');

  let storedPrevStart = prevStart;
  let storedPrevEnd = prevEnd;
  try {
    // Try to read the exact stored range from `Car.dates`.
    const prevCarQuery = Car.findById(prevCarId);
    if (session) {
      prevCarQuery.session(session);
    }
    const prevCar = await prevCarQuery.lean();
    const stored = extractStoredRange(prevCar, prevStart, prevEnd);
    storedPrevStart = stored.storedStart;
    storedPrevEnd = stored.storedEnd;
  } catch (_) {
    // ignore, fall back to prevStart/prevEnd
  }

  // If no new carId was provided, keep the existing car.
  const newCarId =
    payload.carId && payload.carId.toString
      ? payload.carId.toString()
      : String(prevCarId);

  const carQuery = Car.findById(newCarId);
  if (session) {
    carQuery.session(session);
  }
  const car = await carQuery.lean();
  if (!car) {
    const err = new Error('Car not found');
    err.code = 'CAR_NOT_FOUND';
    throw err;
  }

  // Detect whether the core booking dimensions actually changed.
  const sameCar = String(prevCarId) === String(newCarId);
  const sameStart = prevStart && range.start && prevStart.getTime() === range.start.getTime();
  const sameEnd = prevEnd && range.end && prevEnd.getTime() === range.end.getTime();
  const samePickupLoc = existingOrder.pickupLocation === payload.pickupLocation;
  const sameReturnLoc = existingOrder.returnLocation === payload.returnLocation;

  const shouldRecalculatePrice =
    !sameCar || !sameStart || !sameEnd || !samePickupLoc || !sameReturnLoc;

  // If the car or dates changed, block the update when an active online hold overlaps the new range.
  if (!sameCar || !sameStart || !sameEnd) {
    const reservationConflict = await findActiveReservationHold(
      newCarId,
      range.start,
      range.end,
      session
    );
    if (reservationConflict) {
      throw new OrderFormError(
        'RESERVATION_CONFLICT',
        RESERVATION_CONFLICT_MESSAGE
      );
    }
  }

  // Fast path: if car and dates did not change, only update contact/location/price fields.
  if (sameCar && sameStart && sameEnd) {
    existingOrder.pickupLocation = payload.pickupLocation;
    existingOrder.returnLocation = payload.returnLocation;
    existingOrder.hotelName = payload.hotelName;
    existingOrder.fullName = contact.fullName;
    existingOrder.phoneNumber = contact.phoneNumber;
    existingOrder.email = contact.email;
    existingOrder.address = contact.address;

    if (shouldRecalculatePrice) {
      // Location changes can still affect delivery/return fees even when the date range is unchanged.
      const pricing = computeBookingPrice(
        car,
        prevStart,
        prevEnd,
        payload.pickupLocation,
        payload.returnLocation
      );
      existingOrder.rentalDays = pricing.rentalDays;
      existingOrder.deliveryPrice = pricing.deliveryPrice;
      existingOrder.returnPrice = pricing.returnPrice;
      existingOrder.totalPrice = pricing.totalPrice;
    }

    await existingOrder.save(sessionOptions(session));
    return;
  }

  // If the range changed on the same car, update the existing booked range in place.
  if (String(newCarId) === String(prevCarId)) {
    await updateRange(
      prevCarId,
      storedPrevStart,
      storedPrevEnd,
      range.start,
      range.end,
      session
    );
  } else {
    // If the order moved to a different car, move the booked range between car documents.
    await moveRange(
      prevCarId,
      newCarId,
      storedPrevStart,
      storedPrevEnd,
      range.start,
      range.end,
      session
    );
  }

  // Persist the edited order fields after the car-date synchronization succeeded.
  existingOrder.carId = newCarId;
  existingOrder.pickupDate = range.start;
  existingOrder.pickupTime = payload.pickupTime;
  existingOrder.returnDate = range.end;
  existingOrder.returnTime = payload.returnTime;
  existingOrder.pickupLocation = payload.pickupLocation;
  existingOrder.returnLocation = payload.returnLocation;
  existingOrder.hotelName = payload.hotelName;
  existingOrder.fullName = contact.fullName;
  existingOrder.phoneNumber = contact.phoneNumber;
  existingOrder.email = contact.email;
  existingOrder.address = contact.address;

  const now = new Date();
  // Orders whose return date is already in the past should be marked expired.
  if (range.end <= now) {
    existingOrder.status = 'expired';
    if (!existingOrder.expiredAt) {
      existingOrder.expiredAt = now;
    }
  } else {
    // Otherwise the order remains active.
    existingOrder.status = 'active';
    existingOrder.expiredAt = undefined;
  }

  // Recompute price whenever relevant booking inputs changed.
  if (shouldRecalculatePrice) {
    const pricing = computeBookingPrice(
      car,
      range.start,
      range.end,
      payload.pickupLocation,
      payload.returnLocation
    );
    existingOrder.rentalDays = pricing.rentalDays;
    existingOrder.deliveryPrice = pricing.deliveryPrice;
    existingOrder.returnPrice = pricing.returnPrice;
    existingOrder.totalPrice = pricing.totalPrice;
  }

  await existingOrder.save(sessionOptions(session));
}

module.exports = {
  updateOrder,
  updateOrderCore,
  extractStoredRange,
};
