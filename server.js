// Import the Express web framework
const express = require('express');
// Import Mongoose for MongoDB ODM
const mongoose = require('mongoose');
// Body parser to handle form submissions and JSON payloads
const bodyParser = require('body-parser');
// Node.js path utilities
const path = require('path');
// Route modules (payment endpoints)
const paymentRoutes = require('./routes/paymentRoutes');
// Public site routes (home, search, etc.)
const carRoutes=require('./routes/carRoutes');
// Admin area routes (dashboard, orders, cars, contacts)
const adminRoutes = require('./routes/adminRoutes');
// Support pages routes (phone, email, chat, visit)
const supportRoutes = require('./routes/supportRoutes');
// Footer pages routes (FAQ, policy pages, etc.)
const footerRoutes = require('./routes/footerRoutes');
// Car model used for housekeeping job below
const Car= require('./models/Car');
// Express-session handles server-side sessions (cookie + store)
const session = require('express-session');
// Session store backed by MongoDB
const MongoDBStore = require('connect-mongodb-session')(session);
// Authentication routes (login, signup, logout)
const authRoutes = require('./routes/authRoutes');
// Create the Express application instance
const app = express();

/* ───────── static ───────── */
// Serve static assets (css, images) from /public
app.use(express.static(path.join(__dirname, 'public')));
// Explicit mounts for css and images (useful in templates)
app.use('/css',    express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

/* ───────── middleware ───────── */
// Parse urlencoded form data
app.use(bodyParser.urlencoded({ extended: true }));
// Parse JSON bodies as well
app.use(bodyParser.json());                 // allow JSON bodies, too
// Use EJS as the templating engine
app.set('view engine', 'ejs');

// MongoDB connection string (Atlas)
const MONGODB_URI = 'mongodb+srv://perikliev00:bA8NgkFvAiOC2WU6@rentacar.vqfa4od.mongodb.net/cars?retryWrites=true&w=majority&appName=RentACar';

// Configure the Mongo-backed session store
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions'
})
// Prevent crash when the session store cannot connect (e.g., network/Atlas issue)
store.on('error', (err) => {
  console.error('Session store error:', err && err.message ? err.message : err);
});
// Initialize the session middleware
app.use(
  session({ secret: 'my secret', resave: false, saveUninitialized: false,store:store })
)
// Expose auth state to all EJS views
app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.isLoggedIn;
  res.locals.user = req.session.user || null;
  next();
});
// Remove request-level purge (revert to old mechanism)

// Mount public routes
app.use(carRoutes);
// Mount payment routes
app.use(paymentRoutes);
// Mount auth routes
app.use(authRoutes);
// Mount admin routes
app.use(adminRoutes);
// Mount support routes
app.use(supportRoutes);
// Mount footer routes
app.use(footerRoutes);
// Ensure some session defaults exist
app.use((req, res, next) => {
  if(!req.session.isPaid) {
    req.session.isPaid = false;
  }
  if (!req.session.orderDetails) {
    req.session.orderDetails = {};
  }
  next();
});

// (Categories feature removed)


/* ───────── housekeeping helper ───────── */
async function cleanUpOutdatedDates() {
  try {
    const result = await Car.updateMany(
      {},
      { $pull: { dates: { endDate: { $lte: new Date() } } } }
    );
    console.log(`🧹  Removed expired date ranges from ${result.modifiedCount} car(s)`);
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

/* ───────── connect & start ───────── */
(async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✓ MongoDB connected');

    /* run once immediately, then every ~10 seconds (old mechanism) */
    await cleanUpOutdatedDates();
    setInterval(cleanUpOutdatedDates, 10_000);
    // Determine port from env or default to 3000
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`🚗  LuxRide Server running at http://localhost:${PORT}`)
    );
  } catch (err) {
    // Fail fast if the database connection cannot be established
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();