require('dotenv').config();

// app.js
// ─────────────────────────────────────────────────────────────
// Imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const helmet = require('helmet');
const crypto = require('crypto');
const paymentController = require('./controllers/payment');
const expressRaw = express.raw;
const { adminLimiter } = require('./middleware/rateLimit');
const applySecurity = require('./config/security');

// Routes
const paymentRoutes = require('./routes/paymentRoutes');
const carRoutes     = require('./routes/carRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const footerRoutes  = require('./routes/footerRoutes');
const authRoutes    = require('./routes/authRoutes');

// Models
const Car = require('./models/Car');
const Reservation = require('./models/Reservation'); // use reservations in housekeeping
const { ACTIVE_RESERVATION_STATUSES } = require('./utils/reservationHelpers');

// ─────────────────────────────────────────────────────────────
// Constants
const app = express();
const SESSION_IDLE_MS = 20 * 60 * 1000; // 20 minutes idle timeout
const isProd = process.env.NODE_ENV === 'production';

// Mongo
const MONGODB_URI = process.env.MONGODB_URI;

// ─────────────────────────────────────────────────────────────
// Static + Templating
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css',    express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
// Serve flatpickr from public first, then fallback to node_modules.
// This prevents production breakage if public/vendor files are missing.
app.use('/vendor/flatpickr', express.static(path.join(__dirname, 'public/vendor/flatpickr')));
app.use('/vendor/flatpickr', express.static(path.join(__dirname, 'node_modules/flatpickr/dist')));
app.set('view engine', 'ejs');

// Body Parsers
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// CSP nonce must be set before Helmet so script-src can allow nonced scripts
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});
applySecurity(app, { isProd });

// ─────────────────────────────────────────────────────────────
// Session store
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions',
  expires: SESSION_IDLE_MS, // TTL (server-side). Each write/refresh extends this when using "rolling".
});

store.on('error', (err) => {
  console.error('Session store error:', err && err.message ? err.message : err);
});

// If you terminate TLS at a proxy (Heroku/Render/Nginx), trust it in prod
if (isProd) {
  app.set('trust proxy', 1);
}

// Sessions (✅ works on localhost + prod)
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET ,
  store,
  resave: false,
  saveUninitialized: false, // create session only when you set something
  rolling: true,            // refresh cookie expiry on each request (idle timeout)
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,         // false on localhost (HTTP), true in prod (HTTPS)
    maxAge: SESSION_IDLE_MS,       // browser expiry (idle-based thanks to rolling)
  },
}));

// (Optional) quick debug to ensure the same sessionID across requests/tabs
// app.use((req, _res, next) => { console.log('sessionID:', req.sessionID); next(); });

// ─────────────────────────────────────────────────────────────
// Ensure session defaults (you wanted a session even for guests)
// Place BEFORE routes so the session exists on first hit
app.use((req, res, next) => {
  if (!req.session.isPaid) req.session.isPaid = false;
  // Mirror the id inside the session doc for convenience
  if (req.session._sid !== req.sessionID) req.session._sid = req.sessionID;
  next();
});

// Expose auth state to templates
app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.isLoggedIn;
  res.locals.user = req.session.user || null;
  next();
});

app.use((req, res, next) => {
  if (typeof res.locals.csrfToken === 'undefined') {
    res.locals.csrfToken = null;
  }
  next();
});

// ─────────────────────────────────────────────────────────────
// Routes
app.use(carRoutes);
app.use(paymentRoutes);
app.use(authRoutes);
app.use(adminLimiter, adminRoutes);
app.use(supportRoutes);
app.use(footerRoutes);



// 404 handler
app.use((req, res, next) => {
  res.status(404).render('error/404', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
  });
});

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    const message = 'Invalid or missing CSRF token.';
    if (req.accepts('html')) {
      return res.status(403).render('error/500', {
        title: 'Security Error',
        message,
      });
    }
    return res.status(403).json({ error: message });
  }
  return next(err);
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message =
    err.publicMessage ||
    err.message ||
    'An unexpected error occurred. Please try again later.';

  if (status === 404) {
    return res.status(404).render('error/404', {
      title: 'Page Not Found',
      message,
    });
  }

  return res.status(status).render('error/500', {
    title: status === 500 ? 'Server Error' : 'Error',
    message,
  });
});

// ─────────────────────────────────────────────────────────────
// Housekeeping helpers

async function cleanUpOutdatedDates() {
  try {
    const result = await Car.updateMany(
      {},
      [
        {
          $set: {
            dates: {
              $map: {
                input: { $ifNull: ["$dates", []] },
                as: "d",
                in: {
                  $mergeObjects: [
                    "$$d",
                    {
                      startDate: {
                        $convert: { input: "$$d.startDate", to: "date", onError: null, onNull: null }
                      },
                      endDate: {
                        $convert: { input: "$$d.endDate", to: "date", onError: null, onNull: null }
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $set: {
            dates: {
              $filter: {
                input: "$dates",
                as: "d",
                cond: {
                  $and: [
                    { $ne: ["$$d.endDate", null] },
                    {
                      $gt: [
                        {
                          $dateToString: {
                            date: "$$d.endDate",
                            format: "%Y-%m-%dT%H:%M:%S",
                            timezone: "Europe/Sofia"
                          }
                        },
                        {
                          $dateToString: {
                            date: "$$NOW",
                            format: "%Y-%m-%dT%H:%M:%S",
                            timezone: "Europe/Sofia"
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    );

    console.log(`🧹 Car.dates cleanup (Sofia): matched=${result.matchedCount ?? result.n}, modified=${result.modifiedCount ?? result.nModified}`);
  } catch (err) {
    console.error('Cleanup error (Car.dates Sofia):', err);
  }
}

// Housekeep reservations whose holds expired or sessions vanished
async function cleanUpAbandonedReservations() {
  try {
    const nowUTC = new Date();
    const sessionsColl = mongoose.connection.collection('sessions');
    const sessions = await sessionsColl
      .find({ expires: { $gt: nowUTC } }, { projection: { _id: 1 } })
      .toArray();

    const activeSids = sessions.map(s => String(s._id));
    const orCriteria = [
      { holdExpiresAt: { $lte: nowUTC } },
      { sessionId: { $exists: false } },
      { sessionId: null },
    ];
    if (activeSids.length) {
      orCriteria.push({ sessionId: { $nin: activeSids } });
    }

    const updated = await Reservation.updateMany(
      {
        status: { $in: ACTIVE_RESERVATION_STATUSES },
        $or: orCriteria
      },
      { $set: { status: 'expired', holdExpiresAt: nowUTC } }
    );

    if (updated.modifiedCount) {
      console.log(`🧽 Marked ${updated.modifiedCount} reservation(s) as expired or abandoned.`);
    }
  } catch (err) {
    console.error('Cleanup error (abandoned reservations):', err);
  }
}

// ─────────────────────────────────────────────────────────────
// Connect & start
(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ MongoDB connected');

    // run immediately, then on intervals
    await cleanUpOutdatedDates();
    await cleanUpAbandonedReservations();

    setInterval(cleanUpOutdatedDates, 3 * 60 * 1000);          // every 3 min
    setInterval(cleanUpAbandonedReservations, 3 * 60 * 1000);  // every 3 min

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚗  LuxRide Server running at http://localhost:${PORT}`);
      console.log(`NODE_ENV=${process.env.NODE_ENV || 'development'}  isProd=${isProd}`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();
