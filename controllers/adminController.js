const Order = require('../models/Order');
const Car = require('../models/Car');
const Reservation = require('../models/Reservation');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');
const { parseSofiaDate } = require('../utils/timeZone');
const { computeBookingPrice } = require('../utils/pricing');
const { expireFinishedOrders } = require('../utils/bookingSync');
const { ACTIVE_RESERVATION_STATUSES } = require('../utils/reservationHelpers');

const CONTACT_REQUIRED_MESSAGE = 'Full name, phone number, email, and address are required.';
const RESERVATION_CONFLICT_MESSAGE = 'Selected car currently has an active online reservation in this period. Please choose different dates or wait until the hold expires.';
const OrderModel = require('../models/Order');

async function findActiveReservationHold(carId, start, end, session) {
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

exports.getAdminDashboard = async (req, res, next) => {
    try {
        console.log('Admin dashboard: Starting to fetch orders...');
        await expireFinishedOrders();
        
        // Fetch all orders with car details populated for recent orders table
        const orders = await Order.find({ isDeleted: { $ne: true } })
            .populate('carId', 'name image price')
            .sort({ createdAt: -1 }); // Most recent first

        console.log('Admin dashboard: Orders fetched successfully:', orders.length);

        // Get some basic stats
        const totalOrders = orders.length;
        const totalRevenue = totalOrders > 0 
            ? orders.reduce((sum, order) => sum + parseFloat(order.totalPrice || 0), 0)
            : 0;
        const pendingOrders = totalOrders > 0 
            ? orders.filter(order => !order.status || order.status === 'pending').length
            : 0;

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            orders: orders || [],
            stats: {
                totalOrders,
                totalRevenue: totalRevenue.toFixed(2),
                pendingOrders
            }
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        err.publicMessage = 'Error loading admin dashboard.';
        return next(err);
    }
};

exports.getAllOrders = async (req, res, next) => {
    try {
        await expireFinishedOrders();
        const { status, startDate, endDate, search } = req.query;
        const query = { isDeleted: { $ne: true } };

        if (status) {
            const allowedStatuses = ['active', 'pending', 'expired', 'cancelled'];
            if (allowedStatuses.includes(status)) {
                query.status = status;
            }
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { fullName: regex },
                { email: regex },
                { phoneNumber: regex }
            ];
        }

        let rangeStart = null;
        let rangeEnd = null;
        if (startDate) {
            const parsedStart = parseSofiaDate(startDate, '00:00');
            if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
                rangeStart = parsedStart;
            }
        }
        if (endDate) {
            const parsedEnd = parseSofiaDate(endDate, '23:59');
            if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
                rangeEnd = parsedEnd;
            }
        }
        if (rangeStart || rangeEnd) {
            const start = rangeStart || rangeEnd;
            const end = rangeEnd || rangeStart;
            if (start && end && start <= end) {
                query.pickupDate = { $lt: end };
                query.returnDate = { $gt: start };
            }
        }

        const orders = await Order.find(query)
            .populate('carId', 'name image price transmission seats')
            .sort({ createdAt: -1 });

        res.render('admin/orders', {
            title: 'All Orders',
            orders: orders || [],
            filters: {
                status: status || '',
                startDate: startDate || '',
                endDate: endDate || '',
                search: search || ''
            }
        });
    } catch (err) {
        console.error('Get orders error:', err);
        err.publicMessage = 'Error fetching orders.';
        return next(err);
    }
};

exports.getExpiredOrders = async (req, res, next) => {
    try {
        await expireFinishedOrders();
        const orders = await Order.find({ status: 'expired', isDeleted: { $ne: true } })
            .populate('carId', 'name image price transmission seats')
            .sort({ returnDate: -1 });

        res.render('admin/orders-expired', {
            title: 'Expired Orders',
            orders: orders || []
        });
    } catch (err) {
        console.error('Get expired orders error:', err);
        err.publicMessage = 'Error fetching expired orders.';
        return next(err);
    }
};

exports.getDeletedOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ isDeleted: true })
            .populate('carId', 'name image price transmission seats')
            .sort({ deletedAt: -1 });

        res.render('admin/orders-deleted', {
            title: 'Deleted Orders',
            orders: orders || [],
            error: req.query.err || null
        });
    } catch (err) {
        console.error('Get deleted orders error:', err);
        err.publicMessage = 'Error fetching deleted orders.';
        return next(err);
    }
};

exports.postEmptyDeletedOrders = async (_req, res, next) => {
    try {
        await Order.deleteMany({ isDeleted: true });
        res.redirect('/admin/orders/deleted');
    } catch (err) {
        console.error('Empty deleted orders error:', err);
        err.publicMessage = 'Error emptying deleted orders bin.';
        return next(err);
    }
};

exports.getCreateOrder = async (req, res, next) => {
    try {
        const now = new Date();
        const today = new Date(now).toISOString().slice(0,10);
        const cars = await Car.find({}).sort({ name: 1 }).lean();
        res.render('admin/order-new', {
            title: 'Add Order',
            defaults: {
                pickupDate: today,
                returnDate: today,
                pickupTime: '10:00',
                returnTime: '10:00',
                pickupLocation: 'office',
                returnLocation: 'office',
                rentalDays: 1,
                deliveryPrice: 0,
                returnPrice: 0,
                totalPrice: 0,
                hotelName: '',
                fullName: '',
                phoneNumber: '',
                email: '',
                address: ''
            },
            cars
        });
    } catch (err) {
        console.error('Get create order error:', err);
        err.publicMessage = 'Error loading the order creation form.';
        return next(err);
    }
};

// JSON endpoint: check if a car is available for the given period (read-only)
exports.getCarAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { pickupDate, pickupTime, returnDate, returnTime } = req.query;

    if (!id || !pickupDate || !returnDate) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }

    const start = parseSofiaDate(pickupDate, pickupTime || '00:00');
    const end   = parseSofiaDate(returnDate, returnTime || '23:59');

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ ok: false, error: 'Invalid date/time range' });
    }

    // READ-ONLY: just check for conflicts in car.dates
    const conflictDoc = await Car.findOne({
      _id: id,
      dates: { $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } } }
    }).lean();

    let conflicts = [];
    if (conflictDoc && Array.isArray(conflictDoc.dates)) {
      conflicts = conflictDoc.dates
        .filter(d => new Date(d.startDate) < end && new Date(d.endDate) > start)
        .map(d => ({
          startDate: new Date(d.startDate).toISOString(),
          endDate: new Date(d.endDate).toISOString()
        }));
    }

    return res.json({ ok: true, available: !conflictDoc, conflicts });
  } catch (err) {
    console.error('getCarAvailability error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.postCreateOrder = async (req, res, next) => {
    let session;
    let responded = false;
    let success = false;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = { readPreference: 'primary', readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };
        await session.withTransaction(async () => {
        const {
            pickupDate,
            pickupTime,
            returnDate,
            returnTime,
            pickupLocation,
            returnLocation,
            rentalDays,       // form values only used for redisplay on error
            deliveryPrice,    // do NOT persist these; pricing is recomputed server-side
            returnPrice,
            totalPrice,
            fullName,
            phoneNumber,
            email,
            address,
            hotelName,
            carId
        } = req.body;

        const trimmedContact = {
            fullName: (fullName || '').trim(),
            phoneNumber: (phoneNumber || '').trim(),
            email: (email || '').trim(),
            address: (address || '').trim(),
        };
        if (Object.values(trimmedContact).some(value => !value)) {
            const cars = await Car.find({}).sort({ name: 1 }).lean();
            responded = true;
            return res.status(422).render('admin/order-new', {
                title: 'Add Order',
                error: CONTACT_REQUIRED_MESSAGE,
                defaults: {
                    pickupDate,
                    returnDate,
                    pickupTime,
                    returnTime,
                    pickupLocation,
                    returnLocation,
                    rentalDays,
                    deliveryPrice,
                    returnPrice,
                    totalPrice,
                    fullName,
                    phoneNumber,
                    email,
                    address,
                    hotelName
                },
                cars
            });
        }

        // Validate: check for overlap with existing car bookings (after purge)
        const { purgeExpired, addRange } = require('../utils/bookingSync');
        await purgeExpired(carId, session);
        const car = await Car.findById(carId).session(session).lean();
        if (!car) {
            throw new Error('Car not found');
        }

        const newStart = parseSofiaDate(pickupDate, pickupTime || '00:00');
        const newEnd   = parseSofiaDate(returnDate, returnTime || '23:59');
        if (!newStart || !newEnd || Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) || newStart >= newEnd) {
            throw new Error('Invalid pick-up/return range');
        }

        // Re-query overlap from DB (single source of truth)
        const overlapDoc = await Car.findOne({
            _id: carId,
            dates: { $elemMatch: { startDate: { $lt: newEnd }, endDate: { $gt: newStart } } }
        }).session(session).lean();

        if (overlapDoc) {
            // Re-render Add Order with error banner and keep previous inputs
            const cars = await Car.find({}).sort({ name: 1 }).lean();
            responded = true;
            return res.status(422).render('admin/order-new', {
                title: 'Add Order',
                error: 'Selected car is already booked in the specified period. Please choose different dates or a different car.',
                defaults: {
                    pickupDate,
                    returnDate,
                    pickupTime,
                    returnTime,
                    pickupLocation,
                    returnLocation,
                    rentalDays,
                    deliveryPrice,
                    returnPrice,
                    totalPrice,
                    fullName,
                    phoneNumber,
                    email,
                    address,
                    hotelName
                },
                cars
            });
        }

        const reservationConflict = await findActiveReservationHold(carId, newStart, newEnd, session);
        if (reservationConflict) {
            const cars = await Car.find({}).sort({ name: 1 }).lean();
            responded = true;
            return res.status(422).render('admin/order-new', {
                title: 'Add Order',
                error: RESERVATION_CONFLICT_MESSAGE,
                defaults: {
                    pickupDate,
                    returnDate,
                    pickupTime,
                    returnTime,
                    pickupLocation,
                    returnLocation,
                    rentalDays,
                    deliveryPrice,
                    returnPrice,
                    totalPrice,
                    fullName,
                    phoneNumber,
                    email,
                    address,
                    hotelName
                },
                cars
            });
        }

        // Compute authoritative pricing on the server
        const pricing = computeBookingPrice(
          car,
          newStart,
          newEnd,
          pickupLocation,
          returnLocation
        );

        // Create order inside the transaction using computed dates/pricing
        await Order.create([{
            carId,
            pickupDate: newStart,
            pickupTime,
            returnDate: newEnd,
            returnTime,
            pickupLocation,
            returnLocation,
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
            fullName: trimmedContact.fullName,
            phoneNumber: trimmedContact.phoneNumber,
            email: trimmedContact.email,
            address: trimmedContact.address,
            hotelName
        }], { session });

        // Persist booking window to car (validated add)
        await addRange(carId, newStart, newEnd, session);
        console.log('[TX] Order created and range added for car', carId);
        success = true;
        }, txnOptions);
        session.endSession();
        if (responded) return; // early render on overlap
        if (success) return res.redirect('/admin/orders');
    } catch (err) {
        console.error('Post create order error:', err);
        try { if (session) { await session.abortTransaction(); session.endSession(); } } catch(e){}
        if (responded) return; // response already sent

        // Fallback (no transaction) to ensure creation works even if TX unsupported
        try {
            const {
                pickupDate,
                pickupTime,
                returnDate,
                returnTime,
                pickupLocation,
                returnLocation,
                rentalDays,       // only used for redisplay on error
                deliveryPrice,    // do NOT persist; pricing is recomputed server-side
                returnPrice,
                totalPrice,
                fullName,
                phoneNumber,
                email,
                address,
                hotelName,
                carId
            } = req.body;

            const trimmedContact = {
                fullName: (fullName || '').trim(),
                phoneNumber: (phoneNumber || '').trim(),
                email: (email || '').trim(),
                address: (address || '').trim(),
            };
            if (Object.values(trimmedContact).some(value => !value)) {
                const cars = await Car.find({}).sort({ name: 1 }).lean();
                return res.status(422).render('admin/order-new', {
                    title: 'Add Order',
                    error: CONTACT_REQUIRED_MESSAGE,
                    defaults: {
                        pickupDate,
                        returnDate,
                        pickupTime,
                        returnTime,
                        pickupLocation,
                        returnLocation,
                        rentalDays,
                        deliveryPrice,
                        returnPrice,
                        totalPrice,
                        fullName,
                        phoneNumber,
                        email,
                        address,
                        hotelName
                    },
                    cars
                });
            }

            // Re-check overlap straight from DB
            const start = parseSofiaDate(pickupDate, pickupTime || '00:00');
            const end   = parseSofiaDate(returnDate, returnTime || '23:59');
            if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
                throw new Error('Invalid pick-up/return range');
            }
            const car = await Car.findById(carId).lean();
            if (!car) {
                throw new Error('Car not found');
            }
            const conflict = await Car.findOne({
                _id: carId,
                dates: { $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } } }
            }).lean();
            if (conflict) {
                const cars = await Car.find({}).sort({ name: 1 }).lean();
                return res.status(422).render('admin/order-new', {
                    title: 'Add Order',
                    error: 'Selected car is already booked in the specified period. Please choose different dates or a different car.',
                    defaults: {
                        pickupDate,
                        returnDate,
                        pickupTime,
                        returnTime,
                        pickupLocation,
                        returnLocation,
                        rentalDays,
                        deliveryPrice,
                        returnPrice,
                        totalPrice,
                        fullName,
                        phoneNumber,
                        email,
                        address,
                        hotelName
                    },
                    cars
                });
            }

            const reservationConflict = await findActiveReservationHold(carId, start, end);
            if (reservationConflict) {
                const cars = await Car.find({}).sort({ name: 1 }).lean();
                return res.status(422).render('admin/order-new', {
                    title: 'Add Order',
                    error: RESERVATION_CONFLICT_MESSAGE,
                    defaults: {
                        pickupDate,
                        returnDate,
                        pickupTime,
                        returnTime,
                        pickupLocation,
                        returnLocation,
                        rentalDays,
                        deliveryPrice,
                        returnPrice,
                        totalPrice,
                        fullName,
                        phoneNumber,
                        email,
                        address,
                        hotelName
                    },
                    cars
                });
            }

            const pricing = computeBookingPrice(
              car,
              start,
              end,
              pickupLocation,
              returnLocation
            );

            const created = await Order.create({
                carId,
                pickupDate: start,
                pickupTime,
                returnDate: end,
                returnTime,
                pickupLocation,
                returnLocation,
                rentalDays: pricing.rentalDays,
                deliveryPrice: pricing.deliveryPrice,
                returnPrice: pricing.returnPrice,
                totalPrice: pricing.totalPrice,
                fullName: trimmedContact.fullName,
                phoneNumber: trimmedContact.phoneNumber,
                email: trimmedContact.email,
                address: trimmedContact.address,
                hotelName
            });

            const { addRange, purgeExpired } = require('../utils/bookingSync');
            await purgeExpired(carId);
            await addRange(carId, start, end);
            console.log('[FB] Order created', created && created._id ? created._id.toString() : 'unknown');
            return res.redirect('/admin/orders');
        } catch (fallbackErr) {
            console.error('Fallback create order error:', fallbackErr);
            fallbackErr.publicMessage = 'Error creating order.';
            return next(fallbackErr);
        }
    }
};

exports.getOrderDetails = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('carId', 'name image price transmission seats');
        if (!order) return res.status(404).send('Order not found');
        res.render('admin/order-view', {
            title: 'Order Details',
            order
        });
    } catch (err) {
        console.error('Get order details error:', err);
        err.publicMessage = 'Error loading order details.';
        return next(err);
    }
};

exports.getEditOrder = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id).populate('carId', 'name image price priceTier_1_3 priceTier_7_31 priceTier_31_plus');
        if (!order) return res.status(404).send('Order not found');
        const cars = await Car.find({}).sort({ name: 1 }).lean();
        // Normalize date/time values for HTML5 inputs
        const toISODate = (s) => {
            if (!s) return '';
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            const m = String(s).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
            if (m) {
                const [ , d, mo, y ] = m;
                return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            }
            const d = new Date(s);
            return isNaN(d) ? '' : d.toISOString().slice(0,10);
        };
        const toHHMM = (s) => {
            if (!s) return '';
            if (/^\d{2}:\d{2}$/.test(s)) return s;
            const m = String(s).match(/^(\d{1,2}):(\d{2})/);
            if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`;
            return '';
        };
        res.render('admin/order-edit', {
            title: 'Edit Order',
            order,
          cars,
            pickupDateISO: toISODate(order.pickupDate),
            returnDateISO: toISODate(order.returnDate),
            pickupTimeHHMM: toHHMM(order.pickupTime),
            returnTimeHHMM: toHHMM(order.returnTime)
        });
    } catch (err) {
        console.error('Get edit order error:', err);
        err.publicMessage = 'Error loading order.';
        return next(err);
    }
};

exports.postEditOrder = async (req, res, next) => {
    let session;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = { readPreference: 'primary', readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };
        await session.withTransaction(async () => {
        const existingOrder = await Order.findById(req.params.id).session(session);
        if (!existingOrder) {
          res.status(404).send('Order not found');
          return;
        }

        // Previous booking window (now stored as Date in the model)
        const prevCarId = existingOrder.carId;
        const prevStart = existingOrder.pickupDate instanceof Date
          ? existingOrder.pickupDate
          : parseSofiaDate(existingOrder.pickupDate, existingOrder.pickupTime || '00:00');
        const prevEnd = existingOrder.returnDate instanceof Date
          ? existingOrder.returnDate
          : parseSofiaDate(existingOrder.returnDate, existingOrder.returnTime || '23:59');

        // Load previous car to find the exact stored range in Car.dates that belongs to this order.
        // This avoids timezone/normalization mismatches when bookingSync re-normalizes prevStart/prevEnd.
        let storedPrevStart = prevStart;
        let storedPrevEnd = prevEnd;
        try {
          const prevCar = await Car.findById(prevCarId).session(session).lean();
          if (prevCar && Array.isArray(prevCar.dates) && prevCar.dates.length) {
            const candidate = prevCar.dates.find(d => {
              const s = new Date(d.startDate);
              const e = new Date(d.endDate);
              return s < prevEnd && e > prevStart;
            });
            if (candidate) {
              storedPrevStart = new Date(candidate.startDate);
              storedPrevEnd = new Date(candidate.endDate);
            }
          }
        } catch (_) {
          // If anything goes wrong here, fall back to prevStart/prevEnd.
        }

        // New values from the form (pricing fields only used for redisplay on error)
        const {
          pickupDate,
          pickupTime,
          returnDate,
          returnTime,
          pickupLocation,
          returnLocation,
          hotelName,
          fullName,
          phoneNumber,
          email,
          address,
          rentalDays,
          deliveryPrice,
          returnPrice,
          totalPrice,
          carId,
        } = req.body;

        const trimmedContact = {
          fullName: (fullName || '').trim(),
          phoneNumber: (phoneNumber || '').trim(),
          email: (email || '').trim(),
          address: (address || '').trim(),
        };
        if (Object.values(trimmedContact).some(value => !value)) {
          const error = new Error(CONTACT_REQUIRED_MESSAGE);
          error.code = 'MISSING_CONTACT';
          throw error;
        }

        const newCarId = (carId && carId.toString && carId.toString()) || String(prevCarId);

        const newStart = parseSofiaDate(pickupDate, pickupTime || '00:00');
        const newEnd = parseSofiaDate(returnDate, returnTime || '23:59');
        if (
          !prevStart || !prevEnd || !newStart || !newEnd ||
          Number.isNaN(prevStart.getTime()) || Number.isNaN(prevEnd.getTime()) ||
          Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) ||
          newStart >= newEnd
        ) {
          const err = new Error('Invalid date/time range');
          err.code = 'INVALID_RANGE';
          throw err;
        }

        // Load the target car for pricing
        const car = await Car.findById(newCarId).session(session).lean();
        if (!car) {
          const err = new Error('Car not found');
          err.code = 'CAR_NOT_FOUND';
          throw err;
        }

        // Determine whether anything affecting pricing changed
        const sameCar = String(prevCarId) === String(newCarId);
        const sameStart = prevStart && newStart && prevStart.getTime() === newStart.getTime();
        const sameEnd = prevEnd && newEnd && prevEnd.getTime() === newEnd.getTime();
        const samePickupLoc = existingOrder.pickupLocation === pickupLocation;
        const sameReturnLoc = existingOrder.returnLocation === returnLocation;

        const shouldRecalculatePrice =
          !sameCar || !sameStart || !sameEnd || !samePickupLoc || !sameReturnLoc;

        if (!sameCar || !sameStart || !sameEnd) {
          const reservationConflict = await findActiveReservationHold(newCarId, newStart, newEnd, session);
          if (reservationConflict) {
            const err = new Error(RESERVATION_CONFLICT_MESSAGE);
            err.code = 'RESERVATION_HOLD_CONFLICT';
            throw err;
          }
        }

        // If car and window did not change, just update non-date fields and optionally pricing
        if (sameCar && sameStart && sameEnd) {
          existingOrder.carId = prevCarId;
          // Keep existing pickup/return window; only update non-date fields
          existingOrder.pickupLocation = pickupLocation;
          existingOrder.returnLocation = returnLocation;
          existingOrder.hotelName = hotelName;
          existingOrder.fullName = trimmedContact.fullName;
          existingOrder.phoneNumber = trimmedContact.phoneNumber;
          existingOrder.email = trimmedContact.email;
          existingOrder.address = trimmedContact.address;

          if (shouldRecalculatePrice) {
            const pricing = computeBookingPrice(
              car,
              prevStart, // same as newStart
              prevEnd,   // same as newEnd
              pickupLocation,
              returnLocation
            );
            existingOrder.rentalDays = pricing.rentalDays;
            existingOrder.deliveryPrice = pricing.deliveryPrice;
            existingOrder.returnPrice = pricing.returnPrice;
            existingOrder.totalPrice = pricing.totalPrice;
          }

          await existingOrder.save({ session });
          return;
        }

        // Car or window changed: update booking window & car ranges
        const { updateRange, moveRange } = require('../utils/bookingSync');

        if (String(newCarId) === String(prevCarId)) {
          // Use storedPrevStart/storedPrevEnd so $pull in updateRange matches the existing Car.dates entry.
          await updateRange(prevCarId, storedPrevStart, storedPrevEnd, newStart, newEnd, session);
        } else {
          await moveRange(prevCarId, newCarId, storedPrevStart, storedPrevEnd, newStart, newEnd, session);
        }

        // Persist the new values (including dates) on the order
        existingOrder.carId = newCarId;
        existingOrder.pickupDate = newStart;
        existingOrder.pickupTime = pickupTime;
        existingOrder.returnDate = newEnd;
        existingOrder.returnTime = returnTime;
        existingOrder.pickupLocation = pickupLocation;
        existingOrder.returnLocation = returnLocation;
        existingOrder.hotelName = hotelName;
        existingOrder.fullName = trimmedContact.fullName;
        existingOrder.phoneNumber = trimmedContact.phoneNumber;
        existingOrder.email = trimmedContact.email;
        existingOrder.address = trimmedContact.address;

        const now = new Date();
        if (newEnd <= now) {
          existingOrder.status = 'expired';
          if (!existingOrder.expiredAt) {
            existingOrder.expiredAt = now;
          }
        } else {
          existingOrder.status = 'active';
          existingOrder.expiredAt = undefined;
        }

        if (shouldRecalculatePrice) {
          const pricing = computeBookingPrice(
            car,
            newStart,
            newEnd,
            pickupLocation,
            returnLocation
          );
          existingOrder.rentalDays = pricing.rentalDays;
          existingOrder.deliveryPrice = pricing.deliveryPrice;
          existingOrder.returnPrice = pricing.returnPrice;
          existingOrder.totalPrice = pricing.totalPrice;
        }

        await existingOrder.save({ session });
        }, txnOptions);
        session.endSession();
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Post edit order error:', err);
        try { if (session) { await session.abortTransaction(); session.endSession(); } } catch(e){}
        // If overlap error or validation, re-render edit page with banner and keep fields
        const order = await Order.findById(req.params.id)
          .populate('carId', 'name image price priceTier_1_3 priceTier_7_31 priceTier_31_plus');
        if (order) {
          order.pickupDate = req.body.pickupDate;
          order.pickupTime = req.body.pickupTime;
          order.returnDate = req.body.returnDate;
          order.returnTime = req.body.returnTime;
          order.pickupLocation = req.body.pickupLocation;
          order.returnLocation = req.body.returnLocation;
          order.hotelName = req.body.hotelName;
          order.fullName = req.body.fullName;
          order.phoneNumber = req.body.phoneNumber;
          order.email = req.body.email;
          order.address = req.body.address;
          order.rentalDays = req.body.rentalDays;
          order.deliveryPrice = req.body.deliveryPrice;
          order.returnPrice = req.body.returnPrice;
          order.totalPrice = req.body.totalPrice;

          const toISODate = (s) => { if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0,10); };
          const toHHMM = (s) => { if (!s) return ''; if (/^\d{2}:\d{2}$/.test(s)) return s; const m = String(s).match(/^(\d{1,2}):(\d{2})/); return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : ''; };
          // Fetch cars list for the select, as the view expects `cars`
          const cars = await Car.find({}).sort({ name: 1 }).lean();
          return res.status(422).render('admin/order-edit', {
            title: 'Edit Order',
            error: (err && err.code === 'MISSING_CONTACT')
              ? CONTACT_REQUIRED_MESSAGE
              : (err && err.code === 'RESERVATION_HOLD_CONFLICT')
                ? RESERVATION_CONFLICT_MESSAGE
                : (err && err.code === 'OVERLAP')
                  ? 'Selected car is already booked in the specified period. Please choose different dates or a different car.'
                  : 'Error saving order',
            order,
            cars,
            pickupDateISO: toISODate(order.pickupDate),
            returnDateISO: toISODate(order.returnDate),
            pickupTimeHHMM: toHHMM(order.pickupTime),
            returnTimeHHMM: toHHMM(order.returnTime)
          });
        }
        err.publicMessage = 'Error saving order.';
        return next(err);
    }
};

exports.postDeleteOrder = async (req, res, next) => {
    let session;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
        };

        await session.withTransaction(async () => {
          const order = await Order.findById(req.params.id).session(session);
          if (!order) return; // nothing to delete

          // 1) derive previous range from order
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

          // 2) find the exact stored range in Car.dates that corresponds to this order
          try {
            const prevCar = await Car.findById(order.carId).session(session).lean();
            if (prevCar && Array.isArray(prevCar.dates) && prevCar.dates.length) {
              const candidate = prevCar.dates.find((d) => {
                const s = new Date(d.startDate);
                const e = new Date(d.endDate);
                return s < prevEnd && e > prevStart; // overlapping interval
              });
              if (candidate) {
                storedStart = new Date(candidate.startDate);
                storedEnd = new Date(candidate.endDate);
              }
            }
          } catch (_) {
            // if anything fails, we fall back to prevStart/prevEnd
          }

          const { removeRange } = require('../utils/bookingSync');
          await removeRange(order.carId, storedStart, storedEnd, session);

          order.isDeleted = true;
          order.deletedAt = new Date();
          await order.save({ session });
        }, txnOptions);

        session.endSession();
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Delete order error:', err);
        try {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
        } catch (e) {}
        err.publicMessage = 'Error deleting order.';
        return next(err);
    }
};

exports.postRestoreOrder = async (req, res) => {
    let session;
    let responseSent = false;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
        };

        await session.withTransaction(async () => {
          const order = await Order.findById(req.params.id).session(session);
          if (!order || !order.isDeleted) {
            const err = new Error('Order not found or not deleted');
            err.code = 'RESTORE_INVALID';
            throw err;
          }

          const start =
            order.pickupDate instanceof Date
              ? order.pickupDate
              : parseSofiaDate(order.pickupDate, order.pickupTime || '00:00');
          const end =
            order.returnDate instanceof Date
              ? order.returnDate
              : parseSofiaDate(order.returnDate, order.returnTime || '23:59');

          if (
            !start || !end ||
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            start >= end
          ) {
            const rangeErr = new Error('Invalid stored date range');
            rangeErr.code = 'INVALID_RANGE';
            throw rangeErr;
          }

          const { addRange, purgeExpired } = require('../utils/bookingSync');
          await purgeExpired(order.carId, session);
          await addRange(order.carId, start, end, session);

          order.isDeleted = false;
          order.deletedAt = undefined;

          const now = new Date();
          if (end <= now) {
            order.status = 'expired';
            if (!order.expiredAt) {
              order.expiredAt = now;
            }
          } else {
            if (!order.status || order.status === 'expired' || order.status === 'cancelled') {
              order.status = 'active';
            }
            order.expiredAt = undefined;
          }

          await order.save({ session });
        }, txnOptions);

        session.endSession();
        responseSent = true;
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Restore order error:', err);
        try {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
        } catch (e) {}
        if (!responseSent) {
          let message = 'Error restoring order';
          if (err && err.code === 'OVERLAP') {
            message = 'Cannot restore order: car is already booked in that period.';
          } else if (err && err.code === 'RESTORE_INVALID') {
            message = 'Cannot restore: order not found or not in bin.';
          } else if (err && err.code === 'INVALID_RANGE') {
            message = 'Cannot restore: order has invalid stored dates.';
          }
          return res.redirect(`/admin/orders/deleted?err=${encodeURIComponent(message)}`);
        }
    }
};

// -------- Cars CRUD (basic scaffolding, no complex logic) --------
exports.listCars = async (req, res, next) => {
    try {
        const cars = await Car.find().sort({ name: 1 });
        res.render('admin/cars', { title: 'Manage Cars', cars });
    } catch (err) {
        console.error('List cars error:', err);
        err.publicMessage = 'Error loading cars.';
        return next(err);
    }
};

exports.getCreateCar = async (req, res) => {
    res.render('admin/car-form', { title: 'Add Car', car: null });
};

exports.postCreateCar = async (req, res, next) => {
    try {
        const { validationResult } = require('express-validator');
        const errors = validationResult(req);
        const { name, transmission, seats, fuelType, priceTier_1_3, priceTier_7_31, priceTier_31_plus } = req.body;
        if (!errors.isEmpty()) {
            return res.status(422).render('admin/car-form', {
                title: 'Add Car',
                car: {
                    name,
                    transmission,
                    seats,
                    fuelType,
                    priceTier_1_3: priceTier_1_3 || undefined,
                    priceTier_7_31: priceTier_7_31 || undefined,
                    priceTier_31_plus: priceTier_31_plus || undefined,
                    availability: true
                },
                errors: errors.array()
            });
        }
        const imagePath = req.file ? `/images/${req.file.filename}` : '';
        // derive base price from provided tiers (prefer 1–3 days, then 7–31, then 31+)
        const derivedBase = priceTier_1_3 ? parseFloat(priceTier_1_3) : (priceTier_7_31 ? parseFloat(priceTier_7_31) : (priceTier_31_plus ? parseFloat(priceTier_31_plus) : 0));

        await Car.create({
            name,
            transmission,
            price: derivedBase > 0 ? derivedBase : undefined,
            priceTier_1_3: priceTier_1_3 ? parseFloat(priceTier_1_3) : undefined,
            priceTier_7_31: priceTier_7_31 ? parseFloat(priceTier_7_31) : undefined,
            priceTier_31_plus: priceTier_31_plus ? parseFloat(priceTier_31_plus) : undefined,
            seats,
            fuelType,
            image: imagePath,
            availability: true
        });
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Create car error:', err);
        err.publicMessage = 'Error creating car.';
        return next(err);
    }
};

exports.getEditCar = async (req, res, next) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).send('Car not found');
        res.render('admin/car-form', { title: 'Edit Car', car });
    } catch (err) {
        console.error('Get edit car error:', err);
        err.publicMessage = 'Error loading car.';
        return next(err);
    }
};

exports.postEditCar = async (req, res, next) => {
    try {
        const { validationResult } = require('express-validator');
        const errors = validationResult(req);
        const { name, transmission, seats, fuelType, availability, priceTier_1_3, priceTier_7_31, priceTier_31_plus } = req.body;
        if (!errors.isEmpty()) {
            const car = await Car.findById(req.params.id);
            return res.status(422).render('admin/car-form', {
                title: 'Edit Car',
                car: car ? {
                    _id: car._id,
                    name,
                    transmission,
                    price: car.price,
                    seats,
                    fuelType,
                    availability: availability === 'on',
                    image: car.image
                } : null,
                errors: errors.array()
            });
        }
        const update = {
            name,
            transmission,
            price: (priceTier_1_3 || priceTier_7_31 || priceTier_31_plus) ?
                (priceTier_1_3 ? parseFloat(priceTier_1_3) : (priceTier_7_31 ? parseFloat(priceTier_7_31) : parseFloat(priceTier_31_plus))) : undefined,
            priceTier_1_3: priceTier_1_3 ? parseFloat(priceTier_1_3) : undefined,
            priceTier_7_31: priceTier_7_31 ? parseFloat(priceTier_7_31) : undefined,
            priceTier_31_plus: priceTier_31_plus ? parseFloat(priceTier_31_plus) : undefined,
            seats,
            fuelType,
            availability: availability === 'on'
        };
        if (req.file) update.image = `/images/${req.file.filename}`;
        await Car.findByIdAndUpdate(req.params.id, update);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Edit car error:', err);
        err.publicMessage = 'Error updating car.';
        return next(err);
    }
};

exports.postDeleteCar = async (req, res, next) => {
    try {
        await Car.findByIdAndDelete(req.params.id);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Delete car error:', err);
        err.publicMessage = 'Error deleting car.';
        return next(err);
    }
};

