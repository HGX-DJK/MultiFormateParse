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

/**
 * Resolves input to a binary Uint8Array
 */
export async function toUint8Array(input: FileInput): Promise<Uint8Array> {
  // Empty or null handling
  if (input === null || input === undefined || input === '') {
    return new Uint8Array(0);
  }

  // Already Uint8Array or Buffer
  if (input instanceof Uint8Array) {
    return input;
  }

  // ArrayBuffer
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  // Browser Blob or File
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
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
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
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
      const response = await fetch(input);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from "${input}": ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    // 2. Base64 Data URL (data:...;base64,...)
    if (input.startsWith('data:')) {
      const commaIdx = input.indexOf(',');
      if (commaIdx !== -1) {
        const metaPart = input.slice(0, commaIdx);
        const dataPart = input.slice(commaIdx + 1);
        if (metaPart.includes(';base64')) {
          return decodeBase64ToUint8Array(dataPart);
        }
        // URL-encoded text data
        return new TextEncoder().encode(decodeURIComponent(dataPart));
      }
    }

    // 3. Check if it's a local file path in Node.js
    if (isNodeEnvironment() && isPossibleFilePath(input)) {
      try {
        const fs = getNodeModule('fs');
        if (fs && fs.existsSync(input)) {
          const stats = fs.statSync(input);
          if (stats.isFile()) {
            const buf = fs.readFileSync(input);
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          }
        }
      } catch {
        // Fallback to text encoding
      }
    }

    // Treat as raw text string
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(input);
    }
    if (typeof Buffer !== 'undefined') {
      const b = Buffer.from(input, 'utf-8');
      return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    }
  }

  throw new Error(`Unsupported input type: ${typeof input}`);
}

/**
 * Resolves input to an ArrayBuffer
 */
export async function toArrayBuffer(input: FileInput): Promise<ArrayBuffer> {
  const u8 = await toUint8Array(input);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Resolves input to decoded text string
 */
export async function toText(input: FileInput, encoding = 'utf-8'): Promise<string> {
  if (input === null || input === undefined || input === '') {
    return '';
  }

  if (typeof input === 'string') {
    // 1. Remote HTTP/HTTPS URL
    if (/^https?:\/\//i.test(input)) {
      if (typeof fetch === 'function') {
        const res = await fetch(input);
        if (!res.ok) {
          throw new Error(`Failed to fetch file from "${input}": ${res.status} ${res.statusText}`);
        }
        return await res.text();
      }
    }

    // 2. Base64 Data URL
    if (input.startsWith('data:')) {
      const u8 = await toUint8Array(input);
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder(encoding, { fatal: false }).decode(u8);
      }
    }

    // 3. Local file path in Node.js
    if (isNodeEnvironment() && isPossibleFilePath(input)) {
      try {
        const fs = getNodeModule('fs');
        if (fs && fs.existsSync(input)) {
          const stats = fs.statSync(input);
          if (stats.isFile()) {
            return fs.readFileSync(input, { encoding: encoding as BufferEncoding });
          }
        }
      } catch {
        // Fallback to returning raw string
      }
    }

    return input;
  }

  // Browser Blob / File text() method optimization
  if (
    typeof Blob !== 'undefined' &&
    input instanceof Blob &&
    (!encoding || encoding.toLowerCase() === 'utf-8') &&
    typeof input.text === 'function'
  ) {
    return await input.text();
  }

  // Decode from Uint8Array
  const u8 = await toUint8Array(input);
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder(encoding, { fatal: false });
    return decoder.decode(u8);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString(encoding as BufferEncoding);
  }

  let res = '';
  for (let i = 0; i < u8.length; i++) {
    res += String.fromCharCode(u8[i]);
  }
  return res;
}
