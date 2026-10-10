/**
 * Pure RFC-4180 CSV helpers (no React/DOM) shared by the admin bulk upload
 * and product export. Excel-friendly: exports start with a UTF-8 BOM so
 * ₹ / Hindi text opens correctly, and the parser strips it again.
 */

export const CSV_BOM = '\uFEFF';

/**
 * Parse CSV text into raw records (every cell trimmed). Handles quoted fields
 * containing commas, CR/LF newlines and doubled quotes; accepts \r\n or \n
 * record ends. A leading BOM is stripped. Blank records are KEPT, so
 * `index + 1` is the record (row) number.
 */
export function parseCsvTable(text: string): string[][] {
  const src = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = (): void => {
    record.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r' && src[i + 1] === '\n') {
      endRecord();
      i += 1;
    } else if (c === '\n') {
      endRecord();
    } else {
      field += c;
    }
  }
  // Final record without a trailing newline.
  if (field !== '' || record.length > 0) endRecord();

  return records.map((r) => r.map((cell) => cell.trim()));
}

/**
 * Parse CSV text into header-keyed records (see parseCsvTable for the syntax).
 * Every cell is trimmed, all-blank records are skipped, missing cells -> ''.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvTable(text).filter((r) => r.some((cell) => cell !== ''));
  if (rows.length < 2) return [];
  const [headers, ...body] = rows as [string[], ...string[][]];
  return body.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return obj;
  });
}

/** Quote a field only when it contains a comma, quote or newline. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise rows to CSV in column order (header line first, CRLF line ends). */
export function toCsv(
  columns: readonly string[],
  rows: Record<string, string | number | null | undefined>[],
): string {
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
