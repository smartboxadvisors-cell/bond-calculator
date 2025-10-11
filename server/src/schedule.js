import { toISO, addMonths, compareISO, fromISO, endOfMonth, yearFrac } from './daycount.js';

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
  redemptionPct = 100,
  dayCount = 'ACT365F'
} = {}) {
  const faceValue = sanitizeNumber(face, 100);
  const rate = sanitizeNumber(couponRate, 0);
  const frequencyMonths = Math.max(1, Math.floor(sanitizeNumber(freqMonths, 6)));
  const redemptionPercent = sanitizeNumber(redemptionPct, 100);
  const dayCountConvention = typeof dayCount === 'string' && dayCount.trim()
    ? dayCount.trim().toUpperCase()
    : 'ACT365F';

  const issueISO = toISO(issueDate);
  const maturityISO = toISO(maturityDate);
  const redemptionAmountRaw = faceValue * (redemptionPercent / 100);
  const redemptionAmount = Number.isFinite(redemptionAmountRaw) ? Number(redemptionAmountRaw.toFixed(8)) : 0;

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

  const periods = [];
  let periodStartISO = issueISO;
  for (let index = 0; index < couponDates.length; index += 1) {
    const periodEndISO = couponDates[index];
    const accrualFactorRaw = yearFrac(dayCountConvention, periodStartISO, periodEndISO);
    const accrualFactor = Number.isFinite(accrualFactorRaw) && accrualFactorRaw > 0 ? accrualFactorRaw : 0;
    const couponAmountRaw = faceValue * rate * accrualFactor;
    const couponAmount = Number.isFinite(couponAmountRaw) ? Number(couponAmountRaw.toFixed(8)) : 0;
    const isFinal = index === couponDates.length - 1;
    const periodRedemption = isFinal ? redemptionAmount : 0;
    const totalAmount = Number((couponAmount + periodRedemption).toFixed(8));

    periods.push({
      start: periodStartISO,
      end: periodEndISO,
      accrualFactor: Number(accrualFactor.toFixed(12)),
      couponAmount,
      redemptionAmount: periodRedemption,
      totalAmount
    });

    periodStartISO = periodEndISO;
  }

  const cashflows = periods.map(period => ({
    date: period.end,
    amount: period.totalAmount
  }));

  return {
    cashflows,
    couponAmount: periods.length ? periods[0].couponAmount : 0,
    redemptionAmount,
    couponDates,
    periods
  };
}
