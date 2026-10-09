# multi-format-parser

> 一个基于 **Rollup** 构建的**极简统一多格式文件解析库**。无论传入的是 **Excel (.xlsx / .xls / .ods)**、**CSV / TSV** 还是 **Text (纯文本 / JSON / 配置)**，对外提供**完全统一的调用方法与数据返回结构**，前端/后端无需针对不同格式编写繁琐的适配代码，开箱即用，支持 TypeScript。

[![npm version](https://img.shields.io/npm/v/multi-format-parser.svg)](https://www.npmjs.com/package/multi-format-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 💡 为什么需要它？统一解析的优势

在传统开发中，处理用户上传的文件通常很痛苦：
- 解析 Excel 需要调 `xlsx`，还要区分 Sheet、转 JSON；
- 解析 CSV 需要调 `papaparse`，手动处理表头与类型转换；
- 解析 Text/JSON 又要写 `FileReader` / `JSON.parse`；
- 最终不同库返回的数据结构五花八门，业务代码不得不写一大堆 `if-else` 分支去适配。

**`multi-format-parser` 彻底解决此问题**：
无论用户上传何种文件，**只需调用一个方法 `parse(file)`**，返回的结构完全规范一致：

```typescript
import { parse } from 'multi-format-parser';

// 无论 file 是 .xlsx、.xls、.csv 还是 .txt，一律通过统一接口解构使用！
const { rows, columns, total, type } = await parse(file);

// 直接绑定给 UI 表格或提交后端业务：
console.log('数据行:', rows);      // 统一为对象数组或数据行数组
console.log('列名列表:', columns);  // 统一为表头列名数组
console.log('数据行数:', total);    // 总行数
console.log('识别类型:', type);     // 'excel' | 'csv' | 'text' | 'json'
```

---

## 📦 安装

```bash
# npm
npm install multi-format-parser

# pnpm
pnpm add multi-format-parser

# yarn
yarn add multi-format-parser
```

---

## 🚀 极简上手

### 1. 浏览器端文件上传（以 Vue / React / 原生 JS 为例）

```typescript
import { parse } from 'multi-format-parser';

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // 传入 HTML5 File 对象，自动嗅探文件格式并解析
  const { rows, columns, total, type } = await parse(file);

  // 一套逻辑即可渲染所有格式！
  tableData.value = rows;
  tableHeaders.value = columns;
}
```

### 2. 原生 HTML 单脚本直接引入（零外部依赖）

也可以直接通过 `<script>` 标签引入打包好的单文件产物，内部已完整包含所有解析引擎，无需额外引入 xlsx 或 papaparse：

```html
<script src="./dist/index.global.js"></script>
<script>
  // 全局变量 MultiFormatParser 开箱即用
  const { rows, columns } = await MultiFormatParser.parse(file);
</script>
```

---

### 3. Node.js 服务端读取

支持直接传入本地文件路径、Buffer 或 ArrayBuffer：

```typescript
import { parse } from 'multi-format-parser';

// 直接传入文件路径
const result = await parse('./uploads/data.xlsx');
// 或者
const csvResult = await parse('./uploads/users.csv');

console.log(result.rows);
```

---

## 🎯 统一返回结构 (`ParseResult`)

不论解析哪种文件，结果对象均包含如下统一字段：

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`rows`** | `T[]` | **核心数据行**（Excel/CSV 默认解析为对象数组 `[{ col1: v1, col2: v2 }]`；Text 为文本行数组） |
| **`columns`** | `string[]` | **表头列名数组**（例如 `['姓名', '年龄', '部门']`，纯文本模式为空数组） |
| **`total`** | `number` | **数据总行数** |
| **`type`** | `'excel' \| 'csv' \| 'text' \| 'json'` | 自动检测或指定的文件格式类型 |
| `data` | `T[]` | `rows` 的兼容别名（方便习惯使用 data 的开发者） |
| `sheets` | `Record<string, any[]>` | *(Excel 专有)* 全部工作表的数据字典：`{ Sheet1: rows, Sheet2: rows }` |
| `currentSheet` | `string` | *(Excel 专有)* 当前工作表名称 |
| `text` | `string` | *(Text / CSV 专有)* 原始文本字符串 |
| `meta` | `ParseMeta` | 包含文件名、文件大小、分隔符等元信息 |

---

## ⚙️ 统一配置参数 (`ParseOptions`)

无需针对每种格式学习繁杂的配置项，所有参数一律通用且具备合理的默认值：

```typescript
const result = await parse(file, {
  header: true,          // 是否将首行作为表头（为 false 时 rows 为二维数组）
  dynamicTyping: true,   // 是否自动将数字、布尔文本转换为对应的 number / boolean
  skipEmpty: true,       // 是否自动过滤空行
  sheet: 0,              // Excel 时生效：指定工作表（可传索引、名称，或传 'all'）
  delimiter: ',',        // CSV 时生效：未传则自动智能侦测（逗号/分号/制表符等）
  textMode: 'lines'      // Text 时生效：'lines'(按行分割) | 'raw'(原生文本) | 'key-value' | 'json'
});
```

### 参数详细说明：

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `header` | `boolean \| number \| string[]` | `true` | 表头设置：`true` 输出对象数组；`false` 输出二维数组；`number` 指定表头行；`string[]` 自定义表头 |
| `dynamicTyping`| `boolean` | `true` | 自动将数字转为 number、布尔转为 boolean |
| `skipEmpty` | `boolean` | `true` | 是否跳过空行 |
| `sheet` | `number \| string \| 'all'` | `0` | *(Excel)* 选择解析的工作表（默认第 1 个）；传 `'all'` 会将全部 Sheet 解析在 `sheets` 中 |
| `delimiter` | `string` | 自动侦测 | *(CSV)* 分隔符（逗号、分号、`\t` 等） |
| `textMode` | `'lines' \| 'raw' \| 'key-value' \| 'json'` | `'lines'` | *(Text)* 文本处理模式 |
| `encoding` | `string` | `'utf-8'` | 字符编码 |
| `type` | `'auto' \| 'excel' \| 'csv' \| 'text' \| 'json'` | `'auto'` | 强制指定文件类型，默认自动探测 |
| `fileName` | `string` | - | 传入二进制 ArrayBuffer / Buffer 时，可用于辅助推断文件格式 |

---

## 📖 常用场景示例

### 场景 1：不使用表头，按二维矩阵格式输出
```typescript
const { rows } = await parse(file, { header: false });
// rows -> [ ['姓名', '年龄'], ['张三', 18], ['李四', 22] ]
```

### 场景 2：解析 Excel 的多工作表
```typescript
const res = await parse(excelFile, { sheet: 'all' });

// 访问不同工作表的数据行：
console.log(res.sheets?.['用户表']); // 用户表的数据行
console.log(res.sheets?.['订单表']); // 订单表的数据行
```

### 场景 3：解析配置文件（.env / .ini）
```typescript
const res = await parse(configContent, {
  type: 'text',
  textMode: 'key-value'
});

console.log(res.data);
// -> { PORT: '8080', HOST: 'localhost', DEBUG: 'true' }
```

---

## 🛠️ 构建与测试

本工程基于 **Rollup** 构建，输出 Dual ESM (`dist/index.mjs`) 与 CommonJS (`dist/index.cjs`)，并自动生成打包合并的 TypeScript `.d.ts` 声明文件。

```bash
# 运行单元测试
npm run test

# 执行 Rollup 构建打包
npm run build

# 模拟预览即将发布的 npm 压缩包清单
npm pack --dry-run
```

---

## 📄 License

[MIT](./LICENSE) © 2026
