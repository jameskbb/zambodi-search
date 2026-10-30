// Renders docs/images/header-<slug>.png, one per README section, from headers.html.
//
//   npm --prefix docs/src install          # once: playwright-core, pinned in docs/src
//   node docs/src/render-headers.mjs       # from the repository root
//
// 1200x160 at 2x. The slugs come from window.HEADERS in headers.html. Set
// CHROMIUM_PATH to use another browser binary. If the web fonts fail to load,
// nothing is written.

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, executable, gpuArgs, here, images, imagesLoaded, missingFonts, ensureDir } from './lib.mjs'

const base = pathToFileURL(path.join(here, 'headers.html')).href
const browser = await chromium.launch({ ...executable, args: gpuArgs })
const page = await browser.newPage({ viewport: { width: 1200, height: 160 }, deviceScaleFactor: 2 })

await page.goto(base, { waitUntil: 'networkidle' })
const missing = await missingFonts(page)
if (missing.length) {
  await browser.close()
  console.error(`fonts did not load: ${missing.join(', ')}; nothing written`)
  process.exit(1)
}
const slugs = await page.evaluate(() => Object.keys(window.HEADERS))
ensureDir(images)
for (const slug of slugs) {
  await page.goto(`${base}?slug=${slug}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await imagesLoaded(page)
  const overflow = await page.evaluate(() => { const h = document.getElementById('title').getBoundingClientRect(); const m = document.querySelector('.mini').getBoundingClientRect(); return h.right > m.left - 16 })
  if (overflow) { await browser.close(); console.error(`header ${slug}: title runs into the search box; shorten it in headers.html`); process.exit(1) }
  await page.waitForTimeout(100)
  const out = path.join(images, `header-${slug}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 160 }, animations: 'disabled' })
  console.log(path.relative(process.cwd(), out))
}
await browser.close()
