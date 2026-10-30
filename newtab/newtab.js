// Put the cursor in the search box. Chrome gives new tab pages the omnibox
// focus by default, so `autofocus` alone is not always enough.
'use strict';

const box = document.getElementById('q');
box.focus();
window.addEventListener('load', () => box.focus());
