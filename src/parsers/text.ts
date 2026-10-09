import { FileInput, ParseOptions, ParseResult } from '../types';
import { getInputInfo, toText } from '../utils/input';

/**
 * 解析纯文本文件（TXT、日志、配置、JSON 等）
 */
export async function parseText<T = any>(
  input: FileInput,
  options: ParseOptions = {}
): Promise<ParseResult<T>> {
  const {
    textMode = 'lines',
    encoding = 'utf-8',
    trim = true,
    skipEmpty = true,
    fileName: hintFileName
  } = options;

  const rawText = await toText(input, encoding);
  const inputInfo = getInputInfo(input);
  const fileName = hintFileName || inputInfo.fileName;

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
      const parsedJson = JSON.parse(trimmed);
      dataAlias = parsedJson;
      if (Array.isArray(parsedJson)) {
        rows = parsedJson;
        if (parsedJson.length > 0 && typeof parsedJson[0] === 'object' && parsedJson[0] !== null) {
          columns = Object.keys(parsedJson[0]);
        }
      } else if (typeof parsedJson === 'object' && parsedJson !== null) {
        rows = [parsedJson];
        columns = Object.keys(parsedJson);
      } else {
        rows = [parsedJson];
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

  const meta = {
    type: fileType,
    fileName,
    fileSize: inputInfo.fileSize ?? rawText.length,
    rowCount: rows.length,
    columns,
    textMode
  };

  return {
    rows: rows as T[],
    data: dataAlias as T[],
    columns,
    total: rows.length,
    type: fileType,
    text: rawText,
    meta,
    raw: rawText
  };
}
