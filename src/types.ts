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
 * 列级校验规则
 */
export interface ColumnRule {
  /** 是否必填（不能为 null、undefined 或空白字符串） */
  required?: boolean;

  /** 期望的数据类型 */
  type?: 'string' | 'number' | 'boolean' | 'date' | 'email';

  /** 最小值（数字）或最小长度（字符串/数组） */
  min?: number;

  /** 最大值（数字）或最大长度（字符串/数组） */
  max?: number;

  /** 枚举可选值白名单 */
  enum?: any[];

  /** 正则表达式校验 */
  pattern?: RegExp;

  /** 自定义校验函数，返回 false 或错误信息字符串表示校验失败 */
  custom?: (value: any, row: any, index: number) => boolean | string | void;

  /** 校验失败时的自定义提示文案 */
  message?: string;
}

/**
 * 声明式列名校验规则字典：{ 列名: 校验规则 }
 */
export type SchemaMap = Record<string, ColumnRule>;

/**
 * 行级自定义校验函数
 */
export type RowValidator<T = any> = (
  row: T,
  index: number
) => ValidationError[] | string | boolean | void;

/**
 * 兼容 Zod 等规范库的 Schema 结构（带有 .safeParse 方法）
 */
export interface ZodLikeSchema {
  safeParse: (data: any) => {
    success: boolean;
    error?: {
      issues: Array<{ path: Array<string | number>; message: string }>;
    };
  };
}

/**
 * 统一 Schema 校验器类型（支持声明式规则字典、行级校验回调或 Zod Schema）
 */
export type ValidationSchema<T = any> = SchemaMap | RowValidator<T> | ZodLikeSchema;

/**
 * 校验失败时的处理模式：
 * - 'collect': (默认) 收集所有错误至 result.errors，解析不中断，保留全部数据行
 * - 'abort': 遇到首个校验错误立即中断并抛出异常
 * - 'filter': 自动剔除校验不通过的无效行，result.rows 仅保留合规数据
 */
export type ValidationMode = 'collect' | 'abort' | 'filter';

/**
 * 校验错误结构化报告
 */
export interface ValidationError {
  /** 数据行序号（1-based，从 1 开始） */
  row: number;
  /** 物理文件行号（例如带表头时，首条数据在 Excel/CSV 中实际为第 2 行） */
  physicalRow: number;
  /** 发生错误的列名 */
  column?: string;
  /** 错误单元格的原始值 */
  value?: any;
  /** 错误提示描述 */
  message: string;
  /** 触发的规则类型 ('required' | 'type' | 'min' | 'max' | 'enum' | 'pattern' | 'custom' | 'zod') */
  rule?: string;
}

/**
 * 校验执行结果
 */
export interface ValidationResult<T = any> {
  validRows: T[];
  invalidRows: Array<{
    row: number;
    physicalRow: number;
    data: T;
    errors: ValidationError[];
  }>;
  errors: ValidationError[];
  isValid: boolean;
}

/**
 * 数据加载或下载进度信息
 */
export interface ParseProgress {
  /** 当前已读取/下载字节数 */
  loaded: number;
  /** 文件总字节数（如果已知） */
  total?: number;
  /** 进度百分比 (0 - 100) */
  percent?: number;
}

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
   * 大数值精度安全保护：
   * 自动将超过 15 位的超长整数（如 18 位身份证号、雪花算法 ID、订单流水号）以及带前导 0 的编码（如邮编 '01000'）保持为字符串，
   * 避免由于 JavaScript IEEE-754 双精度浮点数限制导致末位被强制置零。
   * @default true
   */
  safeNumberPrecision?: boolean;

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
   * PapaParse 兼容选项：是否跳过空行（等同于 skipEmpty）
   */
  skipEmptyLines?: boolean;

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
   * 编码格式（默认 'auto' 智能自适应识别，支持 UTF-8、GBK、GB2312、UTF-16 等）
   * @default 'auto'
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
   * 中断控制信号（支持标准 AbortSignal，用于取消网络下载或长耗时任务）
   */
  signal?: AbortSignal;

  /**
   * 最大允许文件大小限制（字节数），超出后安全抛错阻断，防止大文件 OOM 攻击
   */
  maxFileSize?: number;

  /**
   * 数据加载/下载进度回调函数
   */
  onProgress?: (progress: ParseProgress) => void;

  /**
   * 逐行处理回调，若返回 false 则提前中止后续解析
   */
  onRow?: (row: any, index: number) => void | boolean;

  /**
   * PapaParse 兼容选项：逐行处理回调（等同于 onRow）
   */
  step?: (row: any, index: number) => void | boolean;

  /**
   * PapaParse 兼容回调：解析完成时调用
   * @param results 统一解析结果对象（同时包含 rows 与 data、columns、total 等）
   * @param file 原始输入源
   */
  complete?: (results: ParseResult<any>, file?: FileInput) => void;

  /**
   * PapaParse 兼容回调：解析发生错误时调用
   * @param error 错误对象
   * @param file 原始输入源
   */
  error?: (error: Error, file?: FileInput) => void;

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

  /**
   * 数据校验规则配置（支持声明式规则字典、行级校验回调或兼容 Zod 的 Schema）
   */
  schema?: ValidationSchema;

  /**
   * 校验处理模式：'collect'(默认全量收集) | 'abort'(遇错阻断) | 'filter'(过滤剔除坏数据)
   * @default 'collect'
   */
  validationMode?: ValidationMode;
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
  /** 校验错误列表 (当存在校验错误时) */
  errors?: ValidationError[];
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
   * 结构化数据校验错误报告列表（仅当配置了 schema 且存在校验不通过的单元格时生成）
   */
  errors?: ValidationError[];

  /**
   * 数据是否全部通过校验（当配置了 schema 时生效，true 表示 0 错误）
   */
  isValid?: boolean;

  /**
   * 校验失败被剔除的无效数据行列表（当 validationMode === 'filter' 时生成）
   */
  invalidRows?: Array<{
    row: number;
    physicalRow: number;
    data: T;
    errors: ValidationError[];
  }>;

  /**
   * 原始内容 (原始 buffer 或 text)
   */
  raw?: any;
}
