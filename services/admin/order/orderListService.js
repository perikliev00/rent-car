const Order = require('../../../models/Order');
const { expireFinishedOrders } = require('../../../utils/bookingSync');
const { parseSofiaDate } = require('../../../utils/timeZone');

// Allowed status filters in the admin order list UI.
const ALLOWED_STATUSES = ['active', 'pending', 'expired', 'cancelled'];

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

// Fetch one order with basic populated car info for the details page.
async function getOrderDetails(id) {
  return Order.findById(id).populate(
    'carId',
    'name image price transmission seats'
  );
}

module.exports = {
  getOrdersList,
  getExpiredOrders,
  getDeletedOrders,
  emptyDeletedOrders,
  mapFilters,
  getOrderDetails,
};
