const mongoose = require('mongoose');
const Car = require('../models/Car');

const MONGODB_URI = 'mongodb+srv://perikliev00:bA8NgkFvAiOC2WU6@rentacar.vqfa4od.mongodb.net/cars?retryWrites=true&w=majority&appName=RentACar';

async function addOneCar() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Add one more exclusive supercar
    const newCar = {
      name: 'Pagani Huayra',
      image: '/images/pagani-huayra.png',
      transmission: 'Automatic',
      fuelType: 'Petrol',
      seats: 2,
      price: 650,
      availability: true,
      dates: []
    };

    // Insert the new car
    const result = await Car.create(newCar);
    console.log(`Added new car: ${result.name}`);

    const totalCars = await Car.countDocuments();
    console.log(`Total cars in collection: ${totalCars}`);

    process.exit(0);
  } catch (error) {
    console.error('Error adding car:', error);
    process.exit(1);
  }
}

addOneCar();