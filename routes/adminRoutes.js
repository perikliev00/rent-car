// Express router for admin-only endpoints
const express = require('express');
// Create a new router instance
const router = express.Router();
// Admin controller: dashboard, orders, and cars logic
const adminController = require('../controllers/adminController');
// Contact messages controller (admin side)
const contactAdminController = require('../controllers/contactController');
// Middleware: ensures user is logged in for protected routes
const { requireAuth } = require('../middleware/auth');
// Multer upload helper for car images
const { upload } = require('../middleware/upload');
// express-validator: validate/normalize incoming form data
const { body } = require('express-validator');
// Categories feature removed

// ─────────────────────────────────────────────────────────────────────────────
// Admin dashboard and Orders
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin-dashboard', requireAuth, adminController.getAdminDashboard);
router.get('/admin/orders', requireAuth, adminController.getAllOrders);
// IMPORTANT: define '/new' BEFORE '/:id' to avoid route collision
router.get('/admin/orders/new', requireAuth, adminController.getCreateOrder);
router.post('/admin/orders/new', requireAuth, adminController.postCreateOrder);
// Availability check endpoint
router.get('/admin/cars/:id/availability', requireAuth, adminController.getCarAvailability);
router.get('/admin/orders/:id', requireAuth, adminController.getOrderDetails);
router.get('/admin/orders/:id/edit', requireAuth, adminController.getEditOrder);
router.post('/admin/orders/:id/edit', requireAuth, adminController.postEditOrder);
router.post('/admin/orders/:id/delete', requireAuth, adminController.postDeleteOrder);

// ─────────────────────────────────────────────────────────────────────────────
// Admin contacts management (view/update/delete contact messages)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/contacts', requireAuth, contactAdminController.getAdminContacts);
router.post('/admin/contacts/:id/status', requireAuth, contactAdminController.postUpdateContactStatus);
router.post('/admin/contacts/:id/delete', requireAuth, contactAdminController.postDeleteContact);

// ─────────────────────────────────────────────────────────────────────────────
// Cars CRUD (create/edit/delete car inventory)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/cars', requireAuth, adminController.listCars);
router.get('/admin/cars/new', requireAuth, adminController.getCreateCar);
router.post(
  '/admin/cars/new',
  requireAuth,
  upload.single('image'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    body('transmission').trim().isIn(['Automatic','Manual']).withMessage('Transmission must be Automatic or Manual'),
    body('seats').toInt().isInt({ min: 2, max: 9 }).withMessage('Seats must be between 2 and 9'),
    body('fuelType').trim().isIn(['Petrol','Diesel','Hybrid','Electric']).withMessage('Fuel type must be Petrol, Diesel, Hybrid or Electric'),
    body('priceTier_1_3').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 1–3 must be a number greater than 0'),
    body('priceTier_7_31').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 7–31 must be a number greater than 0'),
    body('priceTier_31_plus').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 31+ must be a number greater than 0'),
  ],
  adminController.postCreateCar
);
router.get('/admin/cars/:id/edit', requireAuth, adminController.getEditCar);
router.post(
  '/admin/cars/:id/edit',
  requireAuth,
  upload.single('image'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    body('transmission').trim().isIn(['Automatic','Manual']).withMessage('Transmission must be Automatic or Manual'),
    body('seats').toInt().isInt({ min: 2, max: 9 }).withMessage('Seats must be between 2 and 9'),
    body('fuelType').trim().isIn(['Petrol','Diesel','Hybrid','Electric']).withMessage('Fuel type must be Petrol, Diesel, Hybrid or Electric'),
    body('priceTier_1_3').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 1–3 must be a number greater than 0'),
    body('priceTier_7_31').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 7–31 must be a number greater than 0'),
    body('priceTier_31_plus').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 31+ must be a number greater than 0'),
  ],
  adminController.postEditCar
);
router.post('/admin/cars/:id/delete', requireAuth, adminController.postDeleteCar);

// categories routes removed

// Export the configured admin router
module.exports = router;


