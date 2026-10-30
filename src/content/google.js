/*
 * Zambodi branding on Google search pages: logo, doodle and favicon swaps.
 * Runs at document_start on www.google.* and google.* only (see manifest).
 *
 * google.css hides every known logo element from the first paint. Once the
 * on/off flag is read this script either:
 *   - enabled: puts the Zambodi wordmark in place of each logo and keeps doing
 *     so as Google re-renders, and points every favicon link at ours;
 *   - disabled: sets data-zambodi-off on <html>, which switches google.css off,
 *     and does nothing else.
 *
 * Targets are stable attributes only (alt, aria-label, title, src, href, id
 * hplogo), never Google's generated class names. text.js may already have
 * rewritten "Google" to "Zambodi" in those attributes, so every selector is
 * listed in both spellings.
 *
 * Swap rules
 * - Logo inside a link (results page "Go to Google home"): the link's
 *   children are hidden and our <img> is appended to the same link, so the
 *   link still goes home. The link is marked data-zambodi-swapped.
 * - Logo not inside a link (today's homepage SVG): our <img> is inserted just
 *   before it and the original is hidden.
 * - Our <img> takes the box of the element it replaces (width and height
 *   attributes, else its layout box), with object-fit: contain so the
 *   wordmark keeps its aspect. Boxes under 60px tall get the small wordmark.
 *   A logo with no box yet (an <img> without size attributes that has not
 *   loaded) stays hidden and is swapped once it has one; its size is never
 *   guessed.
 * - Doodles (any size or aspect) get the standard box instead: 272x92 on the
 *   homepage, or the doodle's height with the wordmark aspect when small.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  if (!root || globalThis.__zambodiGoogleStarted) return;
  globalThis.__zambodiGoogleStarted = true;

  const both = (fmt) => [fmt('Google'), fmt('Zambodi')];
  const LOGO_SELECTORS = [
    ...both((n) => `img[alt="${n}"]`),
    ...both((n) => `svg[aria-label="${n}"]`),
    ...both((n) => `a[aria-label="Go to ${n} home"]`),
    ...both((n) => `a[aria-label="${n}"]`),
    // [title="Google"] is narrowed to links and images so a tooltip on some
    // unrelated element can never hide it.
    ...both((n) => `a[title="${n}"]`),
    ...both((n) => `img[title="${n}"]`),
    ...both((n) => `a[title="Go to ${n} Home"]`),
  ];
  const DOODLE_SELECTORS = [
    '#hplogo',
    'a[href*="oi=ddle"]',
    'img[src*="/logos/doodles/"]',
    'iframe[src*="/logos/doodles/"]',
  ];
  const SELECTORS = [...LOGO_SELECTORS, ...DOODLE_SELECTORS];
  const ANY = SELECTORS.map((s) => s + ':not([data-zambodi-logo])').join(', ');
  const DOODLE = DOODLE_SELECTORS.join(', ');

  const LOGO_W = 272;
  const LOGO_H = 92;
  const SMALL_BELOW = 60;
  const FULL_URL = chrome.runtime.getURL('assets/logo/zambodi-logo.svg');
  const SMALL_URL = chrome.runtime.getURL('assets/logo/zambodi-logo-small.svg');
  const FAVICON_URL = chrome.runtime.getURL('assets/icons/favicon-32.png');

  function numAttr(el, name) {
    const v = parseFloat(el.getAttribute(name));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  // The box an element occupies: explicit size attributes first (they exist
  // before layout), then the layout box. google.css hides with visibility, so
  // the layout box is still real.
  function measure(el) {
    let w = numAttr(el, 'width');
    let h = numAttr(el, 'height');
    if ((!w || !h) && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      w = w || r.width;
      h = h || r.height;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  // The element that stands for the logo inside a link, for measuring.
  function logoIn(link) {
    return link.querySelector('svg, img, canvas, iframe') || link;
  }

  // Elements with no box yet are retried: an <img> on its load event, any
  // element on the next animation frames (capped, so a logo that never gets
  // a box, say inside a closed menu, does not keep a loop running; the
  // observer still retries it whenever the page changes).
  const MAX_RETRY_FRAMES = 120;
  let retryFrames = 0;
  let retryPending = false;
  const waitingForLoad = new WeakSet();

  function retryLater(target) {
    if (target.tagName === 'IMG' && !waitingForLoad.has(target)) {
      waitingForLoad.add(target);
      target.addEventListener('load', run, { once: true });
    }
    if (retryPending || retryFrames >= MAX_RETRY_FRAMES || typeof requestAnimationFrame !== 'function') return;
    retryPending = true;
    retryFrames++;
    requestAnimationFrame(() => {
      retryPending = false;
      run();
    });
  }

  // An <img> with no size attributes has no real box until it loads: before
  // that it measures 0x0, or the size of its alt text.
  function unsizedPendingImage(el) {
    return el.tagName === 'IMG' && (!numAttr(el, 'width') || !numAttr(el, 'height')) && !(el.complete && el.naturalWidth > 0);
  }

  // The box for our logo, or null when the target has no layout box yet.
  // Doodles always get the standard box. A logo is never given a guessed
  // size: a 272x92 wordmark in a 74x24 header slot (www.google.com/preferences)
  // overflows the page, so the swap waits until the box is known.
  function boxFor(target, doodle) {
    if (!doodle && unsizedPendingImage(target)) {
      retryLater(target);
      return null;
    }
    const m = measure(target);
    if (doodle) {
      const small = m.h > 0 && m.h < SMALL_BELOW;
      const h = small ? m.h : LOGO_H;
      return { w: small ? Math.round((h * LOGO_W) / LOGO_H) : LOGO_W, h };
    }
    if (!m.w || !m.h) {
      retryLater(target);
      return null;
    }
    return m;
  }

  function makeLogo(box) {
    const img = document.createElement('img');
    img.src = box.h < SMALL_BELOW ? SMALL_URL : FULL_URL;
    img.alt = 'Zambodi';
    img.width = box.w;
    img.height = box.h;
    img.setAttribute('data-zambodi-logo', '');
    img.style.cssText = `width:${box.w}px;height:${box.h}px;object-fit:contain;display:inline-block;vertical-align:middle;border:0;`;
    return img;
  }

  function hide(el) {
    if (!el.hasAttribute('data-zambodi-hidden')) el.setAttribute('data-zambodi-hidden', '');
  }

  // Idempotent: hides anything new inside the link and adds our logo once.
  function swapLink(link, doodle) {
    let img = link.querySelector(':scope > img[data-zambodi-logo]');
    const box = img ? null : boxFor(logoIn(link), doodle);
    // Not laid out yet: leave it hidden by google.css and try again later.
    if (!img && !box) return;
    for (const child of link.children) {
      if (child !== img) hide(child);
    }
    if (!img) {
      img = makeLogo(box);
      link.append(img);
    }
    if (!link.hasAttribute('data-zambodi-swapped')) link.setAttribute('data-zambodi-swapped', '');
  }

  function swapInPlace(el, doodle) {
    // If Google re-rendered the logo next to ours, do not add a second one.
    const prev = el.previousElementSibling;
    if (prev && prev.hasAttribute('data-zambodi-logo')) {
      hide(el);
      return;
    }
    const box = boxFor(el, doodle);
    if (!box) return;
    hide(el);
    el.before(makeLogo(box));
  }

  function swapLogos() {
    for (const el of document.querySelectorAll(ANY)) {
      if (el.closest('[data-zambodi-hidden]')) continue;
      const doodle = el.matches(DOODLE) || el.querySelector(DOODLE) !== null;
      const link = el.closest('a');
      if (link) swapLink(link, doodle);
      else swapInPlace(el, doodle);
    }
  }

  function fixFavicons() {
    const head = document.head;
    if (!head) return;
    const links = head.querySelectorAll('link[rel~="icon" i], link[rel*="icon" i]');
    if (links.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = FAVICON_URL;
      link.setAttribute('data-zambodi-favicon', '');
      head.append(link);
      return;
    }
    for (const link of links) {
      if (link.getAttribute('href') !== FAVICON_URL) link.setAttribute('href', FAVICON_URL);
      if (link.hasAttribute('type') && link.getAttribute('type') !== 'image/png') link.setAttribute('type', 'image/png');
    }
  }

  function run() {
    swapLogos();
    fixFavicons();
  }

  function start() {
    run();
    // One full pass per mutation batch is cheap on Google pages and catches
    // everything: late logos, re-rendered headers, re-added favicons. The
    // pass only writes when something is out of place, so its own writes
    // settle after one extra batch.
    new MutationObserver(run).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['alt', 'aria-label', 'title', 'src', 'href', 'rel', 'id'],
    });
  }

  function stop() {
    root.setAttribute('data-zambodi-off', '');
  }

  // Exposed for the unit tests; nothing in the extension reads it.
  globalThis.ZambodiGoogle = Object.freeze({ SELECTORS, LOGO_W, LOGO_H, SMALL_BELOW });

  let answer;
  try {
    answer = chrome.storage.local.get({ enabled: true });
  } catch (e) {
    answer = Promise.resolve({ enabled: true });
  }
  Promise.resolve(answer).then(
    (items) => (items && items.enabled === false ? stop() : start()),
    start
  );
})();
