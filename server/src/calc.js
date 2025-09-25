import { toISO, compareISO, yearFrac } from './daycount.js';

function normalizeYield(value, fallback = 0.05) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (Math.abs(num) > 1.5) {
    return num / 100;
  }
  return num;
}

function compFrequency(comp) {
  const mode = (comp || 'ANNUAL').toUpperCase();
  if (mode === 'SEMI' || mode === 'SEMIANNUAL') return 2;
  return 1; // Treat STREET and ANNUAL equivalently for now
}

function normalizeCashflows(flows = []) {
  return flows
    .map(flow => ({
      date: toISO(flow.date),
      amount: Number(flow.amount)
    }))
    .filter(flow => Number.isFinite(flow.amount))
    .sort((a, b) => compareISO(a.date, b.date));
}

function discountFactor(settlementISO, paymentISO, y, dc, comp) {
  const freq = compFrequency(comp);
  const t = yearFrac(dc, settlementISO, paymentISO);
  if (t <= 0) return 1;
  const base = 1 + y / freq;
  const exponent = t * freq;
  return 1 / Math.pow(base, exponent);
}

export function priceFromYield(settlementISO, flows, yieldInput, dc = 'ACT365F', comp = 'ANNUAL') {
  const settlement = toISO(settlementISO);
  const y = normalizeYield(yieldInput, 0.05);
  const futureFlows = normalizeCashflows(flows).filter(flow => compareISO(flow.date, settlement) >= 0);
  const price = futureFlows.reduce((acc, flow) => {
    const df = discountFactor(settlement, flow.date, y, dc, comp);
    return acc + flow.amount * df;
  }, 0);
  return Number(price.toFixed(8));
}

export function ytmFromPrice(settlementISO, flows, targetPrice, dc = 'ACT365F', comp = 'ANNUAL') {
  const settlement = toISO(settlementISO);
  const cashflows = normalizeCashflows(flows).filter(flow => compareISO(flow.date, settlement) >= 0);
  if (!cashflows.length) {
    return 0;
  }

  const priceTarget = Number(targetPrice);
  if (!Number.isFinite(priceTarget)) {
    throw new Error('Invalid target price');
  }

  let y = normalizeYield(priceTarget >= 100 ? 0.05 : 0.02);
  let iteration = 0;
  const maxIterations = 100;
  const tolerance = 1e-8;
  const epsilon = 1e-5;

  while (iteration < maxIterations) {
    iteration += 1;
    const price = priceFromYield(settlement, cashflows, y, dc, comp);
    const diff = price - priceTarget;
    if (Math.abs(diff) < tolerance) {
      return Number(y.toFixed(8));
    }

    const priceUp = priceFromYield(settlement, cashflows, y + epsilon, dc, comp);
    const priceDown = priceFromYield(settlement, cashflows, y - epsilon, dc, comp);
    const derivative = (priceUp - priceDown) / (2 * epsilon);

    if (Math.abs(derivative) < 1e-10) {
      const adjustment = diff > 0 ? 0.01 : -0.01;
      y += adjustment;
    } else {
      y -= diff / derivative;
    }

    if (!Number.isFinite(y) || y <= -0.99) {
      y = 0.0001;
    }
  }

  return Number(y.toFixed(8));
}

export function riskStats(settlementISO, flows, yieldInput, dc = 'ACT365F', comp = 'ANNUAL') {
  const settlement = toISO(settlementISO);
  const y = normalizeYield(yieldInput, 0.05);
  const freq = compFrequency(comp);
  const cashflows = normalizeCashflows(flows).filter(flow => compareISO(flow.date, settlement) >= 0);

  const price = priceFromYield(settlement, cashflows, y, dc, comp);
  if (price === 0 || !cashflows.length) {
    return { price: 0, macaulay: 0, modified: 0, dv01: 0, convexity: 0 };
  }

  const discounted = cashflows.map(flow => {
    const t = yearFrac(dc, settlement, flow.date);
    const df = discountFactor(settlement, flow.date, y, dc, comp);
    return {
      t,
      pv: flow.amount * df
    };
  });

  const weightedSum = discounted.reduce((acc, item) => acc + item.t * item.pv, 0);
  const macaulay = weightedSum / price;
  const modified = macaulay / (1 + y / freq);
  const convexNumer = discounted.reduce(
    (acc, item) => acc + item.pv * item.t * (item.t + 1 / freq),
    0
  );
  const convexity = convexNumer / (price * Math.pow(1 + y / freq, 2));
  const dv01 = modified * price * 0.0001;

  return {
    price: Number(price.toFixed(8)),
    macaulay: Number(macaulay.toFixed(8)),
    modified: Number(modified.toFixed(8)),
    dv01: Number(dv01.toFixed(8)),
    convexity: Number(convexity.toFixed(8))
  };
}

export function accruedInterest(dc, lastCouponISO, settlementISO, nextCouponISO, couponPerPeriod) {
  if (!lastCouponISO || !nextCouponISO || !Number.isFinite(couponPerPeriod)) {
    return 0;
  }
  const period = yearFrac(dc, lastCouponISO, nextCouponISO);
  if (period <= 0) {
    return 0;
  }
  const accruedFraction = yearFrac(dc, lastCouponISO, settlementISO);
  if (accruedFraction <= 0) {
    return 0;
  }
  const accrued = couponPerPeriod * (accruedFraction / period);
  return Number(accrued.toFixed(8));
}