import { useEffect, useMemo, useState } from 'react';
import { priceDirect, ytmDirect, uploadCF } from '../lib/api.js';
import { toISO, buildDates, businessDaySequence, formatDisplayDate, nextBusinessDay } from '../lib/dates.js';
import StatCard from './StatCard.jsx';
import CashflowTable from './CashflowTable.jsx';

const DAY_COUNTS = ['ACT365F', 'ACT360', '30360US'];
const COMPOUNDING = ['ANNUAL', 'SEMI', 'STREET'];

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
  const todayISO = new Date().toISOString().slice(0, 10);
  const [selectedIsin, setSelectedIsin] = useState('');
  const [settlementDate, setSettlementDate] = useState(() => {
    const options = businessDaySequence(todayISO, 7);
    return options[0] || nextBusinessDay(todayISO);
  });
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

  const settlementOptions = useMemo(() => businessDaySequence(todayISO, 7), [todayISO]);

  useEffect(() => {
    setSettlementDate(prev => {
      if (!settlementOptions.length) {
        return '';
      }
      if (prev && settlementOptions.includes(prev)) {
        return prev;
      }
      return settlementOptions[0];
    });
  }, [settlementOptions]);

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
          <select value={selectedIsin} onChange={event => setSelectedIsin(event.target.value)} disabled={loadingBonds}>
            {loadingBonds && <option>Loading...</option>}
            {!loadingBonds && !bonds.length && <option value="">No bonds found</option>}
            {bonds.map(bond => (
              <option key={bond.isin} value={bond.isin}>
                {bond.isin}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <span>Settlement Date</span>
          <select value={settlementDate || ''} onChange={event => setSettlementDate(event.target.value)} disabled={!settlementOptions.length}>
            {settlementOptions.map(date => (
              <option key={date} value={date}>
                {formatDisplayDate(date)}
              </option>
            ))}
          </select>
          <span className="helper-text">Next 7 business days.</span>
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
            <option value="price-from-yield">Price ← Yield</option>
            <option value="yield-from-price">Yield ← Price</option>
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