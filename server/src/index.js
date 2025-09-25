import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import multer from 'multer';
import Papa from 'papaparse';

import { Bond } from './models.js';
import { buildSchedule } from './schedule.js';
import { priceFromYield, ytmFromPrice, riskStats, accruedInterest } from './calc.js';
import { toISO, addDays, rollBusiness, compareISO } from './daycount.js';

dotenv.config();

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bondcalc';

function sanitizeYield(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(num) > 1.5 ? num / 100 : num;
}

function parseCashflows(cashflows = []) {
  return (cashflows || [])
    .map(item => ({
      date: toISO(item.date),
      amount: Number(item.amount)
    }))
    .filter(item => item.date && Number.isFinite(item.amount));
}

function determineSettlement(settlementDate, lag = 0, rollType = 'FOLLOWING') {
  const base = toISO(settlementDate || new Date());
  const lagged = Number(lag) ? addDays(base, Number(lag)) : base;
  return rollBusiness(lagged, rollType || 'FOLLOWING');
}

function adjacentCoupons(dates = [], settlementISO) {
  if (!dates.length) {
    return { last: null, next: null };
  }
  const sorted = [...dates].sort((a, b) => compareISO(a, b));
  let last = null;
  let next = null;
  for (const date of sorted) {
    if (compareISO(date, settlementISO) <= 0) {
      last = date;
    } else {
      next = date;
      break;
    }
  }
  return { last, next };
}

async function seedBonds() {
  const count = await Bond.estimatedDocumentCount();
  if (count > 0) return;

  const seeds = [
    {
      isin: 'INE721A07RC0',
      face: 100,
      receipts: [8.55, 8.53, 8.55, 8.55, 8.55, 8.55, 8.55, 8.55, 108.55]
    },
    {
      isin: 'INE148I08298',
      face: 100,
      receipts: [8.35, 8.35, 108.3]
    },
    {
      isin: 'INE894F08087',
      face: 100,
      receipts: [10.65, 10.65, 10.65]
    }
  ];

  await Bond.insertMany(seeds);
  console.log('Seeded default bonds');
}

app.get('/api/bonds', async (req, res) => {
  try {
    const bonds = await Bond.find().sort({ isin: 1 }).lean();
    res.json(bonds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/uploadCF/:isin', upload.single('file'), async (req, res) => {
  try {
    const { isin } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const content = req.file.buffer.toString('utf8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
      return res.status(400).json({ error: parsed.errors[0].message });
    }

    const rows = parsed.data
      .map(row => ({
        date: row.date || row.Date,
        amount: row.amount ?? row.Amount
      }))
      .filter(row => row.date && row.amount !== undefined)
      .map(row => ({
        date: toISO(row.date),
        amount: Number(row.amount)
      }))
      .filter(row => Number.isFinite(row.amount));

    if (!rows.length) {
      return res.status(400).json({ error: 'No valid rows found in CSV' });
    }

    const bond = await Bond.findOneAndUpdate(
      { isin },
      { $set: { cashflows: rows } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, bond });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/priceSchedule', async (req, res) => {
  try {
    const { schedule = {}, settlementDate, quote = {} } = req.body || {};
    const {
      dayCount = 'ACT365F',
      compounding = 'ANNUAL',
      settlementLag = 0,
      businessRoll = 'FOLLOWING'
    } = schedule;

    const settlementISO = determineSettlement(settlementDate, settlementLag, businessRoll);
    const scheduleData = buildSchedule(schedule);
    const flows = scheduleData.cashflows;

    if (!flows.length) {
      return res.status(400).json({ error: 'Schedule produced no cashflows' });
    }

    const y = sanitizeYield(quote.yield);
    const dc = dayCount;
    const comp = compounding;

    const risk = riskStats(settlementISO, flows, y, dc, comp);
    const { last, next } = adjacentCoupons(scheduleData.couponDates, settlementISO);
    const accrued = accruedInterest(dc, last, settlementISO, next, scheduleData.couponAmount);
    const clean = risk.price - accrued;

    res.json({
      dirtyPer100: Number(risk.price.toFixed(8)),
      cleanPer100: Number(clean.toFixed(8)),
      accruedPer100: Number(accrued.toFixed(8)),
      ytm: Number(y.toFixed(8)),
      macaulay: risk.macaulay,
      modified: risk.modified,
      dv01: risk.dv01,
      convexity: risk.convexity,
      cashflows: flows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ytmSchedule', async (req, res) => {
  try {
    const { schedule = {}, settlementDate, quote = {} } = req.body || {};
    const {
      dayCount = 'ACT365F',
      compounding = 'ANNUAL',
      settlementLag = 0,
      businessRoll = 'FOLLOWING'
    } = schedule;

    const settlementISO = determineSettlement(settlementDate, settlementLag, businessRoll);
    const scheduleData = buildSchedule(schedule);
    const flows = scheduleData.cashflows;

    if (!flows.length) {
      return res.status(400).json({ error: 'Schedule produced no cashflows' });
    }

    const dc = dayCount;
    const comp = compounding;
    const targetPrice = Number(quote.pricePer100 ?? quote.price);
    if (!Number.isFinite(targetPrice)) {
      return res.status(400).json({ error: 'pricePer100 is required' });
    }

    const y = ytmFromPrice(settlementISO, flows, targetPrice, dc, comp);
    const risk = riskStats(settlementISO, flows, y, dc, comp);
    const { last, next } = adjacentCoupons(scheduleData.couponDates, settlementISO);
    const accrued = accruedInterest(dc, last, settlementISO, next, scheduleData.couponAmount);
    const clean = risk.price - accrued;

    res.json({
      dirtyPer100: Number(risk.price.toFixed(8)),
      cleanPer100: Number(clean.toFixed(8)),
      accruedPer100: Number(accrued.toFixed(8)),
      ytm: Number(y.toFixed(8)),
      macaulay: risk.macaulay,
      modified: risk.modified,
      dv01: risk.dv01,
      convexity: risk.convexity,
      cashflows: flows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/priceDirect', (req, res) => {
  try {
    const { settlementDate, cashflows = [], quote = {}, dayCount = 'ACT365F', comp = 'ANNUAL' } = req.body || {};
    const settlementISO = toISO(settlementDate || new Date());
    const flows = parseCashflows(cashflows);
    if (!flows.length) {
      return res.status(400).json({ error: 'No cashflows provided' });
    }

    const y = sanitizeYield(quote.yield);
    const risk = riskStats(settlementISO, flows, y, dayCount, comp);
    res.json({
      dirtyPer100: Number(risk.price.toFixed(8)),
      cleanPer100: Number(risk.price.toFixed(8)),
      accruedPer100: 0,
      ytm: Number(y.toFixed(8)),
      macaulay: risk.macaulay,
      modified: risk.modified,
      dv01: risk.dv01,
      convexity: risk.convexity,
      cashflows: flows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ytmDirect', (req, res) => {
  try {
    const { settlementDate, cashflows = [], quote = {}, dayCount = 'ACT365F', comp = 'ANNUAL' } = req.body || {};
    const settlementISO = toISO(settlementDate || new Date());
    const flows = parseCashflows(cashflows);
    if (!flows.length) {
      return res.status(400).json({ error: 'No cashflows provided' });
    }

    const targetPrice = Number(quote.pricePer100 ?? quote.price);
    if (!Number.isFinite(targetPrice)) {
      return res.status(400).json({ error: 'pricePer100 is required' });
    }

    const y = ytmFromPrice(settlementISO, flows, targetPrice, dayCount, comp);
    const risk = riskStats(settlementISO, flows, y, dayCount, comp);

    res.json({
      dirtyPer100: Number(risk.price.toFixed(8)),
      cleanPer100: Number(risk.price.toFixed(8)),
      accruedPer100: 0,
      ytm: Number(y.toFixed(8)),
      macaulay: risk.macaulay,
      modified: risk.modified,
      dv01: risk.dv01,
      convexity: risk.convexity,
      cashflows: flows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    await seedBonds();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();