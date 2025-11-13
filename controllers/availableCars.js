const Car = require('../models/Car');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Reservation = require('../models/Reservation');
const { parseSofiaDate } = require('../utils/timeZone');
// ---------------------------------------------
// Controller: POST /search  (search results)
// ---------------------------------------------
exports.postSearchCars = async (req, res) => {
  let errors = validationResult(req);
  // Check if pick-up or return date is in the past – allow today
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 today

  const pickupDateInput = new Date(req.body['pickup-date']);
  const returnDateInput = new Date(req.body['return-date']);
  const pickupTimeInput = req.body['pickup-time'];
  const returnTimeInput = req.body['return-time'];
  pickupDateInput.setHours(0, 0, 0, 0);   // normalise to midnight
  returnDateInput.setHours(0, 0, 0, 0);

  // ── Past-date checks ──
  if (pickupDateInput < today)
    errors.errors.push({ msg: 'Pick-up date can’t be in the past' });
  if (returnDateInput < today)
    errors.errors.push({ msg: 'Return date can’t be in the past' });

  // ── Logical order check ──
  if (pickupDateInput > returnDateInput)
    errors.errors.push({ msg: 'Return date must be after pick-up date' });

  // ── Time-in-past check for today ──
  try {
    if (pickupDateInput.getTime() === today.getTime() && pickupTimeInput) {
      const [ph, pm] = String(pickupTimeInput).split(':').map(Number);
      const pickupMinutes = (ph || 0) * 60 + (pm || 0);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (pickupMinutes <= nowMinutes) {
        errors.errors.push({ msg: 'Pick-up time must be later than the current time today' });
      }
    }
  } catch (_) {
    // ignore parse issues; express-validator will handle empty/invalid inputs
  }
  if (!errors.isEmpty()) {
    const cars = await Car.find();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pickupDateISO = (req.body['pickup-date'] || today.toISOString().split('T')[0]);
    const returnDateISO = (req.body['return-date'] || tomorrow.toISOString().split('T')[0]);

    const message = errors.array()[0].msg;   // ✅ one, clear message
  
    return res.status(422).render('index', {
      title: 'Search cars',
      cars,
      message,                               // ← name matches the EJS check
      pickupDateISO,
      returnDateISO,
      pickupDate : req.body['pickup-date'],
      returnDate : req.body['return-date'],
      pickupTime : req.body['pickup-time'],
      returnTime : req.body['return-time'],
      pickupLocation : req.body['pickup-location'],
      returnLocation : req.body['return-location'],
    });
  }
  
  try {
    /* 1. Pull & validate form data */
    const {
      'pickup-date': pickupDateOnly,
      'pickup-time': pickupTime,
      'return-date': returnDateOnly,
      'return-time': returnTime,
      'pickup-location': pickupLoc,
      'return-location': returnLoc
    } = req.body;

    // Delivery and return prices 
    const deliveryReturnPrices = {
      'office': 0,
      'sunny-beach': 25,
      'sveti-vlas': 30,
      'nesebar': 30,
      'burgas': 40,
      'burgas-airport': 50,
      'sofia': 100,
      'sofia-airport': 120,
      'varna': 80,
      'varna-airport': 90,
      'plovdiv': 70,
      'eleni': 35,
      'ravda': 20
    };

    let deliveryPrice = 0;
    let returnPrice = 0;
    
    // calculate delivery and return prices based on pickup and return locations

    if (pickupLoc === 'office') {
      deliveryPrice = deliveryReturnPrices['office'];
  } else if (pickupLoc === 'sunny-beach') {
      deliveryPrice = deliveryReturnPrices['sunny-beach'];
  } else if (pickupLoc === 'sveti-vlas') {
      deliveryPrice = deliveryReturnPrices['sveti-vlas'];
  } else if (pickupLoc === 'nesebar') {
      deliveryPrice = deliveryReturnPrices['nesebar'];
  } else if (pickupLoc === 'burgas') {
      deliveryPrice = deliveryReturnPrices['burgas'];
  } else if (pickupLoc === 'burgas-airport') {
      deliveryPrice = deliveryReturnPrices['burgas-airport'];
  } else if (pickupLoc === 'sofia') {
      deliveryPrice = deliveryReturnPrices['sofia'];
  } else if (pickupLoc === 'sofia-airport') {
      deliveryPrice = deliveryReturnPrices['sofia-airport'];
  } else if (pickupLoc === 'varna') {
      deliveryPrice = deliveryReturnPrices['varna'];
  } else if (pickupLoc === 'varna-airport') {
      deliveryPrice = deliveryReturnPrices['varna-airport'];
  } else if (pickupLoc === 'plovdiv') {
      deliveryPrice = deliveryReturnPrices['plovdiv'];
  } else if (pickupLoc === 'eleni') {
      deliveryPrice = deliveryReturnPrices['eleni'];
  } else if (pickupLoc === 'ravda') {
      deliveryPrice = deliveryReturnPrices['ravda'];
  }
  
  if (returnLoc === 'office') {
      returnPrice = deliveryReturnPrices['office'];
  } else if (returnLoc === 'sunny-beach') {
      returnPrice = deliveryReturnPrices['sunny-beach'];
  } else if (returnLoc === 'sveti-vlas') {
      returnPrice = deliveryReturnPrices['sveti-vlas'];
  } else if (returnLoc === 'nesebar') {
      returnPrice = deliveryReturnPrices['nesebar'];
  } else if (returnLoc === 'burgas') {
      returnPrice = deliveryReturnPrices['burgas'];
  } else if (returnLoc === 'burgas-airport') {
      returnPrice = deliveryReturnPrices['burgas-airport'];
  } else if (returnLoc === 'sofia') {
      returnPrice = deliveryReturnPrices['sofia'];
  } else if (returnLoc === 'sofia-airport') {
      returnPrice = deliveryReturnPrices['sofia-airport'];
  } else if (returnLoc === 'varna') {
      returnPrice = deliveryReturnPrices['varna'];
  } else if (returnLoc === 'varna-airport') {
      returnPrice = deliveryReturnPrices['varna-airport'];
  } else if (returnLoc === 'plovdiv') {
      returnPrice = deliveryReturnPrices['plovdiv'];
  } else if (returnLoc === 'eleni') {
      returnPrice = deliveryReturnPrices['eleni'];
  } else if (returnLoc === 'ravda') {
      returnPrice = deliveryReturnPrices['ravda'];
  }
    const pickupDate = parseSofiaDate(pickupDateOnly, pickupTime || '00:00');
    const returnDate = parseSofiaDate(returnDateOnly, returnTime || '23:59');

    /* 2. Rental day count */
    const MS_PER_DAY = 86_400_000;
    const rentalDays = Math.max(1, Math.floor((returnDate - pickupDate) / MS_PER_DAY));



    // Basic validation
    if (!pickupDate || !returnDate || Number.isNaN(pickupDate.getTime()) || Number.isNaN(returnDate.getTime()))
      return res.status(400).send('Invalid pick-up or return date / time.');

    const currentSid = req.session?._sid;

    // 🔥 Find all overlapping reservations (mode: "in process") with different sessionId
    const overlappingReservations = await Reservation.find({
      mode: "in process",
      sessionId: { $ne: currentSid },
      // overlap condition: (pickupDate <= res.returnDate) && (returnDate >= res.pickupDate)
      $expr: {
        $and: [
          {
            $lte: [
              {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      "$pickupDate",
                      "T",
                      { $ifNull: ["$pickupTime", "00:00"] },
                      ":00"
                    ]
                  },
                  timezone: "Europe/Sofia"
                }
              },
              returnDate
            ]
          },
          {
            $gte: [
              {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      "$returnDate",
                      "T",
                      { $ifNull: ["$returnTime", "23:59"] },
                      ":00"
                    ]
                  },
                  timezone: "Europe/Sofia"
                }
              },
              pickupDate
            ]
          }
        ]
      }
    }).select('carId');

    // 🧠 Extract just carIds into array
    const blockedCarIds = overlappingReservations.map(r => r.carId.toString());

    console.log(
      "--------------------------------"
    )
    console.log('Blocked car IDs:', blockedCarIds);   // (already in your code)
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

    // NEW: log pre-filter count
    console.log(`✅ Cars before filtering by blocked list: ${cars.length}`);  // NEW

    // NEW: simple filter by blocked IDs (keep your style)
    const blockedSet = new Set(blockedCarIds.map(String));                   // NEW
    const filteredCars = cars.filter(car => {                                 // NEW
      const isBlocked = blockedSet.has(String(car._id));                      // NEW
      if (isBlocked) {                                                        // NEW
        console.log(`❌ Skipping blocked car ${car._id}`);                    // NEW
      }                                                                       // NEW
      return !isBlocked;                                                      // NEW
    });                                                                        // NEW

    // NEW: log post-filter count
    console.log(`✅ Cars after filtering: ${filteredCars.length}`);            // NEW

    // 5. Attach total price per car
    filteredCars.forEach(car => {                                            // UPDATED: iterate filteredCars
      if(rentalDays > 1 && rentalDays <= 3) {
        car.price = car.price * 0.9; // 10% discount for rentals longer than 1 day
      }
      else if (rentalDays > 3 && rentalDays <= 7) {
        car.price = car.price * 0.85; // 15% discount for rentals longer than 3 days
      } else if (rentalDays > 7) {
        car.price = car.price * 0.8; // 20% discount for rentals longer than 7 days
      } else if (rentalDays > 14 && rentalDays <= 30) {
        car.price = car.price * 0.75; // 25% discount for rentals longer than 14 days
      } else if (rentalDays > 30) {
        car.price = car.price * 0.7; // 30% discount for rentals longer than 30 days
      }

      car.totalPrice = car.price * rentalDays+ deliveryPrice + returnPrice;
      car._id = car._id.toString(); // Convert ObjectId to string for easier handling in templates
    });

    // NEW: show final ids + totals
    console.log('💰 Final cars:', filteredCars.map(c => ({ id: c._id, total: c.totalPrice }))); // NEW

    /* 6. Render */
    res.render('searchResults', {
      title: 'Search Results',
      pickupLocation: pickupLoc,
      returnLocation: returnLoc,
      pickupDate: pickupDateOnly,
      returnDate: returnDateOnly,
      rentalDays,
      pickupTime,
      returnTime,
      deliveryPrice,
      returnPrice,
      cars: filteredCars                                                   // UPDATED: pass filteredCars
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error searching for cars');
  }
}
