const paymentController = require('./paymentController');

module.exports = {
  createCheckoutSession: paymentController.createCheckoutSession,
  handleCheckoutSuccess: paymentController.handleCheckoutSuccess,
  handleCheckoutCancel: paymentController.handleCheckoutCancel,
  handleStripeWebhook: paymentController.handleStripeWebhook,
};
