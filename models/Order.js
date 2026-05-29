// Mongoose дефинира schema за потвърдени/admin-създадени booking orders.
const mongoose = require('mongoose');

// Order представя потвърдени booking-и, не временни reservation holds.
const orderSchema = new mongoose.Schema(
  {
    reservationId: {
      // Back-reference към резервацията породила този order, ако съществува.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation',
      index: true,
      unique: true,
      sparse: true,
    },
    carId: {
      // Резервирана кола.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
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
    // Pricing snapshot в момента на потвърждението.
    rentalDays: { type: Number, required: true, min: 1 },
    deliveryPrice: { type: Number, default: 0 },
    returnPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    // Customer/contact полета – задължителни за order.
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    hotelName: String,
    stripeSessionId: {
      // Stripe checkout session за проследяемост.
      type: String,
      index: true,
      sparse: true,
    },
    status: {
      // Admin/business lifecycle на order-а.
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    // Timestamp кога order-ът стана expired.
    expiredAt: { type: Date },
    isDeleted: {
      // Soft-delete флаг за admin recycle bin.
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      // Timestamp кога е направен soft delete.
      type: Date,
    },
    createdAt: {
      // Явен createdAt за съвместимост с timestamps.
      type: Date,
      default: Date.now,
    },
  },
  // Автоматични timestamps също.
  { timestamps: true }
);

// Car.dates синхронизацията се прави явно в controllers (create/edit/delete)

// Експорт на Order модела.
module.exports = mongoose.model('Order', orderSchema);
