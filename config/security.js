const helmet = require('helmet');

/**
 * Apply security headers. Keep CSP nonce-based for scripts.
 * @param {import('express').Express} app
 * @param {{ isProd: boolean }} opts
 */
function applySecurity(app, { isProd }) {
  // ---- Helmet base with CSP ----
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // Scripts: local + per-request nonce + Stripe + jsdelivr (if used)
        "script-src": [
          "'self'",
          // NOTE: res.locals.cspNonce must be set earlier by middleware
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://js.stripe.com",
          "https://m.stripe.network",
          "https://cdn.jsdelivr.net"
        ],
        // Explicitly allow script elements from same sources (avoids fallback quirks)
        "script-src-elem": [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://js.stripe.com",
          "https://m.stripe.network",
          "https://cdn.jsdelivr.net"
        ],
        // Disallow inline attributes like onclick
        "script-src-attr": ["'none'"],
        // Stripe frames/popups
        "frame-src": [
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          "https://checkout.stripe.com"
        ],
        // XHR/fetch to Stripe
        "connect-src": ["'self'", "https://api.stripe.com", "https://m.stripe.network"],
        // Allow posting forms to Stripe checkout
        "form-action": ["'self'", "https://checkout.stripe.com"],
        // Styles: allow inline for EJS/Tailwind + external CSS used in the project
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        // Images & fonts (allow https: if some car images are off-site)
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        // Workers/manifests
        "worker-src": ["'self'", "blob:"],
        "manifest-src": ["'self'"],
        // Lockdown
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        // Production-only stricter ancestors & upgrade
        ...(isProd ? {
          "frame-ancestors": ["'self'"],
          "upgrade-insecure-requests": []
        } : {})
      }
    },
    // Keep COEP off unless you explicitly need it
    crossOriginEmbedderPolicy: false,
    // X-Frame-Options (frameguard). Redundant if frame-ancestors present, but OK to keep.
    frameguard: { action: 'sameorigin' },
    // MIME sniffing protections
    noSniff: true,
    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // HSTS only in production (requires HTTPS)
    hsts: isProd ? {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false
    } : false,
  }));

  // Minimal Permissions-Policy (Feature-Policy successor)
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
}

module.exports = applySecurity;

