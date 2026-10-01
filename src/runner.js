'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runnerScript = fs.readFileSync(path.join(__dirname, '..', 'resources', 'run-python.sh'), 'utf8').replace(/\r\n/g, '\n');

function parseWslPath(windowsPath) {
  if (typeof windowsPath !== 'string' || windowsPath.includes('\0')) return undefined;
  const normalized = windowsPath.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//');
  const match = /^\/\/(?:wsl\$|wsl\.localhost)\/([^/]+)(\/.*)?$/i.exec(normalized);
  if (!match || match[1] === '.' || match[1] === '..') return undefined;
  return { distribution: match[1], linuxPath: path.posix.normalize(match[2] || '/') };
}

function checkedString(value, name) {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error(`${name} はNUL文字を含まない文字列で指定してください。`);
  }
  return value;
}

function buildRunSpec(windowsFile, windowsWorkspace, settings = {}) {
  const file = parseWslPath(windowsFile);
  if (!file || file.linuxPath === '/') {
    throw new Error('\\\\wsl.localhost\\ディストリビューション\\... または \\\\wsl$\\ディストリビューション\\... のPythonファイルを開いてください。');
  }
  const workspace = windowsWorkspace ? parseWslPath(windowsWorkspace) : undefined;
  if (windowsWorkspace && (!workspace || workspace.distribution.toLowerCase() !== file.distribution.toLowerCase())) {
    throw new Error('ファイルとワークスペースは同じWSLディストリビューション内にある必要があります。');
  }
  const root = workspace ? workspace.linuxPath : path.posix.dirname(file.linuxPath);
  const cwdSetting = settings.cwd === undefined ? 'workspaceFolder' : settings.cwd;
  if (!['workspaceFolder', 'fileDir'].includes(cwdSetting)) {
    throw new Error('wslPython.cwd は workspaceFolder または fileDir を指定してください。');
  }
  const cwd = cwdSetting === 'fileDir' ? path.posix.dirname(file.linuxPath) : root;
  const pythonPath = checkedString(settings.pythonPath === undefined ? '' : settings.pythonPath, 'wslPython.pythonPath');
  const scriptArgs = settings.args === undefined ? [] : settings.args;
  if (!Array.isArray(scriptArgs)) throw new Error('wslPython.args は文字列の配列で指定してください。');
  scriptArgs.forEach(arg => checkedString(arg, 'wslPython.args の要素'));
  const executable = checkedString(settings.wslExecutable === undefined ? 'wsl.exe' : settings.wslExecutable, 'wslPython.wslExecutable');
  if (!executable) throw new Error('wslPython.wslExecutable にwsl.exeのパスを指定してください。');

  return {
    executable,
    distribution: file.distribution,
    file: file.linuxPath,
    root,
    cwd,
    // ProcessExecution passes each element as an argument, without a Windows shell.
    // Bash receives paths and user arguments as positional parameters, never as code.
    args: ['--distribution', file.distribution, '--cd', cwd, '--exec', '/bin/bash',
      '-c', runnerScript, 'wsl-python-runner', root, cwd, pythonPath, file.linuxPath, ...scriptArgs]
  };
}

module.exports = { parseWslPath, buildRunSpec };
