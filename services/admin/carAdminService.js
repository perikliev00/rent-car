// Car model – admin fleet CRUD операции.
const Car = require('../../models/Car');

// Парсва tier цена от HTML форма – float или undefined при празно/невалидно.
function parsePriceTier(value) {
  if (value === undefined || value === null || value === '') return undefined;  // Празно → undefined.
  const parsed = parseFloat(value);                                              // Опит за парсване.
  return Number.isNaN(parsed) ? undefined : parsed;                              // NaN → undefined.
}

// Извлича legacy base price от първия наличен tier (short, medium, long).
function deriveBasePrice({ tierShort, tierMedium, tierLong }) {
  if (tierShort !== undefined) return tierShort;    // Приоритет 1–3 дни.
  if (tierMedium !== undefined) return tierMedium;  // Приоритет 7–31 дни.
  if (tierLong !== undefined) return tierLong;      // Приоритет 31+ дни.
  return undefined;                                 // Всички празни.
}

// Създава public image path от Multer file; при липса – fallback.
function buildImagePath(file, fallback = '') {
  return file ? `/images/${file.filename}` : fallback;  // /images/car-xxx.jpg или празен низ.
}

// Възстановява car form state след validation грешки – за re-render.
function buildCarFormState(body = {}, existingCar = null) {
  const car = existingCar ?? {};  // При edit – съществуваща кола; иначе празен обект.

  const pick = (key, fallback = '') => {  // Избира стойност: body > existing > fallback.
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== '') {
      return body[key];
    }
    if (existingCar && car[key] !== undefined) {
      return car[key];
    }
    return fallback;
  };

  const pickAvailability = () => {  // Checkbox: 'on' = true, липса = от existing.
    if (Object.prototype.hasOwnProperty.call(body, 'availability')) {
      return body.availability === 'on';
    }
    if (existingCar) return !!car.availability;
    return true;  // Default при create.
  };

  const pickTier = (key) => {  // Tier полета: празен низ → undefined.
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key] === '' ? undefined : body[key];
    }
    if (existingCar && car[key] !== undefined) return car[key];
    return undefined;
  };

  const base = existingCar
    ? { _id: car._id, image: car.image, price: car.price }  // При edit – immutable полета.
    : {};

  return {
    ...base,
    name: pick('name', ''),
    transmission: pick('transmission', ''),
    seats: pick('seats', ''),
    fuelType: pick('fuelType', ''),
    availability: pickAvailability(),
    priceTier_1_3: pickTier('priceTier_1_3'),
    priceTier_7_31: pickTier('priceTier_7_31'),
    priceTier_31_plus: pickTier('priceTier_31_plus'),
  };
}

// listCars – всички коли, сортирани по име.
async function listCars() {
  return Car.find().sort({ name: 1 });
}

// getCarById – една кола по ID за edit/delete.
async function getCarById(id) {
  return Car.findById(id);
}

// createCar – създава нова кола от admin форма и optional file.
async function createCar(payload, file) {
  const tierShort = parsePriceTier(payload.priceTier_1_3);   // Tier 1–3 дни.
  const tierMedium = parsePriceTier(payload.priceTier_7_31); // Tier 7–31 дни.
  const tierLong = parsePriceTier(payload.priceTier_31_plus);// Tier 31+ дни.

  const derivedBase = deriveBasePrice({  // Base price от първи наличен tier.
    tierShort,
    tierMedium,
    tierLong,
  });

  await Car.create({
    name: payload.name,
    transmission: payload.transmission,
    seats: payload.seats,
    fuelType: payload.fuelType,
    price: derivedBase,
    priceTier_1_3: tierShort,
    priceTier_7_31: tierMedium,
    priceTier_31_plus: tierLong,
    image: buildImagePath(file),  // /images/car-xxx.jpg или празен.
    availability: true,
  });
}

// updateCar – обновява съществуваща кола от admin форма.
async function updateCar(id, payload, file) {
  const tierShort = parsePriceTier(payload.priceTier_1_3);
  const tierMedium = parsePriceTier(payload.priceTier_7_31);
  const tierLong = parsePriceTier(payload.priceTier_31_plus);

  const derivedBase = deriveBasePrice({
    tierShort,
    tierMedium,
    tierLong,
  });

  const existingCar = await Car.findById(id);  // Запазване на price при празни tiers.
  if (!existingCar) {
    throw new Error('Car not found');
  }

  const update = {
    name: payload.name,
    transmission: payload.transmission,
    seats: payload.seats,
    fuelType: payload.fuelType,
    price: derivedBase !== undefined ? derivedBase : existingCar.price,  // Fallback към existing.
    priceTier_1_3: tierShort,
    priceTier_7_31: tierMedium,
    priceTier_31_plus: tierLong,
    availability: payload.availability === 'on',
  };

  if (file) {
    update.image = buildImagePath(file);  // Нова снимка само при upload.
  }

  await Car.findByIdAndUpdate(id, update);
}

// deleteCar – изтрива кола постоянно от БД.
async function deleteCar(id) {
  await Car.findByIdAndDelete(id);
}

module.exports = {
  listCars,
  getCarById,
  createCar,
  updateCar,
  deleteCar,
  buildCarFormState,
};
