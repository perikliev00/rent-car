const Car = require('../../models/Car');

function parsePriceTier(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function deriveBasePrice({ tierShort, tierMedium, tierLong }) {
  if (tierShort !== undefined) return tierShort;
  if (tierMedium !== undefined) return tierMedium;
  if (tierLong !== undefined) return tierLong;
  return undefined;
}

function buildImagePath(file, fallback = '') {
  return file ? `/images/${file.filename}` : fallback;
}

function buildCarFormState(body = {}, existingCar = null) {
  const car = existingCar ?? {};

  // Use body value if it exists (including 0), and is not an empty string.
  const pick = (key, fallback = '') => {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== '') {
      return body[key];
    }
    if (existingCar && car[key] !== undefined) {
      return car[key];
    }
    return fallback;
  };

  // Checkbox: if body has the field, it means the form was submitted.
  // HTML checkbox sends 'on' when checked, and sends nothing when unchecked.
  const pickAvailability = () => {
    if (Object.prototype.hasOwnProperty.call(body, 'availability')) {
      return body.availability === 'on';
    }
    if (existingCar) return !!car.availability;
    return true;
  };

  const pickTier = (key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key] === '' ? undefined : body[key];
    }
    if (existingCar && car[key] !== undefined) return car[key];
    return undefined;
  };

  const base = existingCar
    ? { _id: car._id, image: car.image, price: car.price }
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

async function listCars() {
  return Car.find().sort({ name: 1 });
}

async function getCarById(id) {
  return Car.findById(id);
}

async function createCar(payload, file) {
  const tierShort = parsePriceTier(payload.priceTier_1_3);
  const tierMedium = parsePriceTier(payload.priceTier_7_31);
  const tierLong = parsePriceTier(payload.priceTier_31_plus);

  const derivedBase = deriveBasePrice({
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
    image: buildImagePath(file),
    availability: true,
  });
}

async function updateCar(id, payload, file) {
  const tierShort = parsePriceTier(payload.priceTier_1_3);
  const tierMedium = parsePriceTier(payload.priceTier_7_31);
  const tierLong = parsePriceTier(payload.priceTier_31_plus);

  const derivedBase = deriveBasePrice({
    tierShort,
    tierMedium,
    tierLong,
  });

  // Fetch existing car to preserve price if no tiers provided
  const existingCar = await Car.findById(id);
  if (!existingCar) {
    throw new Error('Car not found');
  }

  const update = {
    name: payload.name,
    transmission: payload.transmission,
    seats: payload.seats,
    fuelType: payload.fuelType,
    // Use derived price, or fallback to existing price if undefined
    price: derivedBase !== undefined ? derivedBase : existingCar.price,
    priceTier_1_3: tierShort,
    priceTier_7_31: tierMedium,
    priceTier_31_plus: tierLong,
    availability: payload.availability === 'on',
  };

  if (file) {
    update.image = buildImagePath(file);
  }

  await Car.findByIdAndUpdate(id, update);
}

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

