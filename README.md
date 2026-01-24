# Rent-a-Car – Session-Bound Reservations & Anti Double-Booking

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
pending → processing (Stripe session created) → confirmed (payment completed)
↓
expired / cancelled


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
- Reservation status transitions to `processing`
- Reservation is linked to `stripeSessionId`
- Webhook (`checkout.session.completed`) finalizes the booking:
  - Inserts booked date range into `Car.dates`
  - Creates an `Order` record
  - Marks the reservation as `confirmed`

> ⚠️ **Note:**  
> The webhook handler trusts parsed JSON payload for demo purposes.  
> Production usage must validate Stripe signatures using the **raw request body** and webhook secret.

---

## Security & Hardening (Demo Level)

- Helmet security headers
- Rate limiting (auth / contact / admin routes)
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
- `stripeSessionId`

Active hold statuses:
- `pending`
- `processing`  
(see `utils/reservationHelpers.js`)

---

## Getting Started

### Installation
```bash
npm install
Environment Variables
Create a .env file in the project root:

MONGODB_URI=mongodb://localhost:27017/luxride
SESSION_SECRET=change-me
STRIPE_SECRET=sk_test_...
NODE_ENV=development
PORT=3000
Run
npm start
Server runs at:

http://localhost:3000
Tailwind (optional)
npm run dev:css
# or
npm run build:css
How Anti Double-Booking Works (Short)
Availability check

Reject if dates overlap with confirmed bookings

Reject if another session holds the same car (active, not expired)

Create or refresh reservation hold

Bound to current session

Hold expiration extended on activity

Cleanup

Expired sessions or holds automatically release the car

This prevents multiple users from holding or paying for the same car simultaneously.

Project Structure
server.js — app setup, sessions, housekeeping jobs

controllers/ — request handlers

services/ — booking & reservation logic

models/ — Mongoose schemas

utils/ — date, pricing, reservation helpers

routes/ — Express routes

views/ — EJS templates

public/ — static assets

Production Hardening (Required for Production Use)
This repository represents a demo implementation.
For production-grade usage, the following improvements are required:

1) Close the micro race window (anti double-booking)
Even with database checks, a small concurrency window exists.

Add Redis-based locking around the hold / confirm critical section
(e.g. SET key value NX PX <ttl>)

Use per-resource lock keys:

lock:car:<carId>:<from>:<to>
Lock TTL should match the hold window

Only the lock holder may create, refresh, or confirm a reservation

2) Stripe webhook security
Verify Stripe webhook signatures using the raw request body

Prevent forged events, replay attacks, and unauthorized confirmations

3) Idempotent webhook finalization
Store stripe_event_id as unique

Enforce uniqueness on stripeSessionId

Ignore already-processed events

4) Database transactions
Use MongoDB sessions for critical operations:

reservation → confirmed

inserting booked date ranges

creating orders

5) Logging & Observability
Add structured logs for:

reservation creation / refresh

expiration

payment confirmation

booking finalization

License
MIT
