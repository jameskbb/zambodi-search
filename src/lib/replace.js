/*
 * Zambodi text replacement: pure functions shared by the content scripts and
 * the unit tests. Loads as a classic content script (attaches
 * globalThis.ZambodiReplace) and as a CommonJS module under Node.
 *
 * Rules
 * - Only the whole word "Google" changes, in any case. Case is preserved:
 *   Google -> Zambodi, google -> zambodi, GOOGLE -> ZAMBODI. Any other mix of
 *   cases (gOOGLE, GoOgLe) falls back to the title-case "Zambodi".
 * - Possessives and plurals keep their suffix: Google's -> Zambodi's,
 *   Google’s -> Zambodi’s, Googles -> Zambodis.
 * - Compounds are left alone: Googler, Googleplex, Googled, Googling and
 *   googleapis stay as written. They are separate words (and often product or
 *   host names), and a half-rebranded "Zambodiplex" reads as a bug, not a joke.
 *   Punctuation is a word boundary, so google.com becomes zambodi.com and
 *   Google-owned becomes Zambodi-owned.
 * - Word boundaries are Unicode-aware (letters, digits and underscore join a
 *   word), so "Googleé" or "my_google" do not change. The exception is
 *   scripts written without spaces between words (Chinese, Japanese, Thai,
 *   Lao, Khmer, Myanmar) and Hangul, where particles attach directly
 *   ("Googleの", "Google은"): their letters count as a boundary, so
 *   "日本のGoogleは" becomes "日本のZambodiは".
 * - The output never contains "google" as a whole word, so replaceText is
 *   idempotent and callers can compare before writing to avoid loops.
 */
(function (root) {
  'use strict';

  // Letters of these scripts sit right next to a Latin word with no space, so
  // they never join it. scx (Script_Extensions) also covers marks shared by
  // Hiragana and Katakana such as the long vowel mark.
  const GAPLESS = ['Han', 'Hiragana', 'Katakana', 'Hangul', 'Thai', 'Lao', 'Khmer', 'Myanmar']
    .map((s) => '\\p{scx=' + s + '}')
    .join('');
  // A character that glues onto a word: a letter, digit or underscore that is
  // not from a gapless script.
  const WORD = '(?:(?![' + GAPLESS + '])[\\p{L}\\p{N}_])';
  // The suffix lookahead allows a plural "s" but nothing else glued on.
  const SOURCE = '(?<!' + WORD + ')google(?=s?(?!' + WORD + '))';
  const TEST_RE = new RegExp(SOURCE, 'iu');
  const REPLACE_RE = new RegExp(SOURCE, 'giu');

  function caseLike(word) {
    if (word === 'google') return 'zambodi';
    if (word === 'GOOGLE') return 'ZAMBODI';
    return 'Zambodi';
  }

  // Cheap pre-check: callers skip nodes that would not change.
  function hasMatch(str) {
    return typeof str === 'string' && str.length >= 6 && TEST_RE.test(str);
  }

  function replaceText(str) {
    if (!hasMatch(str)) return str;
    return str.replace(REPLACE_RE, caseLike);
  }

  const api = Object.freeze({ hasMatch, replaceText });

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ZambodiReplace = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
