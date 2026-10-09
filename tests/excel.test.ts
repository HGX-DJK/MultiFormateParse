import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel } from '../src/parsers/excel';

function createMockExcelBuffer(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Users
  const usersData = [
    { id: 1, name: 'Alice', department: 'Engineering', salary: 10000 },
    { id: 2, name: 'Bob', department: 'Design', salary: 8500 }
  ];
  const wsUsers = XLSX.utils.json_to_sheet(usersData);
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Users');

  // Sheet 2: Projects
  const projectsData = [
    { code: 'PRJ-1', title: 'Parser Tool', status: 'Done' },
    { code: 'PRJ-2', title: 'Rollup Plugin', status: 'In Progress' }
  ];
  const wsProjects = XLSX.utils.json_to_sheet(projectsData);
  XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

describe('parseExcel', () => {
  it('should parse first sheet by default with unified rows, columns, and sheets', async () => {
    const bytes = createMockExcelBuffer();
    const res = await parseExcel<any>(bytes);

    expect(res.type).toBe('excel');
    expect(res.currentSheet).toBe('Users');
    expect(res.sheetNames).toEqual(['Users', 'Projects']);
    expect(res.columns).toEqual(['id', 'name', 'department', 'salary']);
    expect(res.total).toBe(2);
    expect(res.rows).toEqual([
      { id: 1, name: 'Alice', department: 'Engineering', salary: 10000 },
      { id: 2, name: 'Bob', department: 'Design', salary: 8500 }
    ]);
    expect(res.data).toEqual(res.rows);
    // sheets dictionary is also accessible!
    expect(res.sheets?.Users).toHaveLength(2);
    expect(res.sheets?.Projects).toHaveLength(2);
  });

  it('should parse specific sheet by name', async () => {
    const bytes = createMockExcelBuffer();
    const res = await parseExcel<any>(bytes, { sheet: 'Projects' });

    expect(res.currentSheet).toBe('Projects');
    expect(res.columns).toEqual(['code', 'title', 'status']);
    expect(res.rows).toEqual([
      { code: 'PRJ-1', title: 'Parser Tool', status: 'Done' },
      { code: 'PRJ-2', title: 'Rollup Plugin', status: 'In Progress' }
    ]);
  });

  it('should parse specific sheet by index', async () => {
    const bytes = createMockExcelBuffer();
    const res = await parseExcel<any>(bytes, { sheet: 1 });

    expect(res.currentSheet).toBe('Projects');
    expect(res.total).toBe(2);
    expect(res.rows[0].title).toBe('Parser Tool');
  });

  it('should parse sheet as 2D array when header: false', async () => {
    const bytes = createMockExcelBuffer();
    const res = await parseExcel<any[]>(bytes, { header: false });

    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.rows[0]).toEqual(['id', 'name', 'department', 'salary']);
    expect(res.rows[1]).toEqual([1, 'Alice', 'Engineering', 10000]);
  });
});
