const MONTHS_EN = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTHS_BG = {
  'ян': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'май': 4, 'юни': 5, 'юли': 6, 'авг': 7, 'сеп': 8, 'окт': 9, 'ное': 10, 'дек': 11,
};

function toDateSafe(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseD_MMM_YYYY(str, time) {
  if (!str) return null;
  const m = String(str).trim();
  const parts = m.split(/\s+/);
  if (parts.length < 3) return null;
  const day = parseInt(parts[0], 10);
  const monKey = parts[1].toLowerCase().slice(0, 3);
  const year = parseInt(parts[2], 10);
  let mon = MONTHS_EN[monKey];
  if (typeof mon === 'undefined') {
    const monKeyBg = parts[1].toLowerCase().slice(0, 3);
    mon = MONTHS_BG[monKeyBg];
  }
  if (!(year > 1900) || !(day >= 1 && day <= 31) || typeof mon === 'undefined') return null;
  let h = 0; let mi = 0;
  if (time) {
    const mt = String(time).trim().match(/^(\d{1,2}):(\d{2})/);
    if (mt) { h = parseInt(mt[1], 10); mi = parseInt(mt[2], 10); }
  }
  const d = new Date(year, mon, day, h, mi, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse order dates from req.body in a robust way.
 * Prefers ISO fields (pickupDateISO/returnDateISO) + pickupTime/returnTime.
 * Falls back to display strings like "7 Dec 2025" (+ time).
 * Returns { pickupAt, returnAt, pickupISO, returnISO, rentalDays }
 */
function parseOrderDatesFromReq(req) {
  const b = req.body || {};
  const {
    pickupDateISO, returnDateISO,
    pickupDate, returnDate,
    pickupTime, returnTime,
  } = b;

  const isoWithTime = (dateISO, time) => {
    if (!dateISO) return null;
    let s = String(dateISO).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && time) s = `${s}T${String(time).trim()}:00`;
    return toDateSafe(s);
  };

  let pickupAt = isoWithTime(pickupDateISO, pickupTime) || toDateSafe(pickupDateISO);
  let returnAt = isoWithTime(returnDateISO, returnTime) || toDateSafe(returnDateISO);

  if (!pickupAt) pickupAt = parseD_MMM_YYYY(pickupDate, pickupTime) || toDateSafe(pickupDate);
  if (!returnAt) returnAt = parseD_MMM_YYYY(returnDate, returnTime) || toDateSafe(returnDate);

  if (!pickupAt || !returnAt) return null;
  if (returnAt.getTime() <= pickupAt.getTime()) return null;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const rentalDays = Math.max(1, Math.round((returnAt - pickupAt) / MS_PER_DAY));
  return {
    pickupAt,
    returnAt,
    pickupISO: pickupAt.toISOString(),
    returnISO: returnAt.toISOString(),
    rentalDays,
  };
}

module.exports = { parseOrderDatesFromReq };


