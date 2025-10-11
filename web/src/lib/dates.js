const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDate(value) {
  if (!value) throw new Error('Date value required');
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const str = String(value).trim();
  if (ISO_REGEX.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

export function toISO(value) {
  return parseDate(value).toISOString().slice(0, 10);
}

export function formatDisplayDate(value) {
  if (!value) return '';
  const date = parseDate(value);
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function daysInMonth(year, monthIndexZero) {
  return new Date(Date.UTC(year, monthIndexZero + 1, 0)).getUTCDate();
}

export function addMonths(value, months) {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = daysInMonth(year, month);
  date.setUTCDate(Math.min(day, lastDay));
  return toISO(date);
}

export function buildDates(start, freqMonths, count) {
  const total = Math.max(0, Number(count || 0));
  const dates = [];
  let current = toISO(start);
  for (let i = 0; i < total; i += 1) {
    current = addMonths(current, freqMonths);
    dates.push(current);
  }
  return dates;
}

export function addDays(value, days) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return toISO(date);
}

export function isBusinessDay(value) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function nextBusinessDay(value, direction = 1) {
  const step = direction >= 0 ? 1 : -1;
  const date = parseDate(value);
  do {
    date.setUTCDate(date.getUTCDate() + step);
  } while (!isBusinessDay(date));
  return toISO(date);
}

export function ensureBusinessDay(value, direction = 1) {
  return isBusinessDay(value) ? toISO(value) : nextBusinessDay(value, direction);
}

export function businessDaySequence(start, count, options = {}) {
  const total = Math.max(0, Number(count || 0));
  if (!total) return [];
  const { includeStart = false } = options;
  const dates = [];
  let current = includeStart ? ensureBusinessDay(start) : nextBusinessDay(start);
  while (dates.length < total) {
    dates.push(current);
    current = nextBusinessDay(current);
  }
  return dates;
}
