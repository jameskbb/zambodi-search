// Records the demo video: docs/images/demo.gif (embedded in the README) and
// docs/demo.mp4 (kept beside it).
//
//   npm --prefix docs/src install          # once: playwright-core, pinned in docs/src
//   node docs/src/record-demo.mjs          # from the repository root
//
// Records at 1280x800 in a persistent profile with the unpacked extension:
// the new tab page, typing "zambodi search" and pressing Enter, the rebranded
// results page with a hover on the small logo, google.com with a hover on its
// logo, then the popup toggled off and on.
// The raw webm lands in docs/src/out/ (gitignored); ffmpeg turns it into a
// palette-optimised 960px GIF at 11 fps and an H.264 yuv420p faststart MP4.
//
// ffmpeg: set FFMPEG_PATH, or have a full ffmpeg on PATH. The build that
// Playwright bundles is tried last, but it only encodes VP8, so it cannot make
// the GIF or MP4; the script says so and stops before recording. A full static
// build works, for example the one in the imageio-ffmpeg Python package.
//
// Results pages: Google serves automated browsers its "unusual traffic" page
// on /search, so navigations to https://www.google.com/search are answered
// with the bundled mock docs/src/google-results-mock.html, or with the file
// ZAMBODI_RESULTS_HTML names, such as a results page saved from a normal
// browser (see routeResults in lib.mjs). Set CHROMIUM_PATH to use another
// browser binary.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, extensionUrl, gotoGoogle, here, launchProfile, replayOptions, require, resultsNote, root, routeResults } from './lib.mjs'

const GIF = path.join(root, 'docs', 'images', 'demo.gif')
const MP4 = path.join(root, 'docs', 'demo.mp4')
const OUT = path.join(here, 'out')
const GIF_LIMIT = 10 * 1024 * 1024
const rel = p => path.relative(process.cwd(), p)

// ---- ffmpeg -------------------------------------------------------------

function candidates() {
  const list = []
  if (process.env.FFMPEG_PATH) list.push(['FFMPEG_PATH', process.env.FFMPEG_PATH])
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim()) list.push(['PATH', which.stdout.trim().split('\n')[0]])
  try {
    const { registry } = require('playwright-core/lib/coreBundle').registry
    const p = registry.findExecutable('ffmpeg')?.executablePath()
    if (p) list.push(['Playwright bundle', p])
  } catch { /* registry layout changed; skip */ }
  return list
}

function capable(bin) {
  const run = args => spawnSync(bin, ['-hide_banner', ...args], { encoding: 'utf8' })
  const enc = run(['-encoders']), fil = run(['-filters']), mux = run(['-muxers'])
  if (enc.error || enc.status !== 0) return ['not runnable']
  const lacks = []
  if (!/\blibx264\b/.test(enc.stdout)) lacks.push('libx264 encoder')
  if (!/^\s*V\S*\s+gif\b/m.test(enc.stdout)) lacks.push('gif encoder')
  if (!/\bpalettegen\b/.test(fil.stdout) || !/\bpaletteuse\b/.test(fil.stdout)) lacks.push('palettegen/paletteuse filters')
  if (!/^\s*E\s+mp4\b/m.test(mux.stdout)) lacks.push('mp4 muxer')
  return lacks
}

function findFfmpeg() {
  const tried = []
  for (const [where, bin] of candidates()) {
    if (!fs.existsSync(bin)) { tried.push(`${where}: ${bin} does not exist`); continue }
    const lacks = capable(bin)
    if (!lacks.length) return bin
    tried.push(`${where}: ${bin} lacks ${lacks.join(', ')}`)
  }
  console.error('No usable ffmpeg found. Needs libx264, the gif encoder, palettegen/paletteuse and the mp4 muxer.')
  for (const t of tried) console.error(`  ${t}`)
  if (!tried.length) console.error('  nothing found: FFMPEG_PATH unset, no ffmpeg on PATH, no Playwright ffmpeg')
  console.error('Set FFMPEG_PATH to a full ffmpeg build, for example: FFMPEG_PATH=/path/to/ffmpeg node docs/src/record-demo.mjs')
  process.exit(1)
}

const ffmpeg = findFfmpeg()
console.log(`ffmpeg: ${ffmpeg}`)

console.log(resultsNote())

// ---- record ---------------------------------------------------------------

ensureDir(OUT)
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.webm')) fs.rmSync(path.join(OUT, f))

const t0 = Date.now()
const context = await launchProfile('demo', {
  ...replayOptions,
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
})
await routeResults(context)

// Headless video has no pointer; draw one so hovers and clicks read on screen.
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor') || !document.documentElement) return
    const c = document.createElement('div')
    c.id = '__demo_cursor'
    c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .08s;' +
      'background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 22 22%27%3E%3Cpath d=%27M2 1l0 17 4.5-4 3 7 3-1.3-3-6.7 6.5 0z%27 fill=%27%23fff%27 stroke=%27%23000%27 stroke-width=%271.4%27/%3E%3C/svg%3E") no-repeat'
    document.documentElement.appendChild(c)
    addEventListener('mousemove', e => { c.style.left = e.clientX - 2 + 'px'; c.style.top = e.clientY - 1 + 'px' }, true)
    addEventListener('mousedown', () => { c.style.transform = 'scale(.8)' }, true)
    addEventListener('mouseup', () => { c.style.transform = '' }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
})

const page = context.pages()[0] || await context.newPage()
let mouse = { x: 640, y: 400 }
const pause = ms => page.waitForTimeout(ms)
async function glide(x, y, steps = 25) {
  await page.mouse.move(mouse.x, mouse.y)
  await page.mouse.move(x, y, { steps })
  mouse = { x, y }
}
async function firstVisible(selectors) {
  for (const s of selectors) {
    const loc = page.locator(s)
    const n = await loc.count()
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) return loc.nth(i)
  }
  return null
}
async function centre(loc) {
  const b = await loc.boundingBox()
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null
}
async function hoverLogo() {
  const logo = await firstVisible(['img[alt*="Zambodi" i]', 'a[aria-label*="Zambodi" i]', '[title*="Zambodi" i] img', 'svg[aria-label*="Zambodi" i]', '[role="img"][aria-label*="Zambodi" i]'])
  if (!logo) { console.warn('  no Zambodi logo found to hover'); return }
  const c = await centre(logo)
  if (c) { await glide(c.x, c.y); await pause(1500) }
}
const skippedSteps = []

// After a navigation to a chrome-extension:// page the recorder keeps only the
// top 656px of the frame and pads the rest grey. Re-applying the viewport
// fixes it, so every navigation goes through go() or refit().
async function refit() {
  await page.setViewportSize({ width: 1280, height: 801 })
  await page.setViewportSize({ width: 1280, height: 800 })
}
async function go(url) {
  await page.goto(url, { waitUntil: 'load' })
  await refit()
}

// 1. New tab page.
await go(extensionUrl('newtab/newtab.html'))
await page.evaluate(() => document.fonts.ready)
const startAt = (Date.now() - t0) / 1000
await pause(1500)

// 2. Type the query slowly and submit.
const box = await firstVisible(['#q', 'input[name="q"]', 'input[type="search"]', 'input[type="text"]', 'textarea'])
if (box) {
  const c = await centre(box)
  await glide(c.x, c.y)
  await box.click()
  await page.keyboard.type('zambodi search', { delay: 140 })
  await pause(700)
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }).catch(() => null), page.keyboard.press('Enter')])
  await refit()
} else {
  skippedSteps.push('typing (no search box on the new tab page)')
  await go('https://www.google.com/search?q=zambodi+search&hl=en')
}

// 3. Rebranded results, a hover on the small logo, a little scroll.
await pause(1800)
await hoverLogo()
await page.mouse.wheel(0, 500); await pause(1300)
await page.mouse.wheel(0, -500); await pause(800)

// 4. google.com itself.
await gotoGoogle(page, 'https://www.google.com/?hl=en', 0)
await refit()
await pause(1500)
await hoverLogo()
await pause(800)

// 5. The popup, enlarged and centred so it reads in the video, toggled off and on.
await go(extensionUrl('popup/popup.html'))
await page.evaluate(() => {
  const s = document.createElement('style')
  s.textContent = 'html{background:#e3eaf6;height:100%;display:grid;place-items:center}' +
    'body{zoom:2;background:#fff;border:1px solid #8a97ad;border-radius:6px;box-shadow:0 12px 30px rgba(30,50,90,.25);margin:0}'
  document.head.appendChild(s)
})
await pause(1200)
const toggle = await firstVisible(['#enabled', 'label[for="enabled"]', 'label:has(#enabled)', '[role="switch"]', 'input[type="checkbox"]', 'button'])
if (toggle) {
  const c = await centre(toggle)
  await glide(c.x, c.y)
  await pause(500)
  await toggle.click(); await pause(1500)
  await toggle.click(); await pause(1500)
} else {
  skippedSteps.push('toggle (no switch in the popup yet)')
  await pause(1500)
}

const video = page.video()
await context.close()
const raw = await video.path()
console.log(`raw: ${rel(raw)}`)
if (skippedSteps.length) console.warn(`NOTE: left out: ${skippedSteps.join('; ')}`)

// ---- convert --------------------------------------------------------------

function ff(args, what) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) { console.error(`ffmpeg failed making ${what}:\n${r.stderr}`); process.exit(1) }
}
const ss = Math.max(0, startAt - 0.2).toFixed(2)
ff(['-ss', ss, '-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', MP4], 'the MP4')
ff(['-ss', ss, '-i', raw, '-vf',
  'fps=11,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  '-loop', '0', GIF], 'the GIF')

// ---- verify ----------------------------------------------------------------

function stats(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' })
  const frames = [...r.stderr.matchAll(/frame=\s*(\d+)/g)].pop()?.[1]
  const dims = r.stderr.match(/Video: .*?(\d{2,5})x(\d{2,5})/)
  const time = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop()
  const secs = time ? (+time[1]) * 3600 + (+time[2]) * 60 + parseFloat(time[3]) : NaN
  return { frames: Number(frames), width: dims && +dims[1], height: dims && +dims[2], secs, bytes: fs.statSync(file).size }
}
const g = stats(GIF), m = stats(MP4)
const mb = b => (b / 1024 / 1024).toFixed(2) + ' MB'
console.log(`${rel(GIF)}: ${g.width}x${g.height}, ${g.frames} frames, ${g.secs.toFixed(1)} s, ${mb(g.bytes)}`)
console.log(`${rel(MP4)}: ${m.width}x${m.height}, ${m.frames} frames, ${m.secs.toFixed(1)} s, ${mb(m.bytes)}`)
ff(['-ss', '3', '-i', GIF, '-frames:v', '1', path.join(OUT, 'demo-frame.png')], 'a check frame')
console.log(`check frame: ${rel(path.join(OUT, 'demo-frame.png'))}`)
if (!(g.frames > 1) || g.width !== 960) { console.error('GIF check failed: expected an animated 960px GIF'); process.exit(1) }
if (g.bytes >= GIF_LIMIT) { console.error(`GIF is ${mb(g.bytes)}, over the 10 MB limit`); process.exit(1) }
