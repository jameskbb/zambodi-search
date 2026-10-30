'use strict';
// Loads the extension's content scripts into a jsdom window the way Chrome
// would: same global, in manifest order, with a stub of the chrome APIs the
// scripts use.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function makeDom(html, { url = 'https://example.com/', enabled, scripts = ['src/lib/replace.js', 'src/content/text.js'] } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  let resolveStorage;
  const storageAnswered = new Promise((r) => { resolveStorage = r; });
  window.chrome = {
    storage: {
      local: {
        get(defaults) {
          const items = { ...defaults };
          if (enabled !== undefined) items.enabled = enabled;
          return Promise.resolve(items).finally(() => setTimeout(resolveStorage, 0));
        },
      },
    },
    runtime: { getURL: (p) => 'chrome-extension://zambodi-test/' + p },
  };
  for (const s of scripts) window.eval(read(s));
  return { dom, window, document: window.document, storageAnswered };
}

// Mutation observer callbacks run as microtasks; a macrotask turn flushes them.
const settle = () => new Promise((r) => setTimeout(r, 0));

module.exports = { makeDom, settle, read, ROOT };
