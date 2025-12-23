const Car = require('../models/Car');
const mongoose = require('mongoose');
const { formatDateForDisplay } = require('../utils/dateFormatter');

// ---------------------------------------------
// Controller: GET /  (home page)
// ---------------------------------------------
exports.getHome = async (req, res, next) => {
  try {
    // Purge expired booking windows before reading
    try { const { purgeExpired } = require('../utils/bookingSync'); await purgeExpired(); } catch(e) {}
    // 1. Pagination + category filtering for gallery cards
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    // Show max 3 items per page on home
    const perPage = 3;
    const category = (req.query.category || '').toLowerCase();

    // Map UI category chips to Mongo filters based on existing fields
    const categoryToFilter = {
      'electric': { fuelType: 'Electric' },
      'hybrid': { fuelType: 'Hybrid' },
      'petrol': { fuelType: 'Petrol' },
      'diesel': { fuelType: 'Diesel' },
      'automatic': { transmission: 'Automatic' },
      'manual': { transmission: 'Manual' },
      'seats-2-3': { seats: { $in: [2,3] } },
      'seats-4-5': { seats: { $in: [4,5] } },
      'seats-6-9': { seats: { $in: [6,7,8,9] } },
    };
    // Build optional filter conditions from query params (UI-only earlier; now functional)
    const qTransmission = (req.query.transmission || '').toLowerCase();
    const qFuel = (req.query.fuelType || '').toLowerCase();
    const qSeatsMin = Number.parseInt(req.query.seatsMin, 10);
    const qSeatsMax = Number.parseInt(req.query.seatsMax, 10);
    const qPriceMin = Number.parseFloat(req.query.priceMin);
    const qPriceMax = Number.parseFloat(req.query.priceMax);

    const andFilters = [];
    const categoryFilter = categoryToFilter[category];
    if (categoryFilter && Object.keys(categoryFilter).length) andFilters.push(categoryFilter);

    if (qTransmission === 'automatic') andFilters.push({ transmission: 'Automatic' });
    else if (qTransmission === 'manual') andFilters.push({ transmission: 'Manual' });

    if (qFuel === 'petrol') andFilters.push({ fuelType: 'Petrol' });
    else if (qFuel === 'diesel') andFilters.push({ fuelType: 'Diesel' });
    else if (qFuel === 'hybrid') andFilters.push({ fuelType: 'Hybrid' });
    else if (qFuel === 'electric') andFilters.push({ fuelType: 'Electric' });

    const seatsRange = {};
    if (Number.isFinite(qSeatsMin)) seatsRange.$gte = qSeatsMin;
    if (Number.isFinite(qSeatsMax)) seatsRange.$lte = qSeatsMax;
    if (Object.keys(seatsRange).length) andFilters.push({ seats: seatsRange });

    const priceRange = {};
    if (Number.isFinite(qPriceMin)) priceRange.$gte = qPriceMin;
    if (Number.isFinite(qPriceMax)) priceRange.$lte = qPriceMax;
    if (Object.keys(priceRange).length) andFilters.push({ price: priceRange });

    const mongoFilter = andFilters.length > 1 ? { $and: andFilters } : (andFilters[0] || {});

    const totalCars = await Car.countDocuments(mongoFilter);
    const totalPages = Math.max(1, Math.ceil(totalCars / perPage));

    const cars = await Car.find(mongoFilter)
      .sort({ name: 1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    // 2. Default rental span = today ➡️ tomorrow (1 day)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const pickupDateISO = now.toISOString().split('T')[0];
    const returnDateISO = tomorrow.toISOString().split('T')[0];
    const pickupDate = formatDateForDisplay(pickupDateISO);
    const returnDate = formatDateForDisplay(returnDateISO);
    const pickupTime = now.toTimeString().split(' ')[0].slice(0, 5); // HH:MM
    const returnTime = pickupTime;

    const rentalDays = 1;

    // 3. Attach total price so the card partial can show it
    const carsWithTotals = cars.map(car => ({
      ...car.toObject(),
      totalPrice: car.price * rentalDays
    }));

    // 4. Render
    res.render('index', {
      title: 'Find Perfect Car',
      cars: carsWithTotals,
      pickupDate,
      returnDate,
      pickupDateISO,
      returnDateISO,
      pickupTime:"",
      returnTime:"",
      returnLocation:"",
      pickupLocation:"",
      // pagination context for gallery
      currentPage: page,
      totalPages,
      category,
      filters: {
        transmission: req.query.transmission || '',
        fuelType: req.query.fuelType || '',
        seatsMin: req.query.seatsMin || '',
        seatsMax: req.query.seatsMax || '',
        priceMin: req.query.priceMin || '',
        priceMax: req.query.priceMax || '',
      }
    });
  } catch (err) {
    console.error('getHome error:', err);
    err.publicMessage = 'Error fetching cars.';
    return next(err);
  }
};