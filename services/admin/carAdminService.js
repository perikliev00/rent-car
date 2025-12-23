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
  const base = existingCar
    ? {
        _id: existingCar._id,
        image: existingCar.image,
        price: existingCar.price,
      }
    : {};

  return {
    ...base,
    name: body.name || (existingCar ? existingCar.name : ''),
    transmission:
      body.transmission || (existingCar ? existingCar.transmission : ''),
    seats: body.seats || (existingCar ? existingCar.seats : ''),
    fuelType: body.fuelType || (existingCar ? existingCar.fuelType : ''),
    availability:
      body.availability !== undefined
        ? body.availability === 'on'
        : existingCar
        ? existingCar.availability
        : true,
    priceTier_1_3:
      body.priceTier_1_3 !== undefined && body.priceTier_1_3 !== ''
        ? body.priceTier_1_3
        : existingCar && existingCar.priceTier_1_3 !== undefined
        ? existingCar.priceTier_1_3
        : undefined,
    priceTier_7_31:
      body.priceTier_7_31 !== undefined && body.priceTier_7_31 !== ''
        ? body.priceTier_7_31
        : existingCar && existingCar.priceTier_7_31 !== undefined
        ? existingCar.priceTier_7_31
        : undefined,
    priceTier_31_plus:
      body.priceTier_31_plus !== undefined && body.priceTier_31_plus !== ''
        ? body.priceTier_31_plus
        : existingCar && existingCar.priceTier_31_plus !== undefined
        ? existingCar.priceTier_31_plus
        : undefined,
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

