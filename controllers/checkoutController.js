// Този файл е стабилен controller entry point – делегира implementation към paymentController.
const paymentController = require('./paymentController');

// Re-export на payment функции под checkout имена – за routes и server bootstrap.
module.exports = {
  createCheckoutSession: paymentController.createCheckoutSession,
  handleCheckoutSuccess: paymentController.handleCheckoutSuccess,
  handleCheckoutCancel: paymentController.handleCheckoutCancel,
  handleStripeWebhook: paymentController.handleStripeWebhook,
};
