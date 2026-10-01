import os
import platform
import sys

print("executable:", sys.executable)
print("platform:", platform.system())
print("cwd:", os.getcwd())
print("arguments:", sys.argv[1:])
print("virtualenv:", sys.prefix != sys.base_prefix)
