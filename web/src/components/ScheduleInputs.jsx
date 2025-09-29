import { useState } from 'react';
import { priceSchedule, ytmSchedule } from '../lib/api.js';
import StatCard from './StatCard.jsx';
import CashflowTable from './CashflowTable.jsx';

const pad2 = value => String(value).padStart(2, '0');
const formatISODate = date => {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};
const parseISOToLocalDate = iso => {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (![year, month, day].every(num => Number.isFinite(num))) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};
const shiftISODate = (iso, offsetDays) => {
  const date = parseISOToLocalDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + offsetDays);
  return formatISODate(date);
};

const todayISO = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatISODate(today);
})();
const yesterdayISO = shiftISODate(todayISO, -1);
const nextWeekISO = shiftISODate(todayISO, 7);

const isSunday = iso => {
  const date = parseISOToLocalDate(iso);
  if (!date) return false;
  return date.getDay() === 0;
};
const adjustSettlementDate = iso => {
  if (!iso) return iso;
  if (!isSunday(iso)) return iso;
  const forward = shiftISODate(iso, 1);
  if (forward && forward <= nextWeekISO && forward >= todayISO && !isSunday(forward)) {
    return forward;
  }
  const backward = shiftISODate(iso, -1);
  if (backward && backward >= todayISO && !isSunday(backward)) {
    return backward;
  }
  return todayISO;
};

const settlementMinISO = adjustSettlementDate(todayISO);
const clampIssueDate = value => {
  if (!value) return yesterdayISO;
  const iso = value.slice(0, 10);
  if (iso >= todayISO) return yesterdayISO;
  return iso;
};

const clampSettlementDate = value => {
  if (!value) return settlementMinISO;
  let iso = value.slice(0, 10);
  if (iso < todayISO) {
    return settlementMinISO;
  }
  if (iso > nextWeekISO) {
    iso = nextWeekISO;
  }
  return adjustSettlementDate(iso);
};

const preventDateTyping = event => {
  const allowedKeys = ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'];
  if (!allowedKeys.includes(event.key)) {
    event.preventDefault();
  }
};
const defaultIssue = clampIssueDate(yesterdayISO);
const defaultMaturity = (() => {
  const maturity = new Date();
  maturity.setHours(0, 0, 0, 0);
  maturity.setFullYear(maturity.getFullYear() + 5);
  return formatISODate(maturity);
})();
const defaultSettlement = settlementMinISO;
const FREQUENCIES = [12, 6, 4, 1];
const BUSINESS_ROLLS = ['FOLLOWING', 'MODFOLLOW', 'PRECEDING'];
const DAY_COUNTS = ['ACT365F', 'ACT360', '30360US'];
const COMPOUNDING = ['ANNUAL', 'SEMI', 'STREET'];
function toRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(num) > 1.5 ? num / 100 : num;
}
export default function ScheduleInputs() {
  const [form, setForm] = useState({
    face: 100,
    couponRate: 7.5,
    freqMonths: 6,
    issueDate: clampIssueDate(defaultIssue),
    maturityDate: defaultMaturity,
    settlementDate: defaultSettlement,
    settlementLag: 0,
    businessRoll: 'FOLLOWING',
    dayCount: 'ACT365F',
    compounding: 'ANNUAL',
    redemptionPct: 100,
    mode: 'price-from-yield',
    yieldInput: 7.2,
    priceInput: 100
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [cashflows, setCashflows] = useState([]);
  const handleChange = event => {
    const { name, value } = event.target;
    if (name === 'issueDate') {
      const clamped = clampIssueDate(value);
      setForm(prev => ({ ...prev, [name]: clamped }));
      return;
    }
    if (name === 'settlementDate') {
      const target = event.target;
      const iso = value.slice(0, 10);
      if (!iso) {
        setForm(prev => ({ ...prev, settlementDate: settlementMinISO }));
        target.classList.remove('date-input-sunday');
        target.setCustomValidity('');
        return;
      }
      if (isSunday(iso)) {
        target.value = form.settlementDate;
        target.classList.add('date-input-sunday');
        target.setCustomValidity('Settlement cannot fall on Sunday.');
        target.reportValidity();
        setTimeout(() => {
          target.classList.remove('date-input-sunday');
          target.setCustomValidity('');
        }, 1500);
        return;
      }
      target.classList.remove('date-input-sunday');
      target.setCustomValidity('');
      const clamped = clampSettlementDate(iso);
      setForm(prev => ({ ...prev, settlementDate: clamped }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };
  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        schedule: {
          face: Number(form.face),
          couponRate: toRate(form.couponRate),
          freqMonths: Number(form.freqMonths),
          issueDate: form.issueDate,
          maturityDate: form.maturityDate,
          settlementLag: Number(form.settlementLag),
          businessRoll: form.businessRoll,
          dayCount: form.dayCount,
          compounding: form.compounding,
          redemptionPct: Number(form.redemptionPct)
        },
        settlementDate: form.settlementDate
      };
      let data;
      if (form.mode === 'price-from-yield') {
        payload.quote = { yield: toRate(form.yieldInput) };
        data = await priceSchedule(payload);
      } else {
        payload.quote = { pricePer100: Number(form.priceInput) };
        data = await ytmSchedule(payload);
      }
      setResult(data);
      setCashflows(data.cashflows || []);
    } catch (err) {
      setError(err.message);
      setResult(null);
      setCashflows([]);
    } finally {
      setLoading(false);
    }
  };
  const showYieldInput = form.mode === 'price-from-yield';
  return (
    <section className="panel">
      <header>
        <h2 className="section-title">Schedule Generator</h2>
        <p className="helper-text">Build coupon schedules and derive price/yield analytics.</p>
      </header>
      <form onSubmit={handleSubmit} className="form-grid three-col">
        <label className="label">
          <span>Face Amount</span>
          <input type="number" name="face" value={form.face} onChange={handleChange} min="0" step="0.01" />
        </label>
        <label className="label">
          <span>Coupon Rate (%)</span>
          <input type="number" name="couponRate" value={form.couponRate} onChange={handleChange} step="0.01" />
          <span className="helper-text">Enter percent or decimal (e.g. 7.5 or 0.075).</span>
        </label>
        <label className="label">
          <span>Frequency (months)</span>
          <select name="freqMonths" value={form.freqMonths} onChange={handleChange}>
            {FREQUENCIES.map(freq => (
              <option key={freq} value={freq}>
                {freq}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Issue Date</span>
          <input
            type="date"
            name="issueDate"
            value={form.issueDate}
            onChange={handleChange}
            max={yesterdayISO}
          />
        </label>
        <label className="label">
          <span>Maturity Date</span>
          <input type="date" name="maturityDate" value={form.maturityDate} onChange={handleChange} />
        </label>
        <label className="label">
          <span>Settlement Date</span>
          <input
            type="date"
            name="settlementDate"
            value={form.settlementDate}
            onChange={handleChange}
            onKeyDown={preventDateTyping}
            min={settlementMinISO}
            max={nextWeekISO}
            className="date-input"
          />
        </label>
        <label className="label">
          <span>Settlement Lag (days)</span>
          <input type="number" name="settlementLag" value={form.settlementLag} onChange={handleChange} min="0" />
        </label>
        <label className="label">
          <span>Business-day Roll</span>
          <select name="businessRoll" value={form.businessRoll} onChange={handleChange}>
            {BUSINESS_ROLLS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Day-count</span>
          <select name="dayCount" value={form.dayCount} onChange={handleChange}>
            {DAY_COUNTS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Compounding</span>
          <select name="compounding" value={form.compounding} onChange={handleChange}>
            {COMPOUNDING.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Redemption %</span>
          <input type="number" name="redemptionPct" value={form.redemptionPct} onChange={handleChange} step="0.01" />
        </label>
        <label className="label">
          <span>Mode</span>
          <select name="mode" value={form.mode} onChange={handleChange}>
            <option value="price-from-yield">Yield ? Price</option>
            <option value="yield-from-price">Price ? Yield</option>
          </select>
        </label>
        {showYieldInput ? (
          <label className="label">
            <span>Yield Input</span>
            <input type="number" name="yieldInput" value={form.yieldInput} onChange={handleChange} step="0.0001" />
            <span className="helper-text">Enter percent or decimal.</span>
          </label>
        ) : (
          <label className="label">
            <span>Price per 100</span>
            <input type="number" name="priceInput" value={form.priceInput} onChange={handleChange} step="0.0001" />
          </label>
        )}
        <div className="label">
          <span>&nbsp;</span>
          <button type="submit" disabled={loading}>
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
      </form>
      {error && <div className="error-text">{error}</div>}
      {result && (
        <div className="stats-grid">
          <StatCard label="Dirty Price (per 100)" value={result.dirtyPer100} decimals={4} />
          <StatCard label="Dirty Price (total)" value={result.dirtyTotal} decimals={2} />
          <StatCard label="Clean Price (per 100)" value={result.cleanPer100} decimals={4} />
          <StatCard label="Clean Price (total)" value={result.cleanTotal} decimals={2} />
          <StatCard label="Accrued (per 100)" value={result.accruedPer100} decimals={4} />
          <StatCard label="Accrued (total)" value={result.accruedTotal} decimals={2} />
          <StatCard label="Yield" value={result.ytm} format="percent" decimals={4} />
          <StatCard label="Macaulay" value={result.macaulay} decimals={4} />
          <StatCard label="Modified" value={result.modified} decimals={4} />
          <StatCard label="DV01" value={result.dv01} decimals={6} />
          <StatCard label="Convexity" value={result.convexity} decimals={6} />
        </div>
      )}
      <CashflowTable cashflows={cashflows} filename="schedule-cashflows.csv" />
    </section>
  );
}
