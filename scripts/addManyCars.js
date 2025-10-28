const mongoose = require('mongoose');
const Car = require('../models/Car');

const MONGODB_URI = 'mongodb+srv://perikliev00:bA8NgkFvAiOC2WU6@rentacar.vqfa4od.mongodb.net/cars?retryWrites=true&w=majority&appName=RentACar';

async function addManyCars() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Add many more luxury and sport cars
    const newCars = [
      {
        name: 'Lamborghini Huracán',
        image: '/images/lamborghini-huracan.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 350,
        availability: true,
        dates: []
      },
      {
        name: 'Ferrari 488 GTB',
        image: '/images/ferrari-488.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 400,
        availability: true,
        dates: []
      },
      {
        name: 'Porsche 911 Turbo',
        image: '/images/porsche-911.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 4,
        price: 280,
        availability: true,
        dates: []
      },
      {
        name: 'Aston Martin DB11',
        image: '/images/aston-martin-db11.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 4,
        price: 320,
        availability: true,
        dates: []
      },
      {
        name: 'Bentley Continental GT',
        image: '/images/bentley-continental.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 4,
        price: 300,
        availability: true,
        dates: []
      },
      {
        name: 'McLaren 720S',
        image: '/images/mclaren-720s.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 450,
        availability: true,
        dates: []
      },
      {
        name: 'Rolls Royce Phantom',
        image: '/images/rolls-royce-phantom.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 5,
        price: 500,
        availability: true,
        dates: []
      },
      {
        name: 'Bugatti Chiron',
        image: '/images/bugatti-chiron.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 800,
        availability: true,
        dates: []
      },
      {
        name: 'Maserati GranTurismo',
        image: '/images/maserati-granturismo.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 4,
        price: 270,
        availability: true,
        dates: []
      },
      {
        name: 'Jaguar F-Type',
        image: '/images/jaguar-f-type.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 240,
        availability: true,
        dates: []
      },
      {
        name: 'Lotus Evora',
        image: '/images/lotus-evora.png',
        transmission: 'Manual',
        fuelType: 'Petrol',
        seats: 2,
        price: 190,
        availability: true,
        dates: []
      },
      {
        name: 'Koenigsegg Agera',
        image: '/images/koenigsegg-agera.png',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        seats: 2,
        price: 1000,
        availability: true,
        dates: []
      }
    ];

    // Insert new cars
    const result = await Car.insertMany(newCars);
    console.log(`Added ${result.length} more luxury cars`);

    const totalCars = await Car.countDocuments();
    console.log(`Total cars in collection: ${totalCars}`);

    process.exit(0);
  } catch (error) {
    console.error('Error adding cars:', error);
    process.exit(1);
  }
}

addManyCars();