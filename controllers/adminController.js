const Order = require('../models/Order');
const Car = require('../models/Car');
const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');
const OrderModel = require('../models/Order');

exports.getAdminDashboard = async (req, res) => {
    try {
        console.log('Admin dashboard: Starting to fetch orders...');
        
        // Fetch all orders with car details populated for recent orders table
        const orders = await Order.find()
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
        res.status(500).send('Error loading admin dashboard');
    }
};

exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('carId', 'name image price transmission seats')
            .sort({ createdAt: -1 });

        res.render('admin/orders', {
            title: 'All Orders',
            orders: orders || []
        });
    } catch (err) {
        console.error('Get orders error:', err);
        res.status(500).send('Error fetching orders');
    }
};

exports.getCreateOrder = async (req, res) => {
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
                hotelName: ''
            },
            cars
        });
    } catch (err) {
        console.error('Get create order error:', err);
        res.status(500).send('Error');
    }
};

// JSON endpoint: check if a car is available for the given period
exports.getCarAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { pickupDate, pickupTime, returnDate, returnTime } = req.query;
        if (!id || !pickupDate || !returnDate) {
            return res.status(400).json({ ok: false, error: 'Missing required parameters' });
        }
        const start = new Date(`${pickupDate}T${pickupTime || '00:00'}:00Z`);
        const end   = new Date(`${returnDate}T${returnTime || '23:59'}:00Z`);
        if (isNaN(start) || isNaN(end) || start >= end) {
            return res.status(400).json({ ok: false, error: 'Invalid date/time range' });
        }

        // Defensive cleanup: purge orphans before checking
        try { const { purgeOrphaned, purgeExpired } = require('../utils/bookingSync'); await purgeExpired(id); await purgeOrphaned(id); } catch(_){}

        // Query fresh overlap from DB after cleanup
        const conflictDoc = await Car.findOne({
            _id: id,
            dates: { $elemMatch: { startDate: { $lt: end }, endDate: { $gt: start } } }
        }).lean();

        // Optionally return conflicting ranges (lightweight)
        let conflicts = [];
        if (conflictDoc && Array.isArray(conflictDoc.dates)) {
            conflicts = conflictDoc.dates
              .filter(d => new Date(d.startDate) < end && new Date(d.endDate) > start)
              .map(d => ({ startDate: new Date(d.startDate).toISOString(), endDate: new Date(d.endDate).toISOString() }));
        }
        return res.json({ ok: true, available: !conflictDoc, conflicts });
    } catch (err) {
        console.error('getCarAvailability error:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
};

exports.postCreateOrder = async (req, res) => {
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
            rentalDays,
            deliveryPrice,
            returnPrice,
            totalPrice,
            fullName,
            phoneNumber,
            email,
            address,
            hotelName,
            carId
        } = req.body;

        // Validate: check for overlap with existing car bookings (after purge)
        const { purgeExpired, addRange } = require('../utils/bookingSync');
        await purgeExpired(carId, session);
        const car = await Car.findById(carId).session(session).lean();
        if (!car) {
            throw new Error('Car not found');
        }

        const newStart = new Date(`${pickupDate}T${pickupTime || '00:00'}:00Z`);
        const newEnd   = new Date(`${returnDate}T${returnTime || '23:59'}:00Z`);

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

        // Create order inside the transaction
        await Order.create([{
            carId,
            pickupDate,
            pickupTime,
            returnDate,
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
                rentalDays,
                deliveryPrice,
                returnPrice,
                totalPrice,
                fullName,
                phoneNumber,
                email,
                address,
                hotelName,
                carId
            } = req.body;

            // Re-check overlap straight from DB
            const start = new Date(`${pickupDate}T${pickupTime || '00:00'}:00Z`);
            const end   = new Date(`${returnDate}T${returnTime || '23:59'}:00Z`);
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

            const created = await Order.create({
                carId,
                pickupDate,
                pickupTime,
                returnDate,
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
            });

            const { addRange, purgeExpired, purgeOrphaned } = require('../utils/bookingSync');
            await purgeExpired(carId);
            await purgeOrphaned(carId);
            await addRange(carId, start, end);
            console.log('[FB] Order created', created && created._id ? created._id.toString() : 'unknown');
            return res.redirect('/admin/orders');
        } catch (fallbackErr) {
            console.error('Fallback create order error:', fallbackErr);
            return res.status(500).send('Error creating order');
        }
    }
};

exports.getOrderDetails = async (req, res) => {
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
        res.status(500).send('Error loading order details');
    }
};

exports.getEditOrder = async (req, res) => {
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
        res.status(500).send('Error loading order');
    }
};

exports.postEditOrder = async (req, res) => {
    let session;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = { readPreference: 'primary', readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };
        await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) return res.status(404).send('Order not found');

        // Keep originals to locate the existing date range in the car
        const originalPickupDate = order.pickupDate;
        const originalPickupTime = order.pickupTime;
        const originalReturnDate = order.returnDate;
        const originalReturnTime = order.returnTime;

        // Update order fields from form
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
            carId
        } = req.body;

        const previousCarId = order.carId.toString();
        const newCarId = (carId && carId.toString()) || previousCarId;

        order.carId = newCarId;
        order.pickupDate = pickupDate;
        order.pickupTime = pickupTime;
        order.returnDate = returnDate;
        order.returnTime = returnTime;
        order.pickupLocation = pickupLocation;
        order.returnLocation = returnLocation;
        order.hotelName = hotelName;
        order.fullName = fullName;
        order.phoneNumber = phoneNumber;
        order.email = email;
        order.address = address;
        if (typeof rentalDays !== 'undefined') order.rentalDays = rentalDays;
        order.deliveryPrice = deliveryPrice;
        order.returnPrice = returnPrice;
        order.totalPrice = totalPrice;
        await order.save({ session });

        // Build previous and new ISO datetimes
        const prevStart = new Date(`${originalPickupDate}T${originalPickupTime || '00:00'}:00Z`);
        const prevEnd   = new Date(`${originalReturnDate}T${originalReturnTime || '23:59'}:00Z`);
        const newStart  = new Date(`${pickupDate}T${pickupTime || '00:00'}:00Z`);
        const newEnd    = new Date(`${returnDate}T${returnTime || '23:59'}:00Z`);

        const { updateRange, purgeExpired, moveRange } = require('../utils/bookingSync');
        try {
            if (newCarId === previousCarId) {
                await updateRange(newCarId, prevStart, prevEnd, newStart, newEnd, session);
            } else {
                await moveRange(previousCarId, newCarId, prevStart, prevEnd, newStart, newEnd, session);
                await purgeExpired(previousCarId, session);
            }
        } catch (e) {
            const { removeRange, addRange } = require('../utils/bookingSync');
            await removeRange(previousCarId, prevStart, prevEnd, session);
            await addRange(newCarId, newStart, newEnd, session);
        }
        await purgeExpired(newCarId, session);
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
          const toISODate = (s) => { if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0,10); };
          const toHHMM = (s) => { if (!s) return ''; if (/^\d{2}:\d{2}$/.test(s)) return s; const m = String(s).match(/^(\d{1,2}):(\d{2})/); return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : ''; };
          // Fetch cars list for the select, as the view expects `cars`
          const cars = await Car.find({}).sort({ name: 1 }).lean();
          return res.status(422).render('admin/order-edit', {
            title: 'Edit Order',
            error: 'Selected car is already booked in the specified period. Please choose different dates or a different car.',
            order,
            cars,
            pickupDateISO: toISODate(order.pickupDate),
            returnDateISO: toISODate(order.returnDate),
            pickupTimeHHMM: toHHMM(order.pickupTime),
            returnTimeHHMM: toHHMM(order.returnTime)
          });
        }
        res.status(500).send('Error saving order');
    }
};

exports.postDeleteOrder = async (req, res) => {
    let session;
    try {
        const mongoose = require('mongoose');
        session = await mongoose.startSession();
        const txnOptions = { readPreference: 'primary', readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };
        await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) return; // nothing to delete

        // Build exact start/end used when order was created to remove from car.dates
        const startDate = new Date(`${order.pickupDate}T${order.pickupTime || '00:00'}:00Z`);
        const endDate   = new Date(`${order.returnDate}T${order.returnTime || '23:59'}:00Z`);

        const { removeRange } = require('../utils/bookingSync');
        await removeRange(order.carId, startDate, endDate, session);
        await Order.deleteOne({ _id: order._id }).session(session);
        }, txnOptions);
        session.endSession();
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Delete order error:', err);
        try { if (session) { await session.abortTransaction(); session.endSession(); } } catch(e){}
        res.status(500).send('Error deleting order');
    }
};

// -------- Cars CRUD (basic scaffolding, no complex logic) --------
exports.listCars = async (req, res) => {
    try {
        const cars = await Car.find().sort({ name: 1 });
        res.render('admin/cars', { title: 'Manage Cars', cars });
    } catch (err) {
        console.error('List cars error:', err);
        res.status(500).send('Error loading cars');
    }
};

exports.getCreateCar = async (req, res) => {
    res.render('admin/car-form', { title: 'Add Car', car: null });
};

exports.postCreateCar = async (req, res) => {
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
        res.status(500).send('Error creating car');
    }
};

exports.getEditCar = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).send('Car not found');
        res.render('admin/car-form', { title: 'Edit Car', car });
    } catch (err) {
        console.error('Get edit car error:', err);
        res.status(500).send('Error');
    }
};

exports.postEditCar = async (req, res) => {
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
        res.status(500).send('Error');
    }
};

exports.postDeleteCar = async (req, res) => {
    try {
        await Car.findByIdAndDelete(req.params.id);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Delete car error:', err);
        res.status(500).send('Error');
    }
};

