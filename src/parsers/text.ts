import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toText } from '../utils/input';
import { applyValidation } from '../utils/validator';

/**
 * 解析纯文本文件（TXT、日志、配置、JSON 等）
 */
export async function parseText<T = any>(
  input: FileInput,
  options: ParseOptions = {}
): Promise<ParseResult<T>> {
  const {
    textMode = 'lines',
    encoding = 'auto',
    trim = true,
    skipEmpty = true,
    preview,
    transform,
    fileName: hintFileName,
    onRow
  } = options;

  const rawText = await toText(input, encoding, options);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

  // 空文本防护
  if (!rawText || rawText.trim() === '') {
    const emptyMeta = {
      type: (textMode === 'json' ? 'json' : 'text') as 'json' | 'text',
      fileName,
      fileSize: 0,
      rowCount: 0,
      columns: [],
      textMode
    };
    return {
      rows: [] as T[],
      data: (textMode === 'lines' ? [] : textMode === 'key-value' ? {} : '') as any,
      columns: [],
      total: 0,
      type: emptyMeta.type,
      text: '',
      meta: emptyMeta,
      raw: rawText
    };
  }

  let rows: any[] = [];
  let dataAlias: any;
  let columns: string[] = [];
  let fileType: 'text' | 'json' = 'text';

  switch (textMode) {
    case 'raw': {
      const content = trim ? rawText.trim() : rawText;
      rows = [content];
      dataAlias = content;
      columns = [];
      break;
    }

    case 'json': {
      fileType = 'json';
      const trimmed = rawText.trim();
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch (err: any) {
        throw new Error(`无法解析 JSON 文件内容: ${err?.message || err}`);
      }
      dataAlias = parsedJson;

      if (Array.isArray(parsedJson)) {
        rows = parsedJson;
      } else if (typeof parsedJson === 'object' && parsedJson !== null) {
        // 智能解包常用列表字段 (data, items, records, rows, list)
        const commonListKeys = ['data', 'items', 'records', 'rows', 'list', 'results'];
        const listKey = commonListKeys.find((k) => Array.isArray(parsedJson[k]));
        if (listKey) {
          rows = parsedJson[listKey];
        } else {
          rows = [parsedJson];
        }
      } else {
        rows = [parsedJson];
      }

      // 提取列名
      if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
        columns = Object.keys(rows[0]);
      }
      break;
    }

    case 'key-value': {
      const lines = rawText.split(/\r\n|\r|\n/);
      const kvObject: Record<string, string> = {};
      const kvRows: Array<{ key: string; value: string }> = [];

      for (const line of lines) {
        const processed = trim ? line.trim() : line;
        if (skipEmpty && !processed) continue;
        if (processed.startsWith('#') || processed.startsWith(';')) continue;

        const sepIdx = processed.search(/[:=]/);
        if (sepIdx !== -1) {
          const key = processed.slice(0, sepIdx).trim();
          const value = processed.slice(sepIdx + 1).trim();
          if (key) {
            kvObject[key] = value;
            kvRows.push({ key, value });
          }
        }
      }

      rows = kvRows;
      dataAlias = kvObject;
      columns = ['key', 'value'];
      break;
    }

    case 'lines':
    default: {
      let lines = rawText.split(/\r\n|\r|\n/);
      if (trim) {
        lines = lines.map((l) => l.trim());
      }
      if (skipEmpty) {
        lines = lines.filter((l) => l.length > 0);
      }
      rows = lines;
      dataAlias = lines;
      columns = [];
      break;
    }
  }

  // 单元格/行值转换
  if (typeof transform === 'function') {
    rows = rows.map((r, idx) => transform(r, idx));
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

  // 支持 preview
  if (typeof preview === 'number' && preview > 0 && preview < rows.length) {
    rows = rows.slice(0, preview);
  }

  const meta = {
    type: fileType,
    fileName,
    fileSize: inputInfo.fileSize ?? rawText.length,
    rowCount: rows.length,
    columns,
    textMode,
    errors: validationRes.errors.length > 0 ? validationRes.errors : undefined
  };

  return {
    rows: rows as T[],
    data: dataAlias as T[],
    columns,
    total: rows.length,
    type: fileType,
    text: rawText,
    errors: options.schema ? validationRes.errors : undefined,
    isValid: options.schema ? validationRes.isValid : undefined,
    invalidRows: options.schema && options.validationMode === 'filter' ? validationRes.invalidRows : undefined,
    meta,
    raw: rawText
  };
}
