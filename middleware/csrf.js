const csrf = require('csurf');

const csrfProtection = csrf();

function setCsrfToken(req, res, next) {
  if (typeof req.csrfToken === 'function') {
    try {
      res.locals.csrfToken = req.csrfToken();
    } catch (err) {
      return next(err);
    }
  }
  return next();
}

module.exports = {
  csrfProtection,
  setCsrfToken,
};


