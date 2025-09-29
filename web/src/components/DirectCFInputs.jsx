import { useEffect, useMemo, useState } from 'react';
import { priceDirect, ytmDirect, uploadCF } from '../lib/api.js';
import { toISO, buildDates } from '../lib/dates.js';
import StatCard from './StatCard.jsx';
import CashflowTable from './CashflowTable.jsx';

const DAY_COUNTS = ['ACT365F', 'ACT360', '30360US'];
const COMPOUNDING = ['ANNUAL', 'SEMI', 'STREET'];

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

function toRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(num) > 1.5 ? num / 100 : num;
}

function fallbackCashflows(bond, settlementDate) {
  if (!bond?.receipts?.length) return [];
  const settlementISO = toISO(settlementDate || new Date());
  const dates = buildDates(settlementISO, 1, bond.receipts.length);
  return bond.receipts.map((amount, idx) => ({
    date: dates[idx] || settlementISO,
    amount: Number(amount)
  }));
}

export default function DirectCFInputs({ bonds = [], onUpload, loadingBonds = false }) {
  const todayISO = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return formatISODate(today);
  }, []);
  const settlementMaxISO = useMemo(() => shiftISODate(todayISO, 7), [todayISO]);

  const isSunday = iso => {
    const date = parseISOToLocalDate(iso);
    if (!date) return false;
    return date.getDay() === 0;
  };

  const adjustSettlementDate = iso => {
    if (!iso) return iso;
    if (!isSunday(iso)) return iso;
    const forward = shiftISODate(iso, 1);
    if (forward && forward <= settlementMaxISO && forward >= todayISO && !isSunday(forward)) {
      return forward;
    }
    const backward = shiftISODate(iso, -1);
    if (backward && backward >= todayISO && !isSunday(backward)) {
      return backward;
    }
    return todayISO;
  };

  const settlementMinISO = adjustSettlementDate(todayISO);

  const clampSettlementDate = value => {
    if (!value) return settlementMinISO;
    let iso = value.slice(0, 10);
    if (iso < todayISO) {
      return settlementMinISO;
    }
    if (iso > settlementMaxISO) {
      iso = settlementMaxISO;
    }
    return adjustSettlementDate(iso);
  };

  const preventDateTyping = event => {
    const allowedKeys = ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'];
    if (!allowedKeys.includes(event.key)) {
      event.preventDefault();
    }
  };

  const [selectedIsin, setSelectedIsin] = useState('');
  const [settlementDate, setSettlementDate] = useState(() => settlementMinISO);
  const [dayCount, setDayCount] = useState('ACT365F');
  const [compounding, setCompounding] = useState('ANNUAL');
  const [mode, setMode] = useState('price-from-yield');
  const [yieldInput, setYieldInput] = useState(7);
  const [priceInput, setPriceInput] = useState(100);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [cashflows, setCashflows] = useState([]);
  const [customCashflows, setCustomCashflows] = useState({});
  const [calculating, setCalculating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSettlementDateChange = event => {
    const target = event.target;
    const iso = target.value.slice(0, 10);
    if (!iso) {
      setSettlementDate(settlementMinISO);
      target.classList.remove('date-input-sunday');
      target.setCustomValidity('');
      return;
    }
    if (isSunday(iso)) {
      target.value = settlementDate;
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
    setSettlementDate(clampSettlementDate(iso));
  };

  const bondMap = useMemo(() => {
    const map = {};
    for (const bond of bonds) {
      map[bond.isin] = bond;
    }
    return map;
  }, [bonds]);

  useEffect(() => {
    if (!selectedIsin && bonds.length) {
      setSelectedIsin(bonds[0].isin);
    }
  }, [bonds, selectedIsin]);

  useEffect(() => {
    const latest = bondMap[selectedIsin];
    if (latest?.cashflows?.length) {
      setCashflows(latest.cashflows);
    }
  }, [bondMap, selectedIsin]);

  const resolveCashflows = () => {
    if (!selectedIsin) return [];
    if (customCashflows[selectedIsin]?.length) {
      return customCashflows[selectedIsin];
    }
    const bond = bondMap[selectedIsin];
    if (bond?.cashflows?.length) {
      return bond.cashflows;
    }
    return fallbackCashflows(bond, settlementDate);
  };

  const handleUpload = async event => {
    if (!selectedIsin) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus('');
    try {
      const response = await uploadCF(selectedIsin, file);
      const rows = response?.bond?.cashflows || [];
      setCustomCashflows(prev => ({ ...prev, [selectedIsin]: rows }));
      setCashflows(rows);
      setStatus(`Loaded ${rows.length} rows for ${selectedIsin}`);
      setError('');
      if (typeof onUpload === 'function') {
        onUpload();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleCopyIsin = async () => {
    if (!selectedIsin) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedIsin);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = selectedIsin;
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'absolute';
        tempInput.style.left = '-9999px';
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setError('');
      setStatus(`Copied ${selectedIsin} to clipboard`);
    } catch (err) {
      setStatus('');
      setError('Unable to copy ISIN');
    }
  };

  const handleCalculate = async event => {
    event.preventDefault();
    setCalculating(true);
    setError('');
    setStatus('');
    try {
      const flows = resolveCashflows();
      if (!flows.length) {
        throw new Error('No cashflows available for calculation');
      }

      const payload = {
        settlementDate,
        dayCount,
        comp: compounding,
        cashflows: flows
      };

      let data;
      if (mode === 'price-from-yield') {
        payload.quote = { yield: toRate(yieldInput) };
        data = await priceDirect(payload);
      } else {
        payload.quote = { pricePer100: Number(priceInput) };
        data = await ytmDirect(payload);
      }

      setResult(data);
      setCashflows(data.cashflows || flows);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  const showYieldInput = mode === 'price-from-yield';

  return (
    <section className="panel">
      <header>
        <h2 className="section-title">Direct Cashflows</h2>
        <p className="helper-text">Upload bespoke cashflows or fall back to seeded receipts.</p>
      </header>
      <form onSubmit={handleCalculate} className="form-grid three-col">
        <label className="label">
          <span>ISIN</span>
          <div className="input-with-action">
            <select value={selectedIsin} onChange={event => setSelectedIsin(event.target.value)} disabled={loadingBonds}>
              {loadingBonds && <option>Loading...</option>}
              {!loadingBonds && !bonds.length && <option value="">No bonds found</option>}
              {bonds.map(bond => (
                <option key={bond.isin} value={bond.isin}>
                  {bond.isin}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={handleCopyIsin} disabled={!selectedIsin || loadingBonds}>
              Copy
            </button>
          </div>
        </label>
        <label className="label">
          <span>Settlement Date</span>
          <input
            type="date"
            value={settlementDate}
            onChange={handleSettlementDateChange}
            onKeyDown={preventDateTyping}
            min={settlementMinISO}
            max={settlementMaxISO}
            className="date-input"
          />
        </label>
        <label className="label">
          <span>Day-count</span>
          <select value={dayCount} onChange={event => setDayCount(event.target.value)}>
            {DAY_COUNTS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Compounding</span>
          <select value={compounding} onChange={event => setCompounding(event.target.value)}>
            {COMPOUNDING.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Mode</span>
          <select value={mode} onChange={event => setMode(event.target.value)}>
            <option value="price-from-yield">Yield → Price</option>
            <option value="yield-from-price">Price → Yield</option>
          </select>
        </label>
        {showYieldInput ? (
          <label className="label">
            <span>Yield Input</span>
            <input type="number" value={yieldInput} onChange={event => setYieldInput(event.target.value)} step="0.0001" />
            <span className="helper-text">Percent or decimal.</span>
          </label>
        ) : (
          <label className="label">
            <span>Price per 100</span>
            <input type="number" value={priceInput} onChange={event => setPriceInput(event.target.value)} step="0.0001" />
          </label>
        )}
        <label className="label">
          <span>Upload CSV</span>
          <input type="file" accept=".csv" onChange={handleUpload} disabled={!selectedIsin || uploading} />
          <span className="helper-text">Headers: date, amount.</span>
        </label>
        <div className="label">
          <span>&nbsp;</span>
          <button type="submit" disabled={!selectedIsin || calculating}>
            {calculating ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
      </form>
      {status && <div className="status-text">{status}</div>}
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
      <CashflowTable cashflows={cashflows} filename={`direct-${selectedIsin || 'cashflows'}.csv`} />
    </section>
  );
}
