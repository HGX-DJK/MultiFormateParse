import * as XLSX from 'xlsx';
import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toUint8Array } from '../utils/input';
import { applyValidation } from '../utils/validator';

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
    preview,
    transformHeader,
    transform,
    trim = true,
    fileName: hintFileName,
    onRow
  } = options;

  const bytes = await toUint8Array(input, options);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

  // 空文件防护
  if (bytes.length === 0) {
    const emptyMeta = {
      type: 'excel' as const,
      fileName,
      fileSize: 0,
      rowCount: 0,
      columns: [],
      sheetNames: []
    };
    return {
      rows: [] as T[],
      data: [] as T[],
      columns: [],
      total: 0,
      type: 'excel',
      sheets: {},
      meta: emptyMeta,
      raw: bytes
    };
  }

  // 读取工作簿（生产级优化：禁用不必要的公式 AST、HTML 与样式解析，显著削减内存）
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
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

  // 单表解析辅助函数
  const parseSheetByName = (name: string): any[] => {
    const ws = workbook.Sheets[name];
    if (!ws) return [];
    return (XLSX.utils.sheet_to_json(ws, sheetToJsonOpts) as any[]).map(cleanRow);
  };

  // 性能优化：按需懒加载工作表（若用户指定 sheet: 'all' 则全量解析，否则仅首选工作表立即解析，其余工作表在访问时延迟解析并缓存）
  const loadedSheets: Record<string, any[]> = {};
  loadedSheets[currentSheetName] = parseSheetByName(currentSheetName);

  if (sheet === 'all') {
    for (const name of sheetNames) {
      if (!loadedSheets[name]) {
        loadedSheets[name] = parseSheetByName(name);
      }
    }
  }

  const sheets: Record<string, any[]> = {};
  for (const name of sheetNames) {
    if (loadedSheets[name]) {
      sheets[name] = loadedSheets[name];
    } else {
      let cached: any[] | null = null;
      Object.defineProperty(sheets, name, {
        enumerable: true,
        configurable: true,
        get() {
          if (cached === null) {
            cached = parseSheetByName(name);
          }
          return cached;
        }
      });
    }
  }

  // 提取主数据行
  let rows: any[] = sheets[currentSheetName] || [];
  const currentWs = workbook.Sheets[currentSheetName];

  // 提取原始列名（支持数据行为空但存在表头单元格的边界情况）
  let rawColumns: string[] = [];
  if (Array.isArray(header)) {
    rawColumns = header.map(String);
  } else if (header !== false) {
    if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      rawColumns = Object.keys(rows[0]);
    } else if (currentWs && currentWs['!ref']) {
      // 当表格只有表头但没有数据行时，从 Worksheet 第 1 行提取列名
      const headerRows = XLSX.utils.sheet_to_json(currentWs, { header: 1 }) as any[][];
      if (headerRows.length > 0 && Array.isArray(headerRows[0])) {
        rawColumns = headerRows[0].map((c) => String(c ?? ''));
      }
    }
  }

  // 预先计算转换后的列名字典与列表（性能优化：避免在数十万行循环中重复调用 transformHeader）
  const headerMap = new Map<string, string>();
  const columns: string[] = [];

  rawColumns.forEach((colKey, colIdx) => {
    let newKey = trim ? colKey.trim() : colKey;
    if (typeof transformHeader === 'function') {
      newKey = transformHeader(newKey, colIdx);
    }
    headerMap.set(colKey, newKey);
    columns.push(newKey);
  });

  // 应用表头转换到各行数据
  if (header !== false && headerMap.size > 0 && (typeof transformHeader === 'function' || trim)) {
    rows = rows.map((row) => {
      if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
        const newObj: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          const newKey = headerMap.get(key) ?? (trim ? key.trim() : key);
          newObj[newKey] = val;
        }
        return newObj;
      }
      return row;
    });
  }

  // 应用单元格值转换 transform
  if (typeof transform === 'function') {
    rows = rows.map((row) => {
      if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
        const newObj: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          newObj[key] = transform(val, key);
        }
        return newObj;
      } else if (Array.isArray(row)) {
        return row.map((val, idx) => transform(val, idx));
      }
      return row;
    });
  }

  // 生产级数据校验引擎执行
  const validationRes = applyValidation<T>(rows, options);
  if (options.validationMode === 'filter') {
    rows = validationRes.validRows;
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

  const fullCount = rows.length;

  // 支持 preview 截取行数
  if (typeof preview === 'number' && preview > 0 && preview < rows.length) {
    rows = rows.slice(0, preview);
  }

  const meta = {
    type: 'excel' as const,
    fileName,
    fileSize: inputInfo.fileSize ?? bytes.byteLength,
    rowCount: rows.length,
    totalRows: fullCount,
    columns,
    sheetNames,
    currentSheet: currentSheetName,
    errors: validationRes.errors.length > 0 ? validationRes.errors : undefined
  };

  const result: ParseResult<T> = {
    rows: rows as T[],
    data: rows as T[],
    columns,
    total: rows.length,
    type: 'excel',
    sheets,
    currentSheet: currentSheetName,
    sheetNames,
    errors: options.schema ? validationRes.errors : undefined,
    isValid: options.schema ? validationRes.isValid : undefined,
    invalidRows: options.schema && options.validationMode === 'filter' ? validationRes.invalidRows : undefined,
    meta,
    raw: bytes
  };

  if (typeof options.complete === 'function') {
    try {
      options.complete(result, input);
    } catch (cbErr) {
      console.error('Error in complete callback:', cbErr);
    }
  }

  return result;
}
