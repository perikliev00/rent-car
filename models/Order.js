const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  carId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Car',
    required: true,
  },
  pickupDate: String,
  pickupTime: String,
  returnDate: String,
  returnTime: String,
  pickupLocation: String,
  returnLocation: String,
  rentalDays: String,
  deliveryPrice: String,
  returnPrice: String,
  totalPrice: String,
  fullName: String,
  phoneNumber: String,
  email: String,
  address: String,
  hotelName: String,
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, { timestamps: true });

// Syncing of Car.dates is handled explicitly in controllers (create/edit/delete)

module.exports = mongoose.model('Order', orderSchema);