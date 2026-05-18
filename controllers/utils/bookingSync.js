// Mongoose – за съвместимост с transaction/session-aware операции в този util файл.
const mongoose = require('mongoose');
// Car model пази booked date ranges в полето dates.
const Car = require('../models/Car');
// Order model се използва за cross-check или expire на booking прозорци.
const Order = require('../models/Order');
// Timezone parser – при сравнение на stored order ranges с car date ranges.
const { parseSofiaDate } = require('./timeZone');

// Нормализира date-подобна стойност в UTC Date със същите UTC компоненти.
function toUtc(date) {
  const d = new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
  ));
}

// Създава Mongo predicate за откриване на overlap с съществуващ Car.dates елемент.
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

// Премахва всички изтекли date ranges от една кола или всички коли.
async function purgeExpired(carId = null, session = null) {
  // Минимален helper съвместим със старата механика.
  // Всяко booking прозорче завършило в миналото вече не блокира наличност.
  const now = new Date();
  // При подадено car ID – cleanup само за тази кола; иначе всички коли.
  const filter = carId ? { _id: carId } : {};
  // Премахваме изтеклалите ranges от масива dates.
  await Car.updateMany(filter, { $pull: { dates: { endDate: { $lte: now } } } }, { session });
}

// Премахва car date ranges които не отговарят на нито един Order – repair helper за drift.
async function purgeOrphaned(carId, session = null) {
  // Без конкретна кола няма какво да reconcile-ваме.
  if (!carId) return;
  // Зареждаме car документа; при липса на ranges – skip.
  const car = await Car.findById(carId).session(session || null).lean();
  if (!car || !Array.isArray(car.dates) || car.dates.length === 0) return;
  // Зареждаме всички не-изтрити orders за същата кола.
  const orders = await Order.find({ carId, isDeleted: { $ne: true } }).session(session || null).lean();
  // Helper: проверява дали един car range има overlap с поне един реален order range.
  const hasOverlapWithAnyOrder = (range) => {
    const rs = new Date(range.startDate);
    const re = new Date(range.endDate);
    return orders.some(o => {
      const os = parseSofiaDate(o.pickupDate, o.pickupTime || '00:00');
      const oe = parseSofiaDate(o.returnDate, o.returnTime || '23:59');
      if (!os || !oe || Number.isNaN(os.getTime()) || Number.isNaN(oe.getTime())) {
        return false;
      }
      return os < re && oe > rs;
    });
  };
  // Запазваме само car ranges които още отговарят на поне един order.
  const kept = car.dates.filter(hasOverlapWithAnyOrder);
  if (kept.length !== car.dates.length) {
    // Записваме поправения списък само при реална промяна.
    await Car.updateOne({ _id: carId }, { $set: { dates: kept } }, { session });
  }
}

// Хвърля domain грешка когато предложеният date range overlap-ва съществуващ booked прозорец.
async function assertNoOverlap(carId, start, end, session) {
  // Търсим target car за overlap с dates елемент.
  const conflict = await Car.findOne({ _id: carId, ...hasOverlapPredicate(start, end) }).session(session || null).lean();
  if (conflict) {
    // Използваме plain Error с код – callers могат да го мапнат към conflict response.
    const err = new Error('Booking overlaps with existing dates');
    err.code = 'OVERLAP';
    throw err;
  }
}

// Добавя нов booked range в кола след нормализация и overlap проверка.
async function addRange(carId, start, end, session) {
  // Нормализираме двата края в UTC.
  const s = toUtc(start); const e = toUtc(end);
  // End трябва да е след start.
  if (!(s < e)) throw new Error('Invalid date range');
  // Изчистваме изтеклалите ranges първо.
  await purgeExpired(carId, session);
  // Отхвърляме overlaps преди да мутираме колата.
  await assertNoOverlap(carId, s, e, session);
  // Push-ваме новия booking range в car документа.
  await Car.updateOne({ _id: carId }, { $push: { dates: { startDate: s, endDate: e } } }, { session });
}

// Заменя един съществуващ car booking range с нов на същата кола.
async function updateRange(carId, prevStart, prevEnd, newStart, newEnd, session) {
  const ps = toUtc(prevStart); const pe = toUtc(prevEnd);
  const ns = toUtc(newStart); const ne = toUtc(newEnd);
  if (!(ns < ne)) throw new Error('Invalid date range');
  await purgeExpired(carId, session);
  // Премахваме стария прозорец в транзакцията, после валидираме и вмъкваме новия.
  await Car.updateOne({ _id: carId }, { $pull: { dates: { startDate: ps, endDate: pe } } }, { session });
  await assertNoOverlap(carId, ns, ne, session);
  await Car.updateOne({ _id: carId }, { $push: { dates: { startDate: ns, endDate: ne } } }, { session });
}

// Премества booking range от една кола в друга.
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

// Премахва един конкретен booked range от кола.
async function removeRange(carId, startDate, endDate, session) {
  if (!carId || !startDate || !endDate) return;

  // Издърпваме точния съхранен range от car документа.
  await Car.updateOne(
    { _id: carId },
    {
      $pull: {
        dates: {
          startDate: startDate,
          endDate: endDate,
        },
      },
    },
    { session }
  );
}

// Маркира orders като expired след като return date е в миналото.
async function expireFinishedOrders(session = null) {
  const now = new Date();
  // Bulk-update на всички квалифициращи orders в един query.
  await Order.updateMany(
    {
      returnDate: { $lte: now },
      status: { $nin: ['expired', 'cancelled'] },
      isDeleted: { $ne: true },
    },
    {
      $set: {
        status: 'expired',
        expiredAt: now,
      },
    },
    { session }
  );
}

// Експорт на car-date sync helpers за controllers и services.
module.exports = {
  purgeExpired,
  purgeOrphaned,
  addRange,
  updateRange,
  moveRange,
  removeRange,
  expireFinishedOrders,
  toUtc
};
