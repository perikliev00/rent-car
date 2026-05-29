// Reservation model – временният hold, който става потвърден booking.
const Reservation = require('../models/Reservation');
// Order model – финалният потвърден booking запис.
const Order = require('../models/Order');
// ProcessedStripeEvent – идемпотентна обработка на webhook events.
const ProcessedStripeEvent = require('../models/ProcessedStripeEvent');
// addRange – синхронизира confirmed booking прозорци в Car.dates.
const { addRange } = require('../utils/bookingSync');
// ACTIVE_RESERVATION_STATUSES – кои holds са подходящи за webhook финализация.
const { ACTIVE_RESERVATION_STATUSES } = require('../utils/reservationHelpers');
// App errors – разлика между business conflict и corrupted state.
const {
  AppError,
  ConflictError,
  NotFoundError,
} = require('../utils/appError');
// runWithOptionalTransaction – core финализация в Mongo транзакция при поддръжка.
const { runWithOptionalTransaction } = require('../utils/runWithOptionalTransaction');

// Helper – { session } за Mongoose APIs само когато session съществува.
function sessionOptions(session) {
  return session ? { session } : undefined;  // Mongoose очаква { session } при транзакция.
}

// Зарежда резервация по stripeSessionId; populate carId за име и т.н.
async function findReservationByStripeSessionId(stripeSessionId, session = null) {
  const query = Reservation.findOne({ stripeSessionId }).populate('carId');

  if (session) {
    query.session(session);  // Прикачаме сесията за транзакция.
  }

  return query;
}

// Проверява дали резервацията вече е materialized в Order документ.
async function findFinalizedOrderByReservationId(reservationId, session = null) {
  const query = Order.findOne({ reservationId }).lean();  // lean – plain object, без Mongoose methods.

  if (session) {
    query.session(session);
  }

  return query;
}

// Копира booking полета от резервация в Order schema форма.
async function createOrderFromReservation(reservation, carId, session = null) {
  const orderPayload = {  // Копираме всички релевантни полета от резервация в Order.
    reservationId: reservation._id,
    stripeSessionId: reservation.stripeSessionId,
    carId,
    pickupDate: reservation.pickupDate,
    pickupTime: reservation.pickupTime,
    returnDate: reservation.returnDate,
    returnTime: reservation.returnTime,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    rentalDays: reservation.rentalDays,
    deliveryPrice: reservation.deliveryPrice,
    returnPrice: reservation.returnPrice,
    totalPrice: reservation.totalPrice,
    fullName: reservation.fullName,
    phoneNumber: reservation.phoneNumber,
    email: reservation.email,
    address: reservation.address,
    hotelName: reservation.hotelName,
  };

  if (session) {
    await Order.create([orderPayload], { session });  // Array + session за транзакция.
    return;
  }

  await Order.create(orderPayload);  // Без транзакция – обикновен create.
}

// Core бизнес операция: Stripe session + reservation hold → потвърден booking.
async function finalizeReservationCore(stripeSessionId, options = {}, session = null) {
  const { logPrefix, requireActiveStatus = false } = options;  // logPrefix за логове; requireActive за webhook.

  if (!stripeSessionId) {
    throw new NotFoundError('Stripe checkout session was not provided.');
  }

  const reservation = await findReservationByStripeSessionId(stripeSessionId, session);  // Търсим резервация.

  if (!reservation) {  // Няма резервация – връщаме not_found.
    if (logPrefix) {
      console.warn(`${logPrefix} ⚠️ No reservation for stripeSessionId ${stripeSessionId}`);
    }

    return { found: false, finalized: false, reservation: null, reason: 'not_found' };
  }

  const existingOrder = await findFinalizedOrderByReservationId(reservation._id, session);  // Вече има Order?

  if (reservation.status === 'confirmed' && existingOrder) {  // Идемпотентност – вече финализирано.
    if (logPrefix) {
      console.log(`${logPrefix} ℹ️ Reservation already confirmed`, reservation._id.toString());
    }

    return {
      found: true,
      finalized: false,
      reservation,
      order: existingOrder,
      reason: 'already_confirmed',
    };
  }

  if (reservation.status === 'confirmed' && !existingOrder) {  // Corrupted state – confirmed без Order.
    throw new AppError(
      'FINALIZATION_STATE_CORRUPTED',
      500,
      'Reservation is marked as confirmed but has no matching order.',
      {
        reservationId: reservation._id.toString(),
      },
      { isOperational: false }
    );
  }

  if (requireActiveStatus && !ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {  // Webhook изисква pending/processing.
    if (logPrefix) {
      console.warn(
        `${logPrefix} ⚠️ Reservation status is not active`,
        reservation._id.toString(),
        'status=',
        reservation.status
      );
    }

    return {
      found: true,
      finalized: false,
      reservation,
      order: existingOrder || null,
      reason: 'status_not_active',
    };
  }

  if (existingOrder && reservation.status !== 'confirmed') {  // Order съществува но reservation не е confirmed – inconsistency.
    throw new AppError(
      'FINALIZATION_STATE_CORRUPTED',
      500,
      'Reservation finalization is in an inconsistent state.',
      {
        reservationId: reservation._id.toString(),
        status: reservation.status,
      },
      { isOperational: false }
    );
  }

  const carId = reservation.carId?._id || reservation.carId;  // ObjectId – от populated или ref.
  try {
    await addRange(carId, reservation.pickupDate, reservation.returnDate, session);  // Добавяме в Car.dates.
  } catch (err) {
    if (err && err.code === 'OVERLAP') {  // Overlap с друг booking – ConflictError.
      throw new ConflictError(
        'Reservation overlaps with an existing booked period.',
        {
          reservationId: reservation._id.toString(),
          carId: String(carId),
        }
      );
    }

    throw err;
  }
  await createOrderFromReservation(reservation, carId, session);  // Създаваме Order документ.

  reservation.status = 'confirmed';       // Маркираме резервацията като потвърдена.
  reservation.holdExpiresAt = new Date(); // Hold вече не е нужен.
  await reservation.save(sessionOptions(session));  // Запис с session ако в транзакция.

  if (logPrefix) {
    console.log(`${logPrefix} ✅ Car availability updated for car ${carId}`);
    console.log(`${logPrefix} ✅ Order document created`);
    console.log(`${logPrefix} ✅ Reservation ${reservation._id.toString()} marked as confirmed`);
  }

  return {
    found: true,
    finalized: true,
    reservation,
    reason: 'finalized',
  };
}

/**
 * Финализира резервация по Stripe checkout session ID: обновява Car.dates, създава Order,
 * маркира резервацията като confirmed.
 *
 * Идемпотентност:
 * 1) Reservation.stripeSessionId е unique (sparse) — един session ID = най-много една резервация.
 * 2) Order.reservationId е unique (sparse) — една резервация = най-много един Order.
 * 3) Ако резервацията и order-ът вече съществуват — не правим нищо.
 *
 * @param {string} stripeSessionId — ID на Stripe Checkout Session (cs_xxx)
 * @param {object} options — { logPrefix, requireActiveStatus }
 * @returns {Promise<{ found, finalized, reservation, reason }>}
 */
async function finalizeReservationByStripeSessionId(stripeSessionId, options = {}) {
  let result;

  await runWithOptionalTransaction(async (session) => {
    result = await finalizeReservationCore(stripeSessionId, options, session);
  });

  return result;
}

// Обработва един Stripe webhook event — идемпотентно чрез ProcessedStripeEvent.
async function processStripeWebhookEvent({ eventId, stripeSessionId, logPrefix }) {
  if (!eventId || !stripeSessionId) {
    throw new NotFoundError('Stripe webhook event payload is incomplete.');
  }

  let result;

  await runWithOptionalTransaction(async (session) => {
    if (session) {  // С транзакция – записваме event преди finalize (идемпотентност).
      try {
        await ProcessedStripeEvent.create(
          [{ eventId, stripeSessionId, processedAt: new Date() }],
          { session }
        );
      } catch (err) {
        if (err && err.code === 11000) {  // Duplicate key – event вече обработен.
          result = {
            found: true,
            finalized: false,
            reservation: null,
            reason: 'duplicate_event',
          };
          return;
        }

        throw err;
      }

      result = await finalizeReservationCore(
        stripeSessionId,
        { logPrefix, requireActiveStatus: true },
        session
      );
      return;
    }

    const existingEvent = await ProcessedStripeEvent.findOne({ eventId }).lean();
    if (existingEvent) {
      result = {
        found: true,
        finalized: false,
        reservation: null,
        reason: 'duplicate_event',
      };
      return;
    }

    result = await finalizeReservationCore(
      stripeSessionId,
      { logPrefix, requireActiveStatus: true },
      null
    );

    // Без транзакция – записваме idempotency marker след успешна финализация.
    if (result && result.reason !== 'duplicate_event') {
      try {
        await ProcessedStripeEvent.create({
          eventId,
          stripeSessionId,
          processedAt: new Date(),
        });
      } catch (err) {
        if (!err || err.code !== 11000) {
          throw err;
        }
      }
    }
  });

  if (result && result.reason === 'finalized') {
    return result;
  }

  if (
    result &&
    result.reason !== 'duplicate_event' &&
    result.reason !== 'already_confirmed' &&
    result.reason !== 'status_not_active' &&
    result.reason !== 'not_found'
  ) {
    throw new ConflictError('Stripe webhook finalization completed with an unknown state.');
  }

  return result;
}

module.exports = {
  finalizeReservationByStripeSessionId,
  processStripeWebhookEvent,
};
