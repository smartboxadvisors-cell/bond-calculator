import { exportCSV } from '../lib/export.js';
import { formatDisplayDate, toISO } from '../lib/dates.js';

export default function CashflowTable({
  cashflows = [],
  title = 'Cashflows',
  filename = 'cashflows.csv',
  minDate
}) {
  const cutoffISO = minDate ? toISO(minDate) : null;

  const normalizedCashflows = cashflows
    .map(row => {
      if (!row) return null;
      const baseDate = row.date ?? row.displayDate;
      if (!baseDate) return null;
      let isoDate;
      try {
        isoDate = toISO(baseDate);
      } catch {
        return null;
      }
      const amount = Number(row.amount);
      if (!Number.isFinite(amount)) {
        return null;
      }

      let displayISO = isoDate;
      if (row.displayDate) {
        try {
          displayISO = toISO(row.displayDate);
        } catch {
          displayISO = isoDate;
        }
      }

      return {
        ...row,
        date: isoDate,
        displayDate: displayISO,
        amount
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const filteredCashflows = cutoffISO
    ? normalizedCashflows.filter(row => row.date >= cutoffISO)
    : normalizedCashflows;

  if (!filteredCashflows.length) {
    return null;
  }

  const handleExport = () => {
    exportCSV(
      filename,
      filteredCashflows.map(row => ({
        date: formatDisplayDate(row.displayDate || row.date),
        amount: row.amount.toFixed(6)
      }))
    );
  };

  return (
    <div className="cashflow-table">
      <div
        className="section-actions"
        style={{ padding: '1rem', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
        <button type="button" className="secondary" onClick={handleExport}>
          Export CSV
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {filteredCashflows.map(({ date, displayDate, amount }, idx) => (
            <tr key={`${date}-${idx}`}>
              <td>{formatDisplayDate(displayDate || date)}</td>
              <td>{amount.toFixed(6)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
