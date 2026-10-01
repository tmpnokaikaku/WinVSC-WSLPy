'use strict';

const vscode = require('vscode');
const path = require('node:path');
const { parseWslPath, buildRunSpec } = require('./runner');

function activate(context) {
  const updateContext = () => {
    const document = vscode.window.activeTextEditor?.document;
    const supported = process.platform === 'win32' && !vscode.env.remoteName
      && document?.uri.scheme === 'file' && document.languageId === 'python'
      && Boolean(parseWslPath(document.uri.fsPath));
    return vscode.commands.executeCommand('setContext', 'wslPython.isWslFile', Boolean(supported));
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateContext),
    vscode.workspace.onDidOpenTextDocument(updateContext),
    vscode.workspace.onDidCloseTextDocument(updateContext),
    vscode.commands.registerCommand('wslPython.runFile', async resource => {
      try {
        if (!vscode.workspace.isTrusted) throw new Error('実行するにはワークスペースを信頼してください。');
        if (process.platform !== 'win32' || vscode.env.remoteName) {
          throw new Error('Windows側のVS CodeでWSLのUNCパスを開いて使用してください。');
        }

        const uri = resource instanceof vscode.Uri ? resource : vscode.window.activeTextEditor?.document.uri;
        if (!uri || uri.scheme !== 'file' || !parseWslPath(uri.fsPath)) {
          throw new Error('WSL上のPythonファイルを開いてください。');
        }
        const document = await vscode.workspace.openTextDocument(uri);
        if (document.languageId !== 'python') throw new Error('Pythonファイルを選択してください。');

        const folder = vscode.workspace.getWorkspaceFolder(uri);
        const configuration = vscode.workspace.getConfiguration('wslPython', uri);
        const spec = buildRunSpec(uri.fsPath, folder?.uri.fsPath, {
          pythonPath: configuration.get('pythonPath', ''),
          args: configuration.get('args', []),
          cwd: configuration.get('cwd', 'workspaceFolder'),
          wslExecutable: configuration.get('wslExecutable', 'wsl.exe')
        });
        if (document.isDirty && !(await document.save())) {
          throw new Error('ファイルを保存できなかったため、実行を中止しました。');
        }

        const task = new vscode.Task(
          { type: 'wsl-python', file: spec.file, distribution: spec.distribution },
          folder || vscode.TaskScope.Workspace,
          `${spec.distribution}: ${path.posix.basename(spec.file)}`,
          'WSL Python',
          new vscode.ProcessExecution(spec.executable, spec.args),
          []
        );
        task.presentationOptions = {
          reveal: vscode.TaskRevealKind.Always,
          panel: vscode.TaskPanelKind.Dedicated,
          focus: true,
          clear: true,
          echo: false,
          showReuseMessage: false,
          close: false
        };
        await vscode.tasks.executeTask(task);
      } catch (error) {
        await vscode.window.showErrorMessage(`WSL Python: ${error.message || String(error)}`);
      }
    })
  );
  return updateContext();
}

module.exports = { activate };
