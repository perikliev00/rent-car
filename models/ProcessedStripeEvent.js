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
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripeSessionId: {
      type: String,
      index: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcessedStripeEvent', processedStripeEventSchema);
