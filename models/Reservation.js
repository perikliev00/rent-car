// Mongoose дефинира reservation-hold schema за checkout funnel-а.
const mongoose = require('mongoose');

// Резервация представлява временен или потвърден hold, свързан с browser session.
const reservationSchema = new mongoose.Schema(
  {
    // Резервирана кола.
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      required: true,
      index: true,
    },
    // Session-bound ownership – гости могат да имат reservations.
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    // Обхват и локации на booking.
    pickupDate: { type: Date, required: true },
    pickupTime: String,
    returnDate: { type: Date, required: true },
    returnTime: String,
    pickupLocation: { type: String, required: true },
    returnLocation: { type: String, required: true },
    // Pricing snapshot в момента на резервацията.
    rentalDays: { type: Number, required: true, min: 1 },
    deliveryPrice: { type: Number, default: 0 },
    returnPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    // Contact полета могат да са празни в началото и се попълват по време на checkout.
    fullName: { type: String },
    phoneNumber: { type: String },
    email: { type: String },
    address: { type: String },
    hotelName: { type: String },
    // Reservation lifecycle статуси – hold, payment, cleanup flows.
    status: {
      type: String,
      enum: ['pending', 'processing', 'confirmed', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    // Кога временният hold трябва да спре да блокира наличността.
    holdExpiresAt: { type: Date, required: true, index: true },
    // unique + sparse: един Stripe checkout session → най-много една резервация.
    stripeSessionId: { type: String, index: true, unique: true, sparse: true },
    // Опционален Stripe payment intent ID за по-дълбоко проследяване.
    stripePaymentIntentId: String,
  },
  // createdAt/updatedAt за debugging и admin видимост.
  { timestamps: true }
);

// Compound index – често при проверка на активни holds за една кола.
reservationSchema.index({ carId: 1, status: 1, holdExpiresAt: 1 });
// Compound index – при търсене на активен hold за един visitor session.
reservationSchema.index({ sessionId: 1, status: 1, holdExpiresAt: 1 });

// Car.dates синхронизацията се прави явно в controllers (create/edit/delete)

// Експорт на Reservation модела.
module.exports = mongoose.model('Reservation', reservationSchema);
