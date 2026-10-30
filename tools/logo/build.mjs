// Generates every Zambodi brand asset from the bundled OFL serif.
//
//   npm --prefix tools/logo install && node tools/logo/build.mjs
//
// Outputs (paths relative to the repository root):
//   assets/logo/zambodi-logo.svg        full wordmark, viewBox 0 0 272 92
//   assets/logo/zambodi-logo-small.svg  same art, for the results-page logo (shown at 92x30)
//   assets/icons/icon-{16,32,48,128}.png and assets/icons/favicon-32.png
//
// The text is converted to SVG paths with opentype.js, so no font ships with the
// extension. PNGs are rendered by headless Chromium through playwright-core.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const font = opentype.loadSync(join(here, 'fonts', 'EBGaramond-ExtraBold.ttf'));

// 2000s palette, deeper than today's, in the classic sequence.
const BLUE = '#0039b6';
const RED = '#c41200';
const YELLOW = '#f3c518';
const GREEN = '#30a72f';
const LETTERS = [
  ['Z', BLUE],
  ['a', RED],
  ['m', YELLOW],
  ['b', BLUE],
  ['o', GREEN],
  ['d', RED],
  ['i', BLUE],
];

const VIEW_W = 272;
const VIEW_H = 92;
// Room left for the drop shadow, which falls down and to the right.
const PAD_LEFT = 6;
const PAD_RIGHT = 10;
const PAD_TOP = 5;
const PAD_BOTTOM = 10;
// Extra space between letters in font units (the old logo was set slightly loose).
const TRACKING = 10;

const r = (n) => Math.round(n * 100) / 100;

// Lay the word out once at 1 unit per font unit, one path per letter.
function layoutWord() {
  const glyphs = LETTERS.map(([ch]) => font.charToGlyph(ch));
  let x = 0;
  const placed = glyphs.map((g, i) => {
    const at = x;
    x += g.advanceWidth + TRACKING;
    if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]);
    return { glyph: g, x: at };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { glyph, x: gx } of placed) {
    const b = glyph.getPath(gx, 0, font.unitsPerEm).getBoundingBox();
    minX = Math.min(minX, b.x1); minY = Math.min(minY, b.y1);
    maxX = Math.max(maxX, b.x2); maxY = Math.max(maxY, b.y2);
  }
  return { placed, box: { minX, minY, maxX, maxY } };
}

function wordmarkSvg(idPrefix) {
  const { placed, box } = layoutWord();
  const availW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const availH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const scale = Math.min(availW / (box.maxX - box.minX), availH / (box.maxY - box.minY));
  const wordW = (box.maxX - box.minX) * scale;
  const wordH = (box.maxY - box.minY) * scale;
  const offX = PAD_LEFT + (availW - wordW) / 2 - box.minX * scale;
  const offY = PAD_TOP + (availH - wordH) / 2 - box.minY * scale;

  const paths = placed.map(({ glyph, x }, i) => {
    const p = glyph.getPath(offX + x * scale, offY, font.unitsPerEm * scale);
    const [ch, colour] = LETTERS[i];
    return `    <path data-letter="${ch}" fill="${colour}" d="${p.toPathData(2)}"/>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Zambodi">`,
    '  <title>Zambodi</title>',
    '  <defs>',
    retroFilter(`${idPrefix}-retro`, { bevelBlur: 1.6, surface: 4, shadowBlur: 1.3, shadowDx: 2.4, shadowDy: 2.6 }),
    '  </defs>',
    `  <g filter="url(#${idPrefix}-retro)">`,
    ...paths,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

// The retro look: a bevel lit from the upper left plus a soft grey drop shadow.
function retroFilter(id, o) {
  return [
    `    <filter id="${id}" x="-10%" y="-15%" width="125%" height="140%" color-interpolation-filters="sRGB">`,
    // Bevel: blur the letter's alpha into a height map, light it, keep it inside the letter.
    `      <feGaussianBlur in="SourceAlpha" stdDeviation="${o.bevelBlur}" result="height"/>`,
    `      <feSpecularLighting in="height" surfaceScale="${o.surface}" specularConstant="0.75" specularExponent="16" lighting-color="#ffffff" result="glint">`,
    '        <feDistantLight azimuth="225" elevation="40"/>',
    '      </feSpecularLighting>',
    '      <feComposite in="glint" in2="SourceAlpha" operator="in" result="glintIn"/>',
    '      <feComposite in="SourceGraphic" in2="glintIn" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" result="lit"/>',
    // Shadow side of the bevel: a faint darkening on the lower right edges.
    `      <feOffset in="height" dx="${r(-o.bevelBlur * 0.7)}" dy="${r(-o.bevelBlur * 0.7)}" result="heightShift"/>`,
    '      <feComposite in="SourceAlpha" in2="heightShift" operator="out" result="rim"/>',
    '      <feFlood flood-color="#000000" flood-opacity="0.28"/>',
    '      <feComposite in2="rim" operator="in" result="rimDark"/>',
    '      <feComposite in="rimDark" in2="SourceAlpha" operator="in" result="rimIn"/>',
    '      <feMerge result="bevelled"><feMergeNode in="lit"/><feMergeNode in="rimIn"/></feMerge>',
    // Drop shadow, offset down and to the right.
    `      <feGaussianBlur in="SourceAlpha" stdDeviation="${o.shadowBlur}" result="shadowBlur"/>`,
    `      <feOffset in="shadowBlur" dx="${o.shadowDx}" dy="${o.shadowDy}" result="shadowOffset"/>`,
    '      <feFlood flood-color="#6e6e6e" flood-opacity="0.55"/>',
    '      <feComposite in2="shadowOffset" operator="in" result="shadow"/>',
    '      <feMerge><feMergeNode in="shadow"/><feMergeNode in="bevelled"/></feMerge>',
    '    </filter>',
  ].join('\n');
}

// The blue "Z" alone, centred in a square, for the toolbar icons and favicon.
function iconSvg(size) {
  const g = font.charToGlyph('Z');
  const b = g.getPath(0, 0, font.unitsPerEm).getBoundingBox();
  const VIEW = 100;
  // Small sizes need the letter as large as possible; the bevel is toned down to stay crisp.
  const small = size <= 16;
  const inset = small ? 6 : 10;
  const boxW = b.x2 - b.x1;
  const boxH = b.y2 - b.y1;
  const scale = (VIEW - inset * 2) / Math.max(boxW, boxH);
  const offX = (VIEW - boxW * scale) / 2 - b.x1 * scale;
  const offY = (VIEW - boxH * scale) / 2 - b.y1 * scale;
  const d = g.getPath(offX, offY, font.unitsPerEm * scale).toPathData(2);
  const filter = small
    ? retroFilter('z', { bevelBlur: 2.2, surface: 3, shadowBlur: 1.5, shadowDx: 2, shadowDy: 2 })
    : retroFilter('z', { bevelBlur: 3.2, surface: 5, shadowBlur: 2.4, shadowDx: 3.2, shadowDy: 3.5 });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}">`,
    '  <defs>',
    filter,
    '  </defs>',
    `  <rect x="1" y="1" width="${VIEW - 2}" height="${VIEW - 2}" rx="${small ? 14 : 18}" fill="#ffffff" stroke="#c9c9c9" stroke-width="${small ? 0 : 2}"/>`,
    `  <path filter="url(#z)" fill="${BLUE}" d="${d}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

function write(rel, data) {
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  console.log('wrote', rel);
}

async function renderPng(page, svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img id="i" width="${width}" height="${height}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">` +
      '</body></html>',
  );
  await page.locator('#i').evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

const logo = wordmarkSvg('zambodi-logo');
const logoSmall = wordmarkSvg('zambodi-logo-small');
write('assets/logo/zambodi-logo.svg', logo);
write('assets/logo/zambodi-logo-small.svg', logoSmall);

// --disable-gpu keeps screenshots working on machines without a usable GPU process
// (for example WSL), where the compositor otherwise never produces a frame.
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-software-rasterizer'] });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    write(`assets/icons/icon-${size}.png`, await renderPng(page, iconSvg(size), size, size));
  }
  write('assets/icons/favicon-32.png', await renderPng(page, iconSvg(32), 32, 32));
} finally {
  await browser.close();
}
