'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom, settle, read } = require('./helpers/dom.js');
const { MATCHES: GOOGLE_HOSTS } = require('./helpers/google-hosts.js');

const manifest = JSON.parse(read('manifest.json'));
const googleEntry = manifest.content_scripts.find((cs) => (cs.css || []).includes('src/content/google.css'));
// Google pages get every entry whose patterns cover them, in manifest order.
const GOOGLE_SCRIPTS = [...manifest.content_scripts[0].js, ...googleEntry.js];
const EXT = 'chrome-extension://zambodi-test/';

// The flash-prevention rule from google.css, as one selector list.
const css = read('src/content/google.css').replace(/\/\*[\s\S]*?\*\//g, '');
const HIDE_RULE = css.slice(0, css.indexOf('{')).trim();

async function load(fixture, opts = {}) {
  const env = makeDom(read('tests/fixtures/' + fixture), { url: 'https://www.google.com/', scripts: GOOGLE_SCRIPTS, ...opts });
  await env.storageAnswered;
  await settle();
  return env;
}

const logos = (doc) => [...doc.querySelectorAll('img[data-zambodi-logo]')];

test('manifest: Google entry runs at document_start on Google hosts only', () => {
  assert.equal(googleEntry.run_at, 'document_start');
  assert.deepEqual(googleEntry.js, ['src/content/google.js']);
  for (const p of ['https://www.google.com/*', 'https://google.com/*', 'https://www.google.co.uk/*', 'https://www.google.de/*', 'https://www.google.com.au/*']) {
    assert.ok(googleEntry.matches.includes(p), p);
  }
  for (const p of googleEntry.matches) {
    assert.match(p, /^https:\/\/(www\.)?google\.[a-z.]+\/\*$/, p);
  }
  assert.deepEqual(manifest.content_scripts[0].matches, ['<all_urls>']);
  assert.equal(manifest.content_scripts[0].all_frames, true);
  // about:blank and srcdoc frames inherit their parent's origin; without this
  // they get no text pass.
  assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
});

test('manifest: Google host list is the full supported_domains list', () => {
  // Regenerate with: node tests/helpers/google-hosts.js --write
  assert.deepEqual(googleEntry.matches, GOOGLE_HOSTS);
  for (const p of ['https://www.google.co.th/*', 'https://google.com.ec/*', 'https://www.google.rs/*', 'https://www.google.cat/*']) {
    assert.ok(googleEntry.matches.includes(p), p);
  }
});

test('manifest: logo and favicon are web accessible only on the Google hosts', () => {
  // Only google.js puts extension assets into web pages, so no other site
  // can probe chrome-extension:// URLs to fingerprint the extension.
  assert.equal(manifest.web_accessible_resources.length, 1);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, googleEntry.matches);
});

test('manifest: search provider favicon_url stays an https URL', () => {
  // Chrome rejects the manifest unless favicon_url is http or https
  // (CreateManifestURL in chromium's settings_overrides_handler.cc), so the
  // extension's own favicon cannot be used here and the omnibox entry shows
  // Google's icon.
  assert.match(manifest.chrome_settings_overrides.search_provider.favicon_url, /^https:\/\//);
});

test('google.css hides exactly the selectors google.js swaps', async () => {
  const { window } = await load('google-home.html');
  const fromCss = HIDE_RULE.split(',').map((s) => s.trim()
    .replace(/^html:not\(\[data-zambodi-off\]\) /, '')
    .replace(':not([data-zambodi-logo]):not([data-zambodi-swapped])', ''));
  assert.deepEqual(fromCss, [...window.ZambodiGoogle.SELECTORS]);
  assert.match(css, /\[data-zambodi-hidden\]\s*{\s*display: none !important;/);
});

test('before any script runs, the CSS already hides the live homepage logo', () => {
  const { document } = makeDom(read('tests/fixtures/google-home.html'), { scripts: [] });
  const svg = document.querySelector('svg[role="img"]');
  assert.equal(svg.matches(HIDE_RULE), true);
});

test('homepage: logo SVG swapped for the full wordmark, sized to match', async () => {
  const { document } = await load('google-home.html');
  const svg = document.querySelector('svg[role="img"][viewBox="0 0 272 92"]');
  assert.ok(svg.hasAttribute('data-zambodi-hidden'));
  const imgs = logos(document);
  assert.equal(imgs.length, 1);
  const img = imgs[0];
  assert.equal(img.nextElementSibling, svg);
  assert.equal(img.getAttribute('src'), EXT + 'assets/logo/zambodi-logo.svg');
  assert.equal(img.getAttribute('width'), '272');
  assert.equal(img.getAttribute('height'), '92');
  assert.equal(img.alt, 'Zambodi');
  // Ours is visible; the original stays hidden.
  assert.equal(img.matches(HIDE_RULE), false);
  assert.equal(svg.matches('html:not([data-zambodi-off]) [data-zambodi-hidden]'), true);
});

test('homepage: title, buttons, footer and favicon say Zambodi', async () => {
  const { document } = await load('google-home.html');
  assert.equal(document.title, 'Zambodi');
  assert.equal(document.querySelector('input[name="btnK"]').value, 'Zambodi Search');
  assert.equal(document.querySelector('input[name="btnK"]').getAttribute('aria-label'), 'Zambodi Search');
  assert.equal(document.querySelector('input[name="btnI"]').value, "I'm Feeling Lucky");
  // The footer line, found by its link target rather than Google's class names.
  assert.equal(document.querySelector('a[href="https://sustainability.google/"]').textContent, 'Build, create, and do more with AI tools from Zambodi');
  assert.equal(document.querySelector('a[aria-label="Zambodi apps"]') !== null, true);
  const icons = document.querySelectorAll('link[rel~="icon"]');
  assert.equal(icons.length, 1);
  assert.equal(icons[0].getAttribute('href'), EXT + 'assets/icons/favicon-32.png');
});

test('homepage: Google re-rendering the logo does not add a second wordmark', async () => {
  const { document } = await load('google-home.html');
  const old = document.querySelector('svg[role="img"][viewBox="0 0 272 92"]');
  const fresh = old.cloneNode(true);
  fresh.removeAttribute('data-zambodi-hidden');
  fresh.setAttribute('aria-label', 'Google');
  old.replaceWith(fresh);
  await settle();
  await settle();
  assert.ok(fresh.hasAttribute('data-zambodi-hidden'));
  assert.equal(logos(document).length, 1);
});

test('homepage doodle: hidden and replaced by a 272x92 wordmark', async () => {
  const doodle = read('tests/fixtures/google-home.html').replace(
    /<svg class="ESTs9d"[\s\S]*?<\/svg>/,
    '<a href="/search?q=Halloween&amp;oi=ddle&amp;ct=halloween-2026"><img alt="Halloween 2026" src="/logos/doodles/2026/halloween-2026.gif" width="500" height="200"></a>'
  );
  const { document } = makeDom(doodle, { url: 'https://www.google.com/', scripts: GOOGLE_SCRIPTS });
  await settle();
  await settle();
  const a = document.querySelector('a[href*="oi=ddle"]');
  const img = a.querySelector('img[data-zambodi-logo]');
  assert.ok(img);
  assert.equal(img.getAttribute('width'), '272');
  assert.equal(img.getAttribute('height'), '92');
  assert.ok(a.querySelector('img[src*="/logos/doodles/"]').hasAttribute('data-zambodi-hidden'));
  assert.equal(logos(document).length, 1);
});

test('results page: small logo swapped inside the home link, which still goes home', async () => {
  const { document } = await load('google-results.html', { url: 'https://www.google.com/search?q=zambodi' });
  const link = document.getElementById('logo');
  assert.equal(link.getAttribute('href'), 'https://www.google.com/webhp?hl=en&sa=X');
  assert.equal(link.getAttribute('aria-label'), 'Go to Zambodi home');
  assert.ok(link.hasAttribute('data-zambodi-swapped'));
  assert.equal(link.matches(HIDE_RULE), false);
  const img = link.querySelector(':scope > img[data-zambodi-logo]');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), EXT + 'assets/logo/zambodi-logo-small.svg');
  assert.equal(img.getAttribute('width'), '92');
  assert.equal(img.getAttribute('height'), '30');
  assert.ok(link.querySelector('svg').hasAttribute('data-zambodi-hidden'));
  assert.equal(document.title, 'zambodi - Zambodi Search');
});

test('logo without size attributes: never guessed at 272x92, swapped at its own size once loaded', async () => {
  const { window, document } = await load('google-preferences.html', { url: 'https://www.google.com/preferences?hl=en' });
  const link = document.querySelector('a[href="/webhp"]');
  const orig = link.querySelector('img.logo');
  // Not loaded, no box: nothing swapped, the original stays hidden by the CSS.
  assert.equal(logos(document).length, 0);
  assert.equal(orig.matches(HIDE_RULE), true);
  // A few animation frames later there is still no box, still no guess.
  await new Promise((r) => window.requestAnimationFrame(() => window.requestAnimationFrame(r)));
  await settle();
  assert.equal(logos(document).length, 0);
  // The image loads and lays out at its natural 74x24.
  Object.defineProperty(orig, 'complete', { value: true });
  Object.defineProperty(orig, 'naturalWidth', { value: 74 });
  orig.getBoundingClientRect = () => ({ x: 0, y: 0, width: 74, height: 24, top: 0, left: 0, right: 74, bottom: 24 });
  orig.dispatchEvent(new window.Event('load'));
  await settle();
  const imgs = logos(document);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].parentElement, link);
  assert.equal(imgs[0].getAttribute('src'), EXT + 'assets/logo/zambodi-logo-small.svg');
  assert.equal(imgs[0].getAttribute('width'), '74');
  assert.equal(imgs[0].getAttribute('height'), '24');
  assert.ok(orig.hasAttribute('data-zambodi-hidden'));
  assert.equal(link.getAttribute('href'), '/webhp');
  // The page changing afterwards does not add a second one.
  document.body.append(document.createElement('div'));
  await settle();
  assert.equal(logos(document).length, 1);
});

test('results page: every icon link points at the extension favicon', async () => {
  const { document } = await load('google-results.html', { url: 'https://www.google.com/search?q=zambodi' });
  const icons = [...document.querySelectorAll('link[rel*="icon"]')];
  assert.equal(icons.length, 2);
  for (const l of icons) assert.equal(l.getAttribute('href'), EXT + 'assets/icons/favicon-32.png');
  assert.equal(icons[0].getAttribute('type'), 'image/png');
});

test('results page: new search re-renders header, title and favicon; all kept up', async () => {
  const { document } = await load('google-results.html', { url: 'https://www.google.com/search?q=zambodi' });
  const link = document.getElementById('logo');
  // Google swaps in a fresh logo, a new favicon link and a new title.
  link.insertAdjacentHTML('afterbegin', '<svg aria-label="Google" role="img" width="92" height="30"></svg>');
  document.querySelectorAll('link[rel*="icon"]').forEach((l) => l.remove());
  document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="/favicon.ico">');
  document.title = 'second query - Google Search';
  await settle();
  await settle();
  for (const child of link.children) {
    assert.ok(child.hasAttribute('data-zambodi-hidden') || child.hasAttribute('data-zambodi-logo'));
  }
  assert.equal(link.querySelectorAll('img[data-zambodi-logo]').length, 1);
  assert.equal(document.querySelector('link[rel="icon"]').getAttribute('href'), EXT + 'assets/icons/favicon-32.png');
  assert.equal(document.title, 'second query - Zambodi Search');
  // Google removing every icon link gets one of ours back.
  document.querySelectorAll('link[rel*="icon"]').forEach((l) => l.remove());
  await settle();
  const ours = document.querySelectorAll('link[rel="icon"]');
  assert.equal(ours.length, 1);
  assert.equal(ours[0].getAttribute('href'), EXT + 'assets/icons/favicon-32.png');
});

test('disabled: no swap, no favicon change, and the hiding CSS is switched off', async () => {
  const { document } = await load('google-home.html', { enabled: false });
  assert.ok(document.documentElement.hasAttribute('data-zambodi-off'));
  assert.equal(logos(document).length, 0);
  const svg = document.querySelector('svg[role="img"]');
  assert.equal(svg.matches(HIDE_RULE), false);
  assert.equal(document.querySelector('link[rel="icon"]').getAttribute('href'), '//www.gstatic.com/images/branding/searchlogo/ico/favicon.ico');
  assert.equal(document.title, 'Google');
});
