// Mongoose предоставя user/auth schema.
const mongoose = require('mongoose');

// Кратък alias за по-лесно деклариране на schema.
const Schema = mongoose.Schema;

// User документи – authentication и admin authorization.
const userSchema = new Schema({
    email: {
        // Login идентификатор за потребителя.
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        // bcrypt hash на паролата.
        type: String,
        required: true
    },
    role: {
        // Authorization роль – проверява се от admin middleware.
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        required: true
    },
// Явно име на колекция – auth данни в users.
}, { collection: 'users' });

// Експорт на User модела.
module.exports = mongoose.model('User', userSchema);
