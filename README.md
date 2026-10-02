# WSL Python Runner

Windows版VS CodeでWSL上のフォルダをUNCパスから開き、エディタ右上の **「WSL: Python ファイルをWSLで実行」** ボタンからWSLのPythonを使って実行する拡張です。ボタンのアイコンは再生マークに小さな `L` を付けています。

通常のPython拡張の実行ボタンと併用できます。Python拡張やRemote - WSL拡張のインストールは必須ではありません。

## インストールと使い方

1. **Windows版VS Code** の拡張機能ビューで `…` → **「VSIX からのインストール…」** を選び、[winvsc-wslpy-0.1.1.vsix](https://github.com/tmpnokaikaku/WinVSC-WSLPy/raw/refs/heads/main/winvsc-wslpy-0.1.1.vsix) をインストールします。
2. **「フォルダーを開く…」** で、例えば `\\wsl.localhost\Ubuntu\home\user\project` を開きます。`\\wsl$\Ubuntu\home\user\project` 形式にも対応します。
3. フォルダを信頼し、Pythonファイルを開いて右上のWSL実行ボタンを押します。コマンドパレットの **「WSL: Python ファイルをWSLで実行」** からも実行できます。
4. 未保存の変更があれば対象ファイルを保存してから実行します。出力はVS Codeの統合ターミナルに表示されます。`input()` への入力や `Ctrl+C` での停止ができます。

Windows側にインストールした拡張を使用してください。画面左下が `WSL: Ubuntu` などのRemote - WSL接続になっている場合、この拡張のボタンは表示されません。その構成ではPython拡張がWSL内のインタープリタを選択して実行できます。

## Pythonの選択

次の順番で使用するPythonを決めます。

1. `wslPython.pythonPath` で明示した実行ファイル。
2. 実行対象が属するワークスペースフォルダ直下の `.venv/bin/python`（実行可能な場合）。
3. そのWSLディストリビューションの `python3`。

ディストリビューション名はUNCパスから判定します。Windows側のPythonや、WSLの既定ディストリビューションの設定には依存しません。マルチルートワークスペースでは対象ファイルが属するフォルダごとに設定と `.venv` を選びます。フォルダを開かず単独ファイルを開いた場合は、その親ディレクトリを基準にします。

仮想環境はWSL内で作成してください。

```bash
cd /home/user/project
python3 -m venv .venv
```

`.venv/bin/python` を直接実行するため、事前の `activate` 操作は不要です。明示したPythonが見つからない場合は、別のPythonに切り替えずエラーを表示します。

## 設定

VS Codeの設定画面で `wslPython` を検索するか、プロジェクトの `.vscode/settings.json` に指定します。

```json
{
  "wslPython.pythonPath": ".venv/bin/python",
  "wslPython.cwd": "workspaceFolder",
  "wslPython.args": ["--name", "日本語を含む引数"]
}
```

| 設定 | 既定値 | 動作 |
| --- | --- | --- |
| `wslPython.pythonPath` | `""` | 自動選択。`/home/user/env/bin/python`、`~/env/bin/python`、`.venv/bin/python`、`python3` なども指定可能 |
| `wslPython.cwd` | `"workspaceFolder"` | `"fileDir"` にすると対象ファイルの親ディレクトリで実行。`.venv` の検索基準はワークスペースのまま |
| `wslPython.args` | `[]` | 各要素を1つのスクリプト引数として渡す。空白や引用符を手動でエスケープする必要はない |
| `wslPython.wslExecutable` | `"wsl.exe"` | 必要ならWindows上の `wsl.exe` の絶対パスを**ユーザー設定**で指定 |

`pythonPath` にはLinux側のパスを指定します。実行ファイル名だけの場合はWSLのPATHから探し、`/` を含む相対パスの場合はワークスペースから解決します。Pythonの実行オプションを含むコマンド文字列ではなく、実行ファイルだけを指定してください。

## 開発とパッケージ化

Node.js 22以降とnpmを使用します。拡張本体に実行時npm依存関係やビルド処理はありません。

```bash
npm install
npm test
npm run package
```

パッケージ化にはVS Code公式の `@vscode/vsce` を使用します。

開発中はWindows版VS CodeでこのフォルダをUNCパスから開き、`F5` でExtension Development Hostを起動してください。Remote - WSLモードで `F5` を押すとWindows側の実行環境にはなりません。

## 検証

自動テストはUNCパス変換、ディストリビューション判定、設定検証を確認します。Linux環境では実際にBashとPythonを起動して `.venv` の選択、空白・日本語・引用符・改行を含む引数、標準入力、標準エラー、終了コードを検証します。

WindowsのNode.jsでこのプロジェクトのUNCパスを開いて `npm run test:wsl` を実行すると、Windows → `wsl.exe` → WSL Pythonの起動と引数の受け渡しを検証できます。

Windows版VS Codeでは、`examples/check_runtime.py` を開いてボタンを押し、次を確認してください。

- `platform: Linux` と、WSL内の `executable` が表示される。
- WSLで `.venv` を作成すると `executable` が `.venv/bin/python` に変わり、`virtualenv: True` になる。
- `wslPython.pythonPath` の指定で使用するPythonが切り替わる。
- `input()` を含むスクリプトをターミナルで操作でき、長時間実行は `Ctrl+C` で停止できる。
- 実行後も出力がターミナルに残る。

WSLに `/bin/bash` とPythonが必要です。また、`wsl.exe --cd` が利用できるWSLを使用してください。これはファイル実行用のボタンであり、デバッガ接続やNotebook・選択範囲実行には対応していません。

## 参考

- [VS Code: メニューとコマンドの追加](https://code.visualstudio.com/api/references/contribution-points)
- [VS Code: ProcessExecution / Task API](https://code.visualstudio.com/api/references/vscode-api)
- [Microsoft: WSLの基本コマンド](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)
- [VS Code: VSIXのパッケージ化](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
