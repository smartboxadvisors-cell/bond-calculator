import { exportCSV } from '../lib/export.js';
import { formatDisplayDate } from '../lib/dates.js';

export default function CashflowTable({ cashflows = [], title = 'Cashflows', filename = 'cashflows.csv' }) {
  if (!cashflows.length) {
    return null;
  }

  const handleExport = () => {
    exportCSV(filename, cashflows.map(row => ({
      date: formatDisplayDate(row.date),
      amount: Number(row.amount).toFixed(6)
    })));
  };

  return (
    <div className="cashflow-table">
      <div className="section-actions" style={{ padding: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
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
          {cashflows.map(({ date, amount }, idx) => (
            <tr key={`${date}-${idx}`}>
              <td>{formatDisplayDate(date)}</td>
              <td>{Number(amount).toFixed(6)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}