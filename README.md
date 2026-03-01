# LuxRide – Session-Bound Reservations & Anti Double-Booking

A full-stack **rent-a-car booking demo** built with **Node.js / Express**, **MongoDB / Mongoose**, **EJS**, and **Stripe Checkout**.

The project focuses on **real-world booking safety**: preventing double-booking through **session-bound reservation holds**, **automatic expiration**, and **background cleanup jobs**.

---

## Key Features

### Booking & Availability

- Search cars by **date/time** and **pickup/return locations**
- Availability is validated against:
  - **Confirmed bookings** stored in `Car.dates` (booked date ranges)
  - **Active reservation holds** stored in `Reservation` (`pending` / `processing`)

### Anti Double-Booking

- A car becomes **temporarily blocked** when another session holds it  
  (`pending` / `processing` + `holdExpiresAt` not expired)
- The **holding session is excluded** from the blocked list, allowing the same user session to continue checkout

---

## Session-Bound Reservation Holds (Core)

- Every reservation is tied **1:1 to a server-side session** (`Reservation.sessionId`)
- Hold window is aligned with session idle timeout  
  (**default: 20 minutes**)

### Reservation Lifecycle

```
pending → processing (Stripe session created) → confirmed (payment completed)
   ↓
expired / cancelled
```

- Holds automatically expire if the session ends or becomes inactive

---

## Automated Cleanup (Housekeeping)

Background jobs run every **3 minutes**:

- Remove outdated entries from `Car.dates`
- Mark reservations as `expired` when:
  - `holdExpiresAt` has passed
  - `sessionId` is missing
  - the referenced session no longer exists or is expired

This ensures abandoned sessions never permanently block availability.

---

## Payments (Stripe Checkout)

- Stripe Checkout session is created **server-side**
- Reservation status transitions to `processing` and is linked to `stripeSessionId`
- **Webhook** (`checkout.session.completed`) is the primary path for finalizing the booking:
  - Verifies request signature using `STRIPE_WEBHOOK_SECRET` and **raw request body**
  - Uses **ProcessedStripeEvent** (by `event.id`) for idempotency—duplicate deliveries return 200 without re-running finalization
  - Inserts booked date range into `Car.dates`
  - Creates an `Order` record
  - Marks the reservation as `confirmed`
- **Success page** (`GET /success`) may also trigger sync finalization (idempotent); the webhook remains the authoritative source for production

> ⚠️ **Production:** Ensure `STRIPE_WEBHOOK_SECRET` is set and that the webhook route is mounted with `express.raw({ type: 'application/json' })` so signature verification receives the raw body.

---

## Security & Hardening (Demo Level)

- Helmet security headers (CSP with nonce for scripts, Stripe frames allowed)
- Rate limiting (auth, contact, admin routes)
- CSRF protection (`csurf`) on form submissions
- Session storage in MongoDB with rolling idle expiration

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** MongoDB + Mongoose
- **Sessions:** express-session + connect-mongodb-session
- **Payments:** Stripe Checkout
- **Views:** EJS
- **Styling:** Tailwind CSS

---

## Reservation Model (Important Fields)

- `carId`
- `sessionId`
- `status` — `pending | processing | confirmed | cancelled | expired`
- `holdExpiresAt`
- `stripeSessionId` (unique, sparse)
- `stripePaymentIntentId` (optional)

**Active hold statuses:** `pending`, `processing`  
(See `utils/reservationHelpers.js`.)

---

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/luxride
SESSION_SECRET=change-me
STRIPE_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=development
PORT=3000
```

### Run

```bash
npm start
```

Server runs at **http://localhost:3000** (uses nodemon in development).

### Tailwind (optional)

```bash
npm run dev:css
# or
npm run build:css
```

---

## How Anti Double-Booking Works (Short)

1. **Availability check**  
   Reject if dates overlap with confirmed bookings or if another session holds the same car (active, not expired).

2. **Create or refresh reservation hold**  
   Bound to current session; hold expiration extended on activity.

3. **Cleanup**  
   Expired sessions or holds automatically release the car.

This prevents multiple users from holding or paying for the same car simultaneously.

---

## Project Structure

| Path | Description |
|------|-------------|
| `server.js` | App setup, session store, housekeeping jobs, webhook mount |
| `controllers/` | Request handlers (booking, checkout, payment, admin, auth, etc.) |
| `services/` | Booking, reservation, payment, finalization logic |
| `models/` | Mongoose schemas (Car, Reservation, Order, User, Contact, ProcessedStripeEvent) |
| `utils/` | Date, pricing, reservation helpers, booking validation |
| `routes/` | Express route definitions |
| `middleware/` | Auth, CSRF, rate limit, upload |
| `config/` | Security (Helmet/CSP), Stripe |
| `views/` | EJS templates |
| `public/` | Static assets (CSS, JS, images) |

---

## Production Hardening (Required for Production Use)

This repository is a **demo implementation**. For production:

1. **Close the micro race window (anti double-booking)**  
   Add Redis-based locking around the hold/confirm critical section (e.g. `SET key value NX PX <ttl>`). Use per-resource lock keys such as `lock:car:<carId>:<from>:<to>`. Only the lock holder may create, refresh, or confirm a reservation.

2. **Stripe webhook security**  
   Signature verification is already implemented; ensure `STRIPE_WEBHOOK_SECRET` is set and the webhook receives the raw body.

3. **Idempotent webhook finalization**  
   Already implemented via `ProcessedStripeEvent` (unique `eventId`). Enforce uniqueness on `stripeSessionId` where applicable and ignore already-processed events.

4. **Database transactions**  
   Use MongoDB transactions for: reservation → confirmed, inserting booked date ranges, and creating orders.

5. **Logging & observability**  
   Add structured logs for reservation creation/refresh, expiration, payment confirmation, and booking finalization.

---

## License

MIT
