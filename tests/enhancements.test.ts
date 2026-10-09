import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parse } from '../src/index';

describe('Advanced Optimizations & Edge Cases', () => {
  it('should handle Base64 Data URL for CSV', async () => {
    const csvContent = 'name,score\nDave,88\nEmma,92';
    const base64 = Buffer.from(csvContent).toString('base64');
    const dataUrl = `data:text/csv;base64,${base64}`;

    const res = await parse(dataUrl);

    expect(res.type).toBe('csv');
    expect(res.total).toBe(2);
    expect(res.rows).toEqual([
      { name: 'Dave', score: 88 },
      { name: 'Emma', score: 92 }
    ]);
  });

  it('should handle Base64 Data URL for Excel', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ id: 1, product: 'Keyboard' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buf.toString('base64')}`;

    const res = await parse(dataUrl);

    expect(res.type).toBe('excel');
    expect(res.total).toBe(1);
    expect(res.rows[0]).toEqual({ id: 1, product: 'Keyboard' });
  });

  it('should handle empty files gracefully without throwing errors', async () => {
    const resText = await parse('', { type: 'text' });
    expect(resText.total).toBe(0);
    expect(resText.rows).toEqual([]);

    const resCsv = await parse('', { type: 'csv' });
    expect(resCsv.total).toBe(0);
    expect(resCsv.rows).toEqual([]);

    const resExcel = await parse(new Uint8Array(0), { type: 'excel' });
    expect(resExcel.total).toBe(0);
    expect(resExcel.rows).toEqual([]);
  });

  it('should respect preview option across formats', async () => {
    const lines = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    const resText = await parse(lines, { preview: 3 });
    expect(resText.total).toBe(3);
    expect(resText.rows).toEqual(['1', '2', '3']);

    const csv = 'id,val\n1,a\n2,b\n3,c\n4,d';
    const resCsv = await parse(csv, { preview: 2 });
    expect(resCsv.total).toBe(2);
    expect(resCsv.rows).toHaveLength(2);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }]),
      'Sheet1'
    );
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const resExcel = await parse(bytes, { preview: 2 });
    expect(resExcel.total).toBe(2);
    expect(resExcel.rows).toHaveLength(2);
  });

  it('should smart unwrap wrapped JSON responses ({ data: [...] })', async () => {
    const apiResponse = JSON.stringify({
      code: 200,
      message: 'success',
      data: [
        { id: 1, role: 'Admin' },
        { id: 2, role: 'User' }
      ]
    });

    const res = await parse(apiResponse, { textMode: 'json' });

    expect(res.type).toBe('json');
    expect(res.total).toBe(2);
    expect(res.columns).toEqual(['id', 'role']);
    expect(res.rows).toEqual([
      { id: 1, role: 'Admin' },
      { id: 2, role: 'User' }
    ]);
  });

  it('should support transformHeader across CSV and Excel', async () => {
    const csv = ' First Name , Age \nJohn,25';
    const resCsv = await parse(csv, {
      transformHeader: (h) => h.toLowerCase().replace(/\s+/g, '_')
    });
    expect(resCsv.columns).toEqual(['first_name', 'age']);
    expect(resCsv.rows[0]).toEqual({ first_name: 'John', age: 25 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ ' USER ID ': 99 }]), 'S');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const resExcel = await parse(bytes, {
      transformHeader: (h) => h.toLowerCase().replace(/\s+/g, '_')
    });
    expect(resExcel.columns).toEqual(['user_id']);
    expect(resExcel.rows[0]).toEqual({ user_id: 99 });
  });
});
