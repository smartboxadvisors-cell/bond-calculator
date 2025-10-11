import { useEffect, useMemo, useState } from 'react';
import { priceSchedule, ytmSchedule } from '../lib/api.js';
import { businessDaySequence, formatDisplayDate, nextBusinessDay } from '../lib/dates.js';
import StatCard from './StatCard.jsx';
import CashflowTable from './CashflowTable.jsx';

const todayISO = new Date().toISOString().slice(0, 10);
const defaultIssue = todayISO;
const defaultMaturity = new Date(new Date().setFullYear(new Date().getFullYear() + 5))
  .toISOString()
  .slice(0, 10);
const defaultSettlementOptions = businessDaySequence(defaultIssue, 7);
const defaultSettlement = defaultSettlementOptions[0] || nextBusinessDay(defaultIssue);

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
    issueDate: defaultIssue,
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

  const settlementOptions = useMemo(() => {
    if (!form.issueDate) return [];
    return businessDaySequence(form.issueDate, 7);
  }, [form.issueDate]);

  useEffect(() => {
    if (!settlementOptions.length) {
      if (form.settlementDate) {
        setForm(prev => ({ ...prev, settlementDate: '' }));
      }
      return;
    }
    if (!form.settlementDate || !settlementOptions.includes(form.settlementDate)) {
      setForm(prev => ({ ...prev, settlementDate: settlementOptions[0] }));
    }
  }, [settlementOptions, form.settlementDate]);

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleIssueChange = event => {
    const { value } = event.target;
    if (!value) {
      setForm(prev => ({ ...prev, issueDate: '', settlementDate: '' }));
      return;
    }

    const nextValue = value > todayISO ? todayISO : value;
    const options = businessDaySequence(nextValue, 7);
    setForm(prev => {
      const next = { ...prev, issueDate: nextValue };
      if (!options.includes(prev.settlementDate)) {
        next.settlementDate = options[0] || '';
      }
      return next;
    });
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
          <input type="date" name="issueDate" value={form.issueDate} onChange={handleIssueChange} max={todayISO} lang="en-GB" />
        </label>
        <label className="label">
          <span>Maturity Date</span>
          <input type="date" name="maturityDate" value={form.maturityDate} onChange={handleChange} lang="en-GB" />
        </label>
        <label className="label">
          <span>Settlement Date</span>
          <select
            name="settlementDate"
            value={form.settlementDate || ''}
            onChange={handleChange}
            disabled={!settlementOptions.length}
          >
            {settlementOptions.map(date => (
              <option key={date} value={date}>
                {formatDisplayDate(date)}
              </option>
            ))}
          </select>
          <span className="helper-text">Next 7 business days after the issue date.</span>
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
            <option value="price-from-yield">Price ← Yield</option>
            <option value="yield-from-price">Yield ← Price</option>
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
          <StatCard label="Dirty Price" value={result.dirtyPer100} decimals={4} />
          <StatCard label="Clean Price" value={result.cleanPer100} decimals={4} />
          <StatCard label="Accrued" value={result.accruedPer100} decimals={4} />
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
