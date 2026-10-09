import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parse } from '../src/index';

describe('Production-Grade Enterprise Capabilities', () => {
  it('should auto-detect and decode GBK/GB2312 encoded Chinese CSV without manual encoding configuration', async () => {
    // GBK encoded bytes for "姓名,年龄\n张三,28"
    // 姓名: [0xd0, 0xd5, 0xc3, 0xfb], 年龄: [0xc4, 0xea, 0xc1, 0xe4], 张三: [0xd5, 0xc5, 0xc8, 0xfd]
    const gbkBytes = Buffer.from([
      0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4, 0x0a, // 姓名,年龄\n
      0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x32, 0x38             // 张三,28
    ]);

    // parse without specifying encoding (default 'auto')
    const res = await parse(gbkBytes, { type: 'csv' });

    expect(res.columns).toEqual(['姓名', '年龄']);
    expect(res.rows[0]).toEqual({ 姓名: '张三', 年龄: 28 });
  });

  it('should protect ultra-large numbers (Snowflake ID / ID card) and leading zeros from IEEE-754 precision corruption', async () => {
    const csv = `id,order_no,zip_code,amount\n1823912093812093812,01009988,01234,99.5`;
    const res = await parse(csv, { type: 'csv', dynamicTyping: true, safeNumberPrecision: true });

    expect(res.rows[0].id).toBe('1823912093812093812'); // Kept as string!
    expect(res.rows[0].order_no).toBe('01009988');       // Leading 0 preserved as string!
    expect(res.rows[0].zip_code).toBe('01234');          // Postal code preserved as string!
    expect(res.rows[0].amount).toBe(99.5);               // Standard float converted to number!
  });

  it('should enforce maxFileSize and safely reject oversized files to prevent OOM/DoS', async () => {
    const bigString = 'a'.repeat(1000);
    await expect(
      parse(bigString, { type: 'text', maxFileSize: 500 })
    ).rejects.toThrow('超出设定的最大上限');
  });

  it('should support AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('User cancelled'));

    await expect(
      parse('some text', { signal: controller.signal })
    ).rejects.toThrow();
  });

  it('should support onRow callback and allow early termination', async () => {
    const csv = `id,name\n1,A\n2,B\n3,C\n4,D\n5,E`;
    const collected: any[] = [];

    const res = await parse(csv, {
      onRow: (row, idx) => {
        collected.push(row);
        if (idx === 1) return false; // terminate early after index 1
      }
    });

    expect(collected).toHaveLength(2);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toEqual({ id: 1, name: 'A' });
    expect(res.rows[1]).toEqual({ id: 2, name: 'B' });
  });

  it('should report progress via onProgress for Stream or fetch', async () => {
    const progressList: any[] = [];
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('col1,col2\n'));
        ctrl.enqueue(new TextEncoder().encode('1,2\n'));
        ctrl.close();
      }
    });

    const res = await parse(stream, {
      type: 'csv',
      onProgress: (p) => progressList.push(p)
    });

    expect(res.total).toBe(1);
    expect(progressList.length).toBeGreaterThan(0);
    expect(progressList[0].loaded).toBeGreaterThan(0);
  });
});
