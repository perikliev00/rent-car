// Express router – само за admin страници и действия.
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const contactAdminController = require('../controllers/contactController');
const { requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { csrfProtection, setCsrfToken } = require('../middleware/csrf');
// Categories feature removed

const { handleMulterError } = require('../middleware/fileUpload/handleMulterError');
const { handleFileRejected } = require('../middleware/fileUpload/handleFileRejected');
const { carValidationRules } = require('../validators/carValidationRules');

router.get('/admin-dashboard', requireAdmin, csrfProtection, setCsrfToken, adminController.getAdminDashboard);
router.get('/admin/orders', requireAdmin, csrfProtection, setCsrfToken, adminController.getAllOrders);
router.get('/admin/orders/expired', requireAdmin, csrfProtection, setCsrfToken, adminController.getExpiredOrders);
router.get('/admin/orders/deleted', requireAdmin, csrfProtection, setCsrfToken, adminController.getDeletedOrders);
router.post('/admin/orders/deleted/empty', requireAdmin, csrfProtection, adminController.postEmptyDeletedOrders);
router.get('/admin/orders/new', requireAdmin, csrfProtection, setCsrfToken, adminController.getCreateOrder);
router.post('/admin/orders/new', requireAdmin, csrfProtection, setCsrfToken, adminController.postCreateOrder);
router.get('/admin/cars/:id/availability', requireAdmin, adminController.getCarAvailability);
router.get('/admin/orders/:id', requireAdmin, csrfProtection, setCsrfToken, adminController.getOrderDetails);
router.get('/admin/orders/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.getEditOrder);
router.post('/admin/orders/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.postEditOrder);
router.post('/admin/orders/:id/delete', requireAdmin, csrfProtection, adminController.postDeleteOrder);
router.post('/admin/orders/:id/restore', requireAdmin, csrfProtection, adminController.postRestoreOrder);

router.get('/admin/contacts', requireAdmin, csrfProtection, setCsrfToken, contactAdminController.getAdminContacts);
router.post('/admin/contacts/:id/status', requireAdmin, csrfProtection, contactAdminController.postUpdateContactStatus);
router.post('/admin/contacts/:id/delete', requireAdmin, csrfProtection, contactAdminController.postDeleteContact);

router.get('/admin/cars', requireAdmin, csrfProtection, setCsrfToken, adminController.listCars);
router.get('/admin/cars/new', requireAdmin, csrfProtection, setCsrfToken, adminController.getCreateCar);
router.post(
  '/admin/cars/new',
  requireAdmin,
  upload.single('image'),
  handleMulterError,
  handleFileRejected,
  csrfProtection,
  setCsrfToken,
  carValidationRules,
  adminController.postCreateCar
);
router.get('/admin/cars/:id/edit', requireAdmin, csrfProtection, setCsrfToken, adminController.getEditCar);
router.post(
  '/admin/cars/:id/edit',
  requireAdmin,
  upload.single('image'),
  handleMulterError,
  handleFileRejected,
  csrfProtection,
  setCsrfToken,
  carValidationRules,
  adminController.postEditCar
);
router.post('/admin/cars/:id/delete', requireAdmin, csrfProtection, adminController.postDeleteCar);

// categories routes removed

module.exports = router;
