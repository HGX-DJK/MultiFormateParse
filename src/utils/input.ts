import { FileInput } from '../types';

export interface ExtractedInputInfo {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Checks if the current runtime is Node.js
 */
export function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions) &&
    Boolean(process.versions.node)
  );
}

/**
 * Safely access Node.js native modules without breaking browser bundles
 */
function getNodeModule(name: string): any {
  if (!isNodeEnvironment()) return null;
  try {
    const dynamicRequire =
      typeof module !== 'undefined' && module.require
        ? module.require.bind(module)
        : typeof require !== 'undefined'
        ? require
        : null;
    return dynamicRequire ? dynamicRequire(name) : null;
  } catch {
    return null;
  }
}

/**
 * Extracts metadata (name, size, type) from input if available
 */
export function getInputInfo(input: FileInput): ExtractedInputInfo {
  const info: ExtractedInputInfo = {};

  if (!input) return info;

  // Browser File or Blob with name
  if (typeof (input as any).name === 'string') {
    info.fileName = (input as any).name;
  }
  if (typeof (input as any).size === 'number') {
    info.fileSize = (input as any).size;
  }
  if (typeof (input as any).type === 'string' && (input as any).type) {
    info.mimeType = (input as any).type;
  }

  // Node.js Buffer or Uint8Array
  if (input instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(input))) {
    info.fileSize = input.byteLength;
  } else if (input instanceof ArrayBuffer) {
    info.fileSize = input.byteLength;
  } else if (typeof input === 'string') {
    // 1. Remote HTTP/HTTPS URL
    if (/^https?:\/\//i.test(input)) {
      try {
        const url = new URL(input);
        const name = url.pathname.split('/').filter(Boolean).pop();
        if (name && name.includes('.')) {
          info.fileName = decodeURIComponent(name);
        }
      } catch {
        // Ignore URL parse failure
      }
    }
    // 2. Base64 Data URL
    else if (input.startsWith('data:')) {
      const match = input.match(/^data:([^;,]+)?/);
      if (match && match[1]) {
        info.mimeType = match[1];
      }
    }
    // 3. Local file path in Node.js
    else if (isNodeEnvironment() && isPossibleFilePath(input)) {
      try {
        const fs = getNodeModule('fs');
        const path = getNodeModule('path');
        if (fs && path && fs.existsSync(input)) {
          const stats = fs.statSync(input);
          if (stats.isFile()) {
            info.fileName = path.basename(input);
            info.fileSize = stats.size;
          }
        }
      } catch {
        // Ignore filesystem errors and fallback
      }
    }
  }

  return info;
}

/**
 * Check if a string looks like a file path rather than raw file content
 */
function isPossibleFilePath(str: string): boolean {
  if (typeof str !== 'string') return false;
  // If string contains newline or null byte, it's raw text content
  if (str.includes('\n') || str.includes('\r') || str.includes('\0')) {
    return false;
  }
  const trimmed = str.trim();
  if (trimmed.length > 512) return false;

  // Common file extensions or path characters
  return /[\\/]|(\.[a-zA-Z0-9]+)$/.test(trimmed);
}

/**
 * Helper to decode Base64 data string to Uint8Array
 */
function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  if (typeof atob === 'function') {
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

export interface InputProcessOptions {
  signal?: AbortSignal;
  maxFileSize?: number;
  onProgress?: (progress: { loaded: number; total?: number; percent?: number }) => void;
}

/**
 * 智能自动侦测并解码文本字节（处理 UTF-8 BOM、UTF-16LE/BE BOM，并在 UTF-8 校验失败时自动降级尝试 GBK/GB2312）
 */
export function decodeTextWithAutoDetection(
  bytes: Uint8Array,
  requestedEncoding = 'auto'
): string {
  const enc = (requestedEncoding || 'auto').toLowerCase();

  // 若用户显式指定了明确且非 auto/utf-8 的编码（例如 'shift-jis'）
  if (enc !== 'auto' && enc !== 'utf-8' && enc !== 'utf8') {
    try {
      return new TextDecoder(enc, { fatal: false }).decode(bytes);
    } catch {
      // 若当前环境不支持指定编码，降级走默认探测
    }
  }

  // 1. 检查并剥离常见 BOM 头
  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3));
  }
  // UTF-16 LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2));
  }
  // UTF-16 BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2));
  }

  // 2. 严格模式尝试 UTF-8 解码校验
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 3. 当遇到非法 UTF-8 字节序列时，自动回退到 GBK / GB18030（解决 Windows Excel 导出 CSV 在中文环境下的乱码问题）
    try {
      return new TextDecoder('gbk', { fatal: false }).decode(bytes);
    } catch {
      // 最终兜底
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  }
}

/**
 * Resolves input to a binary Uint8Array
 */
export async function toUint8Array(
  input: FileInput,
  options: InputProcessOptions = {}
): Promise<Uint8Array> {
  options.signal?.throwIfAborted?.();

  const checkSize = (size: number) => {
    if (typeof options.maxFileSize === 'number' && size > options.maxFileSize) {
      throw new Error(`文件大小 (${size} 字节) 超出设定的最大上限 (${options.maxFileSize} 字节)`);
    }
  };

  // Empty or null handling
  if (input === null || input === undefined || input === '') {
    return new Uint8Array(0);
  }

  // Already Uint8Array or Buffer
  if (input instanceof Uint8Array) {
    checkSize(input.byteLength);
    return input;
  }

  // ArrayBuffer
  if (input instanceof ArrayBuffer) {
    checkSize(input.byteLength);
    return new Uint8Array(input);
  }

  // Browser Blob or File
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (typeof (input as any).size === 'number') {
      checkSize((input as any).size);
    }
    if (typeof input.arrayBuffer === 'function') {
      const buf = await input.arrayBuffer();
      return new Uint8Array(buf);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(input);
    });
  }

  // Web Streams (ReadableStream)
  if (typeof ReadableStream !== 'undefined' && input instanceof ReadableStream) {
    const reader = input.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      options.signal?.throwIfAborted?.();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
        checkSize(totalLength);
        options.onProgress?.({ loaded: totalLength });
      }
    }
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  // String handling
  if (typeof input === 'string') {
    // 1. Remote HTTP/HTTPS URL
    if (/^https?:\/\//i.test(input)) {
      if (typeof fetch !== 'function') {
        throw new Error('fetch is not supported in this environment to load remote URLs');
      }
      const response = await fetch(input, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch file from "${input}": ${response.status} ${response.statusText}`);
      }

      const contentLength = Number(response.headers.get('content-length')) || undefined;
      if (contentLength) {
        checkSize(contentLength);
      }

      if (response.body && typeof ReadableStream !== 'undefined') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalLength = 0;
        while (true) {
          options.signal?.throwIfAborted?.();
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            totalLength += value.length;
            checkSize(totalLength);
            options.onProgress?.({
              loaded: totalLength,
              total: contentLength,
              percent: contentLength ? Math.min(100, Math.round((totalLength / contentLength) * 100)) : undefined
            });
          }
        }
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        return merged;
      }

      const arrayBuffer = await response.arrayBuffer();
      const u8 = new Uint8Array(arrayBuffer);
      checkSize(u8.byteLength);
      return u8;
    }

    // 2. Base64 Data URL (data:...;base64,...)
    if (input.startsWith('data:')) {
      const commaIdx = input.indexOf(',');
      if (commaIdx !== -1) {
        const metaPart = input.slice(0, commaIdx);
        const dataPart = input.slice(commaIdx + 1);
        if (metaPart.includes(';base64')) {
          const u8 = decodeBase64ToUint8Array(dataPart);
          checkSize(u8.byteLength);
          return u8;
        }
        // URL-encoded text data
        const u8 = new TextEncoder().encode(decodeURIComponent(dataPart));
        checkSize(u8.byteLength);
        return u8;
      }
    }

    // 3. Check if it's a local file path in Node.js
    if (isNodeEnvironment() && isPossibleFilePath(input)) {
      try {
        const fs = getNodeModule('fs');
        if (fs && fs.existsSync(input)) {
          const stats = fs.statSync(input);
          if (stats.isFile()) {
            checkSize(stats.size);
            const buf = fs.readFileSync(input);
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          }
        }
      } catch (e: any) {
        if (e?.message?.includes('超出设定的最大上限')) throw e;
      }
    }

    // Treat as raw text string
    let u8: Uint8Array;
    if (typeof TextEncoder !== 'undefined') {
      u8 = new TextEncoder().encode(input);
    } else if (typeof Buffer !== 'undefined') {
      const b = Buffer.from(input, 'utf-8');
      u8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    } else {
      u8 = new Uint8Array(0);
    }
    checkSize(u8.byteLength);
    return u8;
  }

  throw new Error(`Unsupported input type: ${typeof input}`);
}

/**
 * Resolves input to an ArrayBuffer
 */
export async function toArrayBuffer(
  input: FileInput,
  options: InputProcessOptions = {}
): Promise<ArrayBuffer> {
  const u8 = await toUint8Array(input, options);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Resolves input to decoded text string
 */
export async function toText(
  input: FileInput,
  encoding = 'auto',
  options: InputProcessOptions = {}
): Promise<string> {
  if (input === null || input === undefined || input === '') {
    return '';
  }

  // 1. Local file path in Node.js
  if (typeof input === 'string' && isNodeEnvironment() && isPossibleFilePath(input)) {
    try {
      const fs = getNodeModule('fs');
      if (fs && fs.existsSync(input)) {
        const stats = fs.statSync(input);
        if (stats.isFile()) {
          if (typeof options.maxFileSize === 'number' && stats.size > options.maxFileSize) {
            throw new Error(`文件大小 (${stats.size} 字节) 超出设定的最大上限 (${options.maxFileSize} 字节)`);
          }
          const buf = fs.readFileSync(input);
          const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          return decodeTextWithAutoDetection(u8, encoding);
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('超出设定的最大上限')) throw e;
    }
  }

  // 2. Decode from Uint8Array
  const u8 = await toUint8Array(input, options);
  return decodeTextWithAutoDetection(u8, encoding);
}
