import { useEffect, useMemo, useRef, useState } from 'react';
import { getScheduleByIsin, priceSchedule, ytmSchedule } from '../lib/api.js';
import { addDays, businessDaySequence, formatDisplayDate, nextBusinessDay } from '../lib/dates.js';
import StatCard from './StatCard.jsx';
import CashflowTable from './CashflowTable.jsx';

const todayISO = new Date().toISOString().slice(0, 10);
const maxIssueDate = addDays(todayISO, -1);
const defaultIssue = maxIssueDate;
const defaultMaturity = new Date(new Date().setFullYear(new Date().getFullYear() + 5))
  .toISOString()
  .slice(0, 10);
const defaultSettlementOptions = businessDaySequence(todayISO, 7, { includeStart: true });
const defaultSettlement = defaultSettlementOptions[0] || nextBusinessDay(todayISO);

const FREQUENCIES = [12, 6, 3, 1];
const FREQUENCY_DESCRIPTIONS = {
  12: 'Annually',
  6: 'Half-yearly',
  3: 'Quarterly',
  1: 'Monthly'
};
const BUSINESS_ROLLS = ['FOLLOWING', 'MODFOLLOW', 'PRECEDING'];
const DAY_COUNTS = ['ACT365F', 'ACT360', '30360US'];
const COMPOUNDING = ['ANNUAL', 'SEMI', 'STREET'];
const ARROW = '\u2192';
const MAX_ISIN_LENGTH = 12;

const DEFAULT_FORM = {
  isin: '',
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
};

function toRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(num) > 1.5 ? num / 100 : num;
}

function clampFourDigitYear(value) {
  if (!value) return value;
  const sanitized = String(value).replace(/^(\d{4})\d*/, '$1');
  return sanitized.length > 10 ? sanitized.slice(0, 10) : sanitized;
}

function sanitizeIsin(value) {
  if (!value) return '';
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_ISIN_LENGTH);
}

function normalizeFormSnapshot(snapshot = {}) {
  const merged = { ...DEFAULT_FORM, ...snapshot };
  merged.isin = sanitizeIsin(snapshot.isin || merged.isin);

  const dateFields = ['issueDate', 'maturityDate', 'settlementDate'];
  for (const field of dateFields) {
    if (merged[field]) {
      merged[field] = clampFourDigitYear(merged[field]);
    }
  }

  const numericFields = ['face', 'couponRate', 'freqMonths', 'settlementLag', 'redemptionPct', 'yieldInput', 'priceInput'];
  for (const field of numericFields) {
    if (merged[field] !== undefined && merged[field] !== null && merged[field] !== '') {
      const num = Number(merged[field]);
      if (Number.isFinite(num)) {
        merged[field] = field === 'freqMonths' || field === 'settlementLag' ? num : Number(num.toFixed(8));
      }
    }
  }

  return merged;
}

export default function ScheduleInputs() {
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [cashflows, setCashflows] = useState([]);
  const [prefillStatus, setPrefillStatus] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(false);
  const fetchedIsinRef = useRef('');

  const settlementOptions = useMemo(() => {
    if (!form.settlementDate) {
      return defaultSettlementOptions;
    }
    if (defaultSettlementOptions.includes(form.settlementDate)) {
      return defaultSettlementOptions;
    }
    return [form.settlementDate, ...defaultSettlementOptions];
  }, [form.settlementDate]);

  useEffect(() => {
    if (!settlementOptions.length) return;
    if (!form.settlementDate) {
      setForm(prev => ({ ...prev, settlementDate: settlementOptions[0] }));
    }
  }, [form.settlementDate, settlementOptions]);

  useEffect(() => {
    const currentIsin = sanitizeIsin(form.isin);
    if (!currentIsin || currentIsin.length < MAX_ISIN_LENGTH) {
      if (!currentIsin) {
        setPrefillStatus('');
      }
      if (prefillLoading) {
        setPrefillLoading(false);
      }
      fetchedIsinRef.current = '';
      return;
    }

    if (fetchedIsinRef.current === currentIsin) {
      return;
    }

    let cancelled = false;
    fetchedIsinRef.current = currentIsin;
    setPrefillLoading(true);
    setPrefillStatus('Looking up saved schedule...');

    getScheduleByIsin(currentIsin)
      .then(data => {
        if (cancelled) return;
        fetchedIsinRef.current = currentIsin;
        if (data?.form) {
          const normalized = normalizeFormSnapshot({ ...data.form, isin: currentIsin });
          if (!normalized.settlementDate) {
            normalized.settlementDate = data.result?.settlementDate || DEFAULT_FORM.settlementDate;
          }
          setForm(prev => ({ ...prev, ...normalized }));
          if (data.result) {
            setResult(data.result);
            setCashflows(data.result.cashflows || []);
            setPrefillStatus('Loaded saved schedule for this ISIN.');
          } else {
            setResult(null);
            setCashflows([]);
            setPrefillStatus('Loaded saved schedule. Please calculate to refresh results.');
          }
          setError('');
        } else {
          setPrefillStatus('No saved schedule found. Enter details to calculate.');
          setResult(null);
          setCashflows([]);
        }
      })
      .catch(err => {
        if (cancelled) return;
        fetchedIsinRef.current = currentIsin;
        const message = err?.message || 'Failed to load saved schedule.';
        if (message.toLowerCase().includes('not found')) {
          setPrefillStatus('No saved schedule found. Enter details to calculate.');
        } else {
          setPrefillStatus(message);
        }
        setError('');
        setResult(null);
        setCashflows([]);
      })
      .finally(() => {
        if (!cancelled) {
          setPrefillLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.isin]);

  const handleChange = event => {
    const { name, value } = event.target;
    if (name === 'maturityDate') {
      const sanitized = clampFourDigitYear(value);
      setForm(prev => ({ ...prev, [name]: sanitized }));
      return;
    }
    if (name === 'isin') {
      const sanitized = sanitizeIsin(value);
      setForm(prev => ({ ...prev, isin: sanitized }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleIssueChange = event => {
    const sanitized = clampFourDigitYear(event.target.value);
    if (!sanitized) {
      setForm(prev => ({ ...prev, issueDate: '' }));
      return;
    }

    const nextValue = sanitized > maxIssueDate ? maxIssueDate : sanitized;
    setForm(prev => ({ ...prev, issueDate: nextValue }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const sanitizedIsin = sanitizeIsin(form.isin);
      const formSnapshot = normalizeFormSnapshot({ ...form, isin: sanitizedIsin });

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
          redemptionPct: Number(form.redemptionPct),
          isin: sanitizedIsin
        },
        settlementDate: form.settlementDate,
        formSnapshot,
        mode: form.mode
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
      if (sanitizedIsin) {
        fetchedIsinRef.current = sanitizedIsin;
        setPrefillStatus('Schedule saved for this ISIN.');
      }
    } catch (err) {
      setError(err.message);
      setResult(null);
      setCashflows([]);
    } finally {
      setLoading(false);
    }
  };

  const showYieldInput = form.mode === 'price-from-yield';
  const tableMinDate = result?.settlementDate || form.settlementDate;

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
          <span>ISIN</span>
          <input
            type="text"
            name="isin"
            value={form.isin}
          onChange={handleChange}
          placeholder="Optional identifier"
          maxLength={12}
        />
        <span className="helper-text">Up to 12 characters (A-Z, 0-9).</span>
        {prefillLoading && form.isin.length === MAX_ISIN_LENGTH && (
          <span className="helper-text">Looking up saved schedule...</span>
        )}
        {!prefillLoading && prefillStatus && form.isin.length === MAX_ISIN_LENGTH && (
          <span className="helper-text">{prefillStatus}</span>
        )}
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
                {FREQUENCY_DESCRIPTIONS[freq] ? `${freq} (${FREQUENCY_DESCRIPTIONS[freq]})` : `${freq}`}
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
            onChange={handleIssueChange}
            max={maxIssueDate}
            lang="en-GB"
          />
        </label>
        <label className="label">
          <span>Maturity Date</span>
          <input
            type="date"
            name="maturityDate"
            value={form.maturityDate}
            onChange={handleChange}
            lang="en-GB"
          />
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
          <span className="helper-text">Next 7 business days starting today.</span>
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
            <option value="price-from-yield">{`Price ${ARROW} Yield`}</option>
            <option value="yield-from-price">{`Yield ${ARROW} Price`}</option>
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
            {loading ? 'Calculating...' : 'Calculate'}
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
      <CashflowTable cashflows={cashflows} filename="schedule-cashflows.csv" minDate={tableMinDate} />
    </section>
  );
}
