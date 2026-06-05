const Reservation = require('../../../models/Reservation');

async function compensateReservationAfterStripeFailure(
  reservationDoc,
  createdReservationThisStep
) {
  if (createdReservationThisStep) {
    await Reservation.findByIdAndUpdate(reservationDoc._id, {
      status: 'cancelled',
      holdExpiresAt: new Date(),
    });
  } else {
    reservationDoc.status = 'cancelled';
    reservationDoc.holdExpiresAt = new Date();
    await reservationDoc.save();
  }
}

module.exports = {
  compensateReservationAfterStripeFailure,
};
