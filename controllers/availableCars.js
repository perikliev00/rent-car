const { validationResult } = require('express-validator');
const Reservation = require('../models/Reservation');
const {
  parseCarFilterRaw,
  applyCarCriteriaToMongoMatch,
  filtersViewModel,
} = require('../utils/carFilters');
const { computeBookingPrice } = require('../utils/pricing');
const filterCarsByComputedUnitPrice = require('../utils/carFilters').filterCarsByComputedUnitPrice;

const { ACTIVE_RESERVATION_STATUSES, getSessionId } = require('../utils/reservationHelpers');
const { validateBookingDates } = require('../utils/bookingValidation');
const { paginateCars, parsePage } = require('../utils/paginateCars');
const asyncHandler = require('../utils/asyncHandler');

exports.postSearchCars = asyncHandler(async (req, res) => {

  let errors = validationResult(req);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 today

  const pickupDateOnly = req.body['pickup-date'];
  const returnDateOnly = req.body['return-date'];
  const pickupTimeInput = req.body['pickup-time'];
  const returnTimeInput = req.body['return-time'];

  const {
    isValid,
    errors: bookingErrors,
    startDate,
    endDate,
    rentalDays
  } = validateBookingDates({
    pickupDate: pickupDateOnly,
    returnDate: returnDateOnly,
    pickupTime: pickupTimeInput || '10:00',
    returnTime: returnTimeInput || '10:00',
    now,
  });

  if (!isValid) {
    bookingErrors.forEach((msg) => {
      errors.errors.push({ msg });
    });
  }

  if (!errors.isEmpty()) {
    const { cars, currentPage, totalPages } = await paginateCars({}, {
      page: parsePage(req.body.page ?? req.query.page),
    });

    // ISO дати за placeholder в полетата (днес / утре по подразбиране)
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pickupDateISO =
      pickupDateOnly || today.toISOString().split('T')[0];
    const returnDateISO =
      returnDateOnly || tomorrow.toISOString().split('T')[0];

    const message = errors.array()[0].msg; // едно ясно съобщение за потребителя
    const criteria = parseCarFilterRaw(req.body);

    return res.status(422).render('index', {
      title: 'Search cars',
      cars,
      message, 
      pickupDateISO,
      returnDateISO,
      pickupDate: pickupDateOnly,
      returnDate: returnDateOnly,
      pickupTime: pickupTimeInput,
      returnTime: returnTimeInput,
      pickupLocation: req.body['pickup-location'],
      returnLocation: req.body['return-location'],
      currentPage,
      totalPages,
      category: criteria.category || '',
      filters: filtersViewModel(criteria, req.body),
    });
  }

  const {
    'pickup-time': pickupTime,
    'return-time': returnTime,
    'pickup-location': pickupLoc,
    'return-location': returnLoc,
    transmission,
    fuelType,
    priceMin,
    priceMax,
    seatsMin,
    seatsMax,
    category,
  } = req.body;

  const pickupDate = startDate;
  const returnDate = endDate;

  const sessionId = getSessionId(req);

  const reservationQuery = {
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    holdExpiresAt: { $gt: new Date() },
    pickupDate: { $lt: returnDate },
    returnDate: { $gt: pickupDate },
  };

  if (sessionId) {
    reservationQuery.sessionId = { $ne: sessionId };
  }

  const activeReservations = await Reservation.find(reservationQuery).select('carId');
  const blockedCarIds = activeReservations.map((r) => r.carId);

  const criteria = parseCarFilterRaw({
    category,
    transmission,
    fuelType,
    seatsMin,
    seatsMax,
    priceMin,
    priceMax,
  });

  const match = {
    availability: true,
    _id: blockedCarIds.length > 0 ? { $nin: blockedCarIds } : { $exists: true },
    dates: {
      $not: {
        $elemMatch: {
          startDate: { $lte: returnDate },
          endDate: { $gte: pickupDate },
        },
      },
    },
  };

  applyCarCriteriaToMongoMatch(match, criteria, rentalDays);
  

  const { cars: carsForPage, currentPage, totalPages } = await paginateCars(match, {
    page: parsePage(req.body.page),
    lean: true,
    sort: null,
  });
  let pageCars = carsForPage.map((car) => {
    const p = computeBookingPrice(car, pickupDate, returnDate, pickupLoc, returnLoc);
    return { ...car, ...p };
  });
  pageCars = filterCarsByComputedUnitPrice(pageCars, criteria);

  const sharedRentalDays = pageCars[0]?.rentalDays || rentalDays || 0;
  const sharedDeliveryPrice = pageCars[0]?.deliveryPrice || 0;
  const sharedReturnPrice = pageCars[0]?.returnPrice || 0;

  res.render('searchResults', {
    title: 'Search Results',
    pickupLocation: pickupLoc,
    returnLocation: returnLoc,
    pickupDate: pickupDateOnly,
    returnDate: returnDateOnly,
    rentalDays: sharedRentalDays,
    pickupTime,
    returnTime,
    deliveryPrice: sharedDeliveryPrice,
    returnPrice: sharedReturnPrice,
    cars: pageCars,
    currentPage,
    totalPages,
    filters: filtersViewModel(criteria, {
      priceMin,
      priceMax,
      seatsMin,
      seatsMax,
    }),
    category: criteria.category || '',
  });
});