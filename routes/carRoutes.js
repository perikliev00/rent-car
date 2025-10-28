const express = require('express');
const expressValidator = require('express-validator');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Car = require('../models/Car'); // Ensure you have a Car model
const homeController = require('../controllers/homeController'); // Ensure you have a controller for handling requests
const availableCarsController = require('../controllers/availableCars'); // Ensure you have a controller for handling requests
const orderCarController = require('../controllers/orderCar'); // Ensure you have a controller for handling requests
const aboutController = require('../controllers/aboutController'); // About controller
const contactController = require('../controllers/contactController'); // Contact controller
// Categories feature removed
// Get all cars or filter cars based on query parameters
router.get('/', homeController.getHome);
router.post('/postSearchCars',[
    body('pickup-time')
      .notEmpty()
      .withMessage('Please choose a pick-up time'),
    body('return-time')
      .notEmpty()
      .withMessage('Please choose a return time'),
], availableCarsController.postSearchCars);
// Pagination-friendly GET for search results (links use query params)
// removed GET pagination route per user request
router.post('/orders',orderCarController.getOrderCar);
router.get('/about', aboutController.getAbout);
router.get('/contacts', contactController.getContacts);
router.post('/contact', contactController.postContact);

// Category page
// category routes removed

 

module.exports = router;