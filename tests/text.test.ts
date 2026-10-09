import { describe, it, expect } from 'vitest';
import { parseText } from '../src/parsers/text';

describe('parseText', () => {
  it('should parse text into lines by default with unified rows and columns', async () => {
    const content = `line 1\nline 2\r\nline 3\n\n`;
    const res = await parseText<string>(content);

    expect(res.type).toBe('text');
    expect(res.total).toBe(3);
    expect(res.rows).toEqual(['line 1', 'line 2', 'line 3']);
    expect(res.data).toEqual(['line 1', 'line 2', 'line 3']);
    expect(res.columns).toEqual([]);
  });

  it('should parse text in raw mode', async () => {
    const content = `  Hello World!  \n  Next line  `;
    const res = await parseText<string>(content, { textMode: 'raw', trim: true });

    expect(res.data).toBe('Hello World!  \n  Next line');
    expect(res.total).toBe(1);
  });

  it('should parse text in json mode', async () => {
    const jsonStr = JSON.stringify([{ name: 'Alice', age: 25 }, { name: 'Bob', age: 30 }]);
    const res = await parseText<{ name: string; age: number }>(jsonStr, { textMode: 'json' });

    expect(res.type).toBe('json');
    expect(res.total).toBe(2);
    expect(res.columns).toEqual(['name', 'age']);
    expect(res.rows).toEqual([{ name: 'Alice', age: 25 }, { name: 'Bob', age: 30 }]);
  });

  it('should parse text in key-value mode', async () => {
    const kvStr = `
      # Config file
      PORT=8080
      HOST: localhost
      DEBUG=true
      ; another comment
    `;
    const res = await parseText<any>(kvStr, { textMode: 'key-value' });

    expect(res.type).toBe('text');
    expect(res.columns).toEqual(['key', 'value']);
    expect(res.rows).toEqual([
      { key: 'PORT', value: '8080' },
      { key: 'HOST', value: 'localhost' },
      { key: 'DEBUG', value: 'true' }
    ]);
  });
});
