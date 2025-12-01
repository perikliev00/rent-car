const Car = require('../models/Car');
const { validationResult } = require('express-validator');
const Reservation = require('../models/Reservation');
const { computeBookingPrice } = require('../utils/pricing');
const { ACTIVE_RESERVATION_STATUSES, getSessionId } = require('../utils/reservationHelpers');
const { validateBookingDates } = require('../utils/bookingValidation');
// ---------------------------------------------
// Controller: POST /search  (search results)
// ---------------------------------------------
exports.postSearchCars = async (req, res, next) => {
  let errors = validationResult(req);
  // Check if pick-up or return date is in the past – allow today
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

  // ── Time-in-past check for today ──
  try {
    const pickupDateInput = new Date(pickupDateOnly);
    pickupDateInput.setHours(0, 0, 0, 0); // normalise to midnight

    if (pickupDateInput.getTime() === today.getTime() && pickupTimeInput) {
      const [ph, pm] = String(pickupTimeInput).split(':').map(Number);
      const pickupMinutes = (ph || 0) * 60 + (pm || 0);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (pickupMinutes <= nowMinutes) {
        errors.errors.push({
          msg: 'Pick-up time must be later than the current time today',
        });
      }
    }
  } catch (_) {
    // ignore parse issues; express-validator will handle empty/invalid inputs
  }

  if (!errors.isEmpty()) {
    const cars = await Car.find();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pickupDateISO =
      pickupDateOnly || today.toISOString().split('T')[0];
    const returnDateISO =
      returnDateOnly || tomorrow.toISOString().split('T')[0];

    const message = errors.array()[0].msg; // ✅ one, clear message

    return res.status(422).render('index', {
      title: 'Search cars',
      cars,
      message, // ← name matches the EJS check
      pickupDateISO,
      returnDateISO,
      pickupDate: pickupDateOnly,
      returnDate: returnDateOnly,
      pickupTime: pickupTimeInput,
      returnTime: returnTimeInput,
      pickupLocation: req.body['pickup-location'],
      returnLocation: req.body['return-location'],
    });
  }
  
  try {
    /* 1. Pull & validate form data */
    const {
      'pickup-time': pickupTime,
      'return-time': returnTime,
      'pickup-location': pickupLoc,
      'return-location': returnLoc
    } = req.body;

    const pickupDate = startDate;
    const returnDate = endDate;

    /* 2. Rental day count */
    // Basic validation
    if (!pickupDate || !returnDate || Number.isNaN(pickupDate.getTime()) || Number.isNaN(returnDate.getTime()))
      return res.status(400).send('Invalid pick-up or return date / time.');

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

    console.log(
      "--------------------------------"
    )
    console.log('Blocked car IDs:', activeReservations.map(r => r.carId.toString()));
    console.log(
      "--------------------------------"
    )

    /* 3. MongoDB match query: keep cars whose booked ranges DO NOT overlap */
    const match = {
      availability: true,
      dates: {
        $not: {
          $elemMatch: {
            startDate: { $lte: returnDate },
            endDate: { $gte: pickupDate }
          }
        }
      }
    };

    /* 4. Query DB: return all matching cars (no grouping by name) */
    const cars = await Car.find(match).lean();

    console.log(`✅ Cars before filtering by blocked list: ${cars.length}`);

    const blockedSet = new Set(activeReservations.map(r => String(r.carId)));
    const filteredCars = cars.filter(car => {
      const isBlocked = blockedSet.has(String(car._id));
      if (isBlocked) {
        console.log(`❌ Skipping blocked car ${car._id}`);
      }
      return !isBlocked;
    });

    console.log(`✅ Cars after filtering: ${filteredCars.length}`);

    const previewCars = filteredCars.map((car) => {
      const pricing = computeBookingPrice(
        car,
        pickupDate,
        returnDate,
        pickupLoc,
        returnLoc
      );

      return {
        ...car,
        _id: car._id.toString(),
        rentalDays: pricing.rentalDays,
        deliveryPrice: pricing.deliveryPrice,
        returnPrice: pricing.returnPrice,
        totalPrice: pricing.totalPrice,
        unitPrice: pricing.unitPrice ?? pricing.dayPrice,
      };
    });

    console.log('💰 Final cars:', previewCars.map(c => ({ id: c._id, total: c.totalPrice })));

    const sharedRentalDays = previewCars[0]?.rentalDays || 0;
    const sharedDeliveryPrice = previewCars[0]?.deliveryPrice || 0;
    const sharedReturnPrice = previewCars[0]?.returnPrice || 0;

    /* 6. Render */
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
      cars: previewCars,
    });
  } catch (err) {
    console.error(err);
    err.publicMessage = 'Error searching for cars.';
    return next(err);
  }
}
