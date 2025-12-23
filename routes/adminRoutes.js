// Express router for admin-only endpoints
const express = require('express');
// Create a new router instance
const router = express.Router();
// Admin controller: dashboard, orders, and cars logic
const adminController = require('../controllers/adminController');
// Contact messages controller (admin side)
const contactAdminController = require('../controllers/contactController');
// Middleware: ensures user is logged in for protected routes
const { requireAdmin } = require('../middleware/auth');
// Multer upload helper for car images
const { upload } = require('../middleware/upload');
// express-validator: validate/normalize incoming form data
const { body } = require('express-validator');
// CSRF shared middleware
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');
// Categories feature removed

// ─────────────────────────────────────────────────────────────────────────────
// Admin dashboard and Orders
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin-dashboard', requireAdmin, csrfProtection, setCsrfToken, adminController.getAdminDashboard);
router.get('/admin/orders', requireAdmin, csrfProtection, setCsrfToken, adminController.getAllOrders);
router.get('/admin/orders/expired', requireAdmin, csrfProtection, setCsrfToken, adminController.getExpiredOrders);
router.get('/admin/orders/deleted', requireAdmin, csrfProtection, setCsrfToken, adminController.getDeletedOrders);
router.post('/admin/orders/deleted/empty', requireAdmin, csrfProtection, adminController.postEmptyDeletedOrders);
// IMPORTANT: define '/new' BEFORE '/:id' to avoid route collision
router.get('/admin/orders/new', requireAdmin, csrfProtection, setCsrfToken, adminController.getCreateOrder);
router.post('/admin/orders/new', requireAdmin, csrfProtection, setCsrfToken, adminController.postCreateOrder);
// Availability check endpoint
router.get('/admin/cars/:id/availability', requireAdmin, adminController.getCarAvailability);
router.get('/admin/orders/:id', requireAdmin, csrfProtection, setCsrfToken, adminController.getOrderDetails);
router.get('/admin/orders/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.getEditOrder);
router.post('/admin/orders/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.postEditOrder);
router.post('/admin/orders/:id/delete', requireAdmin, csrfProtection, adminController.postDeleteOrder);
router.post('/admin/orders/:id/restore', requireAdmin, csrfProtection, adminController.postRestoreOrder);

// ─────────────────────────────────────────────────────────────────────────────
// Admin contacts management (view/update/delete contact messages)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/contacts', requireAdmin, csrfProtection, setCsrfToken, contactAdminController.getAdminContacts);
router.post('/admin/contacts/:id/status', requireAdmin, csrfProtection, contactAdminController.postUpdateContactStatus);
router.post('/admin/contacts/:id/delete', requireAdmin, csrfProtection, contactAdminController.postDeleteContact);

// ─────────────────────────────────────────────────────────────────────────────
// Cars CRUD (create/edit/delete car inventory)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/cars', requireAdmin, csrfProtection, setCsrfToken, adminController.listCars);
router.get('/admin/cars/new', requireAdmin, csrfProtection, setCsrfToken, adminController.getCreateCar);
router.post(
  '/admin/cars/new',
  requireAdmin,
  upload.single('image'),
  // Handle multer errors (e.g., file size limit)
  (err, req, res, next) => {
    if (err && err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.fileValidationError = 'File size exceeds 5MB limit';
      } else {
        req.fileValidationError = err.message || 'File upload error';
      }
      return next();
    }
    next(err);
  },
  // Check for file validation errors after multer processes the file
  (req, res, next) => {
    if (req.fileRejected) {
      req.fileValidationError = 'Only image files are allowed (JPG, JPEG, PNG, WEBP)';
    }
    next();
  },
  csrfProtection,
  setCsrfToken,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    body('transmission').trim().isIn(['Automatic','Manual']).withMessage('Transmission must be Automatic or Manual'),
    body('seats').toInt().isInt({ min: 2, max: 9 }).withMessage('Seats must be between 2 and 9'),
    body('fuelType').trim().isIn(['Petrol','Diesel','Hybrid','Electric']).withMessage('Fuel type must be Petrol, Diesel, Hybrid or Electric'),
    body('priceTier_1_3').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 1–3 must be a number greater than 0'),
    body('priceTier_7_31').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 7–31 must be a number greater than 0'),
    body('priceTier_31_plus').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 31+ must be a number greater than 0'),
    // Require at least one price tier
    body().custom((value, { req }) => {
      const tier1 = parseFloat(req.body.priceTier_1_3);
      const tier2 = parseFloat(req.body.priceTier_7_31);
      const tier3 = parseFloat(req.body.priceTier_31_plus);
      const hasValidTier = 
        (Number.isFinite(tier1) && tier1 > 0) ||
        (Number.isFinite(tier2) && tier2 > 0) ||
        (Number.isFinite(tier3) && tier3 > 0);
      if (!hasValidTier) {
        throw new Error('At least one price tier (1–3 days, 7–31 days, or 31+ days) is required');
      }
      return true;
    }).withMessage('At least one price tier is required'),
  ],
  adminController.postCreateCar
);
router.get('/admin/cars/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.getEditCar);
router.post(
  '/admin/cars/:id/edit',
  requireAdmin,
  upload.single('image'),
  // Handle multer errors (e.g., file size limit)
  (err, req, res, next) => {
    if (err && err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.fileValidationError = 'File size exceeds 5MB limit';
      } else {
        req.fileValidationError = err.message || 'File upload error';
      }
      return next();
    }
    next(err);
  },
  // Check for file validation errors after multer processes the file
  (req, res, next) => {
    if (req.fileRejected) {
      req.fileValidationError = 'Only image files are allowed (JPG, JPEG, PNG, WEBP)';
    }
    next();
  },
  csrfProtection,
  setCsrfToken,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    body('transmission').trim().isIn(['Automatic','Manual']).withMessage('Transmission must be Automatic or Manual'),
    body('seats').toInt().isInt({ min: 2, max: 9 }).withMessage('Seats must be between 2 and 9'),
    body('fuelType').trim().isIn(['Petrol','Diesel','Hybrid','Electric']).withMessage('Fuel type must be Petrol, Diesel, Hybrid or Electric'),
    body('priceTier_1_3').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 1–3 must be a number greater than 0'),
    body('priceTier_7_31').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 7–31 must be a number greater than 0'),
    body('priceTier_31_plus').optional({ checkFalsy: true }).toFloat().isFloat({ gt: 0 }).withMessage('Tier 31+ must be a number greater than 0'),
    // Require at least one price tier (same as create route)
    body().custom((value, { req }) => {
      const tier1 = parseFloat(req.body.priceTier_1_3);
      const tier2 = parseFloat(req.body.priceTier_7_31);
      const tier3 = parseFloat(req.body.priceTier_31_plus);
      const hasValidTier = 
        (Number.isFinite(tier1) && tier1 > 0) ||
        (Number.isFinite(tier2) && tier2 > 0) ||
        (Number.isFinite(tier3) && tier3 > 0);
      if (!hasValidTier) {
        throw new Error('At least one price tier (1–3 days, 7–31 days, or 31+ days) is required');
      }
      return true;
    }).withMessage('At least one price tier is required'),
  ],
  adminController.postEditCar
);
router.post('/admin/cars/:id/delete', requireAdmin, csrfProtection, adminController.postDeleteCar);

// categories routes removed

// Export the configured admin router
module.exports = router;


