// Helpers shared by the render scripts in docs/src. Not part of the extension.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '..', '..')
export const images = path.join(root, 'docs', 'images')
export const require = createRequire(path.join(here, 'package.json'))
export const { chromium } = require('playwright-core')

export const EXTENSION_ID = 'oicbgephlhbfmniacckfglonoecdoeba'
export const extensionUrl = p => `chrome-extension://${EXTENSION_ID}/${p}`

// Headless Chromium in a VM has no usable GPU; these keep screenshots from hanging.
export const gpuArgs = ['--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer']
export const executable = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}

export const FONTS = ['Libre Baskerville', 'Arimo']

// Resolves when the web fonts are in; returns the names that failed.
export async function missingFonts(page, fonts = FONTS) {
  const result = await page.evaluate(async list => {
    await document.fonts.ready
    await Promise.all(list.map(f => document.fonts.load(`700 16px "${f}"`).catch(() => null)))
    return list.map(f => [f, document.fonts.check(`700 16px "${f}"`)])
  }, fonts)
  return result.filter(([, ok]) => !ok).map(([f]) => f)
}

// Waits for every <img> on the page to finish loading.
export async function imagesLoaded(page) {
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
}

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }

// Opens a persistent Chromium profile under docs/src/profile/<name> (gitignored),
// with the unpacked extension loaded from the repository root unless
// withExtension is false. Extensions need the full Chromium build, so this
// uses channel 'chromium' in new headless mode.
export async function launchProfile(name, { withExtension = true, ...options } = {}) {
  const profileDir = path.join(here, 'profile', name)
  ensureDir(profileDir)
  const ext = withExtension ? ['--disable-extensions-except=' + root, '--load-extension=' + root] : []
  const context = await chromium.launchPersistentContext(profileDir, {
    ...executable,
    ...(process.env.CHROMIUM_PATH ? {} : { channel: 'chromium' }),
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    args: [...ext, '--lang=en-US', ...gpuArgs],
    ...options,
  })
  await context.addCookies([{ name: 'CONSENT', value: 'YES+', domain: '.google.com', path: '/', secure: true, sameSite: 'Lax' }])
  return context
}

// Results pages. Google answers automated browsers on /search with its
// "unusual traffic" page, so the scripts never load a real one: every
// top-level navigation to https://www.google.com/search is answered with a
// local file, and the extension's real content scripts run on it. By default
// that file is docs/src/google-results-mock.html, a fictional results page
// written for these images. ZAMBODI_RESULTS_HTML names another file to replay
// instead, such as a real results page saved from a normal browser (Chrome:
// Ctrl+S, "Webpage, HTML Only"); its subresources still load from Google.
export const bundledResults = path.join(here, 'google-results-mock.html')
export const resultsReplay = process.env.ZAMBODI_RESULTS_HTML ? path.resolve(process.env.ZAMBODI_RESULTS_HTML) : bundledResults
export const resultsIsMock = !process.env.ZAMBODI_RESULTS_HTML
if (!fs.existsSync(resultsReplay)) {
  console.error(`${resultsIsMock ? 'bundled results mock' : 'ZAMBODI_RESULTS_HTML'}: ${resultsReplay} does not exist`)
  process.exit(2)
}

// One line saying which results page the run replays.
export const resultsNote = () => resultsIsMock
  ? `results page: the bundled mock ${path.relative(process.cwd(), resultsReplay)} (set ZAMBODI_RESULTS_HTML to replay a saved page)`
  : `results page: replaying ${path.relative(process.cwd(), resultsReplay)} for google.com/search`

// Launch options for a context that replays results: service workers are
// blocked so every navigation reaches the route below.
export const replayOptions = { serviceWorkers: 'block' }

// Installs the replay route on a context.
export async function routeResults(context) {
  const body = fs.readFileSync(resultsReplay)
  await context.route(/^https:\/\/www\.google\.com\/search(?:[?#]|$)/, route => {
    const req = route.request()
    if (req.isNavigationRequest() && !req.frame().parentFrame()) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body })
    return route.continue()
  })
}

// Opens url, getting past Google's consent interstitial if one appears.
// Returns 'ok', or 'blocked' when Google serves its unusual-traffic page.
export async function gotoGoogle(page, url, settle = 1500) {
  await page.goto(url, { waitUntil: 'load' })
  if (/consent\.google\./.test(page.url())) {
    await page.context().addCookies([{ name: 'CONSENT', value: 'YES+', domain: '.google.com', path: '/' }])
    await page.goto(url, { waitUntil: 'load' })
  }
  if (await isBlocked(page)) return 'blocked'
  await page.waitForTimeout(settle)
  return 'ok'
}

export async function isBlocked(page) {
  if (/\/sorry\//.test(page.url())) return true
  const text = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')
  return /unusual traffic/i.test(text)
}

export const blockedMessage = what =>
  `SKIPPED ${what}: Google served its "unusual traffic" page to this machine. ` +
  'That image was not updated; run the script again later or from another network.'
