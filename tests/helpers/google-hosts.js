'use strict';
/*
 * The Google search hosts the branding script (google.js, google.css) runs
 * on, and the only origins allowed to load the extension's logo and favicon
 * (web_accessible_resources). manifest.json is plain JSON with no build step,
 * so both lists are written out there in full; this file is their single
 * source and tests/google.test.js fails if the manifest drifts from it.
 *
 * Source: Google's own list of search domains,
 * https://www.google.com/supported_domains (fetched 2026-10-29, 187
 * domains). Each becomes two patterns, www.google.<tld> and google.<tld>.
 * Other Google hosts (mail, docs, maps subdomains) are deliberately not
 * listed: their markup is unknown, so they only get the text pass.
 *
 * After editing the list: node tests/helpers/google-hosts.js --write
 */
const fs = require('node:fs');
const path = require('node:path');

// Everything after "google." in each supported domain, in Google's order.
const SUFFIXES = [
  'com', 'ad', 'ae', 'com.af', 'com.ag', 'al', 'am', 'co.ao',
  'com.ar', 'as', 'at', 'com.au', 'az', 'ba', 'com.bd', 'be', 'bf',
  'bg', 'com.bh', 'bi', 'bj', 'com.bn', 'com.bo', 'com.br', 'bs',
  'bt', 'co.bw', 'by', 'com.bz', 'ca', 'cd', 'cf', 'cg', 'ch', 'ci',
  'co.ck', 'cl', 'cm', 'cn', 'com.co', 'co.cr', 'com.cu', 'cv',
  'com.cy', 'cz', 'de', 'dj', 'dk', 'dm', 'com.do', 'dz', 'com.ec',
  'ee', 'com.eg', 'es', 'com.et', 'fi', 'com.fj', 'fm', 'fr', 'ga',
  'ge', 'gg', 'com.gh', 'com.gi', 'gl', 'gm', 'gr', 'com.gt', 'gy',
  'com.hk', 'hn', 'hr', 'ht', 'hu', 'co.id', 'ie', 'co.il', 'im',
  'co.in', 'iq', 'is', 'it', 'je', 'com.jm', 'jo', 'co.jp', 'co.ke',
  'com.kh', 'ki', 'kg', 'co.kr', 'com.kw', 'kz', 'la', 'com.lb',
  'li', 'lk', 'co.ls', 'lt', 'lu', 'lv', 'com.ly', 'co.ma', 'md',
  'me', 'mg', 'mk', 'ml', 'com.mm', 'mn', 'com.mt', 'mu', 'mv', 'mw',
  'com.mx', 'com.my', 'co.mz', 'com.na', 'com.ng', 'com.ni', 'ne',
  'nl', 'no', 'com.np', 'nr', 'nu', 'co.nz', 'com.om', 'com.pa',
  'com.pe', 'com.pg', 'com.ph', 'com.pk', 'pl', 'pn', 'com.pr', 'ps',
  'pt', 'com.py', 'com.qa', 'ro', 'ru', 'rw', 'com.sa', 'com.sb',
  'sc', 'se', 'com.sg', 'sh', 'si', 'sk', 'com.sl', 'sn', 'so', 'sm',
  'sr', 'st', 'com.sv', 'td', 'tg', 'co.th', 'com.tj', 'tl', 'tm',
  'tn', 'to', 'com.tr', 'tt', 'com.tw', 'co.tz', 'com.ua', 'co.ug',
  'co.uk', 'com.uy', 'co.uz', 'com.vc', 'co.ve', 'co.vi', 'com.vn',
  'vu', 'ws', 'rs', 'co.za', 'co.zm', 'co.zw', 'cat',
];

const MATCHES = SUFFIXES.flatMap((s) => [`https://www.google.${s}/*`, `https://google.${s}/*`]);

function writeManifest() {
  const file = path.join(__dirname, '..', '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = manifest.content_scripts.find((cs) => (cs.css || []).includes('src/content/google.css'));
  entry.matches = MATCHES;
  manifest.web_accessible_resources[0].matches = MATCHES;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}

if (require.main === module && process.argv.includes('--write')) writeManifest();

module.exports = { SUFFIXES, MATCHES };
