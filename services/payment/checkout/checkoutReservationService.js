const { getSessionId, buildExistingReservationSummary } = require('../../../utils/reservationHelpers');
const { normalizeContactDetails } = require('../../paymentService');

const {
  findActiveReservationBySession,
  extendReservationHold,
  checkCarAvailabilityForRange,
  createPendingReservation,
} = require('../../reservationService');
const { buildRenderOrderPageResponse } = require('./checkoutResponseFactory');

async function resolveCheckoutReservation({ req, car, formData, startDate, endDate, pricing }) {
  const trimmedContact = normalizeContactDetails(formData);
  const sessionId = getSessionId(req);
  const now = new Date();

  let reservationDoc = await findActiveReservationBySession(req);
  if (reservationDoc) {
    await reservationDoc.populate('carId', 'name');
  }

  let createdReservationThisStep = false;

  if (reservationDoc) {
    const sameCar =
      String(reservationDoc.carId?._id || reservationDoc.carId) === String(car._id);
    const sameStart =
      reservationDoc.pickupDate instanceof Date &&
      reservationDoc.pickupDate.getTime() === startDate.getTime();
    const sameEnd =
      reservationDoc.returnDate instanceof Date &&
      reservationDoc.returnDate.getTime() === endDate.getTime();

    if (!sameCar || !sameStart || !sameEnd) {
      return {
        ok: false,
        response: buildRenderOrderPageResponse(
          car,
          formData,
          'You already have an active reservation. Please complete or release it before starting another.',
          {
            existingReservation: buildExistingReservationSummary(reservationDoc),
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
            releaseRedirect: req.originalUrl,
          }
        ),
      };
    }

    reservationDoc.fullName = trimmedContact.fullName;
    reservationDoc.phoneNumber = trimmedContact.phoneNumber;
    reservationDoc.email = trimmedContact.email;
    reservationDoc.address = trimmedContact.address;
    reservationDoc.hotelName = trimmedContact.hotelName;
    reservationDoc.rentalDays = pricing.rentalDays;
    reservationDoc.deliveryPrice = pricing.deliveryPrice;
    reservationDoc.returnPrice = pricing.returnPrice;
    reservationDoc.totalPrice = pricing.totalPrice;
    extendReservationHold(reservationDoc);
    reservationDoc.status = 'pending';
  } else {
    const { overlappingReservation, bookedOverlap } = await checkCarAvailabilityForRange({
      carId: car._id,
      startDate,
      endDate,
      now,
    });

    if (overlappingReservation) {
      return {
        ok: false,
        response: buildRenderOrderPageResponse(
          car,
          formData,
          'Selected car is already reserved in this period. Please choose different dates or a different car.',
          {
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
          }
        ),
      };
    }

    if (bookedOverlap) {
      return {
        ok: false,
        response: buildRenderOrderPageResponse(
          car,
          formData,
          'Selected car is already booked in this period. Please choose different dates or a different car.',
          {
            rentalDays: pricing.rentalDays,
            deliveryPrice: pricing.deliveryPrice,
            returnPrice: pricing.returnPrice,
            totalPrice: pricing.totalPrice,
          }
        ),
      };
    }

    reservationDoc = await createPendingReservation({
      carId: car._id,
      sessionId,
      startDate,
      endDate,
      pickupTime: formData.pickupTime,
      returnTime: formData.returnTime,
      pickupLocation: formData.pickupLocation,
      returnLocation: formData.returnLocation,
      pricing,
      contact: trimmedContact,
    });
    createdReservationThisStep = true;
  }

  return {
    ok: true,
    reservationDoc,
    createdReservationThisStep,
  };
}

module.exports = {
  resolveCheckoutReservation,
};
