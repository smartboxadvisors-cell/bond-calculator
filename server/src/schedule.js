import { toISO, addMonths, compareISO, fromISO, endOfMonth } from './daycount.js';

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function buildSchedule({
  face = 100,
  couponRate = 0,
  freqMonths = 6,
  issueDate,
  maturityDate,
  businessRoll = 'FOLLOWING',
  redemptionPct = 100
} = {}) {
  const faceValue = sanitizeNumber(face, 100);
  const rate = sanitizeNumber(couponRate, 0);
  const frequencyMonths = Math.max(1, Math.floor(sanitizeNumber(freqMonths, 6)));
  const redemptionPercent = sanitizeNumber(redemptionPct, 100);

  const issueISO = toISO(issueDate);
  const maturityISO = toISO(maturityDate);
  const couponPerPeriod = faceValue * rate * (frequencyMonths / 12);
  const redemptionAmount = faceValue * (redemptionPercent / 100);

  // Build coupon dates advancing from issue until maturity (inclusive)
  const couponDates = [];
  let cursorISO = issueISO;
  const anchorDay = fromISO(issueISO).getUTCDate();
  let safety = 0;
  while (compareISO(cursorISO, maturityISO) < 0 && safety < 600) {
    safety += 1;
    const nextMonthEnd = endOfMonth(addMonths(cursorISO, frequencyMonths, anchorDay));
    if (compareISO(nextMonthEnd, maturityISO) >= 0) {
      couponDates.push(endOfMonth(maturityISO));
      break;
    }
    couponDates.push(nextMonthEnd);
    cursorISO = nextMonthEnd;
  }

  if (couponDates.length === 0) {
    couponDates.push(endOfMonth(maturityISO));
  }

  const cashflows = couponDates.map((date, index) => {
    const baseCoupon = Number.isFinite(couponPerPeriod) ? couponPerPeriod : 0;
    const amount = index === couponDates.length - 1
      ? baseCoupon + redemptionAmount
      : baseCoupon;
    return {
      date,
      amount: Number(amount.toFixed(8))
    };
  });

  return {
    cashflows,
    couponAmount: Number(couponPerPeriod.toFixed(8)),
    redemptionAmount: Number(redemptionAmount.toFixed(8)),
    couponDates
  };
}