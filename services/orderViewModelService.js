/**
 * Build the base booking-related payload for the order page.
 * This focuses on dates, locations, and pricing; no contact data here.
 */
function buildBaseOrderPayload({
  pickupDateISO,
  returnDateISO,
  pickupTime,
  returnTime,
  pickupLocation,
  returnLocation,
  pickupDateDisplay,
  returnDateDisplay,
  pickupLocationDisplay,
  returnLocationDisplay,
  pricing,
  releaseRedirect,
}) {
  return {
    pickupDateISO,
    returnDateISO,
    pickupTime,
    returnTime,
    pickupLocation,
    returnLocation,
    pickupDateDisplay,
    returnDateDisplay,
    pickupLocationDisplay,
    returnLocationDisplay,
    rentalDays: pricing.rentalDays,
    deliveryPrice: pricing.deliveryPrice,
    returnPrice: pricing.returnPrice,
    totalPrice: pricing.totalPrice,
    releaseRedirect,
  };
}

/**
 * Build the full view model for the order page.
 *
 * Inputs:
 * - car: Car document
 * - basePayload: result of buildBaseOrderPayload(...)
 * - options:
 *    - contact: optional object with fullName, phoneNumber, email, address, hotelName
 *    - existingReservation: optional existing reservation summary
 *    - message: optional message string
 *    - title: optional custom title (defaults to 'Order Car')
 */
function buildOrderViewModel(car, basePayload, options = {}) {
  const {
    contact = {},
    existingReservation = null,
    message = null,
    title = 'Order Car',
  } = options;

  return {
    title,
    car,
    pickupDate: basePayload.pickupDateDisplay,
    pickupTime: basePayload.pickupTime || '',
    returnDate: basePayload.returnDateDisplay,
    returnTime: basePayload.returnTime || '',
    pickupLocation: basePayload.pickupLocation,
    returnLocation: basePayload.returnLocation,
    pickupLocationDisplay: basePayload.pickupLocationDisplay,
    returnLocationDisplay: basePayload.returnLocationDisplay,
    pickupDateISO: basePayload.pickupDateISO,
    returnDateISO: basePayload.returnDateISO,
    rentalDays: basePayload.rentalDays,
    deliveryPrice: basePayload.deliveryPrice,
    returnPrice: basePayload.returnPrice,
    totalPrice: basePayload.totalPrice,
    fullName: contact.fullName || '',
    phoneNumber: contact.phoneNumber || '',
    email: contact.email || '',
    address: contact.address || '',
    hotelName: contact.hotelName || '',
    existingReservation,
    releaseRedirect: basePayload.releaseRedirect,
    message,
  };
}

module.exports = {
  buildBaseOrderPayload,
  buildOrderViewModel,
};



