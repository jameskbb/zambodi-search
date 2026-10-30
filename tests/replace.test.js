'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { replaceText, hasMatch } = require('../src/lib/replace.js');

test('preserves case for the whole word', () => {
  assert.equal(replaceText('Google'), 'Zambodi');
  assert.equal(replaceText('google'), 'zambodi');
  assert.equal(replaceText('GOOGLE'), 'ZAMBODI');
});

test('mixed case falls back to title case', () => {
  assert.equal(replaceText('gOOGLE'), 'Zambodi');
  assert.equal(replaceText('GoOgLe'), 'Zambodi');
});

test('handles possessives and plurals', () => {
  assert.equal(replaceText("Google's search"), "Zambodi's search");
  assert.equal(replaceText('Google’s search'), 'Zambodi’s search');
  assert.equal(replaceText('two Googles'), 'two Zambodis');
  assert.equal(replaceText('GOOGLES'), 'ZAMBODIS');
  assert.equal(replaceText("GOOGLE'S"), "ZAMBODI'S");
});

test('replaces every occurrence in a sentence', () => {
  assert.equal(
    replaceText('Google Search: google it, or GOOGLE it.'),
    'Zambodi Search: zambodi it, or ZAMBODI it.'
  );
  assert.equal(replaceText('zambodi - Google Search'), 'zambodi - Zambodi Search');
});

test('punctuation is a word boundary', () => {
  assert.equal(replaceText('www.google.com'), 'www.zambodi.com');
  assert.equal(replaceText('Google-owned'), 'Zambodi-owned');
  assert.equal(replaceText('(Google)'), '(Zambodi)');
});

test('leaves compounds and embedded words alone', () => {
  for (const s of ['Googler', 'Googleplex', 'Googled', 'Googling', 'googleapis', 'my_google', 'Google2', 'Googleé', 'xgoogle']) {
    assert.equal(replaceText(s), s, s);
    assert.equal(hasMatch(s), false, s);
  }
});

test('letters of scripts written without spaces are word boundaries', () => {
  // Japanese: particles and katakana attach with no space.
  assert.equal(replaceText('日本のGoogle Googleは'), '日本のZambodi Zambodiは');
  assert.equal(replaceText('Googleで検索'), 'Zambodiで検索');
  assert.equal(replaceText('グーグルGoogleー'), 'グーグルZambodiー');
  // Chinese.
  assert.equal(replaceText('使用Google搜索'), '使用Zambodi搜索');
  assert.equal(replaceText('谷歌Google的产品'), '谷歌Zambodi的产品');
  // Korean: particles attach to the word before them.
  assert.equal(replaceText('Google은 검색 엔진입니다'), 'Zambodi은 검색 엔진입니다');
  assert.equal(replaceText('구글Google에서'), '구글Zambodi에서');
  // Thai has no spaces between words either.
  assert.equal(replaceText('ค้นหาGoogleได้'), 'ค้นหาZambodiได้');
  // Plurals and possessives still work next to CJK.
  assert.equal(replaceText('二つのGooglesと'), '二つのZambodisと');
  // Latin, Cyrillic and Greek letters still join the word.
  for (const s of ['Googleé', 'éGoogle', 'Googleж', 'Googleλ']) assert.equal(replaceText(s), s, s);
  // Idempotent here too.
  assert.equal(hasMatch(replaceText('日本のGoogleは')), false);
});

test('is idempotent', () => {
  const inputs = ["Google's Googles", 'GOOGLE google Google', 'no match here', ''];
  for (const s of inputs) {
    const once = replaceText(s);
    assert.equal(replaceText(once), once);
    assert.equal(hasMatch(once), false);
  }
});

test('hasMatch is a cheap guard that agrees with replaceText', () => {
  assert.equal(hasMatch('Google'), true);
  assert.equal(hasMatch('Zambodi'), false);
  assert.equal(hasMatch(''), false);
  assert.equal(hasMatch(null), false);
  assert.equal(hasMatch(undefined), false);
  assert.equal(replaceText(null), null);
  // Repeated calls must not carry regex state between strings.
  for (let i = 0; i < 5; i++) assert.equal(hasMatch('a Google b'), true);
});

test('attaches to globalThis for classic content scripts', () => {
  assert.equal(typeof globalThis.ZambodiReplace.replaceText, 'function');
  assert.equal(globalThis.ZambodiReplace.replaceText('Google'), 'Zambodi');
});
