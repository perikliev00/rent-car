const SOFIA_TZ = 'Europe/Sofia';

function getOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const data = {};

  for (const { type, value } of parts) {
    data[type] = value;
  }

  const year = Number(data.year);
  const month = Number(data.month);
  const day = Number(data.day);
  const hour = Number(data.hour);
  const minute = Number(data.minute);
  const second = Number(data.second);

  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    return 0;
  }

  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUTC - date.getTime()) / 60000;
}

function parseSofiaDate(dateString, timeString = '00:00') {
  if (!dateString) return null;

  const [yearStr, monthStr, dayStr] = String(dateString).split('-');
  const [hourStr = '00', minuteStr = '00'] = String(timeString || '00:00').split(':');

  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    return null;
  }

  const baseline = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getOffsetMinutes(SOFIA_TZ, baseline);
  return new Date(baseline.getTime() - offset * 60000);
}

module.exports = {
  SOFIA_TZ,
  parseSofiaDate,
};

