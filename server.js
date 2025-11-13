// app.js
// ─────────────────────────────────────────────────────────────
// Imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);

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

// ─────────────────────────────────────────────────────────────
// Constants
const app = express();
const FIVE_MIN = 5 * 60 * 1000; // 5 minutes idle timeout
const isProd = process.env.NODE_ENV === 'production';

// Mongo
const MONGODB_URI =
  'mongodb+srv://perikliev00:bA8NgkFvAiOC2WU6@rentacar.vqfa4od.mongodb.net/cars?retryWrites=true&w=majority&appName=RentACar';

// ─────────────────────────────────────────────────────────────
// Static + Templating
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css',    express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.set('view engine', 'ejs');

// Body Parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ─────────────────────────────────────────────────────────────
// Session store
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions',
  expires: FIVE_MIN, // TTL (server-side). Each write/refresh extends this when using "rolling".
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
  secret: 'change-me',   // TODO: move to env var
  store,
  resave: false,
  saveUninitialized: false, // create session only when you set something
  rolling: true,            // refresh cookie expiry on each request (idle timeout)
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,         // false on localhost (HTTP), true in prod (HTTPS)
    maxAge: FIVE_MIN,       // browser expiry (idle-based thanks to rolling)
  },
}));

// (Optional) quick debug to ensure the same sessionID across requests/tabs
// app.use((req, _res, next) => { console.log('sessionID:', req.sessionID); next(); });

// ─────────────────────────────────────────────────────────────
// Ensure session defaults (you wanted a session even for guests)
// Place BEFORE routes so the session exists on first hit
app.use((req, res, next) => {
  if (!req.session.isPaid) req.session.isPaid = false;
  if (!req.session.orderDetails) req.session.orderDetails = {};
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

// ─────────────────────────────────────────────────────────────
// Routes
app.use(carRoutes);
app.use(paymentRoutes);
app.use(authRoutes);
app.use(adminRoutes);
app.use(supportRoutes);
app.use(footerRoutes);

// ─────────────────────────────────────────────────────────────
// Housekeeping helpers

// Helper: "now" in Europe/Sofia as a Date object (wall-clock aligned)

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




// 60s: remove "in process" reservations whose session no longer exists
async function cleanUpAbandonedReservations() {
  try {
    const nowUTC = new Date();
    const sessionsColl = mongoose.connection.collection('sessions');
    const sessions = await sessionsColl
      .find({ expires: { $gt: nowUTC } }, { projection: { _id: 1 } })
      .toArray();

    const activeSids = sessions.map(s => String(s._id));
    const deleted = await Reservation.deleteMany({
      mode: 'in process',
      $or: [
        { sessionId: { $exists: false } },
        { sessionId: null },
        { sessionId: { $nin: activeSids } }
      ]
    });

    if (deleted.deletedCount) {
      console.log(`🧽 Removed ${deleted.deletedCount} abandoned in-process reservation(s) (session missing).`);
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

    setInterval(cleanUpOutdatedDates, 10_000);          // every 10 sec
    setInterval(cleanUpAbandonedReservations, 60_000);  // every 1 min

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
