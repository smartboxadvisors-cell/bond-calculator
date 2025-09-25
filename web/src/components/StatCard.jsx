export default function StatCard({ label, value, format = 'number', decimals = 4 }) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }

  const num = Number(value);
  let display = num;

  if (format === 'percent') {
    display = `${(num * 100).toFixed(decimals)}%`;
  } else {
    display = num.toFixed(decimals);
  }

  return (
    <div className="stat-card">
      <h4>{label}</h4>
      <strong>{display}</strong>
    </div>
  );
}