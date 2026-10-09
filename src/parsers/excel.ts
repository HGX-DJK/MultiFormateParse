import * as XLSX from 'xlsx';
import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toUint8Array } from '../utils/input';

/**
 * 确保每行数据为纯粹的 JavaScript 对象，剔除 SheetJS 的隐藏非枚举属性
 */
function cleanRow(row: any): any {
  if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
    return { ...row };
  }
  return row;
}

/**
 * 解析 Excel 文件 (.xlsx, .xls, .xlsm, .xlsb, .ods)
 */
export async function parseExcel<T = any>(
  input: FileInput,
  options: ParseOptions = {}
): Promise<ParseResult<T>> {
  const {
    sheet = 0,
    header = true,
    dynamicTyping = true,
    raw = dynamicTyping,
    dateNF = 'yyyy-mm-dd hh:mm:ss',
    defval = null,
    skipEmpty = true,
    fileName: hintFileName
  } = options;

  const bytes = await toUint8Array(input);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

  // 读取工作簿
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    dateNF
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('Excel 文件中没有检测到任何工作表 (Worksheet)');
  }

  // 配置 sheet_to_json 参数
  const sheetToJsonOpts: XLSX.Sheet2JSONOpts = {
    raw,
    dateNF,
    defval,
    blankrows: !skipEmpty
  };

  if (header === false) {
    sheetToJsonOpts.header = 1; // 二维数组输出
  } else if (Array.isArray(header)) {
    sheetToJsonOpts.header = header;
  } else if (typeof header === 'number') {
    sheetToJsonOpts.range = header;
  }

  // 构建全部工作表的数据字典
  const sheets: Record<string, any[]> = {};
  for (const name of sheetNames) {
    const ws = workbook.Sheets[name];
    sheets[name] = ws
      ? (XLSX.utils.sheet_to_json(ws, sheetToJsonOpts) as any[]).map(cleanRow)
      : [];
  }

  // 确定当前主工作表
  let currentSheetName = sheetNames[0];
  if (typeof sheet === 'number') {
    if (sheet >= 0 && sheet < sheetNames.length) {
      currentSheetName = sheetNames[sheet];
    }
  } else if (typeof sheet === 'string' && sheet !== 'all') {
    if (sheetNames.includes(sheet)) {
      currentSheetName = sheet;
    }
  }

  // 提取主数据行
  let rows: any[];
  if (sheet === 'all') {
    rows = sheets[currentSheetName] || [];
  } else {
    rows = sheets[currentSheetName] || [];
  }

  // 提取列名
  let columns: string[] = [];
  if (Array.isArray(header)) {
    columns = header;
  } else if (header !== false && rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    columns = Object.keys(rows[0]);
  }

  const meta = {
    type: 'excel' as const,
    fileName,
    fileSize: inputInfo.fileSize ?? bytes.byteLength,
    rowCount: rows.length,
    columns,
    sheetNames,
    currentSheet: currentSheetName
  };

  return {
    rows: rows as T[],
    data: rows as T[],
    columns,
    total: rows.length,
    type: 'excel',
    sheets,
    currentSheet: currentSheetName,
    sheetNames,
    meta,
    raw: bytes
  };
}
