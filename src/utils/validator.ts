import {
  ColumnRule,
  ParseOptions,
  RowValidator,
  SchemaMap,
  ValidationError,
  ValidationResult,
  ZodLikeSchema
} from '../types';

/**
 * 校验单行数据中的单个单元格是否符合规则
 */
function validateField(
  value: any,
  column: string,
  rule: ColumnRule,
  row: any,
  rowIndex: number,
  physicalRow: number
): ValidationError | null {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');

  // 1. 必填规则校验
  if (rule.required && isEmpty) {
    return {
      row: rowIndex + 1,
      physicalRow,
      column,
      value,
      rule: 'required',
      message: rule.message || `列 [${column}] 为必填字段，不能为空`
    };
  }

  // 若为空且非必填，跳过后续规则校验
  if (isEmpty) {
    return null;
  }

  // 2. 数据类型校验
  if (rule.type) {
    let typeValid = true;
    switch (rule.type) {
      case 'string':
        typeValid = typeof value === 'string';
        break;
      case 'number':
        typeValid = typeof value === 'number' && !Number.isNaN(value);
        break;
      case 'boolean':
        typeValid = typeof value === 'boolean';
        break;
      case 'email':
        typeValid =
          typeof value === 'string' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
        break;
      case 'date':
        if (value instanceof Date) {
          typeValid = !Number.isNaN(value.getTime());
        } else if (typeof value === 'string' || typeof value === 'number') {
          typeValid = !Number.isNaN(Date.parse(String(value)));
        } else {
          typeValid = false;
        }
        break;
      default:
        break;
    }

    if (!typeValid) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'type',
        message: rule.message || `列 [${column}] 数据类型不正确，期望为 ${rule.type}`
      };
    }
  }

  // 3. 最小值/最小长度校验
  if (typeof rule.min === 'number') {
    let minValid = true;
    if (typeof value === 'number') {
      minValid = value >= rule.min;
    } else if (typeof value === 'string' || Array.isArray(value)) {
      minValid = value.length >= rule.min;
    }

    if (!minValid) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'min',
        message:
          rule.message ||
          (typeof value === 'number'
            ? `列 [${column}] 的数值不能小于 ${rule.min}`
            : `列 [${column}] 的长度不能少于 ${rule.min} 个字符`)
      };
    }
  }

  // 4. 最大值/最大长度校验
  if (typeof rule.max === 'number') {
    let maxValid = true;
    if (typeof value === 'number') {
      maxValid = value <= rule.max;
    } else if (typeof value === 'string' || Array.isArray(value)) {
      maxValid = value.length <= rule.max;
    }

    if (!maxValid) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'max',
        message:
          rule.message ||
          (typeof value === 'number'
            ? `列 [${column}] 的数值不能大于 ${rule.max}`
            : `列 [${column}] 的长度不能超过 ${rule.max} 个字符`)
      };
    }
  }

  // 5. 枚举可选值校验
  if (Array.isArray(rule.enum) && rule.enum.length > 0) {
    if (!rule.enum.includes(value)) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'enum',
        message:
          rule.message ||
          `列 [${column}] 的取值无效，必须在 [${rule.enum.join(', ')}] 中`
      };
    }
  }

  // 6. 正则表达式校验
  if (rule.pattern instanceof RegExp) {
    if (!rule.pattern.test(String(value))) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'pattern',
        message: rule.message || `列 [${column}] 格式不符合正则表达式规则要求`
      };
    }
  }

  // 7. 自定义校验回调
  if (typeof rule.custom === 'function') {
    try {
      const customRes = rule.custom(value, row, rowIndex);
      if (customRes === false) {
        return {
          row: rowIndex + 1,
          physicalRow,
          column,
          value,
          rule: 'custom',
          message: rule.message || `列 [${column}] 未通过自定义业务校验`
        };
      }
      if (typeof customRes === 'string') {
        return {
          row: rowIndex + 1,
          physicalRow,
          column,
          value,
          rule: 'custom',
          message: customRes
        };
      }
    } catch (err: any) {
      return {
        row: rowIndex + 1,
        physicalRow,
        column,
        value,
        rule: 'custom',
        message: err?.message || `列 [${column}] 自定义校验抛出异常`
      };
    }
  }

  return null;
}

/**
 * 校验单行数据
 */
export function validateSingleRow<T = any>(
  row: T,
  rowIndex: number,
  options: ParseOptions
): ValidationError[] {
  const { schema, header = true } = options;
  if (!schema) return [];

  // 计算对应 Excel/CSV 的物理行号
  // 当 header=true 或为列名数组时，第 1 行为表头，首条数据为第 2 行
  const hasHeaderRow = header !== false;
  const physicalRow = hasHeaderRow ? rowIndex + 2 : rowIndex + 1;

  const errors: ValidationError[] = [];

  // 1. Zod 等兼容 Schema 库支持（带有 .safeParse 方法）
  if (typeof (schema as ZodLikeSchema).safeParse === 'function') {
    const parseResult = (schema as ZodLikeSchema).safeParse(row);
    if (!parseResult.success && parseResult.error?.issues) {
      for (const issue of parseResult.error.issues) {
        const column = issue.path.join('.') || undefined;
        errors.push({
          row: rowIndex + 1,
          physicalRow,
          column,
          value: column && typeof row === 'object' && row !== null ? (row as any)[column] : undefined,
          rule: 'zod',
          message: issue.message
        });
      }
    }
    return errors;
  }

  // 2. 外部行级自定义校验函数
  if (typeof schema === 'function') {
    try {
      const res = (schema as RowValidator<T>)(row, rowIndex);
      if (Array.isArray(res)) {
        return res.map((e) => ({
          ...e,
          row: e.row || rowIndex + 1,
          physicalRow: e.physicalRow || physicalRow
        }));
      }
      if (typeof res === 'string') {
        return [
          {
            row: rowIndex + 1,
            physicalRow,
            rule: 'custom',
            message: res
          }
        ];
      }
      if (res === false) {
        return [
          {
            row: rowIndex + 1,
            physicalRow,
            rule: 'custom',
            message: `第 ${physicalRow} 行数据未通过校验`
          }
        ];
      }
    } catch (err: any) {
      return [
        {
          row: rowIndex + 1,
          physicalRow,
          rule: 'custom',
          message: err?.message || `第 ${physicalRow} 行校验发生异常`
        }
      ];
    }
    return [];
  }

  // 3. 内置声明式 Schema 规则字典 (SchemaMap)
  if (typeof schema === 'object' && schema !== null) {
    const schemaMap = schema as SchemaMap;
    for (const [colName, rule] of Object.entries(schemaMap)) {
      const val =
        typeof row === 'object' && row !== null && !Array.isArray(row)
          ? (row as any)[colName]
          : undefined;

      const error = validateField(val, colName, rule, row, rowIndex, physicalRow);
      if (error) {
        errors.push(error);
      }
    }
  }

  return errors;
}

/**
 * 校验全量数据行，并根据 validationMode（collect / filter / abort）处理
 */
export function applyValidation<T = any>(
  rows: T[],
  options: ParseOptions
): ValidationResult<T> {
  const { schema, validationMode = 'collect', header = true } = options;

  if (!schema) {
    return {
      validRows: rows,
      invalidRows: [],
      errors: [],
      isValid: true
    };
  }

  const allErrors: ValidationError[] = [];
  const validRows: T[] = [];
  const invalidRows: Array<{
    row: number;
    physicalRow: number;
    data: T;
    errors: ValidationError[];
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors = validateSingleRow(row, i, options);
    const hasHeaderRow = header !== false;
    const physicalRow = hasHeaderRow ? i + 2 : i + 1;

    if (rowErrors.length > 0) {
      allErrors.push(...rowErrors);
      invalidRows.push({
        row: i + 1,
        physicalRow,
        data: row,
        errors: rowErrors
      });

      // 熔断中止模式
      if (validationMode === 'abort') {
        const firstErr = rowErrors[0];
        const error = new Error(
          `数据校验未通过: 第 ${firstErr.physicalRow} 行 [${firstErr.column || '全行'}] ${firstErr.message}`
        );
        (error as any).errors = allErrors;
        (error as any).invalidRows = invalidRows;
        throw error;
      }
    } else {
      validRows.push(row);
    }
  }

  return {
    validRows,
    invalidRows,
    errors: allErrors,
    isValid: allErrors.length === 0
  };
}
