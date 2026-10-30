# Zambodi logo generator

Produces every brand asset from one OFL serif. Run from the repository root:

```bash
npm --prefix tools/logo install
node tools/logo/build.mjs
```

It rewrites:

| File | Size | Use |
|---|---|---|
| `assets/logo/zambodi-logo.svg` | viewBox `0 0 272 92` | google.com homepage logo, new tab page |
| `assets/logo/zambodi-logo-small.svg` | viewBox `0 0 272 92` (same art) | results-page logo, popup (shown at 92x30) |
| `assets/icons/icon-{16,32,48,128}.png` | square, transparent corners | extension icons |
| `assets/icons/favicon-32.png` | 32x32 | favicon on Google pages |

Rendering uses `playwright-core` (pinned) and the Chromium build that version
expects in the Playwright browser cache. If it is missing, run
`npx --prefix tools/logo playwright-core install chromium-headless-shell`.

## How it works

- `opentype.js` converts each letter of "Zambodi" to SVG path data, one
  `<path>` per letter, so no font file ships with the extension.
- Colours follow the 1999 to 2010 sequence and palette: Z `#0039b6`, a
  `#c41200`, m `#f3c518`, b `#0039b6`, o `#30a72f`, d `#c41200`, i `#0039b6`.
- One SVG filter gives the retro finish: the letter alpha is blurred into a
  height map and lit by `feSpecularLighting` from the upper left, a faint dark
  rim sits on the lower right edges, and a soft grey drop shadow falls down and
  to the right.
- Icons use the bevelled blue "Z" alone on a white rounded square, so it stays
  legible on dark browser themes. The 16px icon uses a smaller inset and a
  lighter bevel to stay crisp.
- The two wordmark SVGs carry different filter ids so both can be inlined into
  one page without clashing.
- Chromium is launched with `--disable-gpu`: on machines without a working GPU
  process (WSL, containers) headless screenshots otherwise hang.

## Font choice and credit

The wordmark is set in **EB Garamond ExtraBold** by Georg Duffner and Octavio
Pardo, licensed under the SIL Open Font License 1.1 (`fonts/OFL.txt`). Source:
<https://github.com/octaviopardo/EBGaramond12> (static `fonts/ttf` build; the
Google Fonts copy is a variable font, which opentype.js cannot instance).

Four OFL candidates were rendered side by side in the logo colours: Cormorant
Garamond Bold, EB Garamond ExtraBold, Gentium Book Plus Bold and Lora Bold.
The original logo's Catull is a heavy humanist serif with calligraphic,
slightly old-style forms. Cormorant was too light and delicate; Gentium and
Lora read as book or screen text faces. EB Garamond at its heaviest weight has
the closest mix of weight, contrast and calligraphic bowls, so it was chosen.
