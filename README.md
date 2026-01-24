Rent-a-Car – Session-Bound Reservations + Anti Double-Booking

A full-stack rent-a-car booking demo built with Node.js/Express + MongoDB/Mongoose + EJS + Stripe Checkout.

The project focuses on real-world booking safety: preventing double-booking via session-bound reservation holds with automatic expiration and background cleanup.

Key Features
Booking & Availability

Search cars by date/time and pickup/return locations

Availability check against:

Confirmed bookings stored in Car.dates (booked date ranges)

Active reservation holds stored in Reservation (pending/processing holds)

Anti double-booking:

A car becomes temporarily blocked when another session holds it (pending/processing + holdExpiresAt not expired)

The holding session is excluded from the “blocked cars” list so the same user session can continue checkout

Session-Bound Reservation Holds (Core)

Reservations are tied to a server-side session (Reservation.sessionId)

Hold window is aligned with session idle timeout (default 20 minutes)

Lifecycle:

pending → processing (Stripe session created) → confirmed (payment completed)

Holds can also become cancelled or expired

Automated Cleanup (Housekeeping)

Background jobs run every 3 minutes:

Cleans outdated Car.dates entries (removes past date ranges)

Marks reservations as expired if:

holdExpiresAt passed, or

reservation has no sessionId, or

the referenced session no longer exists / is expired in the sessions collection

Payments (Stripe Checkout)

Stripe Checkout session is created server-side

Reservation is set to processing and linked to stripeSessionId

Webhook (demo implementation) listens for checkout.session.completed and finalizes:

Inserts booking range into Car.dates

Creates an Order record

Marks reservation as confirmed

Note: The webhook handler currently trusts parsed JSON payload for demo purposes. In production you should validate Stripe signature using the raw request body + webhook secret.

Security & Hardening

Helmet headers

Rate limiting (auth/contact/admin)

CSRF protection (csurf) on form routes

Session storage in MongoDB (connect-mongodb-session) with rolling idle expiry

Tech Stack

Backend: Node.js, Express

DB: MongoDB + Mongoose

Sessions: express-session + connect-mongodb-session (TTL + rolling)

Payments: Stripe Checkout

Views: EJS

Styling: Tailwind (build script included)

Reservation Model (Important Fields)

carId

sessionId

status: pending | processing | confirmed | cancelled | expired

holdExpiresAt (server-side hold expiry)

stripeSessionId (checkout session link)

Active hold statuses:

pending, processing (see utils/reservationHelpers.js)

Hold window:

HOLD_WINDOW_MS = 20 minutes (matches session idle timeout)

Getting Started
1) Install
npm install

2) Environment Variables

Create .env in the project root:

MONGODB_URI=mongodb://localhost:27017/luxride
SESSION_SECRET=change-me
STRIPE_SECRET=sk_test_...
NODE_ENV=development
PORT=3000

3) Run
npm start


Server will run on:

http://localhost:3000

4) Tailwind build (optional)
npm run dev:css
# or
npm run build:css

How Anti Double-Booking Works (Short Explanation)

When a user starts checkout, the server creates or reuses a reservation hold:

Check availability:

reject if Car.dates overlaps (already booked), or

reject if another session holds an overlapping active reservation (pending/processing and not expired)

Create/refresh reservation hold:

reservation is bound to the current sessionId

hold expiry is extended on activity

Housekeeping:

if session expires / disappears, or hold expires, reservation becomes expired

blocked cars become available again automatically

This prevents two users from paying for (or holding) the same car in the same time window.

Project Structure

server.js – app setup + sessions + housekeeping jobs

controllers/ – request handlers (search, order, payment, admin)

services/ – business logic (reservation hold, finalization)

models/ – Mongoose schemas (Car, Reservation, Order, etc.)

utils/ – pricing, date/time helpers, reservation helpers, booking sync

routes/ – Express routes

views/ – EJS templates

public/ – static assets

Production Hardening (Required for Production Use)

This repository represents a demo implementation. To ship this system safely into production, the following improvements are required:

1) Close the micro race window (anti double-booking)

Even with database checks, a small concurrency window exists where two parallel requests can pass validation before state is persisted.

To guarantee atomicity under concurrency and across multiple app instances:

Introduce Redis-based locking around the reservation hold / confirmation critical section
(e.g. SET key value NX PX <ttl>).

Use a per-resource lock key such as:

lock:car:<carId>:<from>:<to>


The lock TTL should be aligned with the reservation hold window.

Only the lock holder is allowed to create, refresh, or confirm a reservation.

This eliminates race conditions and prevents double-booking under high load.

2) Stripe webhook security

The webhook handler must verify Stripe webhook signatures using the raw request body and the webhook secret.

This protects against:

forged webhook events

replay attacks

unauthorized booking confirmations

3) Idempotent webhook finalization

Stripe webhooks can be delivered multiple times.

To prevent duplicate side effects:

Store stripe_event_id as unique

or enforce uniqueness on stripe_session_id

Ignore repeated webhook events that were already processed

This ensures bookings and payments are finalized exactly once.

4) Database transactions for critical booking steps

For production reliability:

Use MongoDB transactions (sessions) for critical steps such as:

reservation → confirmed

inserting booked date ranges

creating order records

This prevents partial writes if a failure occurs mid-flow.

5) Logging & observability

Add structured logging and monitoring around booking state transitions:

reservation created / refreshed

reservation expired

payment confirmed

booking finalized

This is essential for debugging disputes, audits, and production incidents.

License

MIT
