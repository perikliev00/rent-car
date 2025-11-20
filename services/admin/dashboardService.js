const Order = require('../../models/Order');
const { expireFinishedOrders } = require('../../utils/bookingSync');

async function getDashboardData() {
  await expireFinishedOrders();

  const orders = await Order.find({ isDeleted: { $ne: true } })
    .populate('carId', 'name image price')
    .sort({ createdAt: -1 });

  const totalOrders = orders.length;
  const totalRevenue =
    totalOrders > 0
      ? orders.reduce(
          (sum, order) => sum + parseFloat(order.totalPrice || 0),
          0
        )
      : 0;
  const pendingOrders =
    totalOrders > 0
      ? orders.filter(
          (order) => !order.status || order.status === 'pending'
        ).length
      : 0;

  return {
    orders: orders || [],
    stats: {
      totalOrders,
      totalRevenue: totalRevenue.toFixed(2),
      pendingOrders,
    },
  };
}

module.exports = {
  getDashboardData,
};

