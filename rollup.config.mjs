import { defineConfig } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import terser from '@rollup/plugin-terser';

const npmExternal = ['xlsx', 'papaparse', 'fs', 'path'];

export default defineConfig([
  // 1. ESM and CJS bundle for npm packages
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        exports: 'named',
        sourcemap: true
      },
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true
      }
    ],
    external: npmExternal,
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs(),
      json(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      })
    ]
  },

  // 2. Browser Standalone All-In-One Bundle (包含未压缩版与 Terser 极速压缩版)
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.global.js',
        format: 'iife',
        name: 'MultiFormatParser',
        exports: 'named',
        sourcemap: true
      },
      {
        file: 'dist/index.global.min.js',
        format: 'iife',
        name: 'MultiFormatParser',
        exports: 'named',
        sourcemap: true,
        plugins: [terser()]
      }
    ],
    external: ['fs', 'path'],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      json(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      })
    ]
  },

  // 3. Type definitions bundle (.d.ts)
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es'
      }
    ],
    external: npmExternal,
    plugins: [dts()]
  }
]);
