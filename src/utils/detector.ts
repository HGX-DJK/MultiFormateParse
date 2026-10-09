import { FileInput, FileType } from '../types';
import { getInputInfo, toUint8Array } from './input';

const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'];
const CSV_EXTENSIONS = ['.csv', '.tsv'];
const TEXT_EXTENSIONS = ['.txt', '.log', '.json', '.md', '.env', '.ini', '.xml', '.yaml', '.yml'];

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/x-excel'
];

const CSV_MIME_TYPES = [
  'text/csv',
  'text/tab-separated-values',
  'application/csv',
  'application/x-csv',
  'text/x-csv'
];

/**
 * Checks magic numbers in binary data to identify Excel file formats:
 * - XLSX / ODS (ZIP archive): PK\x03\x04 [0x50, 0x4B, 0x03, 0x04]
 * - XLS (Compound Document / OLE2): [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]
 */
export function isExcelBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;

  // ZIP signature (XLSX, ODS)
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return true;
  }

  // OLE2 / Compound File Binary format (XLS)
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return true;
  }

  return false;
}

/**
 * Detect file type based on file name, MIME type, or content
 */
export async function detectFileType(
  input: FileInput,
  hintFileName?: string,
  hintMimeType?: string
): Promise<FileType> {
  const meta = getInputInfo(input);
  const fileName = (hintFileName || meta.fileName || '').toLowerCase();
  const mimeType = (hintMimeType || meta.mimeType || '').toLowerCase();

  // 1. Check file extension
  if (fileName) {
    if (EXCEL_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return 'excel';
    }
    if (CSV_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return 'csv';
    }
    if (fileName.endsWith('.json')) {
      return 'json';
    }
    if (TEXT_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return 'text';
    }
  }

  // 2. Check MIME type
  if (mimeType) {
    if (EXCEL_MIME_TYPES.some((mime) => mimeType.includes(mime))) {
      return 'excel';
    }
    if (CSV_MIME_TYPES.some((mime) => mimeType.includes(mime))) {
      return 'csv';
    }
    if (mimeType.includes('application/json')) {
      return 'json';
    }
    if (mimeType.startsWith('text/')) {
      return 'text';
    }
  }

  // 3. Inspect binary magic bytes if applicable
  try {
    const bytes = await toUint8Array(input);
    if (isExcelBinary(bytes)) {
      return 'excel';
    }

    // Check if it's text/csv
    const previewLen = Math.min(bytes.length, 4096);
    let hasNull = false;
    for (let i = 0; i < previewLen; i++) {
      if (bytes[i] === 0) {
        hasNull = true;
        break;
      }
    }

    // Binary with null bytes not matching excel
    if (hasNull) {
      return 'excel';
    }

    // String heuristics for JSON vs CSV vs plain text
    const textPreview = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, previewLen));
    const trimmed = textPreview.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const fullText =
          typeof input === 'string'
            ? input.trim()
            : bytes.length <= previewLen
            ? trimmed
            : new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
        JSON.parse(fullText);
        return 'json';
      } catch {
        // 对于超大或被截断的 JSON 文本，进行结构特征兜底识别
        if (trimmed.startsWith('{') && (trimmed.includes('":') || trimmed.includes('": '))) {
          return 'json';
        }
        if (trimmed.startsWith('[') && (trimmed.includes('{') || trimmed.includes('",') || trimmed.includes('",\n'))) {
          return 'json';
        }
      }
    }

    if (isLikelyCsv(textPreview)) {
      return 'csv';
    }
  } catch {
    // Fallback to text
  }

  return 'text';
}

/**
 * Heuristic check if string content is formatted as CSV
 */
export function isLikelyCsv(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5);

  if (lines.length === 0) return false;

  const delimiters = [',', ';', '\t', '|'];
  for (const delim of delimiters) {
    const counts = lines.map((line) => line.split(delim).length - 1);
    const firstCount = counts[0];
    // If delimiter appears at least once per line and counts match consistently
    if (firstCount > 0 && counts.every((c) => c === firstCount)) {
      return true;
    }
  }

  return false;
}
