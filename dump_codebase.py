"""
dump_codebase.py
────────────────
Dumps all source code and directory structure into codebase_dump.txt.
"""

import os

OUTPUT_FILE = "codebase_dump.txt"
EXCLUDE_DIRS = {".git", "node_modules", "dist", "__pycache__", "venv", ".venv", ".idea", ".vscode"}
EXCLUDE_FILES = {"package-lock.json", "abc_state.db", ".env", OUTPUT_FILE}
EXCLUDE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".pdf", ".zip", ".exe", ".pyc", ".db", ".sqlite"}

root_dir = os.path.dirname(os.path.abspath(__file__))

collected_files = []
for dirpath, dirnames, filenames in os.walk(root_dir):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for f in filenames:
        ext = os.path.splitext(f)[1].lower()
        if f not in EXCLUDE_FILES and ext not in EXCLUDE_EXTS and not f.endswith(".env"):
            collected_files.append(os.path.join(dirpath, f))

with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
    out.write("=" * 80 + "\n")
    out.write("PROJECT DIRECTORY TREE\n")
    out.write("=" * 80 + "\n")
    for f in collected_files:
        rel = os.path.relpath(f, root_dir)
        out.write(rel + "\n")

    out.write("\n" + "=" * 80 + "\n")
    out.write("FILE CONTENTS\n")
    out.write("=" * 80 + "\n")

    for f in collected_files:
        rel = os.path.relpath(f, root_dir)
        out.write("\n" + "-" * 80 + "\n")
        out.write(f"FILE: {rel}\n")
        out.write("-" * 80 + "\n")
        try:
            with open(f, "r", encoding="utf-8") as src:
                out.write(src.read() + "\n")
        except Exception as e:
            out.write(f"[Could not read file as UTF-8: {e}]\n")

print(f"Dump complete! Saved {len(collected_files)} files to {OUTPUT_FILE}")
