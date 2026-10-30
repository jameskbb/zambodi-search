#!/usr/bin/env bash
# Repository checks: lint, unit tests, manifest validation, agent-rule parity, and a public-safety scan.
#   scripts/check.sh            check the working tree
#   scripts/check.sh --history  scan every commit on every branch for the public-safety patterns and the
#                               words in scripts/blocklist.txt; run it before making the repository public
set -u
cd "$(dirname "$0")/.." || exit 1

command -v node >/dev/null 2>&1 || { echo "FAIL: node not found; install Node.js 20 or later"; exit 1; }

# Public-safety scanner, in node so it behaves the same with GNU and BSD tools.
# Mode "tree" scans tracked files; mode "history" scans `git log -p --all`.
# shellcheck disable=SC2016 # JavaScript source, not shell
scan_js='
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const mode = process.argv[1];
const BLOCKLIST = "scripts/blocklist.txt";
const LOCAL_BLOCKLIST = "scripts/blocklist.local.txt"; // untracked; words you would rather not publish in the list itself
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rules = [
  ["private IP address", /(?<![0-9.])(192\.168|10\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}(?![0-9])/],
  ["MAC address", /(?<![0-9A-Fa-f:])([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:])/],
  ["machine path", /\/home\/[a-z]{2,}|\/Users\/[A-Za-z]|C:\\\\Users/],
  ["em dash", /\u2014/],
];
for (const file of [BLOCKLIST, LOCAL_BLOCKLIST]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const w = raw.trim();
    if (w && !w.startsWith("#")) rules.push([`blocklist word "${w}"`, new RegExp(`(?<![A-Za-z])${esc(w)}(?![A-Za-z])`, "i")]);
  }
}
const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30 });
let bad = 0;
if (mode === "tree") {
  const binary = /\.(png|webp|jpe?g|gif|mp4|webm|ico|woff2?|ttf|otf)$/i;
  for (const f of git(["ls-files", "-z"]).split("\0")) {
    if (!f || binary.test(f) || f === BLOCKLIST || f === LOCAL_BLOCKLIST || !fs.existsSync(f)) continue;
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      for (const [label, re] of rules) if (re.test(line)) { console.log(`FAIL: ${label}: ${f}:${i + 1}: ${line.trim().slice(0, 160)}`); bad++; }
    });
  }
} else {
  // Diff lines that add or remove text, commit messages, and author and committer identities.
  // The blocklist file itself is excluded, or it would always match.
  const log = git(["log", "-p", "--all", "--no-color", "--format=@@commit %h%n%an <%ae>%n%cn <%ce>%n%B", "--", ".", ":(exclude)" + BLOCKLIST, ":(exclude)" + LOCAL_BLOCKLIST]);
  const hits = new Map();
  let commit = "?";
  for (const line of log.split("\n")) {
    if (line.startsWith("@@commit ")) { commit = line.slice(9); continue; }
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    for (const [label, re] of rules) {
      if (!re.test(line)) continue;
      const byCommit = hits.get(label) || new Map();
      byCommit.set(commit, (byCommit.get(commit) || 0) + 1);
      hits.set(label, byCommit);
    }
  }
  for (const [label, byCommit] of hits) {
    const total = [...byCommit.values()].reduce((a, b) => a + b, 0);
    const list = [...byCommit].map(([c, n]) => `${c} (${n})`).join(", ");
    console.log(`FAIL: history: ${label}: ${total} lines in ${byCommit.size} commits: ${list}`);
    bad++;
  }
  if (bad) console.log("Inspect with: git log --all -p -i -G <pattern>");
}
process.exit(bad ? 1 : 0);
'

if [ "${1:-}" = "--history" ]; then
  node -e "$scan_js" history && echo "OK: history is clean"
  exit $?
elif [ $# -gt 0 ]; then
  echo "usage: scripts/check.sh [--history]"; exit 2
fi

fail=0

# Agent rules: when present, the two files are identical. The public companion has neither.
if [ -f CLAUDE.md ] || [ -f AGENTS.md ]; then
  cmp -s CLAUDE.md AGENTS.md || { echo "FAIL: CLAUDE.md and AGENTS.md differ"; fail=1; }
fi

# Public-safety: no private network identifiers, machine paths, em dashes or blocklisted words in tracked files.
node -e "$scan_js" tree || fail=1

for s in scripts/*.sh; do
  bash -n "$s" || { echo "FAIL: syntax error in $s"; fail=1; }
done

# Lint: every tracked script parses.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  err=$(node --check "$f" 2>&1) || { echo "FAIL: syntax error in $f: $(printf '%s\n' "$err" | grep -m1 -E 'Error')"; fail=1; }
done < <(git ls-files '*.js' '*.mjs')

# Lint, manifest and extension pages. Every failure is one line.
node - <<'JS' || fail=1
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
let bad = 0;
const fail = (msg) => { console.log(`FAIL: ${msg}`); bad++; };

// Extension pages: MV3 forbids inline script; styles and handlers belong in the .css and .js files.
const pages = execFileSync('git', ['ls-files', '-z', 'popup', 'newtab'], { encoding: 'utf8' })
  .split('\0').filter((f) => /\.html?$/i.test(f) && fs.existsSync(f));
for (const f of pages) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const where = `${f}:${i + 1}`;
    for (const tag of line.match(/<script\b[^>]*>/gi) || []) if (!/\bsrc\s*=/i.test(tag)) fail(`inline <script> in ${where}`);
    if (/<style\b/i.test(line)) fail(`inline <style> block in ${where}`);
    if (/<[^>]*\son[a-z]+\s*=/i.test(line)) fail(`inline on* event handler in ${where}`);
    if (/javascript:/i.test(line)) fail(`javascript: URL in ${where}`);
  });
}

// Manifest: valid JSON, MV3, every referenced file exists, every web_accessible_resources glob matches.
let m;
try { m = JSON.parse(fs.readFileSync('manifest.json', 'utf8')); }
catch (e) { fail(`manifest.json: ${e.message.split('\n')[0]}`); process.exit(1); }
if (m.manifest_version !== 3) fail('manifest.json: manifest_version must be 3');
const refs = [];
for (const v of Object.values(m.icons || {})) refs.push(v);
for (const v of Object.values(m.action?.default_icon || {})) refs.push(v);
if (m.action?.default_popup) refs.push(m.action.default_popup);
for (const v of Object.values(m.chrome_url_overrides || {})) refs.push(v);
for (const cs of m.content_scripts || []) refs.push(...(cs.js || []), ...(cs.css || []));
for (const r of refs) if (!fs.existsSync(r)) fail(`manifest.json references missing file: ${r}`);
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const war of m.web_accessible_resources || []) {
  for (const glob of war.resources || []) {
    const re = new RegExp('^' + glob.replace(/^\//, '').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    if (!tracked.some((f) => re.test(f))) fail(`manifest.json web_accessible_resources glob matches no file: ${glob}`);
  }
}
process.exit(bad ? 1 : 0);
JS

# README: every local image or video it references exists, and the demo GIF stays under 10 MB.
if [ -f README.md ]; then
  refs=$(grep -oE '\]\([^)#[:space:]]+\.(png|gif|jpe?g|svg|webp|mp4)\)|src="[^"]+\.(png|gif|jpe?g|svg|webp|mp4)"' README.md \
    | sed -E 's/^\]\(//; s/\)$//; s/^src="//; s/"$//' | grep -vE '^https?://' | sort -u)
  for r in $refs; do
    [ -f "$r" ] || { echo "FAIL: README references missing file: $r"; fail=1; }
  done
fi
gif=docs/images/demo.gif
if [ -f "$gif" ]; then
  size=$(wc -c < "$gif")
  [ "$size" -lt 10485760 ] || { echo "FAIL: $gif is $size bytes, over 10 MB"; fail=1; }
fi

# Unit tests always run: install the test dependencies first if they are missing.
if [ -f package.json ]; then
  if [ ! -d node_modules ]; then
    if ! command -v npm >/dev/null 2>&1; then
      echo "FAIL: unit tests not run: node_modules is missing and npm is not installed"; fail=1
    elif ! npm ci --silent --no-audit --no-fund; then
      echo "FAIL: unit tests not run: npm ci failed"; fail=1
    fi
  fi
  if [ -d node_modules ]; then
    npm test --silent || { echo "FAIL: unit tests"; fail=1; }
  fi
fi

[ $fail -eq 0 ] && echo "OK: all checks passed"
exit $fail
