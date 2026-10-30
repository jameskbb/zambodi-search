/*
 * Zambodi text pass. Runs at document_start in every page and frame.
 *
 * At document_start the body does not exist yet and the on/off flag in
 * chrome.storage.local is only available asynchronously. So the script starts
 * rewriting and observing straight away (enabled is the default) and records
 * every change it makes. When storage answers:
 *   - enabled (or no answer): the record is dropped and work continues;
 *   - disabled: the observer is disconnected and every recorded change that
 *     the page has not since overwritten is put back.
 * This avoids a flash of "Google" on the common path without ever leaving a
 * page rewritten when the user has switched the extension off.
 */
(function () {
  'use strict';

  const R = globalThis.ZambodiReplace;
  const root = document.documentElement;
  if (!R || !root || globalThis.__zambodiTextStarted) return;
  globalThis.__zambodiTextStarted = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'TEMPLATE']);
  const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
  const SKIP_SELECTOR = 'script, style, noscript, textarea, input, template, ' + EDITABLE;
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'value'];
  const VALUE_INPUT_TYPES = new Set(['button', 'submit', 'reset']);

  // Undo log, kept only until storage answers.
  let undo = [];

  function skipped(el) {
    if (!el) return false;
    if (el.isContentEditable === true) return true;
    return el.closest(SKIP_SELECTOR) !== null;
  }

  // An <option> without a value attribute submits its text, so rewriting the
  // label would change what the form sends. Pin the original text as the
  // value first; the label still reads Zambodi.
  function pinOptionValue(opt) {
    if (!opt || opt.tagName !== 'OPTION' || opt.hasAttribute('value')) return;
    const value = opt.value;
    if (undo) undo.push({ el: opt, name: 'value', after: value, before: null });
    opt.setAttribute('value', value);
  }

  function fixText(node) {
    const before = node.data;
    if (!R.hasMatch(before) || skipped(node.parentElement)) return;
    pinOptionValue(node.parentElement);
    const after = R.replaceText(before);
    if (undo) undo.push({ node, after, before });
    node.data = after;
  }

  function attrApplies(el, name) {
    if (name !== 'value') return true;
    if (el.tagName === 'BUTTON') return true;
    return el.tagName === 'INPUT' && VALUE_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  }

  function fixAttr(el, name) {
    const before = el.getAttribute(name);
    if (!R.hasMatch(before) || !attrApplies(el, name)) return;
    // Inputs and textareas are allowed here so button values and placeholders
    // change; only editable regions the user is typing into are left alone.
    if (el.isContentEditable === true || el.closest(EDITABLE) !== null) return;
    const after = R.replaceText(before);
    if (undo) undo.push({ el, name, after, before });
    el.setAttribute(name, after);
  }

  function fixAttrs(el) {
    for (const name of ATTRS) {
      if (el.hasAttribute(name)) fixAttr(el, name);
    }
  }

  /*
   * Open shadow roots (web components) are not reached by a TreeWalker or by
   * an observer on the document, so each one found is walked and observed in
   * its own right. An isolated-world content script cannot hook attachShadow,
   * so a root is found when its host is walked (the usual case: components
   * attach in their constructor, before they are inserted), and by a full
   * rescan at DOMContentLoaded, at load and at most once a second after DOM
   * changes (for hosts upgraded or given a root later with no other change).
   * Remaining gaps: closed shadow roots are unreachable, and a root attached
   * to an untouched host on an otherwise idle page waits for the next rescan.
   */
  const OBSERVE = {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ATTRS,
  };
  let observer = null;
  const shadowRoots = new WeakSet();

  function visitShadow(el) {
    const sr = el.shadowRoot;
    if (!sr || shadowRoots.has(sr)) return;
    shadowRoots.add(sr);
    if (observer) observer.observe(sr, OBSERVE);
    walk(sr);
  }

  // Walk a subtree: text nodes outside skipped regions, attributes everywhere.
  function walk(start) {
    if (start.nodeType === Node.TEXT_NODE) {
      fixText(start);
      return;
    }
    const isRoot = start.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
    if (start.nodeType !== Node.ELEMENT_NODE && !isRoot) return;
    // Content added inside a skipped region (a script body, an editor) is
    // left alone entirely.
    if (skipped(start.parentElement)) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        fixAttrs(node);
        if (SKIP_TAGS.has(node.tagName.toUpperCase()) || node.isContentEditable === true || node.matches(EDITABLE)) {
          return NodeFilter.FILTER_REJECT;
        }
        visitShadow(node);
        return NodeFilter.FILTER_SKIP;
      },
    });
    if (!isRoot) {
      fixAttrs(start);
      visitShadow(start);
    }
    let node;
    while ((node = walker.nextNode())) fixText(node);
  }

  // Finds shadow roots the walks missed, nested ones included.
  function scanShadows(scope) {
    for (const el of scope.querySelectorAll('*')) {
      if (el.shadowRoot) {
        visitShadow(el);
        scanShadows(el.shadowRoot);
      }
    }
  }

  let rescanTimer = 0;
  function scheduleRescan() {
    if (rescanTimer || !observer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = 0;
      if (observer) scanShadows(document);
    }, 1000);
  }

  function onMutations(records) {
    for (const rec of records) {
      if (rec.type === 'characterData') {
        fixText(rec.target);
      } else if (rec.type === 'attributes') {
        fixAttr(rec.target, rec.attributeName);
      } else {
        for (const n of rec.addedNodes) walk(n);
      }
    }
    scheduleRescan();
  }

  observer = new MutationObserver(onMutations);
  observer.observe(root, OBSERVE);
  walk(root);

  function rescanNow() {
    if (observer) scanShadows(document);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rescanNow, { once: true });
  if (document.readyState !== 'complete') globalThis.addEventListener('load', rescanNow, { once: true });

  function revert() {
    observer.disconnect();
    observer = null;
    clearTimeout(rescanTimer);
    const log = undo;
    undo = null;
    for (let i = log.length - 1; i >= 0; i--) {
      const u = log[i];
      if (u.node) {
        if (u.node.data === u.after) u.node.data = u.before;
      } else if (u.el.getAttribute(u.name) === u.after) {
        if (u.before === null) u.el.removeAttribute(u.name);
        else u.el.setAttribute(u.name, u.before);
      }
    }
  }

  function keep() {
    undo = null;
  }

  let answer;
  try {
    answer = chrome.storage.local.get({ enabled: true });
  } catch (e) {
    answer = Promise.resolve({ enabled: true });
  }
  Promise.resolve(answer).then(
    (items) => (items && items.enabled === false ? revert() : keep()),
    keep
  );
})();
