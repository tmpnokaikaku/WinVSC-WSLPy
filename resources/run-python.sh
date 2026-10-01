set -e
root=$1
working_directory=$2
configured_python=$3
file=$4
shift 4

cd -- "$working_directory"
if [ -n "$configured_python" ]; then
    case "$configured_python" in
        "~/"*) python="$HOME/${configured_python#\~/}" ;;
        /*) python="$configured_python" ;;
        */*) python="$root/$configured_python" ;;
        *) python="$configured_python" ;;
    esac
elif [ -x "$root/.venv/bin/python" ]; then
    python="$root/.venv/bin/python"
else
    python=python3
fi

if ! command -v -- "$python" >/dev/null 2>&1; then
    printf '[WSL Python] Pythonが見つかりません: %s\n' "$python" >&2
    printf 'WSLにPythonをインストールするか、wslPython.pythonPathを設定してください。\n' >&2
    exit 127
fi

printf '[WSL Python] Python: %s\n' "$python"
printf '[WSL Python] cwd: %s\n' "$PWD"
exec "$python" -u -- "$file" "$@"
