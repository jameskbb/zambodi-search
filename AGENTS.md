# Zambodi Search agent rules

`CLAUDE.md` and `AGENTS.md` are the same document under two names so Claude
Code and Codex follow identical rules. Change both together;
`scripts/check.sh` fails if they differ.

## 1. What this is

A Chrome extension (Manifest V3) that rebrands Google as "Zambodi": the word on
every page, the google.com logo, the favicon and tab title, a 2000s-style new
tab page, and an omnibox search engine.

Layout:

| Path | Owns |
|---|---|
| `manifest.json` | The extension manifest; every section is declared here |
| `src/content/` | Content scripts: text and attribute replacement, Google logo, favicon and title swaps, flash-prevention CSS |
| `src/lib/` | Pure functions the content scripts and tests share |
| `newtab/` | The new tab page |
| `popup/` | The toolbar popup with the on/off toggle |
| `assets/logo/`, `assets/icons/` | Wordmark SVGs, favicon and extension icons |
| `tools/logo/` | Generator that produces the wordmark and icons from an OFL font |
| `tests/` | Unit tests (`node --test`) |
| `docs/src/` | Scripts that render the README title card, screenshots and demo video |
| `docs/images/` | The rendered images the README embeds |

## 2. This repository is public

- No private identifiers anywhere: no personal or employer names, machine
  hostnames, absolute paths on anyone's machine, IP or MAC addresses.
- Agents never change repository visibility or settings, create a repository,
  or post project content publicly. A release is cut only when the maintainer
  asks for it (section 5).
- `CLAUDE.md`, `AGENTS.md` and `.claude/ai-skills.md` are tracked and public:
  write them as contributor guidance.
- Commits carry no AI attribution trailers.
- No em dashes in any file or commit message.
- The extension makes no network calls, loads no remote code, and stores
  nothing but the on/off flag.

## 3. Run and test

```bash
npm install                 # once: test dependencies only
scripts/check.sh            # lint, unit tests, manifest validation, rule parity, public-safety scan
scripts/check.sh --history  # before publishing: scan all history for the same patterns and the blocklist files
```

Try it: `chrome://extensions`, Developer mode, Load unpacked, pick this folder.

## 4. Rules

- No build step for the extension. Chrome loads the folder as it is.
- Target Google markup by stable attributes (`alt`, `aria-label`, `title`,
  `role`), never obfuscated class names.
- Changing how any screen looks (new tab page, popup, logo swap) regenerates
  its screenshot in the same change: `node docs/src/render-screenshots.mjs`.
  The title card is `docs/src/title-card.html`, rendered by
  `node docs/src/render-title-card.mjs`. The demo video is
  `node docs/src/record-demo.mjs`. Full instructions: `docs/src/README.md`.
  The public README carries no maintainer instructions.
- Changing the wordmark regenerates the SVGs and icons with `tools/logo/` and
  then the screenshots.
- Branch model: `main` only. Test command: `scripts/check.sh`.

## 5. Releases

A release is a tag `v<version>` on this repository, where `<version>` equals
`manifest.json`'s version and `docs/release-notes/v<version>.md` exists.
Pushing the tag runs `.github/workflows/release.yml`, which checks, packages
(`scripts/package.sh`) and publishes the release. Repository visibility and
settings are changed only by hand. Bump the manifest version and write the
notes before tagging.
