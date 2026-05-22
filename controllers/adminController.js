// validationResult – route-level validation грешки за admin car форми.
const { validationResult } = require('express-validator');
// dashboardService – admin dashboard данни.
const dashboardService = require('../services/admin/dashboardService');
// orderAdminService – admin order CRUD и transaction логика.
const orderAdminService = require('../services/admin/orderAdminService');
// carAdminService – admin fleet CRUD логика.
const carAdminService = require('../services/admin/carAdminService');

// Render на admin dashboard със summary stats и orders.
exports.getAdminDashboard = async (req, res, next) => {
    try {
        // Ask the service layer to fetch dashboard metrics and backing order data.
        const { orders, stats } = await dashboardService.getDashboardData();

        // Render the dashboard template with the service result.
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            orders,
            stats
        });
    } catch (err) {
        // Unexpected dashboard failures go through the central error handler.
        console.error('Admin dashboard error:', err);
        err.publicMessage = 'Error loading admin dashboard.';
        return next(err);
    }
};

// Render the main admin order list page.
exports.getAllOrders = async (req, res, next) => {
    try {
        // Query-string filters are passed through to the order admin service.
        const data = await orderAdminService.getOrdersList(req.query);

        res.render('admin/orders', {
            title: 'All Orders',
            ...data
        });
    } catch (err) {
        // Bubble the failure to the global handler with a friendly public message.
        console.error('Get orders error:', err);
        err.publicMessage = 'Error fetching orders.';
        return next(err);
    }
};

// Render the expired-orders list.
exports.getExpiredOrders = async (req, res, next) => {
    try {
        const data = await orderAdminService.getExpiredOrders();

        res.render('admin/orders-expired', {
            title: 'Expired Orders',
            ...data
        });
    } catch (err) {
        console.error('Get expired orders error:', err);
        err.publicMessage = 'Error fetching expired orders.';
        return next(err);
    }
};

// Render the deleted-orders bin.
exports.getDeletedOrders = async (req, res, next) => {
    try {
        const data = await orderAdminService.getDeletedOrders();

        res.render('admin/orders-deleted', {
            title: 'Deleted Orders',
            ...data,
            error: req.query.err || null
        });
    } catch (err) {
        console.error('Get deleted orders error:', err);
        err.publicMessage = 'Error fetching deleted orders.';
        return next(err);
    }
};

// Permanently empty the deleted-orders bin.
exports.postEmptyDeletedOrders = async (_req, res, next) => {
    try {
        await orderAdminService.emptyDeletedOrders();
        res.redirect('/admin/orders/deleted');
    } catch (err) {
        console.error('Empty deleted orders error:', err);
        err.publicMessage = 'Error emptying deleted orders bin.';
        return next(err);
    }
};

// Render the create-order admin form.
exports.getCreateOrder = async (req, res, next) => {
    try {
        const data = await orderAdminService.getCreateOrderForm();
        res.render('admin/order-new', {
            title: 'Add Order',
            ...data
        });
    } catch (err) {
        console.error('Get create order error:', err);
        err.publicMessage = 'Error loading the order creation form.';
        return next(err);
    }
};

// JSON endpoint: check if a car is available for the given period (read-only)
// Return availability info for a selected car/date range to power admin form UX.
exports.getCarAvailability = async (req, res) => {
  try {
    const result = await orderAdminService.getCarAvailability(
      req.params.id,
      req.query
    );
    // The service returns both status and body so the controller can stay very thin.
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('getCarAvailability error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};

// Create a new admin-side order after service-layer validation/business rules run.
exports.postCreateOrder = async (req, res, next) => {
    try {
        const result = await orderAdminService.createOrder(req.body);
        // Success redirects back to the main order list.
        if (result.success) {
            return res.redirect('/admin/orders');
        }

        // Validation/business-rule failures re-render the form with the service-generated view model.
        return res.status(result.status).render('admin/order-new', {
                title: 'Add Order',
            ...result.viewModel
        });
    } catch (err) {
        console.error('Post create order error:', err);
        err.publicMessage = 'Error creating order.';
        return next(err);
    }
};

// Render the details page for a single order.
exports.getOrderDetails = async (req, res, next) => {
    try {
        const order = await orderAdminService.getOrderDetails(req.params.id);
        // Missing orders are handled locally with a 404 text response.
        if (!order) return res.status(404).send('Order not found');
        res.render('admin/order-view', {
            title: 'Order Details',
            order
        });
    } catch (err) {
        console.error('Get order details error:', err);
        err.publicMessage = 'Error loading order details.';
        return next(err);
    }
};

// Render the edit form for a single order.
exports.getEditOrder = async (req, res, next) => {
    try {
        const data = await orderAdminService.getOrderEditData(req.params.id);
        // Missing orders are handled locally.
        if (!data) return res.status(404).send('Order not found');
        res.render('admin/order-edit', {
            title: 'Edit Order',
            ...data
        });
    } catch (err) {
        console.error('Get edit order error:', err);
        err.publicMessage = 'Error loading order.';
        return next(err);
    }
};

// Save admin-side edits to an order.
exports.postEditOrder = async (req, res, next) => {
    try {
        const result = await orderAdminService.updateOrder(
            req.params.id,
            req.body
        );
        // Success returns to the order list.
        if (result.success) {
            return res.redirect('/admin/orders');
        }
        // Validation/business errors re-render the form with service-computed state.
        return res.status(result.status).render('admin/order-edit', {
            title: 'Edit Order',
            ...result.viewModel
        });
    } catch (err) {
        console.error('Post edit order error:', err);
        err.publicMessage = 'Error saving order.';
        return next(err);
    }
};

// Soft-delete an order from the admin list.
exports.postDeleteOrder = async (req, res, next) => {
    try {
        await orderAdminService.deleteOrder(req.params.id);
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Delete order error:', err);
        err.publicMessage = 'Error deleting order.';
        return next(err);
    }
};

// Restore a soft-deleted order from the admin bin.
exports.postRestoreOrder = async (req, res, next) => {
    try {
        await orderAdminService.restoreOrder(req.params.id);
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Restore order error:', err);
        // Restore errors with a domain-specific flag are redirected back to the deleted list with a query message.
        if (err && err.isOrderRestoreError) {
            const message = err.message || 'Error restoring order';
          return res.redirect(`/admin/orders/deleted?err=${encodeURIComponent(message)}`);
        }
        err.publicMessage = 'Error restoring order.';
        return next(err);
    }
};

// -------- Cars CRUD (basic scaffolding, no complex logic) --------
// Render the admin fleet list page.
exports.listCars = async (req, res, next) => {
    try {
        const cars = await carAdminService.listCars();
        res.render('admin/cars', { title: 'Manage Cars', cars });
    } catch (err) {
        console.error('List cars error:', err);
        err.publicMessage = 'Error loading cars.';
        return next(err);
    }
};

// Render the blank admin create-car form.
exports.getCreateCar = async (req, res) => {
    res.render('admin/car-form', { title: 'Add Car', car: null });
};

// Persist a newly created car from the admin form.
exports.postCreateCar = async (req, res, next) => {
    try {
        // Check for multer file validation errors first
        if (req.fileValidationError) {
            return res.status(422).render('admin/car-form', {
                title: 'Add Car',
                car: carAdminService.buildCarFormState(req.body),
                errors: [{ msg: req.fileValidationError, param: 'image', location: 'body' }]
            });
        }
        // Read express-validator errors produced at the route layer.
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).render('admin/car-form', {
                title: 'Add Car',
                car: carAdminService.buildCarFormState(req.body),
                errors: errors.array()
            });
        }
        // Delegate actual persistence to the service layer.
        await carAdminService.createCar(req.body, req.file);
        res.redirect('/admin/cars');
    } catch (err) {
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError' && err.errors) {
            const mongooseErrors = Object.values(err.errors).map(e => ({
                msg: e.message,
                param: e.path,
                location: 'body'
            }));
            return res.status(422).render('admin/car-form', {
                title: 'Add Car',
                car: carAdminService.buildCarFormState(req.body),
                errors: mongooseErrors
            });
        }
        // Handle other errors - render form with error instead of crashing
        console.error('Create car error:', err);
        return res.status(422).render('admin/car-form', {
            title: 'Add Car',
            car: carAdminService.buildCarFormState(req.body),
            errors: [{ msg: err.message || 'Error creating car. Please check all required fields are filled.', param: '_error', location: 'body' }]
        });
    }
};

// Render the edit-car form.
exports.getEditCar = async (req, res, next) => {
    try {
        const car = await carAdminService.getCarById(req.params.id);
        if (!car) return res.status(404).send('Car not found');
        res.render('admin/car-form', { title: 'Edit Car', car });
    } catch (err) {
        console.error('Get edit car error:', err);
        err.publicMessage = 'Error loading car.';
        return next(err);
    }
};

// Save edits to an existing car.
exports.postEditCar = async (req, res, next) => {
    try {
        // Check for multer file validation errors first
        if (req.fileValidationError) {
            const car = await carAdminService.getCarById(req.params.id);
            return res.status(422).render('admin/car-form', {
                title: 'Edit Car',
                car: carAdminService.buildCarFormState(req.body, car || null),
                errors: [{ msg: req.fileValidationError, param: 'image', location: 'body' }]
            });
        }
        // Read express-validator failures produced by the route.
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const car = await carAdminService.getCarById(req.params.id);
            return res.status(422).render('admin/car-form', {
                title: 'Edit Car',
                car: carAdminService.buildCarFormState(req.body, car || null),
                errors: errors.array()
            });
        }
        // Delegate the actual update to the admin car service.
        await carAdminService.updateCar(req.params.id, req.body, req.file);
        res.redirect('/admin/cars');
    } catch (err) {
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError' && err.errors) {
            const mongooseErrors = Object.values(err.errors).map(e => ({
                msg: e.message,
                param: e.path,
                location: 'body'
            }));
            try {
                const car = await carAdminService.getCarById(req.params.id);
                return res.status(422).render('admin/car-form', {
                    title: 'Edit Car',
                    car: carAdminService.buildCarFormState(req.body, car || null),
                    errors: mongooseErrors
                });
            } catch (loadErr) {
                console.error('Error loading car for edit error display:', loadErr);
                // Fall through to generic error handler
            }
        }
        // Handle "Car not found" from service
        if (err.message === 'Car not found') {
            return res.status(404).send('Car not found');
        }
        // Handle other errors - still render form with error instead of crashing
        console.error('Edit car error:', err);
        try {
            const car = await carAdminService.getCarById(req.params.id);
            return res.status(422).render('admin/car-form', {
                title: 'Edit Car',
                car: carAdminService.buildCarFormState(req.body, car || null),
                errors: [{ msg: err.message || 'Error updating car. Please check all required fields are filled.', param: '_error', location: 'body' }]
            });
        } catch (loadErr) {
            // If we can't load the car, then show generic error
            err.publicMessage = 'Error updating car.';
            return next(err);
        }
    }
};

// Delete a car from the fleet.
exports.postDeleteCar = async (req, res, next) => {
    try {
        await carAdminService.deleteCar(req.params.id);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Delete car error:', err);
        err.publicMessage = 'Error deleting car.';
        return next(err);
    }
};

