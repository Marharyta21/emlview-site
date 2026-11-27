// Welcome page logic: show "how to pin" until the extension's icon is on the toolbar, then "how to use".
// The extension opens this page with ?pinned=0|1&id=<extension id>. While the page is visible
// it asks the extension again every 1.5 s (externally_connectable), so pinning switches the page by itself.
// #pin / #usage in the address are the user's own choice and stop the automatic switching.
// emlview.com opened without parameters (by hand, from the store) also starts on "how to pin": the owner's
// decision 2026-11-20, the main page of the domain is the pinning guide.

const STORE_IDS = []; // the Chrome Web Store ID goes here once the extension is published
const POLL_MS = 1500;
const NAME = 'EML Viewer';
const TITLES = { pin: `${NAME} is installed`, usage: `${NAME} is ready` };

const params = new URLSearchParams(location.search);
const ids = [...new Set([params.get('id'), ...STORE_IDS])].filter((id) => /^[a-p]{32}$/.test(id || ''));
let chosenByUser = false;

function setMode(mode, { justPinned = false } = {}) {
  if (document.body.dataset.mode === mode && !justPinned) return;
  document.body.dataset.mode = mode;
  document.title = TITLES[mode];
  document.getElementById('pinnedNote').hidden = !justPinned;
  window.scrollTo(0, 0);
}

function modeFromHash() {
  if (location.hash === '#usage') return 'usage';
  if (location.hash === '#pin') return 'pin';
  return null;
}

/** Asks one extension ID for its toolbar state; null when it can't answer (not installed, other ID). */
function askOne(runtime, id) {
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(id, { type: 'getPinState' }, (reply) => {
        if (runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(typeof reply?.isOnToolbar === 'boolean' ? reply.isOnToolbar : null);
      });
    } catch (err) {
      console.warn('Could not ask the extension about its toolbar icon', id, err);
      resolve(null);
    }
  });
}

/** True or false from the first extension ID that answers; null when none can be asked. */
async function isPinned() {
  // chrome.runtime exists on this page only when an installed extension lists this site.
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) return null;
  for (const id of ids) {
    const answer = await askOne(runtime, id);
    if (answer !== null) return answer;
  }
  return null;
}

let checking = false;
async function check() {
  if (chosenByUser || checking || document.hidden || document.body.dataset.mode !== 'pin') return;
  checking = true;
  try {
    if (await isPinned()) setMode('usage', { justPinned: true });
  } finally {
    checking = false;
  }
}

function start() {
  const fromHash = modeFromHash();
  chosenByUser = fromHash !== null;
  setMode(fromHash || (params.get('pinned') === '1' ? 'usage' : 'pin'));
  if (!ids.length) return; // opened by hand, not by the extension: nothing to ask
  check();
  setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', check);
}

// People click the pictures as if they were the real browser. Tell them it's a picture and point
// up to the real toolbar (top right of the window), without pretending to know the exact spot.
const HINTS = {
  pin: 'This is a picture. Click the puzzle icon in your browser, up here at the top right.',
  usage: 'This is a picture. Click the blue envelope icon in your browser, up here at the top right.'
};
let hintTimer = 0;
document.querySelectorAll('.shot-wrap').forEach((wrap) => {
  wrap.addEventListener('click', () => {
    const hint = document.getElementById('shotHint');
    document.getElementById('shotHintText').textContent = HINTS[wrap.dataset.hint] || HINTS.pin;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.hidden = true; }, 7000);
  });
});

window.addEventListener('hashchange', () => {
  const mode = modeFromHash();
  if (!mode) return;
  chosenByUser = true;
  setMode(mode);
});

start();
