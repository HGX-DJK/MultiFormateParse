import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parse, parseFile } from '../src/index';

describe('parse (unified interface for all files)', () => {
  it('should parse CSV with exact same { rows, columns, total, type } interface', async () => {
    const csvContent = 'id,title,price\n101,Book A,29.9\n102,Book B,39.9';
    const res = await parse(csvContent, { fileName: 'books.csv' });

    expect(res.type).toBe('csv');
    expect(res.columns).toEqual(['id', 'title', 'price']);
    expect(res.total).toBe(2);
    expect(res.rows).toEqual([
      { id: 101, title: 'Book A', price: 29.9 },
      { id: 102, title: 'Book B', price: 39.9 }
    ]);
  });

  it('should parse Excel with exact same { rows, columns, total, type } interface', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ id: 101, title: 'Book A', price: 29.9 }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Books');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    // Both parse and parseFile can be used identically
    const res = await parseFile(bytes);

    expect(res.type).toBe('excel');
    expect(res.columns).toEqual(['id', 'title', 'price']);
    expect(res.total).toBe(1);
    expect(res.rows).toEqual([{ id: 101, title: 'Book A', price: 29.9 }]);
    expect(res.currentSheet).toBe('Books');
  });

  it('should parse Text with exact same interface', async () => {
    const textContent = 'First sentence.\nSecond sentence.';
    const res = await parse(textContent, { fileName: 'notes.txt' });

    expect(res.type).toBe('text');
    expect(res.total).toBe(2);
    expect(res.rows).toEqual(['First sentence.', 'Second sentence.']);
    expect(res.text).toBe(textContent);
  });

  it('should parse JSON file when detected', async () => {
    const jsonContent = JSON.stringify([{ id: 1, name: 'Alice' }]);
    const res = await parse(jsonContent, { fileName: 'data.json' });

    expect(res.type).toBe('json');
    expect(res.total).toBe(1);
    expect(res.columns).toEqual(['id', 'name']);
    expect(res.rows).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('should allow frontend/backend to consume CSV and Excel with identical code', async () => {
    const csvContent = 'name,score\nCharlie,99';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ name: 'Charlie', score: 99 }]), 'Sheet1');
    const excelBytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    // Simulating consumer code processing any file format
    async function handleUpload(file: any) {
      const { rows, columns, total } = await parse(file);
      return { count: total, firstUser: rows[0].name, cols: columns };
    }

    const csvProcessed = await handleUpload(csvContent);
    const excelProcessed = await handleUpload(excelBytes);

    expect(csvProcessed).toEqual(excelProcessed);
    expect(csvProcessed).toEqual({
      count: 1,
      firstUser: 'Charlie',
      cols: ['name', 'score']
    });
  });
});
