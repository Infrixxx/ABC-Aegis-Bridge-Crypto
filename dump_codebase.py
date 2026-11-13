"""
dump_codebase.py
────────────────
Dumps all source code, backend, active frontend, and abc-frontend redesign
into codebase_dump.txt for comprehensive review and UI enhancement.
"""

import os

OUTPUT_FILE = "codebase_dump.txt"
EXCLUDE_DIRS = {".git", "node_modules", "dist", "__pycache__", "venv", ".venv", ".idea", ".vscode"}
EXCLUDE_FILES = {"package-lock.json", "abc_state.db", ".env", OUTPUT_FILE}
EXCLUDE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".pdf", ".zip", ".exe", ".pyc", ".db", ".sqlite"}

current_dir = os.path.dirname(os.path.abspath(__file__))
abc_frontend_dir = os.path.abspath(os.path.join(current_dir, "..", "ABC", "abc-frontend", "frontend"))
review_file = os.path.abspath(os.path.join(current_dir, "..", "ABC", "REVIEW.md"))

collected = []

# 1. Collect from main active repository (ABC-Aegis-Bridge-Crypto)
for dirpath, dirnames, filenames in os.walk(current_dir):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for f in filenames:
        ext = os.path.splitext(f)[1].lower()
        if f not in EXCLUDE_FILES and ext not in EXCLUDE_EXTS and not f.endswith(".env"):
            full_p = os.path.join(dirpath, f)
            rel_p = os.path.relpath(full_p, current_dir)
            collected.append((f"[ABC-Aegis-Bridge-Crypto]/{rel_p}", full_p))

# 2. Collect from abc-frontend redesign (if exists)
if os.path.exists(abc_frontend_dir):
    for dirpath, dirnames, filenames in os.walk(abc_frontend_dir):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if f not in EXCLUDE_FILES and ext not in EXCLUDE_EXTS and not f.endswith(".env"):
                full_p = os.path.join(dirpath, f)
                rel_p = os.path.relpath(full_p, abc_frontend_dir)
                collected.append((f"[abc-frontend]/{rel_p}", full_p))

# 3. Collect REVIEW.md (if exists)
if os.path.exists(review_file):
    collected.append(("[ABC]/REVIEW.md", review_file))

# Sort collected files alphabetically by displayed path
collected.sort(key=lambda x: x[0])

with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
    out.write("=" * 80 + "\n")
    out.write("COMPLETE PROJECT DIRECTORY TREE (Backend + Active Frontend + Redesign)\n")
    out.write("=" * 80 + "\n")
    for disp, _ in collected:
        out.write(disp + "\n")

    out.write("\n" + "=" * 80 + "\n")
    out.write("COMPLETE FILE CONTENTS\n")
    out.write("=" * 80 + "\n")

    for disp, full_p in collected:
        out.write("\n" + "-" * 80 + "\n")
        out.write(f"FILE: {disp}\n")
        out.write("-" * 80 + "\n")
        try:
            with open(full_p, "r", encoding="utf-8") as src:
                out.write(src.read() + "\n")
        except Exception as e:
            out.write(f"[Could not read file as UTF-8: {e}]\n")

print(f"Dump complete! Saved {len(collected)} files to {OUTPUT_FILE}")
