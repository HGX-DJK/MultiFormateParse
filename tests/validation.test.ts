import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parse } from '../src/index';

describe('Enterprise Schema Validation Engine', () => {
  it('should validate CSV rows with declarative schema and report detailed error positioning', async () => {
    const csv = `name,age,email,role\nAlice,25,alice@test.com,admin\nBob,15,invalid-email,guest\n,30,charlie@test.com,unknown`;

    const res = await parse(csv, {
      type: 'csv',
      schema: {
        name: { required: true },
        age: { type: 'number', min: 18, message: '年龄必须年满18周岁' },
        email: { type: 'email', message: '邮箱格式不合法' },
        role: { enum: ['admin', 'user', 'guest'], message: '角色权限无效' }
      }
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toBeDefined();
    expect(res.errors?.length).toBe(4);

    // Row 2 (physical row 3): Bob is age 15 (< 18) and invalid email
    const bobAgeErr = res.errors?.find((e) => e.row === 2 && e.column === 'age');
    expect(bobAgeErr).toMatchObject({
      row: 2,
      physicalRow: 3,
      column: 'age',
      value: 15,
      rule: 'min',
      message: '年龄必须年满18周岁'
    });

    const bobEmailErr = res.errors?.find((e) => e.row === 2 && e.column === 'email');
    expect(bobEmailErr).toMatchObject({
      row: 2,
      physicalRow: 3,
      column: 'email',
      rule: 'type',
      message: '邮箱格式不合法'
    });

    // Row 3 (physical row 4): Empty name and unknown role
    const emptyNameErr = res.errors?.find((e) => e.row === 3 && e.column === 'name');
    expect(emptyNameErr).toMatchObject({
      row: 3,
      physicalRow: 4,
      column: 'name',
      rule: 'required'
    });

    const roleErr = res.errors?.find((e) => e.row === 3 && e.column === 'role');
    expect(roleErr).toMatchObject({
      row: 3,
      physicalRow: 4,
      column: 'role',
      rule: 'enum',
      message: '角色权限无效'
    });
  });

  it('should filter invalid rows when validationMode is "filter"', async () => {
    const csv = `product,price\nKeyboard,299\nMouse,-50\nMonitor,1200`;

    const res = await parse(csv, {
      type: 'csv',
      validationMode: 'filter',
      schema: {
        price: { type: 'number', min: 0 }
      }
    });

    expect(res.isValid).toBe(false);
    // Invalid row (Mouse) is filtered out
    expect(res.rows).toHaveLength(2);
    expect(res.rows).toEqual([
      { product: 'Keyboard', price: 299 },
      { product: 'Monitor', price: 1200 }
    ]);
    expect(res.invalidRows).toHaveLength(1);
    expect(res.invalidRows?.[0].data).toEqual({ product: 'Mouse', price: -50 });
    expect(res.invalidRows?.[0].physicalRow).toBe(3);
  });

  it('should abort parsing when validationMode is "abort" and error encountered', async () => {
    const csv = `code\nVALID\nTOO_LONG_CODE`;

    await expect(
      parse(csv, {
        type: 'csv',
        validationMode: 'abort',
        schema: {
          code: { max: 5, message: '代码长度不得超过5位' }
        }
      })
    ).rejects.toThrow('数据校验未通过: 第 3 行 [code] 代码长度不得超过5位');
  });

  it('should support custom column validator and custom row validator function', async () => {
    const csv = `password,confirm\n123456,123456\nabc,different`;

    const res = await parse(csv, {
      type: 'csv',
      schema: (row) => {
        if (row.password !== row.confirm) {
          return '两次输入的密码不一致';
        }
      }
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors?.[0]).toMatchObject({
      row: 2,
      physicalRow: 3,
      message: '两次输入的密码不一致'
    });
  });

  it('should support Zod-like schema with .safeParse', async () => {
    const mockZodSchema = {
      safeParse(data: any) {
        if (!data.username || data.username.length < 3) {
          return {
            success: false,
            error: {
              issues: [{ path: ['username'], message: '用户名至少3个字符' }]
            }
          };
        }
        return { success: true };
      }
    };

    const csv = `username\nok_user\nno`;
    const res = await parse(csv, {
      type: 'csv',
      schema: mockZodSchema
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors?.[0]).toMatchObject({
      row: 2,
      physicalRow: 3,
      column: 'username',
      message: '用户名至少3个字符',
      rule: 'zod'
    });
  });

  it('should work seamlessly with Excel spreadsheets', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { id: 1, department: 'HR' },
      { id: 2, department: 'InvalidDept' }
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const res = await parse(bytes, {
      schema: {
        department: { enum: ['HR', 'Engineering', 'Finance'] }
      }
    });

    expect(res.type).toBe('excel');
    expect(res.isValid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors?.[0].physicalRow).toBe(3);
    expect(res.errors?.[0].value).toBe('InvalidDept');
  });
});
