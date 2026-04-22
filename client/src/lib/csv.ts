// CSV export utility — RFC 4180 compliant, BOM for Excel compatibility

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCSV<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  headers: { key: keyof T; label: string }[],
): void {
  const headerLine = headers.map((h) => escapeCell(h.label)).join(",");
  const body = rows
    .map((row) => headers.map((h) => escapeCell(row[h.key])).join(","))
    .join("\r\n");

  // BOM ensures Excel reads UTF-8 correctly
  const csv = "\uFEFF" + headerLine + "\r\n" + body;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
