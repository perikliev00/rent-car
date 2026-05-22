// formatDateForDisplay – ISO дати в display текст за landing page defaults.
const { formatDateForDisplay } = require('../utils/dateFormatter');
const { purgeExpired } = require('../utils/bookingSync');
const {
  parseCarFilterRaw,
  applyCarCriteriaToMongoMatch,
  filtersViewModel,
} = require('../utils/carFilters');
const { paginateCars, parsePage } = require('../utils/paginateCars');

// GET / – home page (landing)
exports.getHome = async (req, res, next) => {
  try {
    // Изчистваме изтекла booking прозорца преди четене – да не засягат наличността.
    const criteria = parseCarFilterRaw(req.query);
    const rentalDays = 1;
    const mongoFilter = {};
    applyCarCriteriaToMongoMatch(mongoFilter, criteria, rentalDays);

    const { cars, currentPage, totalPages } = await paginateCars(mongoFilter, {
      page: parsePage(req.query.page),
    });

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const pickupDateISO = now.toISOString().split('T')[0];
    const returnDateISO = tomorrow.toISOString().split('T')[0];
    const pickupDate = formatDateForDisplay(pickupDateISO);
    const returnDate = formatDateForDisplay(returnDateISO);

    res.render('index', {
      title: 'Find Perfect Car',
      cars,
      pickupDate,
      returnDate,
      pickupDateISO,
      returnDateISO,
      returnLocation:"",
      pickupLocation:"",
      currentPage,
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
