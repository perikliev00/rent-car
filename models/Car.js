const mongoose = require('mongoose');

const carSchema = new mongoose.Schema({
    name: { type: String, required: true },
    image: { type: String, required: true },
    transmission: { type: String, required: true }, // e.g., "Automatic" or "Manual"
    price: { type: Number, required: true }, // Legacy base price per day
    pricePerDay: { type: Number },           // Used for 4-6 days if provided; fallback to price
    priceTier_1_3: { type: Number },
    priceTier_7_31: { type: Number },
    priceTier_31_plus: { type: Number },
    seats: { type: Number, required: true }, // Number of seats
    fuelType: { type: String, required: true }, // e.g., "Petrol", "Diesel", "Electric"
    availability: { type: Boolean, default: true }, // Whether the car is available for rent
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    dates: [
        {
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true }
        }
    ]
}, { collection: 'cars' });

module.exports = mongoose.model('Car', carSchema, 'cars');