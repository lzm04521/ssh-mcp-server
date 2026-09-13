#!/usr/bin/env node

/**
 * 测试运行器
 * 使用 Node.js 内置的测试框架运行所有测试
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';

console.log('🧪 运行测试...\n');

// Windows 下 URL.pathname 是 "/D:/..." 形式，直接作 cwd 会 ENOENT，必须走 fileURLToPath
const root = fileURLToPath(new URL('..', import.meta.url));

try {
  execSync('node scripts/build.js', {
    stdio: 'inherit',
    cwd: root
  });
  execSync('node --test test/**/*.test.js', {
    stdio: 'inherit',
    cwd: root
  });
} catch (err) {
  process.exit(1);
}
