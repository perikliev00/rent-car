const Reservation = require('../models/Reservation');
const Order = require('../models/Order');
const { addRange } = require('../utils/bookingSync');
const { ACTIVE_RESERVATION_STATUSES } = require('../utils/reservationHelpers');

async function finalizeReservationByStripeSessionId(stripeSessionId, options = {}) {
  const { logPrefix, requireActiveStatus = false } = options;

  const reservation = await Reservation.findOne({ stripeSessionId }).populate('carId');

  if (!reservation) {
    if (logPrefix) {
      console.warn(`${logPrefix} ⚠️ No reservation for stripeSessionId ${stripeSessionId}`);
    }
    return { found: false, finalized: false, reservation: null, reason: 'not_found' };
  }

  if (requireActiveStatus && !ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
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
      reason: 'status_not_active',
    };
  }

  if (reservation.status === 'confirmed') {
    if (logPrefix) {
      console.log(
        `${logPrefix} ℹ️ Reservation already confirmed`,
        reservation._id.toString()
      );
    }
    return {
      found: true,
      finalized: false,
      reservation,
      reason: 'already_confirmed',
    };
  }

  const carId = reservation.carId?._id || reservation.carId;

  await addRange(carId, reservation.pickupDate, reservation.returnDate, null);

  await Order.create({
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
  });

  reservation.status = 'confirmed';
  reservation.holdExpiresAt = new Date();
  await reservation.save();

  if (logPrefix) {
    console.log(`${logPrefix} ✅ Car availability updated for car ${carId}`);
    console.log(`${logPrefix} ✅ Order document created`);
    console.log(
      `${logPrefix} ✅ Reservation ${reservation._id.toString()} marked as confirmed`
    );
  }

  return {
    found: true,
    finalized: true,
    reservation,
    reason: 'finalized',
  };
}

module.exports = {
  finalizeReservationByStripeSessionId,
};


