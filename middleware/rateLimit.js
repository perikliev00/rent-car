const rateLimit = require('express-rate-limit');

function defaultHandler(req, res /*, next */) {
  const preferred = typeof req.accepts === 'function'
    ? req.accepts(['html', 'json'])
    : null;

  if (preferred === 'html') {
    return res.status(429).render('error/500', {
      title: 'Too Many Requests',
      message: 'Too many requests. Please wait a bit and try again.',
    });
  }

  return res
    .status(429)
    .json({ error: 'Too many requests, please slow down.' });
}

function createLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: defaultHandler,
    ...options,
  });
}

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

const contactLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
});

const adminLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

module.exports = {
  authLimiter,
  contactLimiter,
  adminLimiter,
};

