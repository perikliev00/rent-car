// Car model – fleet заявки и pagination за home page.
const Car = require('../models/Car');
// formatDateForDisplay – ISO дати в display текст за landing page defaults.
const { formatDateForDisplay } = require('../utils/dateFormatter');
const { purgeExpired } = require('../utils/bookingSync');
const {
  parseCarFilterRaw,
  applyCarCriteriaToMongoMatch,
  filtersViewModel,
} = require('../utils/carFilters');

// GET / – home page (landing)
exports.getHome = async (req, res, next) => {
  try {
    // Изчистваме изтекла booking прозорца преди четене – да не засягат наличността.
    try {  await purgeExpired(); } catch(e) {}
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = 3;

    const criteria = parseCarFilterRaw(req.query);
    const rentalDays = 1;
    const mongoFilter = {};
    applyCarCriteriaToMongoMatch(mongoFilter, criteria, rentalDays);

    const totalCars = await Car.countDocuments(mongoFilter);
    const totalPages = Math.max(1, Math.ceil(totalCars / perPage));

    const cars = await Car.find(mongoFilter)
      .sort({ name: 1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const pickupDateISO = now.toISOString().split('T')[0];
    const returnDateISO = tomorrow.toISOString().split('T')[0];
    const pickupDate = formatDateForDisplay(pickupDateISO);
    const returnDate = formatDateForDisplay(returnDateISO);
    const pickupTime = now.toTimeString().split(' ')[0].slice(0, 5);
    const returnTime = pickupTime;

    const carsWithTotals = cars.map(car => ({
      ...car.toObject(),
      totalPrice: car.price * rentalDays
    }));

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
      currentPage: page,
      totalPages,
      category: criteria.category,
      filters: filtersViewModel(criteria, req.query),
    });
  } catch (err) {
    console.error('getHome error:', err);
    err.publicMessage = 'Error fetching cars.';
    return next(err);
  }
};
