// path помага за OS-safe filesystem пътища към дестинациите на upload-нати файлове.
const path = require('path');
// multer обработва multipart/form-data uploads от admin car create/edit форми.
const multer = require('multer');

// Конфигурация как upload-натите файлове да се пазят на диска.
const storage = multer.diskStorage({
    // destination решава в коя папка се записва файлът.
    destination: function (req, file, cb) {
        // Запазваме car images в public/images – за static serving по-късно.
        cb(null, path.join(__dirname, '..', 'public', 'images'));
    },
    // filename решава финалното име на файла.
    filename: function (req, file, cb) {
        // Уникален суфикс – текущо време + random цифри за по-малък collision риск.
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        // Запазваме оригиналното file extension, lowercase.
        const ext = path.extname(file.originalname || '').toLowerCase();
        // Всяка снимка под предсказуем car-* prefix за по-лесно разпознаване.
        cb(null, `car-${unique}${ext}`);
    }
});

// fileFilter решава дали типът на upload-натия файл е приемлив.
function fileFilter (req, file, cb) {
    // Допускаме само обикновени raster image формати за car снимки.
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    // Извличаме extension от оригиналното име на клиента.
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Приемаме upload ако extension-ът е в allowlist.
    if (allowed.includes(ext)) return cb(null, true);
    // Маркираме, че файлът е отхвърлен – validation middleware да го хване.
    req.fileRejected = true;
    // Отхвърляме без throw – предотвратява счупване на сървъра.
    cb(null, false);
}

// Един конфигуриран multer instance – disk storage, file filter, 5MB лимит.
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Експорт – admin routes да извикват upload.single('image').
module.exports = { upload };
