const mongoose = require('mongoose');
const Car = require('../models/Car');
const Order = require('../models/Order');

function toUtc(date) {
  const d = new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
  ));
}

function hasOverlapPredicate(start, end) {
  return {
    dates: {
      $elemMatch: {
        startDate: { $lt: end },
        endDate: { $gt: start }
      }
    }
  };
}

async function purgeExpired(carId = null, session = null) {
  // minimal old mechanism compatible helper
  const now = new Date();
  const filter = carId ? { _id: carId } : {};
  await Car.updateMany(filter, { $pull: { dates: { endDate: { $lte: now } } } }, { session });
}

// Remove car date ranges that do not correspond to any existing order
async function purgeOrphaned(carId, session = null) {
  if (!carId) return;
  const car = await Car.findById(carId).session(session || null).lean();
  if (!car || !Array.isArray(car.dates) || car.dates.length === 0) return;
  const orders = await Order.find({ carId }).session(session || null).lean();
  const hasOverlapWithAnyOrder = (range) => {
    const rs = new Date(range.startDate);
    const re = new Date(range.endDate);
    return orders.some(o => {
      const os = new Date(`${o.pickupDate}T${(o.pickupTime || '00:00')}:00Z`);
      const oe = new Date(`${o.returnDate}T${(o.returnTime || '23:59')}:00Z`);
      return os < re && oe > rs;
    });
  };
  const kept = car.dates.filter(hasOverlapWithAnyOrder);
  if (kept.length !== car.dates.length) {
    await Car.updateOne({ _id: carId }, { $set: { dates: kept } }, { session });
  }
}

async function assertNoOverlap(carId, start, end, session) {
  const conflict = await Car.findOne({ _id: carId, ...hasOverlapPredicate(start, end) }).session(session || null).lean();
  if (conflict) {
    const err = new Error('Booking overlaps with existing dates');
    err.code = 'OVERLAP';
    throw err;
  }
}

async function addRange(carId, start, end, session) {
  const s = toUtc(start); const e = toUtc(end);
  if (!(s < e)) throw new Error('Invalid date range');
  await purgeExpired(carId, session);
  await assertNoOverlap(carId, s, e, session);
  await Car.updateOne({ _id: carId }, { $push: { dates: { startDate: s, endDate: e } } }, { session });
}

async function updateRange(carId, prevStart, prevEnd, newStart, newEnd, session) {
  const ps = toUtc(prevStart); const pe = toUtc(prevEnd);
  const ns = toUtc(newStart); const ne = toUtc(newEnd);
  if (!(ns < ne)) throw new Error('Invalid date range');
  await purgeExpired(carId, session);
  // Remove the old window first within the tx, then validate and insert the new one
  await Car.updateOne({ _id: carId }, { $pull: { dates: { startDate: ps, endDate: pe } } }, { session });
  await assertNoOverlap(carId, ns, ne, session);
  await Car.updateOne({ _id: carId }, { $push: { dates: { startDate: ns, endDate: ne } } }, { session });
}

async function moveRange(prevCarId, newCarId, prevStart, prevEnd, newStart, newEnd, session) {
  const ps = toUtc(prevStart); const pe = toUtc(prevEnd);
  const ns = toUtc(newStart); const ne = toUtc(newEnd);
  if (!(ns < ne)) throw new Error('Invalid date range');
  await purgeExpired(prevCarId, session);
  await purgeExpired(newCarId, session);
  await assertNoOverlap(newCarId, ns, ne, session);
  await Car.updateOne({ _id: prevCarId }, { $pull: { dates: { startDate: ps, endDate: pe } } }, { session });
  await Car.updateOne({ _id: newCarId }, { $push: { dates: { startDate: ns, endDate: ne } } }, { session });
}

async function removeRange(carId, start, end, session) {
  const s = toUtc(start); const e = toUtc(end);
  await Car.updateOne({ _id: carId }, { $pull: { dates: { startDate: s, endDate: e } } }, { session });
  await purgeExpired(carId, session);
}

module.exports = {
  purgeExpired,
  purgeOrphaned,
  addRange,
  updateRange,
  moveRange,
  removeRange,
  toUtc
};


