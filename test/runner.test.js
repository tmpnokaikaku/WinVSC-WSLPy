'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseWslPath, buildRunSpec } = require('../src/runner');

test('UNCの両ホスト名・区切り・拡張UNCに対応し、Linuxパスの大文字小文字を保持する', () => {
  for (const name of [
    String.raw`\\wsl.localhost\Ubuntu-24.04\home\User\日本語 folder\main.py`,
    String.raw`\\wsl$\Ubuntu-24.04\home\User\日本語 folder\main.py`,
    '//WSL.LOCALHOST/Ubuntu-24.04/home/User/日本語 folder/main.py',
    String.raw`\\?\UNC\wsl.localhost\Ubuntu-24.04\home\User\日本語 folder\main.py`
  ]) {
    assert.deepEqual(parseWslPath(name), {
      distribution: 'Ubuntu-24.04', linuxPath: '/home/User/日本語 folder/main.py'
    });
  }
  assert.deepEqual(parseWslPath(String.raw`\\wsl$\Debian`), { distribution: 'Debian', linuxPath: '/' });
});

test('Windowsローカル・通常の共有・未保存ファイル・NULを拒否する', () => {
  for (const name of ['C:\\test.py', '\\\\server\\share\\test.py', '/home/user/test.py',
    '\\\\wsl$\\', '\\\\wsl$\\..\\test.py', '\\\\wsl$\\Ubuntu\\test\0.py', undefined]) {
    assert.equal(parseWslPath(name), undefined);
  }
});

test('ワークスペースとファイルからディストリビューション・cwdを求める', () => {
  const spec = buildRunSpec('\\\\wsl$\\Debian\\work\\sub\\main.py', '\\\\wsl$\\Debian\\work');
  assert.equal(spec.executable, 'wsl.exe');
  assert.equal(spec.distribution, 'Debian');
  assert.equal(spec.file, '/work/sub/main.py');
  assert.equal(spec.root, '/work');
  assert.equal(spec.cwd, '/work');
  assert.deepEqual(spec.args.slice(0, 7), ['--distribution', 'Debian', '--cd', '/work', '--exec', '/bin/bash', '-c']);
});

test('fileDirでも.venv検索の基準はワークスペースに固定する', () => {
  const spec = buildRunSpec('\\\\wsl$\\Debian\\work\\sub\\main.py', '\\\\wsl$\\Debian\\work', { cwd: 'fileDir' });
  assert.equal(spec.root, '/work');
  assert.equal(spec.cwd, '/work/sub');
});

test('フォルダを開いていない場合はファイルの親フォルダを使う', () => {
  const spec = buildRunSpec('\\\\wsl$\\Debian\\work\\main.py');
  assert.equal(spec.root, '/work');
  assert.equal(spec.cwd, '/work');
});

test('ディストリビューション不一致・無効な設定を拒否する', () => {
  const file = '\\\\wsl$\\Ubuntu\\work\\main.py';
  assert.throws(() => buildRunSpec(file, '\\\\wsl$\\Debian\\work'), /同じWSL/);
  assert.throws(() => buildRunSpec(file, 'C:\\work'), /同じWSL/);
  assert.throws(() => buildRunSpec('C:\\main.py'), /wsl.localhost/);
  for (const settings of [{ args: 'a' }, { args: [1] }, { args: ['\0'] },
    { pythonPath: 1 }, { pythonPath: 'python3\0' }, { cwd: 'invalid' }, { wslExecutable: '' }]) {
    assert.throws(() => buildRunSpec(file, undefined, settings));
  }
});

// Exercise the actual shell script and Python on Linux. Windows/WSL launching
// is a separate manual check documented in README.md.
const linuxOnly = { skip: process.platform === 'win32' };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wsl-python 日本語 ' $; "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'sub'));
  const file = path.join(root, 'sub', "計算 ' $;`.py");
  fs.writeFileSync(file, [
    'import json, os, sys',
    'print(json.dumps({"cwd": os.getcwd(), "executable": sys.executable,',
    '"args": sys.argv[1:], "venv": sys.prefix != sys.base_prefix}))'
  ].join('\n'));
  return { root, file };
}

function toUnc(linuxPath) { return `//wsl.localhost/Ubuntu${linuxPath}`; }

function runPython(file, root, settings, options = {}) {
  const spec = buildRunSpec(toUnc(file), toUnc(root), settings);
  // Strip WSL's options and invoke exactly the Linux command it receives.
  return spawnSync(spec.args[5], spec.args.slice(6), { encoding: 'utf8', ...options });
}

function resultJson(result) {
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('system python3で実行し、空白・引用符・空文字・改行・シェル式の引数をそのまま渡す', linuxOnly, t => {
  const { root, file } = fixture(t);
  const marker = path.join(root, 'should-not-exist');
  const args = ['日本語 space', "a'b\"c", '', 'line1\nline2', `$(touch "${marker}")`, '`id`', '; exit 9', '-option'];
  const output = resultJson(runPython(file, root, { args }));
  assert.equal(output.cwd, root);
  assert.deepEqual(output.args, args);
  assert.equal(output.venv, false);
  assert.equal(fs.existsSync(marker), false);
});

test('実際の.venvを自動選択し、fileDir指定でも同じ仮想環境を使う', linuxOnly, t => {
  const { root, file } = fixture(t);
  const venv = spawnSync('python3', ['-m', 'venv', '--without-pip', path.join(root, '.venv')], { encoding: 'utf8' });
  assert.equal(venv.status, 0, venv.stderr);
  const output = resultJson(runPython(file, root, { cwd: 'fileDir' }));
  assert.equal(output.cwd, path.dirname(file));
  assert.equal(output.executable, path.join(root, '.venv', 'bin', 'python'));
  assert.equal(output.venv, true);
});

test('Python指定を優先し、相対パス・絶対パス・ホームパス・コマンド名を解決する', linuxOnly, t => {
  const { root, file } = fixture(t);
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  const bin = path.join(root, 'custom bin');
  fs.mkdirSync(bin);
  const configured = path.join(bin, "python ' interpreter");
  fs.symlinkSync(python, configured);
  fs.mkdirSync(path.join(root, '.venv', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.venv', 'bin', 'python'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });

  for (const pythonPath of ["custom bin/python ' interpreter", configured, "~/custom bin/python ' interpreter", 'python3']) {
    const output = resultJson(runPython(file, root, { pythonPath, cwd: 'fileDir' }, { env: { ...process.env, HOME: root } }));
    assert.equal(output.venv, false);
    assert.equal(output.executable, pythonPath === 'python3' ? python : configured);
  }
});

test('明示したPythonが存在しなければエラーを残して終了する', linuxOnly, t => {
  const { root, file } = fixture(t);
  const output = runPython(file, root, { pythonPath: 'missing/python' });
  assert.equal(output.status, 127);
  assert.match(output.stderr, /Pythonが見つかりません/);
});

test('Pythonの終了コードと標準エラーを保持する', linuxOnly, t => {
  const { root, file } = fixture(t);
  fs.writeFileSync(file, 'import sys\nprint("failure detail", file=sys.stderr)\nsys.exit(23)\n');
  const output = runPython(file, root, {});
  assert.equal(output.status, 23);
  assert.match(output.stderr, /failure detail/);
});

test('Pythonのinput()へ標準入力を渡せる', linuxOnly, t => {
  const { root, file } = fixture(t);
  fs.writeFileSync(file, 'print("received:", input())\n');
  const output = runPython(file, root, {}, { input: 'こんにちは\n' });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /received: こんにちは/);
});
