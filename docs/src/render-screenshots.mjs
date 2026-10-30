// Renders the README screenshots of the extension at work, into docs/images/:
//
//   google-home.png      https://www.google.com/ with the extension loaded
//   google-results.png   a results page for "zambodi search" (replay only, see below)
//   newtab.png           the extension's new tab page, at 1280x420 so it fills the frame
//   popup.png            the toolbar popup at its natural size
//   before-after.png     google.com without the extension beside google.com with it
//
//   npm --prefix docs/src install                      # once: playwright-core, pinned in docs/src
//   node docs/src/render-screenshots.mjs               # from the repository root, all images
//   node docs/src/render-screenshots.mjs newtab popup  # only some of them
//
// Loads the unpacked extension from the repository root into a persistent
// profile under docs/src/profile/ (gitignored). The manifest key pins the
// extension id, so the new tab page and popup are addressed directly. If
// Google serves its "unusual traffic" page, that image is skipped with a
// message and the committed one is left alone. Only when no file exists yet
// at that path does it write a plainly labelled "screenshot pending" card, so
// the README never shows a broken image. The script exits 3 whenever it
// skipped something. Set CHROMIUM_PATH to use another browser binary.
//
// Google serves automated browsers its "unusual traffic" page on /search, so
// google-results needs a results page saved from a normal browser (Chrome:
// Ctrl+S, "Webpage, HTML Only"; docs/src/out/ is gitignored and a good place
// for it). Point ZAMBODI_RESULTS_HTML at that file and
// navigations to https://www.google.com/search are answered with it (see
// routeResults in lib.mjs):
//
//   ZAMBODI_RESULTS_HTML=docs/src/out/google-results.html node docs/src/render-screenshots.mjs google-results

import fs from 'node:fs'
import path from 'node:path'
import { blockedMessage, ensureDir, extensionUrl, FONTS, gotoGoogle, images, launchProfile, missingFonts, replayOptions, resultsReplay, routeResults } from './lib.mjs'

const ALL = ['google-home', 'google-results', 'newtab', 'popup', 'before-after']
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ALL
for (const w of wanted) if (!ALL.includes(w)) { console.error(`unknown image "${w}"; choose from ${ALL.join(', ')}`); process.exit(2) }

ensureDir(images)
const out = name => path.join(images, `${name}.png`)
const done = [], skipped = []
const wrote = name => { done.push(name); console.log(path.relative(process.cwd(), out(name))) }

const context = await launchProfile('with-extension', replayOptions)
if (await routeResults(context)) console.log(`replaying ${path.relative(process.cwd(), resultsReplay)} for google.com/search`)
const page = context.pages()[0] || await context.newPage()
let withShot = null

if (wanted.includes('google-home') || wanted.includes('before-after')) {
  if (await gotoGoogle(page, 'https://www.google.com/') === 'blocked') {
    console.warn(blockedMessage('google-home and before-after'))
    skipped.push('google-home', 'before-after')
  } else {
    withShot = await page.screenshot({ animations: 'disabled' })
    if (wanted.includes('google-home')) { await page.screenshot({ path: out('google-home'), animations: 'disabled' }); wrote('google-home') }
  }
}

if (wanted.includes('google-results')) {
  if (await gotoGoogle(page, 'https://www.google.com/search?q=zambodi+search&hl=en') === 'blocked') {
    console.warn(blockedMessage('google-results'))
    if (!resultsReplay) console.warn('  to render it from a results page saved in your browser, set ZAMBODI_RESULTS_HTML (see the top of this script)')
    skipped.push('google-results')
  } else {
    await page.screenshot({ path: out('google-results'), animations: 'disabled' })
    wrote('google-results')
  }
}

if (wanted.includes('newtab')) {
  // The page is short; a 1280x420 viewport keeps the shot from being mostly blank.
  await page.setViewportSize({ width: 1280, height: 420 })
  await page.goto(extensionUrl('newtab/newtab.html'), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.screenshot({ path: out('newtab'), animations: 'disabled' })
  await page.setViewportSize({ width: 1280, height: 800 })
  wrote('newtab')
}

if (wanted.includes('popup')) {
  // Chrome sizes a popup to fit its content; do the same in a tab, then clip.
  await page.goto(extensionUrl('popup/popup.html'), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const box = await page.evaluate(() => {
    const html = document.documentElement
    html.style.width = 'fit-content'
    html.style.height = 'fit-content'
    const r = html.getBoundingClientRect()
    return { width: Math.min(800, Math.max(25, Math.ceil(r.width))), height: Math.min(600, Math.max(25, Math.ceil(r.height))) }
  })
  await page.screenshot({ path: out('popup'), clip: { x: 0, y: 0, ...box }, animations: 'disabled' })
  wrote('popup')
  console.log(`  popup natural size ${box.width}x${box.height}`)
}
await context.close()

if (wanted.includes('before-after') && withShot) {
  const plain = await launchProfile('without-extension', { withExtension: false })
  const p = plain.pages()[0] || await plain.newPage()
  if (await gotoGoogle(p, 'https://www.google.com/') === 'blocked') {
    console.warn(blockedMessage('before-after'))
    skipped.push('before-after')
    await plain.close()
  } else {
    const withoutShot = await p.screenshot({ animations: 'disabled' })
    await plain.close()
    await composeBeforeAfter(withoutShot, withShot)
    wrote('before-after')
  }
}

async function composeBeforeAfter(before, after) {
  const ctx = await launchProfile('compose', { withExtension: false, viewport: { width: 1280, height: 470 } })
  const p = ctx.pages()[0] || await ctx.newPage()
  const src = b => `data:image/png;base64,${b.toString('base64')}`
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Arimo:wght@400;700&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 470px; background: linear-gradient(180deg, #f4f7fc, #e3eaf6); display: flex; gap: 40px; justify-content: center; align-items: center; font-family: Arimo, sans-serif; }
  figure { width: 580px; }
  figcaption { font: 700 22px 'Libre Baskerville', serif; color: #222; margin-bottom: 10px; display: flex; align-items: baseline; gap: 10px; }
  figcaption span { font: 400 14px Arimo, sans-serif; color: #666; }
  img { width: 580px; height: 362.5px; display: block; border: 1px solid #8a97ad; border-radius: 6px; box-shadow: 0 10px 24px rgba(30,50,90,.2); }
  .arrow { font: 700 40px 'Libre Baskerville', serif; color: #3366cc; margin-top: 30px; }
</style></head><body>
<figure><figcaption>Before <span>google.com, extension off</span></figcaption><img src="${src(before)}" alt=""></figure>
<figure><figcaption>After <span>google.com, extension on</span></figcaption><img src="${src(after)}" alt=""></figure>
</body></html>`, { waitUntil: 'networkidle' })
  const missing = await missingFonts(p, FONTS)
  if (missing.length) { await ctx.close(); throw new Error(`fonts did not load: ${missing.join(', ')}; before-after not written`) }
  await p.screenshot({ path: out('before-after'), animations: 'disabled' })
  await ctx.close()
}

for (const name of new Set(skipped)) {
  if (!fs.existsSync(out(name))) {
    await writePending(name)
    console.warn(`  wrote a "screenshot pending" card to ${path.relative(process.cwd(), out(name))}; rerun to replace it`)
  }
}

async function writePending(name) {
  const ctx = await launchProfile('compose', { withExtension: false, viewport: { width: 1280, height: 800 } })
  const p = ctx.pages()[0] || await ctx.newPage()
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Arimo:wght@400;700&display=swap">
<style>
  * { margin: 0; } body { width: 1280px; height: 800px; display: grid; place-items: center; text-align: center;
  background: repeating-linear-gradient(45deg, #f4f7fc 0 24px, #e9eef6 24px 48px); font-family: Arimo, sans-serif; color: #444; }
  h1 { font: 700 44px 'Libre Baskerville', serif; color: #222; margin-bottom: 18px; } code { font-size: 18px; white-space: nowrap; background: #fff; padding: 4px 10px; border: 1px solid #b9c4d6; }
  p { font-size: 22px; margin-bottom: 22px; }
</style></head><body><div>
<h1>Screenshot pending: ${name}</h1>
${name === 'google-results'
  ? `<p>Google blocks automated browsers on results pages. Save one from your browser, then:</p>
<code>ZAMBODI_RESULTS_HTML=docs/src/out/google-results.html node docs/src/render-screenshots.mjs ${name}</code>`
  : `<p>Google showed its "unusual traffic" page when this was rendered.</p>
<code>node docs/src/render-screenshots.mjs ${name}</code>`}
</div></body></html>`, { waitUntil: 'networkidle' })
  await missingFonts(p, FONTS)
  await p.screenshot({ path: out(name) })
  await ctx.close()
}

console.log(`done: ${done.join(', ') || 'nothing'}${skipped.length ? `; skipped: ${[...new Set(skipped)].join(', ')}` : ''}`)
if (skipped.length) process.exitCode = 3
