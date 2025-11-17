const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
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
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    hotelName: String,
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    expiredAt: { type: Date },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Syncing of Car.dates is handled explicitly in controllers (create/edit/delete)

module.exports = mongoose.model('Order', orderSchema);