#!/usr/bin/env bash
# Build dist/zambodi-search-<version>.zip: the files Chrome needs, nothing else,
# inside one top-level folder so unzipping gives a folder to "Load unpacked".
# Deterministic: sorted entries, fixed timestamps, so the same tree gives the same bytes.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="dist/zambodi-search-$version.zip"
mkdir -p dist
rm -f "$out"
git ls-files -z manifest.json LICENSE src newtab popup assets | sort -z | tr '\0' '\n' > dist/.files
python3 - "$out" dist/.files <<'PY'
import sys, zipfile, time
out, listing = sys.argv[1], sys.argv[2]
stamp = (2026, 1, 1, 0, 0, 0)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for path in open(listing).read().split("\n"):
        if not path:
            continue
        info = zipfile.ZipInfo("zambodi-search/" + path, date_time=stamp)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(path, "rb") as f:
            z.writestr(info, f.read())
PY
rm -f dist/.files
echo "$out ($(wc -c < "$out") bytes, $(python3 -c "import sys,zipfile;print(len(zipfile.ZipFile(sys.argv[1]).namelist()))" "$out") files)"
