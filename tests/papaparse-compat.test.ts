import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parse } from '../src/index';

describe('PapaParse Compatibility (Callbacks & Option Aliases)', () => {
  it('should support Papa.parse style callback with complete(results, file) for CSV', async () => {
    const csv = `name,age\nAlice,25\n\nBob,30\n`;
    const completeSpy = vi.fn();

    const promise = parse(csv, {
      header: true,
      skipEmptyLines: true, // PapaParse option alias for skipEmpty
      complete: completeSpy
    });

    const res = await promise;

    expect(completeSpy).toHaveBeenCalledTimes(1);
    const [results, file] = completeSpy.mock.calls[0];

    expect(file).toBe(csv);
    expect(results).toBe(res);
    expect(results.total).toBe(2);
    // PapaParse developers typically access results.data
    expect(results.data).toEqual([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ]);
    expect(results.data).toBe(results.rows);
  });

  it('should support PapaParse complete callback style for Excel (.xlsx) files too!', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ title: 'Excel Task', priority: 1 }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    let receivedData: any = null;
    await parse(bytes, {
      complete: (results) => {
        receivedData = results.data;
      }
    });

    expect(receivedData).toEqual([{ title: 'Excel Task', priority: 1 }]);
  });

  it('should support PapaParse step callback alias for onRow', async () => {
    const csv = `id,name\n1,Alpha\n2,Beta\n3,Gamma`;
    const steppedRows: any[] = [];

    await parse(csv, {
      step: (row, idx) => {
        steppedRows.push(row);
        if (idx === 1) return false; // early abort
      }
    });

    expect(steppedRows).toHaveLength(2);
    expect(steppedRows[0]).toEqual({ id: 1, name: 'Alpha' });
    expect(steppedRows[1]).toEqual({ id: 2, name: 'Beta' });
  });

  it('should trigger error(err, file) callback when parsing fails', async () => {
    const errorSpy = vi.fn();
    const badJson = '{ invalid_json: ';

    await expect(
      parse(badJson, {
        textMode: 'json',
        error: errorSpy
      })
    ).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [err, file] = errorSpy.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(file).toBe(badJson);
  });
});
