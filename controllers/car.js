const Car = require('../models/Car');
const mongoose = require('mongoose');
const { formatDateForDisplay } = require('../utils/dateFormatter');

// ---------------------------------------------
// Controller: GET /  (home page)
// ---------------------------------------------
exports.getHome = async (req, res, next) => {
  try {
    // 1. Fetch all cars
    const cars = await Car.find();

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
      pickupTime,
      returnTime,
      rentalDays
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching cars');
  }
};

// ---------------------------------------------
// Controller: POST /search  (search results)
// ---------------------------------------------
exports.postSearchCars = async (req, res) => {
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
    // Build ISO strings
    const pickupISO = `${pickupDateOnly}T${pickupTime || '00:00'}:00Z`;
    const returnISO = `${returnDateOnly}T${returnTime || '23:59'}:00Z`;

    const pickupDate = new Date(pickupISO);
    const returnDate = new Date(returnISO);

    /* 2. Rental day count */
    const MS_PER_DAY = 86_400_000;
    const rentalDays = Math.max(1, Math.ceil((returnDate - pickupDate) / MS_PER_DAY));

    // Basic validation
    if (isNaN(pickupDate) || isNaN(returnDate))
      return res.status(400).send('Invalid pick‑up or return date / time.');

    if (pickupDate > returnDate)
      return res.status(400).send('Pick‑up must be before return.');

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

    /* 4. Query DB and de‑duplicate by car name */
    const cars = await Car.aggregate([
      { $match: match },
      { $group: { _id: '$name', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } }
    ]);

    // 5. Attach total price per car
    cars.forEach(car => {
      car.totalPrice = car.price * rentalDays+ deliveryPrice + returnPrice;
    });

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
      cars
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error searching for cars');
  }
};