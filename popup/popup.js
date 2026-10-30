// The one setting: chrome.storage.local `enabled`, default true. Content
// scripts read it once at start, so a change applies on the next page load.
'use strict';

const box = document.getElementById('enabled');

chrome.storage.local.get({ enabled: true }).then(({ enabled }) => {
  box.checked = enabled !== false;
});

box.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: box.checked });
});
