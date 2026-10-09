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
    encoding = 'utf-8',
    preview,
    fileName: hintFileName
  } = options;

  let rawText = await toText(input, encoding);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

  // 剔除 UTF-8 BOM 头
  if (rawText.charCodeAt(0) === 0xfeff) {
    rawText = rawText.slice(1);
  }

  const isHeaderMode = typeof header === 'boolean' ? header : Boolean(header);

  const parseConfig: Papa.ParseConfig = {
    header: isHeaderMode,
    delimiter: delimiter || undefined,
    dynamicTyping,
    skipEmptyLines: skipEmpty,
    transformHeader,
    transform,
    preview
  };

  const parsed = Papa.parse(rawText, parseConfig);
  const rows = (parsed.data || []) as any[];

  // 提取列名
  let columns: string[] = [];
  if (isHeaderMode && parsed.meta.fields) {
    columns = parsed.meta.fields;
  } else if (Array.isArray(header)) {
    columns = header;
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
