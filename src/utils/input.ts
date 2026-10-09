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
    // Dynamic access to avoid static require analysis by browser bundlers
    const dynamicRequire = typeof module !== 'undefined' && module.require ? module.require.bind(module) : typeof require !== 'undefined' ? require : null;
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
    // If it's a file path in Node
    if (isNodeEnvironment() && isPossibleFilePath(input)) {
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
  // Trimmed string length check
  const trimmed = str.trim();
  if (trimmed.length > 512) return false;

  // Common file extensions or path characters
  return /[\\/]|(\.[a-zA-Z0-9]+)$/.test(trimmed);
}

/**
 * Resolves input to a binary Uint8Array
 */
export async function toUint8Array(input: FileInput): Promise<Uint8Array> {
  if (!input && input !== '') {
    throw new Error('Input is empty or null');
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
    // Fallback for older FileReader
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(input);
    });
  }

  // String handling
  if (typeof input === 'string') {
    // Check if it's a local file path in Node.js
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
  if (typeof input === 'string') {
    // If it's a file path in Node.js
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

  // Fallback
  let res = '';
  for (let i = 0; i < u8.length; i++) {
    res += String.fromCharCode(u8[i]);
  }
  return res;
}
