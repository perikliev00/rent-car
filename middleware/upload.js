const path = require('path');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'public', 'images'));
    },
    filename: function (req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `car-${unique}${ext}`);
    }
});

function fileFilter (req, file, cb) {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    // Mark that a file was rejected so validation middleware can catch it
    req.fileRejected = true;
    // Reject file without throwing error (prevents server crash)
    cb(null, false);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = { upload };


