import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/parsers/csv';

describe('parseCsv', () => {
  it('should parse standard CSV with unified rows, columns, and total', async () => {
    const csv = `name,age,active,score\nAlice,30,true,95.5\nBob,25,false,88.0`;
    const res = await parseCsv<{ name: string; age: number; active: boolean; score: number }>(csv);

    expect(res.type).toBe('csv');
    expect(res.total).toBe(2);
    expect(res.columns).toEqual(['name', 'age', 'active', 'score']);
    expect(res.rows).toEqual([
      { name: 'Alice', age: 30, active: true, score: 95.5 },
      { name: 'Bob', age: 25, active: false, score: 88.0 }
    ]);
    expect(res.data).toEqual(res.rows);
  });

  it('should parse CSV without header (2D array in rows)', async () => {
    const csv = `val1,val2,val3\nval4,val5,val6`;
    const res = await parseCsv<string[]>(csv, { header: false });

    expect(res.rows).toEqual([
      ['val1', 'val2', 'val3'],
      ['val4', 'val5', 'val6']
    ]);
    expect(res.total).toBe(2);
  });

  it('should handle custom delimiter (tab separated TSV)', async () => {
    const tsv = `id\tname\trole\n1\tAdmin\tOwner\n2\tUser\tMember`;
    const res = await parseCsv<any>(tsv, { delimiter: '\t' });

    expect(res.meta.delimiter).toBe('\t');
    expect(res.total).toBe(2);
    expect(res.rows[0]).toEqual({ id: 1, name: 'Admin', role: 'Owner' });
  });

  it('should handle quoted fields with commas and newlines', async () => {
    const csv = `id,description\n1,"Hello, World!"\n2,"Line 1\nLine 2"`;
    const res = await parseCsv<any>(csv);

    expect(res.total).toBe(2);
    expect(res.rows[0].description).toBe('Hello, World!');
    expect(res.rows[1].description).toBe('Line 1\nLine 2');
  });

  it('should handle UTF-8 Byte Order Mark (BOM)', async () => {
    const bomCsv = '\uFEFFname,count\nApple,10';
    const res = await parseCsv<any>(bomCsv);

    expect(res.columns).toEqual(['name', 'count']);
    expect(res.rows[0]).toEqual({ name: 'Apple', count: 10 });
  });
});
