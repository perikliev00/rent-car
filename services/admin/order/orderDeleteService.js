const Order = require('../../../models/Order');
const Car = require('../../../models/Car');
const { parseSofiaDate } = require('../../../utils/timeZone');
const { removeRange } = require('../../../utils/bookingSync');
const { sessionOptions, runWithOptionalTransaction } = require('./orderShared');
const { extractStoredRange } = require('./orderUpdateService');

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

module.exports = {
  deleteOrder,
};
