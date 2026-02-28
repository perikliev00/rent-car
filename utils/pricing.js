const { feeFor } = require('./fees');

const MS_PER_DAY = 86_400_000;

function computeRentalDays(start, end) {
  if (!start || !end || !(start instanceof Date) || !(end instanceof Date)) return 0;
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

function computeDayPrice(car, rentalDays) {
  if (!car) return 0;

  const t1 = car.priceTier_1_3;
  const t7 = car.priceTier_7_31;
  const t31 = car.priceTier_31_plus;

  // Use tiered prices if present
  if (t1 || t7 || t31) {
    if (rentalDays <= 3 && t1) return t1;
    if (rentalDays <= 31 && t7) return t7;
    if (rentalDays > 31 && t31) return t31;
    return car.price || 0;
  }

  // Otherwise base price + discounts

  return car.price || 0;
}

function computeBookingPrice(car, start, end, pickupLocation, returnLocation) {
  const rentalDays = computeRentalDays(start, end);
  const dayPrice = computeDayPrice(car, rentalDays);

  const deliveryPrice = feeFor(pickupLocation);
  const returnPrice   = feeFor(returnLocation);

  const total = Number(((dayPrice * rentalDays) + deliveryPrice + returnPrice).toFixed(2));

  return {
    rentalDays,
    deliveryPrice,
    returnPrice,
    totalPrice: total,
    dayPrice,
    unitPrice: dayPrice,
  };
}

module.exports = { computeBookingPrice };


