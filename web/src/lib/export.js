export function exportCSV(filename, rows = []) {
  if (!rows.length) return;
  const header = Object.keys(rows[0]);
  const escapeCell = value => {
    const str = value ?? '';
    if (/[",\n]/.test(str)) {
      return `"${String(str).replace(/"/g, '""')}"`;
    }
    return String(str);
  };
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map(key => escapeCell(row[key])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}