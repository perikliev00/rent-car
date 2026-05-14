// =============================================================================
// availableCars.js – контролер за търсене на налични коли (POST /search)
// =============================================================================

// Модел за кола в MongoDB
const Car = require('../models/Car');
// Връща грешките от express-validator за формата
const { validationResult } = require('express-validator');
// Модел за резервации – за да намерим кои коли са заети в избрания период
const Reservation = require('../models/Reservation');
// Изчислява цена: дневна, доставка, връщане, обща
const { computeBookingPrice } = require('../utils/pricing');
const {
  parseCarFilterRaw,
  applyCarCriteriaToMongoMatch,
  filterCarsByComputedUnitPrice,
  filtersViewModel,
} = require('../utils/carFilters');
// Активни статуси на резервация + функция за session ID (да изключим собствените резервации)
const { ACTIVE_RESERVATION_STATUSES, getSessionId } = require('../utils/reservationHelpers');
// Валидира дати и времена за наемане (не в миналото, return след pickup и т.н.)
const { validateBookingDates } = require('../utils/bookingValidation');

// Милисекунди в един ден – за изчисление на броя дни на наем
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------
// Контролер: POST /search (резултати от търсене)
// ---------------------------------------------
exports.postSearchCars = async (req, res, next) => {
  // Събираме всички валидационни грешки от формата
  let errors = validationResult(req);
  // Текущ момент – за проверка дали дата/час са в миналото
  const now = new Date();
  // Начало на днес (00:00) – за сравнение „днес“
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 today

  // Сурови стойности от формата – само дати (YYYY-MM-DD) и времена
  const pickupDateOnly = req.body['pickup-date'];
  const returnDateOnly = req.body['return-date'];
  const pickupTimeInput = req.body['pickup-time'];
  const returnTimeInput = req.body['return-time'];

  // Валидация на дати и времена: връща дали е валидно, списък грешки и нормализирани startDate/endDate
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

  // Ако датите не са валидни – добавяме грешките към общия списък
  if (!isValid) {
    bookingErrors.forEach((msg) => {
      errors.errors.push({ msg });
    });
  }

  // Проверка: ако вземането е ДНЕС, часът трябва да е в бъдещето (не в миналото)
  try {
    const pickupDateInput = new Date(pickupDateOnly);
    pickupDateInput.setHours(0, 0, 0, 0); // нормализираме до полунощ за сравнение

    // Само когато избраната дата е днес и има въведен час
    if (pickupDateInput.getTime() === today.getTime() && pickupTimeInput) {
      const [ph, pm] = String(pickupTimeInput).split(':').map(Number);
      const pickupMinutes = (ph || 0) * 60 + (pm || 0);   // час за вземане в минути от полунощ
      const nowMinutes = now.getHours() * 60 + now.getMinutes(); // текущо време в минути
      if (pickupMinutes <= nowMinutes) {
        errors.errors.push({
          msg: 'Pick-up time must be later than the current time today',
        });
      }
    }
  } catch (_) {
    // При грешка при парсване – игнорираме; express-validator ще хване празни/невалидни полета
  }

  // Ако има грешки – не правим търсене в БД, а връщаме началната страница с едно съобщение и запазени стойности
  if (!errors.isEmpty()) {
    // Пагинация както на началната страница
    const page = Math.max(1, parseInt(req.body.page || req.query.page || '1', 10));
    const perPage = 3; // също като home страницата

    const totalCars = await Car.countDocuments({});
    const totalPages = Math.max(1, Math.ceil(totalCars / perPage));
    const cars = await Car.find({})
      .sort({ name: 1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    // ISO дати за placeholder в полетата (днес / утре по подразбиране)
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pickupDateISO =
      pickupDateOnly || today.toISOString().split('T')[0];
    const returnDateISO =
      returnDateOnly || tomorrow.toISOString().split('T')[0];

    const message = errors.array()[0].msg; // едно ясно съобщение за потребителя

    return res.status(422).render('index', {
      title: 'Search cars',
      cars,
      message, // името съвпада с проверката в EJS
      pickupDateISO,
      returnDateISO,
      pickupDate: pickupDateOnly,
      returnDate: returnDateOnly,
      pickupTime: pickupTimeInput,
      returnTime: returnTimeInput,
      pickupLocation: req.body['pickup-location'],
      returnLocation: req.body['return-location'],
      currentPage: page,
      totalPages: totalPages,
      category: '', // при грешка няма категория
      filters: {
        transmission: '',
        fuelType: '',
        seatsMin: '',
        seatsMax: '',
        priceMin: '',
        priceMax: '',
      }
    });
  }

  // Няма грешки – продължаваме с търсенето в БД
  try {
    /* 1. Извличаме и валидираме данните от формата */
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

    // Използваме вече валидираните дати от validateBookingDates
    const pickupDate = startDate;
    const returnDate = endDate;

    /* 2. Брой дни на наем + проверка за валидни дати */
    if (!pickupDate || !returnDate || Number.isNaN(pickupDate.getTime()) || Number.isNaN(returnDate.getTime()))
      return res.status(400).send('Invalid pick-up or return date / time.');

    // Session ID – за да не считаме собствените резервации на потребителя като „заети“
    const sessionId = getSessionId(req);

    // Критерий за активни резервации: активен статус, hold не е изтекъл, периодът се застъпва с търсения
    const reservationQuery = {
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      holdExpiresAt: { $gt: new Date() },
      pickupDate: { $lt: returnDate },
      returnDate: { $gt: pickupDate },
    };

    // Изключваме резервациите на текущия потребител (по sessionId)
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

    // Брой дни на наем (най-малко 1) – за изчисление на цена и избор на ценов тиър
    const rentalDays = Math.max(
      1,
      Math.ceil((returnDate.getTime() - pickupDate.getTime()) / MS_PER_DAY)
    );

    /* 3. MongoDB match: налични коли, изключване на блокирани, период dates, + филтри от формата */
    const match = {
      availability: true,
      // Колите с _id в blockedCarIds са заети – изключваме ги
      _id: blockedCarIds.length > 0 ? { $nin: blockedCarIds } : { $exists: true },
      // Колата да няма запис в dates с период, който се застъпва с [pickupDate, returnDate]
      dates: {
        $not: {
          $elemMatch: {
            startDate: { $lte: returnDate },
            endDate: { $gte: pickupDate }
          }
        }
      }
    };

    applyCarCriteriaToMongoMatch(match, criteria, rentalDays);

    /* 4. Пагинация в БД: взимаме само текущата страница и общия брой */
    const toInt = (v, fallback) => {
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

    const perPage = 3;
    const requestedPage = toInt(req.body.page, 1);
    const currentPage = clamp(requestedPage, 1, 999999);
    const skip = (currentPage - 1) * perPage;

    const [carsForPage, totalCount] = await Promise.all([
      Car.find(match).lean().skip(skip).limit(perPage),
      Car.countDocuments(match)
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    /* 5. Изчисляваме цена само за колите на текущата страница */
    let pageCars = carsForPage.map((car) => {
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
        unitPrice: pricing.unitPrice ?? pricing.dayPrice
      };
    });

    pageCars = filterCarsByComputedUnitPrice(pageCars, criteria);

    // Общи стойности за шаблона (при еднакви дати/локации са еднакви за всички коли на страницата)
    const sharedRentalDays = pageCars[0]?.rentalDays || 0;
    const sharedDeliveryPrice = pageCars[0]?.deliveryPrice || 0;
    const sharedReturnPrice = pageCars[0]?.returnPrice || 0;

    /* 6. Рендваме страницата с резултати */
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
  } catch (err) {
    console.error(err);
    err.publicMessage = 'Error searching for cars.';
    return next(err);
  }
};
