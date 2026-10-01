'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildRunSpec } = require('../src/runner');

if (process.platform !== 'win32') {
  throw new Error('WindowsのNode.jsを使い、WSLのUNCパスからこのスクリプトを実行してください。');
}

const root = path.resolve(__dirname, '..');
const args = ['日本語 space', 'quoted"argument', "single'quote", '', 'line1\nline2', '$(echo should-stay-literal)'];
const spec = buildRunSpec(path.join(root, 'examples', 'check_runtime.py'), root, { args });
const result = spawnSync(spec.executable, spec.args, { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || String(result.error));
assert.match(result.stdout, /platform: Linux/);
assert.ok(result.stdout.includes(`cwd: ${spec.root}`), result.stdout);
assert.ok(result.stdout.includes('日本語 space'), result.stdout);
assert.ok(result.stdout.includes('$(echo should-stay-literal)'), result.stdout);
assert.ok(result.stdout.includes("''"), result.stdout);
assert.ok(result.stdout.includes('line1\\nline2'), result.stdout);
console.log(result.stdout);
console.log('Windows → wsl.exe → WSL Python: OK');
