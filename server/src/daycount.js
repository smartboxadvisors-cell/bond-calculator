const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function coerceDate(value) {
  if (!value) throw new Error('Date value is required');
  if (value instanceof Date) return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  ));
  if (typeof value === 'string' && ISO_REGEX.test(value.trim())) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  ));
}

export function toISO(value) {
  const date = coerceDate(value);
  return date.toISOString().slice(0, 10);
}

export function fromISO(value) {
  return coerceDate(value);
}

export function isWeekend(value) {
  const date = coerceDate(value);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function daysBetween(start, end) {
  const startDate = coerceDate(start);
  const endDate = coerceDate(end);
  return Math.round((endDate - startDate) / MS_PER_DAY);
}

function daysInMonth(year, monthIndexZeroBased) {
  return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

export function endOfMonth(value) {
  const date = coerceDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return toISO(date);
}

export function addDays(value, days) {
  const date = coerceDate(value);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return toISO(date);
}

export function addMonths(value, months, anchorDay) {
  const date = coerceDate(value);
  const referenceDay = Number.isFinite(anchorDay) ? Number(anchorDay) : date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = daysInMonth(year, month);
  date.setUTCDate(Math.min(referenceDay, lastDay));
  return toISO(date);
}

export function nextBusinessDay(value, direction = 1) {
  const step = direction >= 0 ? 1 : -1;
  const date = coerceDate(value);
  do {
    date.setUTCDate(date.getUTCDate() + step);
  } while (isWeekend(date));
  return toISO(date);
}

export function previousBusinessDay(value) {
  return nextBusinessDay(value, -1);
}

export function rollBusiness(value, roll = 'FOLLOWING') {
  const rollType = (roll || 'FOLLOWING').toUpperCase();
  const original = coerceDate(value);
  if (!isWeekend(original)) {
    return toISO(original);
  }

  const forwardDate = new Date(original);
  while (isWeekend(forwardDate)) {
    forwardDate.setUTCDate(forwardDate.getUTCDate() + 1);
  }

  if (rollType === 'FOLLOWING') {
    return toISO(forwardDate);
  }

  if (rollType === 'PRECEDING') {
    const backward = new Date(original);
    while (isWeekend(backward)) {
      backward.setUTCDate(backward.getUTCDate() - 1);
    }
    return toISO(backward);
  }

  if (rollType === 'MODFOLLOW' || rollType === 'MODIFIEDFOLLOWING') {
    const sameMonth = forwardDate.getUTCMonth() === original.getUTCMonth();
    if (sameMonth) {
      return toISO(forwardDate);
    }
    const backward = new Date(original);
    while (isWeekend(backward)) {
      backward.setUTCDate(backward.getUTCDate() - 1);
    }
    return toISO(backward);
  }

  return toISO(forwardDate);
}

export function yearFrac(dc, start, end) {
  const convention = (dc || 'ACT365F').toUpperCase();
  const startDate = coerceDate(start);
  const endDate = coerceDate(end);
  if (endDate <= startDate) return 0;

  if (convention === 'ACT365F') {
    return (endDate - startDate) / (MS_PER_DAY * 365);
  }

  if (convention === 'ACT360') {
    return (endDate - startDate) / (MS_PER_DAY * 360);
  }

  if (convention === '30360US' || convention === '30/360US' || convention === '30/360-US') {
    let [y1, m1, d1] = [startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate()];
    let [y2, m2, d2] = [endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()];

    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) {
      d2 = 30;
    }

    const numerator = 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
    return numerator / 360;
  }

  throw new Error(`Unsupported day-count convention: ${dc}`);
}

export function compareISO(a, b) {
  return fromISO(a) - fromISO(b);
}