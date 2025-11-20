const { formatDateForDisplay, formatLocationName } = require('../utils/dateFormatter');

function buildOrderPageViewModel(car, formData, message, options = {}) {
  const pickupDateISO = formData.pickupDate;
  const returnDateISO = formData.returnDate;
  const pickupDateDisplay = formatDateForDisplay(formData.pickupDate);
  const returnDateDisplay = formatDateForDisplay(formData.returnDate);
  const pickupLocationDisplay = formatLocationName(formData.pickupLocation);
  const returnLocationDisplay = formatLocationName(formData.returnLocation);
  const releaseRedirect =
    options.releaseRedirect || formData.releaseRedirect || formData.currentUrl || '';

  return {
    title: 'Order Car',
    car,
    message,
    pickupDate: pickupDateDisplay,
    pickupTime: formData.pickupTime,
    returnDate: returnDateDisplay,
    returnTime: formData.returnTime,
    pickupLocation: formData.pickupLocation,
    returnLocation: formData.returnLocation,
    pickupLocationDisplay,
    returnLocationDisplay,
    pickupDateISO,
    returnDateISO,
    rentalDays: options.rentalDays ?? formData.rentalDays,
    deliveryPrice: options.deliveryPrice ?? formData.deliveryPrice,
    returnPrice: options.returnPrice ?? formData.returnPrice,
    totalPrice: options.totalPrice ?? formData.totalPrice,
    fullName: formData.fullName,
    phoneNumber: formData.phoneNumber,
    email: formData.email,
    address: formData.address,
    hotelName: formData.hotelName,
    existingReservation: options.existingReservation || null,
    releaseRedirect,
  };
}

function normalizeContactDetails(formData = {}) {
  return {
    fullName: (formData.fullName || '').trim(),
    phoneNumber: (formData.phoneNumber || '').trim(),
    email: (formData.email || '').trim(),
    address: (formData.address || '').trim(),
    hotelName: (formData.hotelName || '').trim(),
  };
}

module.exports = {
  buildOrderPageViewModel,
  normalizeContactDetails,
};

