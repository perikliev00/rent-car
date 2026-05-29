// Mongoose дефинира schema за публични/support contact съобщения.
const mongoose = require('mongoose');

// Contact съобщения – клиентски/support запитвания от публични форми.
const contactSchema = new mongoose.Schema({
  // Име на подателя.
  name: { type: String, required: true },
  // Email адрес на подателя.
  email: { type: String, required: true },
  // Опционален телефонен номер.
  phone: { type: String },
  // Категория избрана в contact/support формата.
  subject: { type: String, required: true },
  // Свободен текст на съобщението.
  message: { type: String, required: true },
  // Прост workflow статус – управляван от admins.
  status: { type: String, enum: ['new', 'ready', 'done'], default: 'new' }
// Timestamps и фиксирано име на колекция.
}, { timestamps: true, collection: 'contacts' });

// Експорт на Contact модела.
module.exports = mongoose.model('Contact', contactSchema, 'contacts');
