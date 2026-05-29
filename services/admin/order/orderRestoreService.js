const Order = require('../../../models/Order');
const { parseSofiaDate } = require('../../../utils/timeZone');
const { purgeExpired, addRange } = require('../../../utils/bookingSync');
const {
  OrderRestoreError,
  sessionOptions,
  runWithOptionalTransaction,
} = require('./orderShared');

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

module.exports = {
  restoreOrder,
};
