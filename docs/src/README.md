# Regenerating the README images and the demo

Maintainer notes for the scripts in this folder.

Every image in the README, and the demo video, is produced by a script in
`docs/src/`, which has its own `package.json` pinning `playwright-core`. Run
these from the repository root:

```bash
npm --prefix docs/src install                             # once
npx --prefix docs/src playwright-core install chromium    # once, if no Chromium is cached

node docs/src/render-title-card.mjs     # docs/images/readme-title-zambodi.png
node docs/src/render-headers.mjs        # docs/images/header-*.png
node docs/src/render-screenshots.mjs    # google-home, google-results, newtab, popup, before-after
FFMPEG_PATH=/path/to/ffmpeg node docs/src/record-demo.mjs   # docs/images/demo.gif and docs/demo.mp4
```

- `render-screenshots.mjs` takes image names to render only some, for example
  `node docs/src/render-screenshots.mjs newtab popup`. It loads the unpacked
  extension into a throwaway profile under `docs/src/profile/`. If Google
  answers with its "unusual traffic" page, that image is skipped with a
  message and the script exits with status 3; try again later.
- `record-demo.mjs` needs an ffmpeg with libx264, the GIF encoder and the
  palette filters. Set `FFMPEG_PATH`, or put `ffmpeg` on your `PATH`. The
  ffmpeg that Playwright downloads only encodes VP8 and is not enough; the
  script says so before recording anything.
- Results pages never come from Google, whose bot check blocks automated
  browsers: `render-screenshots.mjs` and `record-demo.mjs` answer navigations
  to `https://www.google.com/search` with the bundled mock
  `docs/src/google-results-mock.html`, and the extension rebrands it with its
  real content scripts. `ZAMBODI_RESULTS_HTML` names a results page saved
  from Chrome (Ctrl+S, "Webpage, HTML Only"), for example
  `docs/src/out/google-results.html`, which is gitignored, to replay instead.
- `CHROMIUM_PATH` points any of the scripts at a different Chromium binary.
- The title card and headers need the Libre Baskerville and Arimo web fonts;
  if they fail to load, nothing is written.

Check the repository (lint, unit tests, manifest, image references,
public-safety scan) and build the release zip:

```bash
npm install
scripts/check.sh
scripts/package.sh        # dist/zambodi-search-<version>.zip
```
