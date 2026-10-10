import { CSV_BOM, parseCsv, parseCsvTable, toCsv } from '@/lib/csv';

describe('csv — toCsv', () => {
  it('quotes comma/quote/newline fields, doubles inner quotes, leaves plain fields bare', () => {
    const out = toCsv(['a', 'b', 'c', 'd', 'e'], [
      { a: 'plain', b: 'x,y', c: 'say "hi"', d: 'line1\nline2', e: 'cr\rhere' },
    ]);
    expect(out).toBe('a,b,c,d,e\r\nplain,"x,y","say ""hi""","line1\nline2","cr\rhere"\r\n');
  });

  it('renders null/undefined as empty cells and numbers as-is', () => {
    expect(toCsv(['a', 'b', 'c'], [{ a: null, b: undefined, c: 799.5 }])).toBe('a,b,c\r\n,,799.5\r\n');
  });
});

describe('csv — parseCsv', () => {
  it('strips a leading BOM so the first header is "sku"', () => {
    const rows = parseCsv(`${CSV_BOM}sku,title\nA1,Tea\n`);
    expect(Object.keys(rows[0]!)[0]).toBe('sku');
    expect(rows).toEqual([{ sku: 'A1', title: 'Tea' }]);
  });

  it('skips blank records, trims cells and fills missing cells with ""', () => {
    expect(parseCsv('a,b,c\r\n\r\n x , y \r\n,,\r\nonly\r\n')).toEqual([
      { a: 'x', b: 'y', c: '' },
      { a: 'only', b: '', c: '' },
    ]);
  });

  it('round-trips toCsv output (quotes, multi-line, ₹ and Hindi)', () => {
    const row = { sku: 'RICE-5KG', title: 'Basmati, 5kg "Premium"', description: 'Line ₹ 899\r\nदूसरी, "q"' };
    const parsed = parseCsv(`${CSV_BOM}${toCsv(['sku', 'title', 'description'], [row])}`);
    expect(parsed).toEqual([row]);
  });
});

describe('csv — parseCsvTable', () => {
  it('keeps blank records so index + 1 is the row number, strips the BOM and trims cells', () => {
    expect(parseCsvTable(`${CSV_BOM}sku,title\r\n A1 ,Tea\r\n\r\n,\r\nB2,"x,y"\r\n`)).toEqual([
      ['sku', 'title'],
      ['A1', 'Tea'],
      [''],
      ['', ''],
      ['B2', 'x,y'],
    ]);
  });

  it('keeps a quoted multi-line cell inside one record', () => {
    expect(parseCsvTable('a,b\n"l1\nl2",z')).toEqual([
      ['a', 'b'],
      ['l1\nl2', 'z'],
    ]);
  });
});
