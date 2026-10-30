// Renders docs/images/readme-title-zambodi.png from title-card.html.
//
//   npm --prefix docs/src install                             # once: playwright-core, pinned in docs/src
//   npx --prefix docs/src playwright-core install chromium    # once, if no cached browser
//   node docs/src/render-title-card.mjs                       # from the repository root
//
// 1200x440 at 2x. Set CHROMIUM_PATH to use another browser binary. If the web
// fonts fail to load, nothing is written: a card in a fallback font must never
// replace the committed one.

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, executable, gpuArgs, here, images, imagesLoaded, missingFonts, ensureDir } from './lib.mjs'

const out = path.join(images, 'readme-title-zambodi.png')

const browser = await chromium.launch({ ...executable, args: gpuArgs })
const page = await browser.newPage({ viewport: { width: 1200, height: 440 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(path.join(here, 'title-card.html')).href, { waitUntil: 'networkidle' })
const missing = await missingFonts(page)
if (missing.length) {
  await browser.close()
  console.error(`fonts did not load: ${missing.join(', ')}; nothing written`)
  process.exit(1)
}
await imagesLoaded(page)
await page.waitForTimeout(250)
ensureDir(images)
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 440 }, animations: 'disabled' })
console.log(path.relative(process.cwd(), out))
await browser.close()
