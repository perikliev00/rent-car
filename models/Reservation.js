const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    pickupDate: { type: Date, required: true },
    pickupTime: String,
    returnDate: { type: Date, required: true },
    returnTime: String,
    pickupLocation: { type: String, required: true },
    returnLocation: { type: String, required: true },
    rentalDays: { type: Number, required: true, min: 1 },
    deliveryPrice: { type: Number, default: 0 },
    returnPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    fullName: { type: String },
    phoneNumber: { type: String },
    email: { type: String },
    address: { type: String },
    hotelName: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'confirmed', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    holdExpiresAt: { type: Date, required: true, index: true },
    stripeSessionId: { type: String, index: true },
    stripePaymentIntentId: String,
  },
  { timestamps: true }
);

reservationSchema.index({ carId: 1, status: 1, holdExpiresAt: 1 });
reservationSchema.index({ sessionId: 1, status: 1, holdExpiresAt: 1 });

// Syncing of Car.dates is handled explicitly in controllers (create/edit/delete)

module.exports = mongoose.model('Reservation', reservationSchema);