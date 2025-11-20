const Reservation = require('../../models/Reservation');
const { ACTIVE_RESERVATION_STATUSES } = require('../../utils/reservationHelpers');

async function findActiveReservationHold(carId, start, end, session = null) {
  const now = new Date();
  const query = {
    carId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: now },
    pickupDate: { $lt: end },
    returnDate: { $gt: start },
  };

  const search = Reservation.findOne(query);
  if (session) {
    search.session(session);
  }
  return search.lean();
}

module.exports = {
  findActiveReservationHold,
};

