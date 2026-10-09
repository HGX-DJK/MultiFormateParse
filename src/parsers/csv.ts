import Papa from 'papaparse';
import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toText } from '../utils/input';

/**
 * 生产级安全动态类型转换（防止超长整数精度丢失与前导 0 丢失）
 */
function parseSafeDynamicValue(val: any): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed === 'true' || trimmed === 'TRUE') return true;
  if (trimmed === 'false' || trimmed === 'FALSE') return false;
  if (trimmed === 'null' || trimmed === 'NULL') return null;
  if (trimmed === 'undefined') return undefined;

  // 带前导 0 的编码（如邮编 '01234'、电话区号）必须保留为原始字符串
  if (/^0\d+$/.test(trimmed) || /^-0\d+$/.test(trimmed)) {
    return val;
  }

  // 纯整数
  if (/^-?\d+$/.test(trimmed)) {
    if (trimmed.length >= 16) {
      const num = Number(trimmed);
      if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
        return val; // 超过 JS 安全整数限制（如 18 位身份证或雪花 ID），防止精度丢失
      }
    }
    return Number(trimmed);
  }

  // 标准浮点数
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return val;
}

/**
 * 解析 CSV / TSV 文本或文件
 */
export async function parseCsv<T = any>(
  input: FileInput,
  options: ParseOptions = {}
): Promise<ParseResult<T>> {
  const {
    header = true,
    delimiter,
    dynamicTyping = true,
    safeNumberPrecision = true,
    skipEmpty = true,
    transformHeader,
    transform,
    trim = true,
    encoding = 'auto',
    preview,
    fileName: hintFileName,
    onRow
  } = options;

  let rawText = await toText(input, encoding, options);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

  // 空文本防护
  if (!rawText || rawText.trim() === '') {
    const emptyMeta = {
      type: 'csv' as const,
      fileName,
      fileSize: 0,
      rowCount: 0,
      columns: []
    };
    return {
      rows: [] as T[],
      data: [] as T[],
      columns: [],
      total: 0,
      type: 'csv',
      text: '',
      meta: emptyMeta,
      raw: rawText
    };
  }

  // 剔除 UTF-8 BOM 头
  if (rawText.charCodeAt(0) === 0xfeff) {
    rawText = rawText.slice(1);
  }

  const isCustomHeader = Array.isArray(header);
  const isHeaderMode = isCustomHeader ? false : (typeof header === 'boolean' ? header : true);

  // 默认对表头去空格并执行 transformHeader
  const headerTransformer = (h: string, idx: number) => {
    let name = trim && typeof h === 'string' ? h.trim() : h;
    if (typeof transformHeader === 'function') {
      name = transformHeader(name, idx);
    }
    return name;
  };

  // 单元格数据转换处理
  const cellTransformer = (value: string, field: string | number) => {
    let val: any = value;
    if (dynamicTyping && safeNumberPrecision) {
      val = parseSafeDynamicValue(val);
    }
    if (typeof transform === 'function') {
      val = transform(val, field);
    }
    return val;
  };

  const parseConfig: Papa.ParseConfig = {
    header: isHeaderMode,
    delimiter: delimiter || undefined,
    dynamicTyping: dynamicTyping && !safeNumberPrecision,
    skipEmptyLines: skipEmpty,
    transformHeader: headerTransformer,
    transform: cellTransformer,
    preview
  };

  const parsed = Papa.parse(rawText, parseConfig);
  let rows = (parsed.data || []) as any[];

  // 提取列名及映射自定义表头
  let columns: string[] = [];
  if (isCustomHeader) {
    const customHeaders = (header as string[]).map((h, i) => headerTransformer(String(h), i));
    columns = customHeaders;
    rows = rows.map((rowArr) => {
      if (Array.isArray(rowArr)) {
        const obj: Record<string, any> = {};
        for (let i = 0; i < customHeaders.length; i++) {
          const key = customHeaders[i];
          obj[key] = rowArr[i] !== undefined ? rowArr[i] : null;
        }
        return obj;
      }
      return rowArr;
    });
  } else if (isHeaderMode && parsed.meta.fields) {
    columns = parsed.meta.fields;
  }

  // 支持逐行回调 onRow，若返回 false 则提前截断
  if (typeof onRow === 'function') {
    for (let i = 0; i < rows.length; i++) {
      const continueFlag = onRow(rows[i], i);
      if (continueFlag === false) {
        rows = rows.slice(0, i + 1);
        break;
      }
    }
  }

  const meta = {
    type: 'csv' as const,
    fileName,
    fileSize: inputInfo.fileSize ?? rawText.length,
    rowCount: rows.length,
    columns,
    delimiter: parsed.meta.delimiter,
    errors: parsed.errors.length > 0 ? parsed.errors : undefined
  };

  return {
    rows: rows as T[],
    data: rows as T[],
    columns,
    total: rows.length,
    type: 'csv',
    text: rawText,
    meta,
    raw: rawText
  };
}
