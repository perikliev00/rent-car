// Mongoose – за optional transaction sessions в admin order mutations.
const mongoose = require('mongoose');
const { parseSofiaDate } = require('../../../utils/timeZone');

// Shared message shown when required contact fields are missing.
const CONTACT_REQUIRED_MESSAGE =
  'Full name, phone number, email, and address are required.';
// Shared message shown when an online reservation hold blocks an admin booking.
const RESERVATION_CONFLICT_MESSAGE =
  'Selected car currently has an active online reservation in this period. Please choose different dates or wait until the hold expires.';

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

module.exports = {
  CONTACT_REQUIRED_MESSAGE,
  RESERVATION_CONFLICT_MESSAGE,
  TXN_OPTIONS,
  OrderFormError,
  OrderRestoreError,
  isTransactionUnsupportedError,
  sessionOptions,
  runWithOptionalTransaction,
  parseDateRange,
};
