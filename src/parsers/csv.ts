import Papa from 'papaparse';
import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toText } from '../utils/input';

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
    skipEmpty = true,
    transformHeader,
    transform,
    trim = true,
    encoding = 'utf-8',
    preview,
    fileName: hintFileName
  } = options;

  let rawText = await toText(input, encoding);
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

  const parseConfig: Papa.ParseConfig = {
    header: isHeaderMode,
    delimiter: delimiter || undefined,
    dynamicTyping,
    skipEmptyLines: skipEmpty,
    transformHeader: headerTransformer,
    transform,
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
