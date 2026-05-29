// Mongoose дефинира schema за идемпотентна обработка на Stripe webhooks.
const mongoose = require('mongoose');

/**
 * Колекция за вече обработени Stripe webhook events (идемпотентност).
 *
 * Stripe може да изпрати един и същ event многократно (retry при timeout/грешка).
 * Ако обработим същия event два пъти, ще създадем дублирани Order-и и ще добавим
 * дати два пъти в Car.dates. За да избегнем това, записваме event.id при първа
 * обработка; при повторна доставка insert-ът ще fail-не с duplicate key (11000)
 * и просто връщаме 200 без да финализираме отново.
 *
 * eventId — уникален идентификатор на event-а от Stripe (evt_xxx).
 * stripeSessionId — за удобство при дебъг/аудит; checkout session, свързан с event-а.
 * processedAt — кога сме обработили event-а.
 */
const processedStripeEventSchema = new mongoose.Schema(
  {
    // Уникален Stripe event id (evt_*) – primary idempotency key.
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Свързан Stripe checkout session id за debugging и correlation.
    stripeSessionId: {
      type: String,
      index: true,
    },
    // Timestamp кога приложението е записал event-а като обработен.
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  // Timestamps за operational debugging/history.
  { timestamps: true }
);

// Експорт на ProcessedStripeEvent модела.
module.exports = mongoose.model('ProcessedStripeEvent', processedStripeEventSchema);
