const Stripe = require('stripe');

// Initialize Stripe with the secret key
const stripe = new Stripe('sk_test_51QVe9bFJUHb7cgH941Bz73OTVdEWdBTBILhsZdtK61F8auOiTueagQRYYRYhF16iFdGLoJlkQCh1i5fWU9DJdB8G00wHBpoqiI');

module.exports = stripe;