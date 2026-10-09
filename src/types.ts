/**
 * 支持的输入数据类型：浏览器 File/Blob、Node Buffer、ArrayBuffer、Uint8Array、字符串（内容或文件路径）
 */
export type FileInput =
  | string
  | ArrayBuffer
  | Uint8Array
  | Blob
  | File
  | any;

/**
 * 解析后的文件类型
 */
export type FileType = 'excel' | 'csv' | 'text' | 'json';

/**
 * 统一的解析配置选项
 */
export interface ParseOptions {
  /**
   * 表头设置：
   * - true: 首行作为表头（返回对象数组 [{ col1: val1, col2: val2 }]）
   * - false: 不使用表头（返回二维数组 [[val1, val2], ...]）
   * - number: 指定第 N 行作为表头 (0-based)
   * - string[]: 自定义表头列名
   * @default true
   */
  header?: boolean | number | string[];

  /**
   * 自动类型转换：是否自动将数字、布尔文本转换为 JavaScript number 和 boolean
   * @default true
   */
  dynamicTyping?: boolean;

  /**
   * 是否保持底层原始值（如 Excel 中不转格式化文本字符串）
   * @default true
   */
  raw?: boolean;

  /**
   * 是否自动跳过空行
   * @default true
   */
  skipEmpty?: boolean;

  /**
   * 是否自动去除前后空白字符
   * @default true
   */
  trim?: boolean;

  /**
   * 工作表设置（Excel 生效）：
   * - 0 或其它数字：工作表索引（默认第 1 个）
   * - 字符串：工作表名称
   * - 'all'：解析全部工作表，结果保存在 result.sheets 中
   * @default 0
   */
  sheet?: string | number | 'all';

  /**
   * 分隔符（CSV/文本生效，未指定时自动侦测逗号、分号、制表符等）
   */
  delimiter?: string;

  /**
   * 编码格式（默认 utf-8）
   * @default 'utf-8'
   */
  encoding?: string;

  /**
   * 强制指定解析类型（默认 'auto' 自动识别）
   * @default 'auto'
   */
  type?: 'auto' | FileType;

  /**
   * 文件名提示（传入 Buffer 或 ArrayBuffer 时可传入以辅助识别类型）
   */
  fileName?: string;

  /**
   * MIME 类型提示
   */
  mimeType?: string;

  /**
   * 纯文本模式设置：
   * - 'lines': 按行分割为数组（默认）
   * - 'raw': 返回纯文本字符串
   * - 'key-value': 解析为键值对对象（如 .env 或配置文件）
   * - 'json': 解析为 JSON 数据
   * @default 'lines'
   */
  textMode?: 'lines' | 'raw' | 'key-value' | 'json';

  /**
   * Excel 日期格式化模版（如 'yyyy-mm-dd hh:mm:ss'）
   */
  dateNF?: string;

  /**
   * 空单元格默认填充值
   * @default null
   */
  defval?: any;

  /**
   * 最大解析行数限制
   */
  preview?: number;

  /**
   * 转换表头名称的函数
   */
  transformHeader?: (header: string, index: number) => string;

  /**
   * 转换每个单元格值的函数
   */
  transform?: (value: any, field: string | number) => any;
}

/**
 * 元信息描述
 */
export interface ParseMeta {
  /** 识别或指定的文件类型 */
  type: FileType;
  /** 文件名（如果能获取到） */
  fileName?: string;
  /** 文件字节大小 */
  fileSize?: number;
  /** 行数 */
  rowCount: number;
  /** 列名列表 */
  columns: string[];
  /** 侦测到或使用的分隔符 (CSV) */
  delimiter?: string;
  /** 所有工作表名称列表 (Excel) */
  sheetNames?: string[];
  /** 当前工作表名称 (Excel) */
  currentSheet?: string;
  /** 其它扩展信息或警告 */
  [key: string]: any;
}

/**
 * 统一的解析结果
 */
export interface ParseResult<T = any> {
  /**
   * 统一的数据行输出：
   * - Excel / CSV: 默认返回对象数组 [ { col1: 'a', col2: 'b' } ] 或二维数组 (当 header=false 时)
   * - Text: 默认返回文本行数组 ['line 1', 'line 2']
   * - JSON: 返回解析后的数组或对象
   */
  rows: T[];

  /**
   * 数据别名，等同于 rows（方便习惯使用 data 的开发者）
   */
  data: T[];

  /**
   * 列名列表（Excel 与 CSV 为表头列名，纯文本模式为空数组）
   */
  columns: string[];

  /**
   * 数据总行数
   */
  total: number;

  /**
   * 解析出的文件格式类型 ('excel' | 'csv' | 'text' | 'json')
   */
  type: FileType;

  /**
   * 文本字符串内容（适用于纯文本、CSV 或 JSON 的原始文本查看）
   */
  text?: string;

  /**
   * Excel 的全部工作表字典（当解析 Excel 时提供，格式为 { [工作表名]: 行数组 }）
   */
  sheets?: Record<string, any[]>;

  /**
   * 当前工作表名（Excel 时有效）
   */
  currentSheet?: string;

  /**
   * 全部工作表名列表（Excel 时有效）
   */
  sheetNames?: string[];

  /**
   * 详细元数据
   */
  meta: ParseMeta;

  /**
   * 原始内容 (原始 buffer 或 text)
   */
  raw?: any;
}
