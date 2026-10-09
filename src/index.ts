import { FileInput, ParseOptions, ParseResult, FileType } from './types';
import { detectFileType } from './utils/detector';
import { parseText } from './parsers/text';
import { parseCsv } from './parsers/csv';
import { parseExcel } from './parsers/excel';

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export * from './types';
export * from './parsers';
export { XLSX, Papa };
export { detectFileType } from './utils/detector';
export { toUint8Array, toArrayBuffer, toText, getInputInfo, decodeTextWithAutoDetection } from './utils/input';
export { applyValidation, validateSingleRow } from './utils/validator';

/**
 * 统一文件解析入口（自动智能识别并统一输出格式）
 *
 * 无论传入的是 Excel (.xlsx/.xls)、CSV 还是 Text 文本，
 * 均返回完全一致的数据结构：`{ rows, columns, total, type, sheets, ... }`
 *
 * @param input 支持浏览器 File、Blob、ArrayBuffer、Uint8Array、Node Buffer 或字符串（文本内容或文件路径）
 * @param options 统一解析选项
 * @returns 统一的解析结果对象
 *
 * @example
 * // 1. 极简用法（自动识别 Excel / CSV / Text）
 * const { rows, columns, total } = await parse(file);
 *
 * @example
 * // 2. 指定表头不启用，按二维数组输出
 * const { rows } = await parse(file, { header: false });
 *
 * @example
 * // 3. 显式指定工作表（Excel 时有效）
 * const { rows } = await parse(file, { sheet: 'Sheet2' });
 */
export async function parse<T = any>(
  input: FileInput,
  options: ParseOptions = {}
): Promise<ParseResult<T>> {
  const { type = 'auto', fileName, mimeType, ...restOptions } = options;

  let resolvedType: FileType;
  if (type !== 'auto') {
    resolvedType = type;
  } else {
    resolvedType = await detectFileType(input, fileName, mimeType);
  }

  let result: ParseResult<T>;

  switch (resolvedType) {
    case 'excel':
      result = await parseExcel<T>(input, { ...restOptions, fileName });
      break;

    case 'csv':
      result = await parseCsv<T>(input, { ...restOptions, fileName });
      break;

    case 'json':
      result = await parseText<T>(input, { ...restOptions, textMode: 'json', fileName });
      break;

    case 'text':
    default:
      result = await parseText<T>(input, { ...restOptions, fileName });
      break;
  }

  if (fileName && !result.meta.fileName) {
    result.meta.fileName = fileName;
  }

  return result;
}

/**
 * parse 函数的语义化别名
 */
export const parseFile = parse;

export default parse;
