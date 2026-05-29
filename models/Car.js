// Mongoose се използва за дефиниране на fleet/car schema в MongoDB.
const mongoose = require('mongoose');

// carSchema описва наемаемо превозно средство + pricing tiers и booked date ranges.
const carSchema = new mongoose.Schema(
  {
    // Публично име за показ на колата.
    name: { type: String, required: true },
    // Път до изображението – използва се от frontend/admin UI.
    image: { type: String, required: true },
    transmission: { type: String, required: true }, // напр. "Automatic" или "Manual"
    price: { type: Number, required: true }, // Legacy base цена на ден
    pricePerDay: { type: Number }, // За 4–6 дни ако е подадена; fallback към price
    // Tiered pricing полета за booking изчисления.
    priceTier_1_3: { type: Number },
    priceTier_7_31: { type: Number },
    priceTier_31_plus: { type: Number },
    seats: { type: Number, required: true }, // Брой места
    fuelType: { type: String, required: true }, // напр. "Petrol", "Diesel", "Electric"
    availability: { type: Boolean, default: true }, // Дали колата е налична за наем
    // Legacy/опционална category връзка – за обратна съвместимост.
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    // dates пази вече-booked/блокирани интервали при availability checks.
    dates: [
      {
        // Начало на един блокиран интервал.
        startDate: { type: Date, required: true },
        // Край на един блокиран интервал.
        endDate: { type: Date, required: true },
      },
    ],
  },
  // Фиксирано име на колекция и createdAt/updatedAt timestamps.
  { collection: 'cars', timestamps: true }
);

// Индекси за по-бързи availability заявки по date range.
// Query planner може да ползва multikey индекси при филтриране по date overlap.
carSchema.index({ 'dates.startDate': 1 });
carSchema.index({ 'dates.endDate': 1 });

// Експорт на Car модела, явно свързан с колекцията cars.
module.exports = mongoose.model('Car', carSchema, 'cars');
