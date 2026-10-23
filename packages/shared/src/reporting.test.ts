import fc from 'fast-check';
import { averageOrderValue, toCsv } from './reporting';

/** Property-based tests for the CSV serializer + AOV (BR-6, BR-1). */
describe('reporting helpers — property-based', () => {
  const columns = ['a', 'b', 'c'];

  it('PBT-03: every CSV data row has exactly `columns.length` fields regardless of content', () => {
    const cell = fc.oneof(fc.string(), fc.integer(), fc.constant(''), fc.constantFrom('a,b', 'x"y', 'l1\nl2'));
    const row = fc.record({ a: cell, b: cell, c: cell });
    fc.assert(
      fc.property(fc.array(row, { maxLength: 20 }), (rows) => {
        const csv = toCsv(columns, rows as Record<string, unknown>[]);
        const lines = parseCsvLines(csv);
        // First line is the header; each subsequent line has columns.length fields.
        for (const fields of lines) {
          expect(fields).toHaveLength(columns.length);
        }
        expect(lines).toHaveLength(rows.length + 1);
      }),
    );
  });

  it('PBT-03: averageOrderValue = round(revenue/orders), 0 when no orders', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), fc.integer({ min: 0, max: 10_000 }), (revenue, orders) => {
        const aov = averageOrderValue(revenue, orders);
        if (orders === 0) expect(aov).toBe(0);
        else expect(aov).toBe(Math.round(revenue / orders));
      }),
    );
  });

  it('escapes commas, quotes and newlines (example)', () => {
    const csv = toCsv(['x'], [{ x: 'a,b' }, { x: 'he said "hi"' }, { x: 'l1\nl2' }]);
    expect(csv).toBe('x\n"a,b"\n"he said ""hi"""\n"l1\nl2"');
  });
});

/**
 * Minimal RFC-4180 CSV line parser for the test: splits into logical rows and
 * fields, honoring quoted fields (which may contain commas and newlines).
 */
function parseCsvLines(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ignore
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}
