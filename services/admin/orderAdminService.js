const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Car = require('../../models/Car');
const { computeBookingPrice } = require('../../utils/pricing');
const { parseSofiaDate } = require('../../utils/timeZone');
const {
  expireFinishedOrders,
  purgeExpired,
  addRange,
  updateRange,
  moveRange,
  removeRange,
} = require('../../utils/bookingSync');
const { findActiveReservationHold } = require('./reservationAdminService');

const CONTACT_REQUIRED_MESSAGE =
  'Full name, phone number, email, and address are required.';
const RESERVATION_CONFLICT_MESSAGE =
  'Selected car currently has an active online reservation in this period. Please choose different dates or wait until the hold expires.';

const ALLOWED_STATUSES = ['active', 'pending', 'expired', 'cancelled'];
const TXN_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' },
};

class OrderFormError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderFormError';
    this.code = code;
    this.isOrderFormError = true;
  }
}

class OrderRestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderRestoreError';
    this.code = code;
    this.isOrderRestoreError = true;
  }
}

function isTransactionUnsupportedError(err) {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('transaction numbers are only allowed on a replica set') ||
    msg.includes('transactions are not supported') ||
    msg.includes('replica set')
  );
}

function sessionOptions(session) {
  return session ? { session } : undefined;
}

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
      throw err;
    }

    if (isTransactionUnsupportedError(err)) {
      await work(null);
      return;
    }

    throw err;
  }
}

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

async function getCarsList() {
  return Car.find({}).sort({ name: 1 }).lean();
}

function trimContactFields(payload = {}) {
  return {
    fullName: (payload.fullName || '').trim(),
    phoneNumber: (payload.phoneNumber || '').trim(),
    email: (payload.email || '').trim(),
    address: (payload.address || '').trim(),
  };
}

function contactFieldsIncomplete(contact) {
  return Object.values(contact).some((value) => !value);
}

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

function toISODate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value).slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function toHHMM(value) {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : '';
}

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

function mapFilters(query = {}) {
  const filters = {
    status: query.status || '',
    startDate: query.startDate || '',
    endDate: query.endDate || '',
    search: query.search || '',
  };
  return filters;
}

async function getOrdersList(query = {}) {
  await expireFinishedOrders();

  const filters = mapFilters(query);
  const dbQuery = { isDeleted: { $ne: true } };

  if (filters.status && ALLOWED_STATUSES.includes(filters.status)) {
    dbQuery.status = filters.status;
  }

  if (filters.search && filters.search.trim()) {
    const regex = new RegExp(filters.search.trim(), 'i');
    dbQuery.$or = [{ fullName: regex }, { email: regex }, { phoneNumber: regex }];
  }

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

  if (rangeStart || rangeEnd) {
    const start = rangeStart || rangeEnd;
    const end = rangeEnd || rangeStart;
    if (start && end && start <= end) {
      dbQuery.pickupDate = { $lt: end };
      dbQuery.returnDate = { $gt: start };
    }
  }

  const orders = await Order.find(dbQuery)
    .populate('carId', 'name image price transmission seats')
    .sort({ createdAt: -1 });

  return {
    orders: orders || [],
    filters,
  };
}

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

async function getDeletedOrders() {
  const orders = await Order.find({ isDeleted: true })
    .populate('carId', 'name image price transmission seats')
    .sort({ deletedAt: -1 });

  return {
    orders: orders || [],
  };
}

async function emptyDeletedOrders() {
  await Order.deleteMany({ isDeleted: true });
}

async function getCreateOrderForm() {
  const cars = await getCarsList();
  return {
    defaults: buildInitialOrderDefaults(),
    cars,
  };
}

async function getCarAvailability(carId, query = {}) {
  const { pickupDate, pickupTime, returnDate, returnTime } = query;

  if (!carId || !pickupDate || !returnDate) {
    return {
      status: 400,
      body: { ok: false, error: 'Missing required parameters' },
    };
  }

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

  const conflictDoc = await Car.findOne({
    _id: carId,
    dates: {
      $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } },
    },
  }).lean();

  let conflicts = [];
  if (conflictDoc && Array.isArray(conflictDoc.dates)) {
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

async function createOrder(payload) {
  const trimmedContact = trimContactFields(payload);
  if (contactFieldsIncomplete(trimmedContact)) {
    return buildOrderNewErrorResult(payload, CONTACT_REQUIRED_MESSAGE);
  }

  let range;
  try {
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
    await runWithOptionalTransaction((session) =>
      createOrderCore({
        command,
        range,
        session,
      })
    );
    return { success: true };
  } catch (err) {
    if (err.isOrderFormError) {
      return buildOrderNewErrorResult(payload, err.message);
    }
    throw err;
  }
}

async function createOrderCore({ command, range, session }) {
  if (!command.carId) {
    throw new OrderFormError('CAR_REQUIRED', 'Car selection is required.');
  }

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

  const reservationConflict = await findActiveReservationHold(
    command.carId,
    range.start,
    range.end,
    session
  );
  if (reservationConflict) {
    throw new OrderFormError('RESERVATION_CONFLICT', RESERVATION_CONFLICT_MESSAGE);
  }

  const pricing = computeBookingPrice(
    car,
    range.start,
    range.end,
    command.pickupLocation,
    command.returnLocation
  );

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

  if (session) {
    await Order.create([orderPayload], { session });
  } else {
    await Order.create(orderPayload);
  }

  await addRange(command.carId, range.start, range.end, session);
}

async function getOrderDetails(id) {
  return Order.findById(id).populate(
    'carId',
    'name image price transmission seats'
  );
}

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

async function updateOrder(orderId, payload) {
  const trimmedContact = trimContactFields(payload);
  if (contactFieldsIncomplete(trimmedContact)) {
    return buildOrderEditErrorResult(
      orderId,
      payload,
      CONTACT_REQUIRED_MESSAGE
    );
  }

  let range;
  try {
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

async function updateOrderCore({ orderId, payload, contact, range, session }) {
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

  const sameCar = String(prevCarId) === String(newCarId);
  const sameStart = prevStart && range.start && prevStart.getTime() === range.start.getTime();
  const sameEnd = prevEnd && range.end && prevEnd.getTime() === range.end.getTime();
  const samePickupLoc = existingOrder.pickupLocation === payload.pickupLocation;
  const sameReturnLoc = existingOrder.returnLocation === payload.returnLocation;

  const shouldRecalculatePrice =
    !sameCar || !sameStart || !sameEnd || !samePickupLoc || !sameReturnLoc;

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

  if (sameCar && sameStart && sameEnd) {
    existingOrder.pickupLocation = payload.pickupLocation;
    existingOrder.returnLocation = payload.returnLocation;
    existingOrder.hotelName = payload.hotelName;
    existingOrder.fullName = contact.fullName;
    existingOrder.phoneNumber = contact.phoneNumber;
    existingOrder.email = contact.email;
    existingOrder.address = contact.address;

    if (shouldRecalculatePrice) {
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
  if (range.end <= now) {
    existingOrder.status = 'expired';
    if (!existingOrder.expiredAt) {
      existingOrder.expiredAt = now;
    }
  } else {
    existingOrder.status = 'active';
    existingOrder.expiredAt = undefined;
  }

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

async function deleteOrder(orderId) {
  await runWithOptionalTransaction(async (session) => {
    const orderQuery = Order.findById(orderId);
    if (session) {
      orderQuery.session(session);
    }
    const order = await orderQuery;
    if (!order) return;

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

    await removeRange(order.carId, storedStart, storedEnd, session);
    order.isDeleted = true;
    order.deletedAt = new Date();
    await order.save(sessionOptions(session));
  });
}

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

      await purgeExpired(order.carId, session);
      await addRange(order.carId, start, end, session);

      order.isDeleted = false;
      order.deletedAt = undefined;

      const now = new Date();
      if (end <= now) {
        order.status = 'expired';
        if (!order.expiredAt) {
          order.expiredAt = now;
        }
      } else {
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
    if (err.isOrderRestoreError) {
      throw err;
    }
    if (err && err.code === 'OVERLAP') {
      throw new OrderRestoreError(
        'OVERLAP',
        'Cannot restore order: car is already booked in that period.'
      );
    }
    throw err;
  }
}

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

