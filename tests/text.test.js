'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom, settle, read } = require('./helpers/dom.js');

const PAGE = `<!doctype html><html><head><title>Google</title></head><body>
  <h1 id="h">Welcome to Google's homepage</h1>
  <p id="p">Search with google or GOOGLE. Ask a Googler at the Googleplex.</p>
  <script id="s">var name = "Google";</script>
  <style id="st">.google::after { content: "Google"; }</style>
  <noscript id="ns">Google needs JavaScript</noscript>
  <textarea id="ta" placeholder="Search Google">I typed Google</textarea>
  <input id="txt" type="text" value="Google typed by me" placeholder="Ask Google">
  <input id="hid" type="hidden" value="Google">
  <input id="btn" type="submit" value="Google Search" aria-label="Google Search">
  <button id="b2" value="Google" title="Open Google">Google</button>
  <img id="img" alt="Google logo" title="Google">
  <div id="ce" contenteditable="true">Draft about Google <b id="ceb" title="Google">Google</b></div>
  <div id="cef" contenteditable="false">Not editable Google</div>
  <svg><style>.x{font-family:"Google Sans"}</style><text id="svgt">Google</text></svg>
</body></html>`;

test('rewrites visible text with case and possessives, leaves compounds', async () => {
  const { document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  assert.equal(document.getElementById('h').textContent, "Welcome to Zambodi's homepage");
  assert.equal(document.getElementById('p').textContent, 'Search with zambodi or ZAMBODI. Ask a Googler at the Googleplex.');
  assert.equal(document.getElementById('svgt').textContent, 'Zambodi');
  assert.equal(document.getElementById('cef').textContent, 'Not editable Zambodi');
});

test('skips script, style, noscript, textarea, input values and contenteditable', async () => {
  const { document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  assert.equal(document.getElementById('s').textContent, 'var name = "Google";');
  assert.equal(document.getElementById('st').textContent, '.google::after { content: "Google"; }');
  assert.match(document.querySelector('svg style').textContent, /Google Sans/);
  assert.equal(document.getElementById('ns').textContent, 'Google needs JavaScript');
  assert.equal(document.getElementById('ta').value, 'I typed Google');
  assert.equal(document.getElementById('txt').value, 'Google typed by me');
  assert.equal(document.getElementById('txt').getAttribute('value'), 'Google typed by me');
  assert.equal(document.getElementById('hid').getAttribute('value'), 'Google');
  assert.equal(document.getElementById('ce').textContent, 'Draft about Google Google');
  assert.equal(document.getElementById('ceb').getAttribute('title'), 'Google');
});

test('attribute pass covers button values, placeholder, aria-label, title, alt', async () => {
  const { document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  const btn = document.getElementById('btn');
  assert.equal(btn.getAttribute('value'), 'Zambodi Search');
  assert.equal(btn.value, 'Zambodi Search');
  assert.equal(btn.getAttribute('aria-label'), 'Zambodi Search');
  const b2 = document.getElementById('b2');
  assert.equal(b2.getAttribute('value'), 'Zambodi');
  assert.equal(b2.getAttribute('title'), 'Open Zambodi');
  assert.equal(b2.textContent, 'Zambodi');
  assert.equal(document.getElementById('img').getAttribute('alt'), 'Zambodi logo');
  assert.equal(document.getElementById('img').getAttribute('title'), 'Zambodi');
  assert.equal(document.getElementById('ta').getAttribute('placeholder'), 'Search Zambodi');
  assert.equal(document.getElementById('txt').getAttribute('placeholder'), 'Ask Zambodi');
});

test('title is rebranded and kept rebranded when the page changes it', async () => {
  const { document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  assert.equal(document.title, 'Zambodi');
  document.title = 'zambodi - Google Search';
  await settle();
  assert.equal(document.title, 'zambodi - Zambodi Search');
  // Replacing the whole <title> element is picked up too.
  const t = document.createElement('title');
  t.textContent = 'Google Images';
  document.querySelector('title').replaceWith(t);
  await settle();
  assert.equal(document.title, 'Zambodi Images');
});

test('MutationObserver picks up late content, text edits and attribute changes', async () => {
  const { document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  const div = document.createElement('div');
  div.innerHTML = '<p>More from Google</p><span aria-label="Google apps">GOOGLE</span><script>"Google"</script>';
  document.body.append(div);
  const tn = document.createTextNode('appended google text');
  document.body.append(tn);
  document.getElementById('h').firstChild.data = 'Changed to Google';
  document.getElementById('img').setAttribute('alt', 'Google again');
  await settle();
  assert.equal(div.querySelector('p').textContent, 'More from Zambodi');
  assert.equal(div.querySelector('span').getAttribute('aria-label'), 'Zambodi apps');
  assert.equal(div.querySelector('span').textContent, 'ZAMBODI');
  assert.equal(div.querySelector('script').textContent, '"Google"');
  assert.equal(tn.data, 'appended zambodi text');
  assert.equal(document.getElementById('h').textContent, 'Changed to Zambodi');
  assert.equal(document.getElementById('img').getAttribute('alt'), 'Zambodi again');
  // Typing into a contenteditable region is never rewritten.
  document.getElementById('ce').append(document.createTextNode(' more Google'));
  await settle();
  assert.match(document.getElementById('ce').textContent, /more Google$/);
});

test('its own writes do not loop', async () => {
  const { window, document, storageAnswered } = makeDom(PAGE);
  await storageAnswered;
  let mutations = 0;
  new window.MutationObserver((recs) => { mutations += recs.length; })
    .observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  document.getElementById('p').firstChild.data = 'google once';
  await settle();
  await settle();
  // One write by the test, one rewrite by the extension, then quiet.
  assert.equal(mutations, 2);
});

test('disabled: nothing changes and early rewrites are put back', async () => {
  const { document, storageAnswered } = makeDom(PAGE, { enabled: false });
  await storageAnswered;
  assert.equal(document.title, 'Google');
  assert.equal(document.getElementById('h').textContent, "Welcome to Google's homepage");
  assert.equal(document.getElementById('btn').getAttribute('value'), 'Google Search');
  const p = document.createElement('p');
  p.textContent = 'late Google';
  document.body.append(p);
  await settle();
  assert.equal(p.textContent, 'late Google');
});

test('starts at document_start before the body exists', async () => {
  // Simulate document_start: only <html> exists when the script runs.
  const { document, storageAnswered } = makeDom('<!doctype html><html></html>');
  document.documentElement.innerHTML = '<head><title>Google</title></head><body><p>Google</p></body>';
  await storageAnswered;
  await settle();
  assert.equal(document.title, 'Zambodi');
  assert.equal(document.querySelector('p').textContent, 'Zambodi');
});

const FORM = `<!doctype html><html><body><form id="f">
  <select name="source" id="sel"><option id="o1">Google</option><option id="o2">A friend</option></select>
  <select name="engine" id="sel2"><option id="o3" value="g">Google Search</option></select>
</form></body></html>`;

test('options without a value attribute keep submitting their original text', async () => {
  const { window, document, storageAnswered } = makeDom(FORM);
  await storageAnswered;
  const o1 = document.getElementById('o1');
  assert.equal(o1.textContent, 'Zambodi');
  assert.equal(o1.getAttribute('value'), 'Google');
  assert.equal(document.getElementById('sel').value, 'Google');
  assert.equal(new window.FormData(document.getElementById('f')).get('source'), 'Google');
  // An option with its own value keeps it; only the label changes.
  const o3 = document.getElementById('o3');
  assert.equal(o3.textContent, 'Zambodi Search');
  assert.equal(o3.getAttribute('value'), 'g');
  // Options added later are handled the same way.
  const late = document.createElement('option');
  late.textContent = 'Google Ads';
  document.getElementById('sel').append(late);
  await settle();
  assert.equal(late.textContent, 'Zambodi Ads');
  assert.equal(late.value, 'Google Ads');
  // Options with nothing to rewrite are left alone.
  assert.equal(document.getElementById('o2').hasAttribute('value'), false);
});

test('disabled: the pinned option value is removed again', async () => {
  const { document, storageAnswered } = makeDom(FORM, { enabled: false });
  await storageAnswered;
  const o1 = document.getElementById('o1');
  assert.equal(o1.textContent, 'Google');
  assert.equal(o1.hasAttribute('value'), false);
});

test('open shadow roots are rewritten and observed, nested ones too', async () => {
  const { window, document, storageAnswered } = makeDom('<!doctype html><html><body><div id="root"></div></body></html>');
  await storageAnswered;
  // A component that attaches its root before it is inserted (the usual case).
  const host = document.createElement('x-card');
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = '<b title="Google">Google in shadow</b><span id="inner"></span>';
  const inner = sr.getElementById('inner');
  inner.attachShadow({ mode: 'open' }).innerHTML = '<i>nested Google</i>';
  document.getElementById('root').append(host);
  await settle();
  assert.equal(sr.querySelector('b').textContent, 'Zambodi in shadow');
  assert.equal(sr.querySelector('b').getAttribute('title'), 'Zambodi');
  assert.equal(inner.shadowRoot.querySelector('i').textContent, 'nested Zambodi');
  // Later changes inside the shadow root are seen by its own observer.
  sr.querySelector('b').firstChild.data = 'Google again';
  sr.append(window.document.createTextNode('late Google'));
  await settle();
  assert.equal(sr.querySelector('b').textContent, 'Zambodi again');
  assert.equal(sr.lastChild.data, 'late Zambodi');
});

test('a shadow root attached to a host already in the page is found by the rescan', async () => {
  const { document, storageAnswered } = makeDom('<!doctype html><html><body><x-late id="h"></x-late><p>x</p></body></html>');
  await storageAnswered;
  const sr = document.getElementById('h').attachShadow({ mode: 'open' });
  sr.innerHTML = '<b>Google upgraded</b>';
  // Any DOM change schedules the rescan.
  document.querySelector('p').textContent = 'y';
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(sr.querySelector('b').textContent, 'Zambodi upgraded');
});

test('disabled: text rewritten inside a shadow root is put back', async () => {
  const { window, document } = makeDom('<!doctype html><html></html>', { enabled: false, scripts: [] });
  const host = document.createElement('x-card');
  host.attachShadow({ mode: 'open' }).innerHTML = '<b>Google</b>';
  document.documentElement.append(host);
  for (const s of ['src/lib/replace.js', 'src/content/text.js']) window.eval(read(s));
  assert.equal(host.shadowRoot.querySelector('b').textContent, 'Zambodi');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(host.shadowRoot.querySelector('b').textContent, 'Google');
});
