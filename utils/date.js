function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Parses ISO string (Z or offset) safely; returns Date or null */
function parseISOorNull(v) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return isValidDate(d) ? d : null;
}

/** Joins date string and optional time string (naive local) → Date or null */
function fromPartsOrNull(dateStr, timeStr) {
  const d = (dateStr || '').trim();
  const t = (timeStr || '').trim();
  if (!d) return null;
  const combined = t ? `${d}T${t}` : d;
  const dt = new Date(combined);
  return isValidDate(dt) ? dt : null;
}

/** Best-effort parse using ISO → fallback → parts */
function bestEffortRange(body) {
  const {
    pickupDateISO, returnDateISO,
    pickupDate, returnDate,
    pickupTime,  returnTime,
  } = body || {};

  const start = parseISOorNull(pickupDateISO)
             || parseISOorNull(pickupDate)
             || fromPartsOrNull(pickupDate, pickupTime);

  const end   = parseISOorNull(returnDateISO)
             || parseISOorNull(returnDate)
             || fromPartsOrNull(returnDate, returnTime);

  return { start, end };
}

module.exports = {
  isValidDate,
  parseISOorNull,
  fromPartsOrNull,
  bestEffortRange,
};

