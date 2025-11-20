const { validationResult } = require('express-validator');
const dashboardService = require('../services/admin/dashboardService');
const orderAdminService = require('../services/admin/orderAdminService');
const carAdminService = require('../services/admin/carAdminService');

exports.getAdminDashboard = async (req, res, next) => {
    try {
        const { orders, stats } = await dashboardService.getDashboardData();

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            orders,
            stats
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        err.publicMessage = 'Error loading admin dashboard.';
        return next(err);
    }
};

exports.getAllOrders = async (req, res, next) => {
    try {
        const data = await orderAdminService.getOrdersList(req.query);

        res.render('admin/orders', {
            title: 'All Orders',
            ...data
        });
    } catch (err) {
        console.error('Get orders error:', err);
        err.publicMessage = 'Error fetching orders.';
        return next(err);
    }
};

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
exports.getCarAvailability = async (req, res) => {
  try {
    const result = await orderAdminService.getCarAvailability(
      req.params.id,
      req.query
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('getCarAvailability error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.postCreateOrder = async (req, res, next) => {
    try {
        const result = await orderAdminService.createOrder(req.body);
        if (result.success) {
            return res.redirect('/admin/orders');
        }

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

exports.getOrderDetails = async (req, res, next) => {
    try {
        const order = await orderAdminService.getOrderDetails(req.params.id);
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

exports.getEditOrder = async (req, res, next) => {
    try {
        const data = await orderAdminService.getOrderEditData(req.params.id);
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

exports.postEditOrder = async (req, res, next) => {
    try {
        const result = await orderAdminService.updateOrder(
            req.params.id,
            req.body
        );
        if (result.success) {
            return res.redirect('/admin/orders');
        }
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

exports.postRestoreOrder = async (req, res, next) => {
    try {
        await orderAdminService.restoreOrder(req.params.id);
        res.redirect('/admin/orders');
    } catch (err) {
        console.error('Restore order error:', err);
        if (err && err.isOrderRestoreError) {
            const message = err.message || 'Error restoring order';
          return res.redirect(`/admin/orders/deleted?err=${encodeURIComponent(message)}`);
        }
        err.publicMessage = 'Error restoring order.';
        return next(err);
    }
};

// -------- Cars CRUD (basic scaffolding, no complex logic) --------
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

exports.getCreateCar = async (req, res) => {
    res.render('admin/car-form', { title: 'Add Car', car: null });
};

exports.postCreateCar = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).render('admin/car-form', {
                title: 'Add Car',
                car: carAdminService.buildCarFormState(req.body),
                errors: errors.array()
            });
        }
        await carAdminService.createCar(req.body, req.file);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Create car error:', err);
        err.publicMessage = 'Error creating car.';
        return next(err);
    }
};

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

exports.postEditCar = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const car = await carAdminService.getCarById(req.params.id);
            return res.status(422).render('admin/car-form', {
                title: 'Edit Car',
                car: carAdminService.buildCarFormState(req.body, car || null),
                errors: errors.array()
            });
        }
        await carAdminService.updateCar(req.params.id, req.body, req.file);
        res.redirect('/admin/cars');
    } catch (err) {
        console.error('Edit car error:', err);
        err.publicMessage = 'Error updating car.';
        return next(err);
    }
};

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

