// Mongoose – за optional transaction sessions в admin order mutations.
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Car = require('../../models/Car');
const { computeBookingPrice } = require('../../utils/pricing');
// Timezone helper parses date+time fields using the business timezone rules.
const { parseSofiaDate } = require('../../utils/timeZone');
// Booking-sync helpers keep `Car.dates` aligned with admin order CRUD operations.
const {
  expireFinishedOrders,
  purgeExpired,
  addRange,
  updateRange,
  moveRange,
  removeRange,
} = require('../../utils/bookingSync');
// Admin reservation helper detects overlap with active online holds.
const { findActiveReservationHold } = require('./reservationAdminService');
// Contact helpers normalize contact fields and enforce required admin contact data.
const {
  trimContactDetails,
  contactFieldsIncomplete,
} = require('../contactService');

// Shared message shown when required contact fields are missing.
const CONTACT_REQUIRED_MESSAGE =
  'Full name, phone number, email, and address are required.';
// Shared message shown when an online reservation hold blocks an admin booking.
const RESERVATION_CONFLICT_MESSAGE =
  'Selected car currently has an active online reservation in this period. Please choose different dates or wait until the hold expires.';

// Allowed status filters in the admin order list UI.
const ALLOWED_STATUSES = ['active', 'pending', 'expired', 'cancelled'];
// Transaction options used when Mongo transactions are available.
const TXN_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' },
};

// Domain-style error used for recoverable admin form problems.
class OrderFormError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderFormError';
    this.code = code;
    this.isOrderFormError = true;
  }
}

// Domain-style error used when restoring a deleted order is impossible.
class OrderRestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderRestoreError';
    this.code = code;
    this.isOrderRestoreError = true;
  }
}

// Detect whether the current Mongo environment supports transactions.
function isTransactionUnsupportedError(err) {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('transaction numbers are only allowed on a replica set') ||
    msg.includes('transactions are not supported') ||
    msg.includes('replica set')
  );
}

// Small helper so `save()` calls can receive `{ session }` only when a transaction exists.
function sessionOptions(session) {
  return session ? { session } : undefined;
}

// Execute work inside a Mongo transaction when supported, otherwise fall back to non-transactional execution.
async function runWithOptionalTransaction(work) {
  let session = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await work(session);
    }, TXN_OPTIONS);
    await session.endSession();
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (_) {
        // ignore
      }
      await session.endSession();
    }

    if (err && (err.isOrderFormError || err.isOrderRestoreError)) {
      // Known domain errors should be re-thrown untouched so controllers/services can handle them cleanly.
      throw err;
    }

    if (isTransactionUnsupportedError(err)) {
      // Local standalone Mongo instances often lack replica-set transaction support, so fall back gracefully.
      await work(null);
      return;
    }

    // All other failures are real unexpected errors.
    throw err;
  }
}

// Build the blank default state for the admin create-order form.
function buildInitialOrderDefaults() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  return {
    pickupDate: today,
    returnDate: today,
    pickupTime: '10:00',
    returnTime: '10:00',
    pickupLocation: 'office',
    returnLocation: 'office',
    rentalDays: 1,
    deliveryPrice: 0,
    returnPrice: 0,
    totalPrice: 0,
    hotelName: '',
    fullName: '',
    phoneNumber: '',
    email: '',
    address: '',
  };
}

// Rebuild form defaults from a submitted payload after validation/business-rule failures.
function buildOrderFormDefaultsFromPayload(payload = {}) {
  return {
    pickupDate: payload.pickupDate || '',
    returnDate: payload.returnDate || '',
    pickupTime: payload.pickupTime || '',
    returnTime: payload.returnTime || '',
    pickupLocation: payload.pickupLocation || 'office',
    returnLocation: payload.returnLocation || 'office',
    rentalDays:
      payload.rentalDays !== undefined && payload.rentalDays !== ''
        ? payload.rentalDays
        : 1,
    deliveryPrice:
      payload.deliveryPrice !== undefined && payload.deliveryPrice !== ''
        ? payload.deliveryPrice
        : 0,
    returnPrice:
      payload.returnPrice !== undefined && payload.returnPrice !== ''
        ? payload.returnPrice
        : 0,
    totalPrice:
      payload.totalPrice !== undefined && payload.totalPrice !== ''
        ? payload.totalPrice
        : 0,
    fullName: payload.fullName || '',
    phoneNumber: payload.phoneNumber || '',
    email: payload.email || '',
    address: payload.address || '',
    hotelName: payload.hotelName || '',
  };
}

// Admin create/edit forms need a car list for dropdown selection.
async function getCarsList() {
  return Car.find({}).sort({ name: 1 }).lean();
}

// Parse and validate a date/time range from admin form input.
function parseDateRange(pickupDate, pickupTime, returnDate, returnTime) {
  const start = parseSofiaDate(pickupDate, pickupTime || '00:00');
  const end = parseSofiaDate(returnDate, returnTime || '23:59');
  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    throw new OrderFormError('INVALID_RANGE', 'Invalid pick-up/return range');
  }
  return { start, end };
}

// Re-render payload for the admin create-order form after a recoverable failure.
async function buildOrderNewErrorResult(payload, errorMessage) {
  const cars = await getCarsList();
  return {
    success: false,
    status: 422,
    viewModel: {
      error: errorMessage,
      defaults: buildOrderFormDefaultsFromPayload(payload),
      cars,
    },
  };
}

// Normalize a value into YYYY-MM-DD for HTML date inputs.
function toISODate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value).slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Normalize a value into HH:MM for HTML time inputs.
function toHHMM(value) {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : '';
}

// Rebuild payload for the admin edit-order form after validation/business failures.
async function buildOrderEditErrorResult(orderId, payload, errorMessage) {
  const order = await Order.findById(orderId).populate(
    'carId',
    'name image price priceTier_1_3 priceTier_7_31 priceTier_31_plus'
  );
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  order.pickupDate = payload.pickupDate;
  order.returnDate = payload.returnDate;
  order.pickupTime = payload.pickupTime;
  order.returnTime = payload.returnTime;
  order.pickupLocation = payload.pickupLocation;
  order.returnLocation = payload.returnLocation;
  order.hotelName = payload.hotelName;
  order.fullName = payload.fullName;
  order.phoneNumber = payload.phoneNumber;
  order.email = payload.email;
  order.address = payload.address;
  order.rentalDays = payload.rentalDays;
  order.deliveryPrice = payload.deliveryPrice;
  order.returnPrice = payload.returnPrice;
  order.totalPrice = payload.totalPrice;

  const cars = await getCarsList();

  return {
    success: false,
    status: 422,
    viewModel: {
      error: errorMessage,
      order,
      cars,
      pickupDateISO: toISODate(order.pickupDate),
      returnDateISO: toISODate(order.returnDate),
      pickupTimeHHMM: toHHMM(order.pickupTime),
      returnTimeHHMM: toHHMM(order.returnTime),
    },
  };
}

// Normalize supported order-list filter query params.
function mapFilters(query = {}) {
  const filters = {
    status: query.status || '',
    startDate: query.startDate || '',
    endDate: query.endDate || '',
    search: query.search || '',
  };
  return filters;
}

// Fetch the main admin order list with optional filters.
async function getOrdersList(query = {}) {
  // Expire finished orders before listing so the UI reflects current business state.
  await expireFinishedOrders();

  const filters = mapFilters(query);
  const dbQuery = { isDeleted: { $ne: true } };

  // Apply status filter only when it is recognized.
  if (filters.status && ALLOWED_STATUSES.includes(filters.status)) {
    dbQuery.status = filters.status;
  }

  // Text search matches name, email, or phone.
  if (filters.search && filters.search.trim()) {
    const regex = new RegExp(filters.search.trim(), 'i');
    dbQuery.$or = [{ fullName: regex }, { email: regex }, { phoneNumber: regex }];
  }

  // Convert optional date filters into timezone-aware Date objects.
  let rangeStart = null;
  let rangeEnd = null;
  if (filters.startDate) {
    const parsed = parseSofiaDate(filters.startDate, '00:00');
    if (parsed && !Number.isNaN(parsed.getTime())) {
      rangeStart = parsed;
    }
  }
  if (filters.endDate) {
    const parsed = parseSofiaDate(filters.endDate, '23:59');
    if (parsed && !Number.isNaN(parsed.getTime())) {
      rangeEnd = parsed;
    }
  }

  // When a date range is valid, filter orders that overlap that range.
  if (rangeStart || rangeEnd) {
    const start = rangeStart || rangeEnd;
    const end = rangeEnd || rangeStart;
    if (start && end && start <= end) {
      dbQuery.pickupDate = { $lt: end };
      dbQuery.returnDate = { $gt: start };
    }
  }

  // Load the filtered order list with basic car info for display.
  const orders = await Order.find(dbQuery)
    .populate('carId', 'name image price transmission seats')
    .sort({ createdAt: -1 });

  return {
    orders: orders || [],
    filters,
  };
}

// Fetch expired orders for the dedicated admin page.
async function getExpiredOrders() {
  await expireFinishedOrders();
  const orders = await Order.find({
    status: 'expired',
    isDeleted: { $ne: true },
  })
    .populate('carId', 'name image price transmission seats')
    .sort({ returnDate: -1 });

  return {
    orders: orders || [],
  };
}

// Fetch soft-deleted orders for the admin recycle-bin page.
async function getDeletedOrders() {
  const orders = await Order.find({ isDeleted: true })
    .populate('carId', 'name image price transmission seats')
    .sort({ deletedAt: -1 });

  return {
    orders: orders || [],
  };
}

// Permanently remove all soft-deleted orders.
async function emptyDeletedOrders() {
  await Order.deleteMany({ isDeleted: true });
}

// Build the data needed to render the admin create-order form.
async function getCreateOrderForm() {
  const cars = await getCarsList();
  return {
    defaults: buildInitialOrderDefaults(),
    cars,
  };
}

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

// Fetch one order with basic populated car info for the details page.
async function getOrderDetails(id) {
  return Order.findById(id).populate(
    'carId',
    'name image price transmission seats'
  );
}

// Load the order plus the supporting car list needed by the edit form.
async function getOrderEditData(id) {
  const order = await Order.findById(id).populate(
    'carId',
    'name image price priceTier_1_3 priceTier_7_31 priceTier_31_plus'
  );
  if (!order) {
    return null;
  }
  const cars = await getCarsList();
  return {
    order,
    cars,
    pickupDateISO: toISODate(order.pickupDate),
    returnDateISO: toISODate(order.returnDate),
    pickupTimeHHMM: toHHMM(order.pickupTime),
    returnTimeHHMM: toHHMM(order.returnTime),
  };
}

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

// Soft-delete an order and remove its booked range from `Car.dates`.
async function deleteOrder(orderId) {
  await runWithOptionalTransaction(async (session) => {
    const orderQuery = Order.findById(orderId);
    if (session) {
      orderQuery.session(session);
    }
    const order = await orderQuery;
    if (!order) return;

    // Resolve the order's previous date range so it can be removed from `Car.dates`.
    const prevStart =
      order.pickupDate instanceof Date
        ? order.pickupDate
        : parseSofiaDate(order.pickupDate, order.pickupTime || '00:00');
    const prevEnd =
      order.returnDate instanceof Date
        ? order.returnDate
        : parseSofiaDate(order.returnDate, order.returnTime || '23:59');

    let storedStart = prevStart;
    let storedEnd = prevEnd;
    try {
      // Try to recover the exact stored range from the car document.
      const carQuery = Car.findById(order.carId);
      if (session) {
        carQuery.session(session);
      }
      const car = await carQuery.lean();
      const stored = extractStoredRange(car, prevStart, prevEnd);
      storedStart = stored.storedStart;
      storedEnd = stored.storedEnd;
    } catch (_) {
      // ignore
    }

    // Remove the booked range from the car, then mark the order as deleted.
    await removeRange(order.carId, storedStart, storedEnd, session);
    order.isDeleted = true;
    order.deletedAt = new Date();
    await order.save(sessionOptions(session));
  });
}

// Restore a soft-deleted order, re-adding its booking window if the car is still free.
async function restoreOrder(orderId) {
  try {
    await runWithOptionalTransaction(async (session) => {
      const orderQuery = Order.findById(orderId);
      if (session) {
        orderQuery.session(session);
      }
      const order = await orderQuery;
      if (!order || !order.isDeleted) {
        throw new OrderRestoreError(
          'RESTORE_INVALID',
          'Cannot restore: order not found or not in bin.'
        );
      }

      // Parse the stored order dates back into concrete Date values.
      const start =
        order.pickupDate instanceof Date
          ? order.pickupDate
          : parseSofiaDate(order.pickupDate, order.pickupTime || '00:00');
      const end =
        order.returnDate instanceof Date
          ? order.returnDate
          : parseSofiaDate(order.returnDate, order.returnTime || '23:59');

      if (
        !start ||
        !end ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start >= end
      ) {
        throw new OrderRestoreError(
          'INVALID_RANGE',
          'Cannot restore: order has invalid stored dates.'
        );
      }

      // Clean stale ranges, then re-add this order's booking window.
      await purgeExpired(order.carId, session);
      await addRange(order.carId, start, end, session);

      // Mark the order as restored.
      order.isDeleted = false;
      order.deletedAt = undefined;

      const now = new Date();
      // Restored orders whose return date is already in the past should come back as expired.
      if (end <= now) {
        order.status = 'expired';
        if (!order.expiredAt) {
          order.expiredAt = now;
        }
      } else {
        // Otherwise restore them as active unless a more specific status should be preserved.
        if (
          !order.status ||
          order.status === 'expired' ||
          order.status === 'cancelled'
        ) {
          order.status = 'active';
        }
        order.expiredAt = undefined;
      }

      await order.save(sessionOptions(session));
    });
  } catch (err) {
    // Preserve domain-specific restore errors.
    if (err.isOrderRestoreError) {
      throw err;
    }
    // Convert overlap conflicts into a friendlier restore-specific domain error.
    if (err && err.code === 'OVERLAP') {
      throw new OrderRestoreError(
        'OVERLAP',
        'Cannot restore order: car is already booked in that period.'
      );
    }
    throw err;
  }
}

// Export the full admin order service surface used by admin controllers.
module.exports = {
  getOrdersList,
  getExpiredOrders,
  getDeletedOrders,
  emptyDeletedOrders,
  getCreateOrderForm,
  getCarAvailability,
  createOrder,
  getOrderDetails,
  getOrderEditData,
  updateOrder,
  deleteOrder,
  restoreOrder,
};

