const { parseSofiaDate } = require('./timeZone');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute rental days between two Date objects.
 * - Minimum 1 day
 * - Uses ceil on the difference in days
 */
function computeRentalDays(startDate, endDate) {
  if (
    !(startDate instanceof Date) ||
    Number.isNaN(startDate.getTime()) ||
    !(endDate instanceof Date) ||
    Number.isNaN(endDate.getTime())
  ) {
    throw new Error('Invalid dates passed to computeRentalDays');
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const days = Math.ceil(diffMs / MS_PER_DAY);
  return Math.max(1, days);
}

/**
 * Validate and normalize booking dates coming from the UI.
 *
 * Inputs:
 * - pickupDate, returnDate: strings from form (e.g. "2025-11-28")
 * - pickupTime, returnTime: optional time strings ("HH:MM"), with sensible defaults
 * - now: optional Date for "current time", default = new Date()
 *
 * Behavior:
 * - Allow "today", but not dates strictly before "today".
 * - Ensure return >= pickup (if your current controllers require at least 1 day,
 *   keep the same logic here – do NOT relax restrictions).
 * - Use parseSofiaDate so all comparisons are in Europe/Sofia timezone.
 *
 * Return shape:
 * {
 *   isValid: boolean,
 *   errors: string[],
 *   startDate: Date | null,
 *   endDate: Date | null,
 *   rentalDays: number | null
 * }
 */
function validateBookingDates({
  pickupDate,
  returnDate,
  pickupTime = '00:00',
  returnTime = '23:59',
  now = new Date(),
}) {
  const errors = [];

  // Parse dates using the existing timezone helper
  const start = parseSofiaDate(pickupDate, pickupTime);
  const end = parseSofiaDate(returnDate, returnTime);

  if (
    !start ||
    Number.isNaN(start.getTime()) ||
    !end ||
    Number.isNaN(end.getTime())
  ) {
    errors.push('Invalid date format.');
    return {
      isValid: false,
      errors,
      startDate: null,
      endDate: null,
      rentalDays: null,
    };
  }

  // "today" in Europe/Sofia – approximate via the local date of "now"
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (start < today || end < today) {
    errors.push('Pick-up and return dates cannot be in the past.');
  }

  // Keep behavior consistent with the existing code:
  // enforce at least one full day – end must be strictly after start.
  if (end <= start) {
    errors.push('Return date must be after pick-up date.');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      startDate: start,
      endDate: end,
      rentalDays: null,
    };
  }

  const rentalDays = computeRentalDays(start, end);

  return {
    isValid: true,
    errors: [],
    startDate: start,
    endDate: end,
    rentalDays,
  };
}

module.exports = {
  MS_PER_DAY,
  computeRentalDays,
  validateBookingDates,
};


