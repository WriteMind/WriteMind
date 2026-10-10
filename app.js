'use strict';
const writing = document.querySelector('#writing');
const status = document.querySelector('#status');
const fileInput = document.querySelector('#file');
const draftKey = 'zen-writing-draft-v1';
let filename = 'quiet-thoughts.md';
let saveTimer;
// Diagnostics: add ?debug to the address to see live typing timings and Pencil events.
// Tap the panel to reset the counters.
const debugOn = new URLSearchParams(location.search).has('debug');
const debugStats = {};
let debugPanel = null;
let debugTimer = null;
function dbg(key, value) {
  if (!debugOn) return;
  debugStats[key] = value === undefined ? (typeof debugStats[key] === 'number' ? debugStats[key] + 1 : 1) : value;
  debugTimer ??= setTimeout(renderDebug, 150);
}
function renderDebug() {
  debugTimer = null;
  if (!debugPanel) {
    debugPanel = Object.assign(document.createElement('div'), {id: 'debug-panel', title: 'Tap to reset the counters'});
    debugPanel.addEventListener('click', () => {
      for (const k of Object.keys(debugStats)) if (typeof debugStats[k] === 'number') debugStats[k] = '–';
      renderDebug();
    });
    document.body.append(debugPanel);
  }
  debugPanel.textContent = Object.entries(debugStats).map(([k, v]) => `${k}: ${v}`).join('\n');
}
if (debugOn) {
  const ua = navigator.userAgent;
  debugStats.browser = (ua.match(/CriOS\/[\d.]+|FxiOS\/[\d.]+|EdgiOS\/[\d.]+|Edg\/[\d.]+|Chrome\/[\d.]+|Firefox\/[\d.]+|Version\/[\d.]+(?=.*Safari)/)?.[0] || 'unknown') +
    (navigator.maxTouchPoints > 1 ? ', touch screen' : '');
  for (const k of ['typing: input delay ms', 'typing: to next frame ms', 'typing: slowest frame ms', 'typing: first key ms', 'typing: Markdown sync ms',
    'pen mode', 'pen down', 'pen up', 'pen cancel', 'strokes saved', 'strokes finished late', 'lift-offs outside board', 'capture lost mid-stroke',
    'palm touches ignored', 'finger touches ignored', 'palm strokes discarded', 'touch events blocked', 'pen moves/s', 'points per move', 'pressure']) debugStats[k] = '–';
  renderDebug();
}
// The gentle slide-in plays once per visit, not every time Write is reopened.
setTimeout(() => document.body.classList.remove('intro'), 1000);
let growFrame = null;
function refresh(growOnly = false) {
  const words = writing.value.trim().match(/\S+/gu)?.length || 0;
  document.querySelector('#count').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  // While typing, the textarea only ever grows; shrinking it to re-measure lays out the whole text twice.
  if (growOnly) {
    // Measured just before the next paint, when the browser lays out the text anyway, so typing
    // never waits on a forced layout of the whole document.
    growFrame ??= requestAnimationFrame(() => {
      growFrame = null;
      if (writing.scrollHeight > writing.clientHeight) writing.style.height = `${writing.scrollHeight}px`;
    });
    return schedulePreview();
  }
  writing.style.height = 'auto';
  writing.style.height = `${writing.scrollHeight}px`;
  schedulePreview();
}
function persist() {
  try {
    localStorage.setItem(draftKey, JSON.stringify({text: writing.value, filename}));
    status.textContent = 'Draft saved on this device';
  } catch { status.textContent = 'Save a .md file to keep your writing'; }
}
try {
  const draft = JSON.parse(localStorage.getItem(draftKey));
  if (draft && typeof draft.text === 'string') {
    writing.value = draft.text;
    filename = typeof draft.filename === 'string' ? draft.filename : filename;
    status.textContent = 'Draft restored on this device';
  }
} catch { status.textContent = 'Save a .md file to keep your writing'; }
writing.addEventListener('input', (e) => {
  refresh(Boolean(e.inputType) && !e.inputType.startsWith('delete'));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
});
window.addEventListener('pagehide', persist);
window.addEventListener('resize', refresh);
document.querySelector('#load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (writing.value.trim() && !window.confirm('Replace your current writing with this file? Save a .md copy first if you want to keep it.')) {
    fileInput.value = '';
    return;
  }
  try {
    writing.value = await extractEmbeddedImages(await file.text());
    filename = file.name.replace(/\.(md|markdown|txt)$/i, '') + '.md';
    refresh();
    persist();
    document.querySelector('#announcement').textContent = `${file.name} loaded`;
    focusEditor();
  } catch { status.textContent = 'Could not load this file. Please try again.'; }
  fileInput.value = '';
});
document.querySelector('#save').addEventListener('click', async () => {
  flushRich();
  const url = URL.createObjectURL(new Blob([await withEmbeddedImages(writing.value)], {type: 'text/markdown;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  persist();
  document.querySelector('#announcement').textContent = 'Markdown download started';
});
// Sounds: the Moodist ambient mixer (moodist.mvze.net) in a side panel. It loads on first open,
// and closing the panel only hides it, so whatever is playing keeps playing.
const soundsButton = document.querySelector('#sounds');
const soundPanel = document.querySelector('#sound-panel');
function setSoundPanel(open) {
  if (open && !soundPanel.querySelector('iframe')) {
    const frame = Object.assign(document.createElement('iframe'), {src: 'https://moodist.mvze.net/', title: 'Moodist ambient sounds', loading: 'eager'});
    frame.allow = 'autoplay';
    soundPanel.append(frame);
  }
  soundPanel.classList.toggle('open', open);
  document.body.classList.toggle('sounds-open', open);
  // The page and board change size, so text wrapping, the focus band and the canvas are re-measured.
  window.dispatchEvent(new Event('resize'));
  soundPanel.setAttribute('aria-hidden', String(!open));
  soundsButton.setAttribute('aria-expanded', String(open));
}
soundsButton.addEventListener('click', () => setSoundPanel(!soundPanel.classList.contains('open')));
document.querySelector('#sound-close').addEventListener('click', () => setSoundPanel(false));

// Theme: auto (follows the device), light, dark or sepia.
const themeSelect = document.querySelector('#theme');
const themeMeta = document.querySelector('#theme-color');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
  try { localStorage.setItem('zen-theme', theme); } catch {}
  themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#ffffff';
  window.dispatchEvent(new Event('zen-theme'));
}
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
darkQuery.addEventListener?.('change', () => { if (themeSelect.value === 'auto') applyTheme('auto'); });
applyTheme(document.documentElement.dataset.theme || 'auto');

// A short message that stays visible even when the menus (and the status line) are hidden.
const toast = document.querySelector('#toast');
let toastTimer;
function notify(message) {
  status.textContent = message;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}
// Full screen, with a button to tuck the menus away.
const isAppleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const fullButton = document.querySelector('#fullscreen');
const hideButton = document.querySelector('#hide-menus');
function setMenusHidden(hidden) {
  document.body.classList.toggle('menus-hidden', hidden);
  hideButton.setAttribute('aria-pressed', String(hidden));
  hideButton.querySelector('span').textContent = hidden ? 'Show menus' : 'Hide menus';
}
function setFull(on) {
  document.body.classList.toggle('is-full', on);
  fullButton.setAttribute('aria-pressed', String(on));
  if (!on && isAppleTouch) setMenusHidden(false);
}
// Real full screen is always requested. Safari on iPad drops out of it when the keyboard opens;
// when that happens the focus view (menus tucked away) stays on until the button is pressed again.
let wantFull = false;
const nativeFull = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
function leaveFull() {
  wantFull = false;
  if (nativeFull()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {}); } catch {} }
  setFull(false);
}
fullButton.addEventListener('click', () => {
  if (wantFull || document.body.classList.contains('is-full')) { leaveFull(); return; }
  wantFull = true;
  setFull(true);
  if (isAppleTouch && document.body.dataset.mode !== 'board') setMenusHidden(true);
  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  // Called straight from the tap (no await first), as Safari requires.
  const homeTip = isAppleTouch ? ' For full screen on iPad, use Share → Add to Home Screen.' : '';
  if (navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) {
    notify('Already running full screen from the Home Screen — menus tucked away.');
    return;
  }
  if (!enter) { notify(`This browser has no full screen mode, so the focus view is on.${homeTip}`); return; }
  // Report why Safari refused, so problems on a particular device can be pinned down.
  const refused = (err) => { notify(`The browser declined full screen (${err?.name || 'no reason given'}); the focus view is on.${homeTip}`); };
  try { enter.call(root)?.catch?.(refused); } catch (err) { refused(err); }
  setTimeout(() => { if (wantFull && !nativeFull() && !/declined|no full screen/.test(toast.textContent)) notify(`Full screen did not start; the focus view is on.${homeTip}`); }, 1200);
});
['fullscreenchange', 'webkitfullscreenchange'].forEach((type) => document.addEventListener(type, () => {
  if (nativeFull()) { setFull(true); return; }
  if (!wantFull) return;
  if (isAppleTouch) notify('Safari left full screen — the focus view stays on. Tap the full screen button to leave it.');
  else { wantFull = false; setFull(false); }
}));
hideButton.addEventListener('click', () => setMenusHidden(!document.body.classList.contains('menus-hidden')));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || nativeFull()) return;
  if (document.body.classList.contains('menus-hidden')) setMenusHidden(false);
  else if (document.body.classList.contains('is-full')) leaveFull();
});

// Keep the drafts from the last two sessions.
const backupKey = 'zen-writing-backups-v1';
const restoreSelect = document.querySelector('#restore');
function readBackups() {
  try { const list = JSON.parse(localStorage.getItem(backupKey)); return Array.isArray(list) ? list.slice(0, 2) : []; }
  catch { return []; }
}
function renderBackups() {
  const list = readBackups();
  const label = new Option('Backups', '');
  label.disabled = true;
  restoreSelect.replaceChildren(label);
  list.forEach((b, i) => {
    const when = new Date(b.time).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
    const words = b.text.trim().split(/\s+/).slice(0, 4).join(' ');
    restoreSelect.append(new Option(`${when} — ${words}…`, String(i)));
  });
  restoreSelect.value = '';
  restoreSelect.hidden = list.length === 0;
}
try {
  if (!sessionStorage.getItem('zen-session')) {
    sessionStorage.setItem('zen-session', '1');
    if (writing.value.trim()) {
      const list = readBackups().filter((b) => b.text !== writing.value);
      list.unshift({text: writing.value, filename, time: Date.now()});
      localStorage.setItem(backupKey, JSON.stringify(list.slice(0, 2)));
    }
  }
} catch {}
renderBackups();
restoreSelect.addEventListener('change', () => {
  const backup = readBackups()[Number(restoreSelect.value)];
  restoreSelect.value = '';
  if (!backup) return;
  if (writing.value.trim() && writing.value !== backup.text && !window.confirm('Replace your current writing with this backup? Save a .md copy first if you want to keep it.')) return;
  writing.value = backup.text;
  filename = backup.filename || filename;
  refresh();
  persist();
  document.querySelector('#announcement').textContent = 'Backup restored';
  focusEditor();
});

// ---------- Local picture and board storage (IndexedDB) ----------
let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('zen-space', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('images'); open.result.createObjectStore('board'); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}
async function idb(store, mode, run) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Pictures ----------
const imageCache = new Map(); // id -> data URL
const imagePattern = /\]\(img:([\w-]+)\)/g;
const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {href: url, download: name});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function shrink(file) {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900000) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/webp', .86));
}
async function storeImage(blob) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await idb('images', 'readwrite', (s) => s.put(blob, id));
  imageCache.set(id, await blobToDataURL(blob));
  return id;
}
async function loadImage(id) {
  if (imageCache.has(id)) return imageCache.get(id);
  const blob = await idb('images', 'readonly', (s) => s.get(id)).catch(() => null);
  const url = blob ? await blobToDataURL(blob) : '';
  imageCache.set(id, url);
  return url;
}
const isImage = (f) => f.type.startsWith('image/');
// Saved files carry their pictures inside; loading one moves them back into local storage.
async function withEmbeddedImages(text) {
  const ids = [...new Set([...text.matchAll(imagePattern)].map((m) => m[1]))];
  const urls = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadImage(id)])));
  return text.replace(imagePattern, (m, id) => (urls[id] ? `](${urls[id]})` : m));
}
async function extractEmbeddedImages(text) {
  const found = [...text.matchAll(/\]\((data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+)\)/g)];
  for (const [, url] of found) {
    try {
      const id = await storeImage(await (await fetch(url)).blob());
      text = text.replace(url, `img:${id}`);
    } catch {}
  }
  return text;
}

// ---------- Writing: formatted by default, Markdown code on request ----------
const rich = document.querySelector('#rich');
const editor = document.querySelector('.editor');
const codeButton = document.querySelector('#code-view');
let fromRich = false;
let richTimer;
let turndown;
// Equations: $inline$ and $$display$$, rendered with KaTeX. Code is left alone.
const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const mathPattern = /\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\w$])/g;
function protectMath(text) {
  const math = [];
  const out = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => (i % 2 ? part : part.replace(mathPattern, (m, display, inline) => {
    math.push({tex: (display ?? inline).trim(), display: display != null});
    return `ZENMATH${math.length - 1}X`;
  }))).join('');
  return {text: out, math};
}
function mathHTML({tex, display}) {
  let html = escapeHTML(tex);
  try { if (window.katex) html = katex.renderToString(tex, {displayMode: display, throwOnError: false, output: 'htmlAndMathml'}); } catch {}
  return `<span class="math${display ? ' math-display' : ''}" data-tex="${escapeHTML(tex)}" contenteditable="false">${html}</span>`;
}
function markdownToHTML(text) {
  if (!window.marked || !window.DOMPurify) return null;
  const {text: safe, math} = protectMath(text);
  const html = marked.parse(safe.replace(imagePattern, (m, id) => `](${imageCache.get(id) || 'about:blank#' + id})`), {gfm: true, breaks: true});
  return DOMPurify.sanitize(html).replace(/ZENMATH(\d+)X/g, (m, n) => (math[n] ? mathHTML(math[n]) : m));
}
function tagImages(root) {
  const byUrl = new Map([...imageCache].map(([id, url]) => [url, id]));
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const id = byUrl.get(src) || (src.startsWith('about:blank#') ? src.slice(12) : null);
    if (id) img.dataset.zenId = id;
  });
}
function ensureTurndown() {
  if (!turndown) {
    turndown = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*'});
    if (window.turndownPluginGfm) turndown.use(turndownPluginGfm.gfm);
    turndown.addRule('zenImage', {
      filter: (node) => node.nodeName === 'IMG' && node.dataset.zenId,
      replacement: (c, node) => `![${(node.getAttribute('alt') || '').replace(/[[\]]/g, '')}](img:${node.dataset.zenId})`
    });
    turndown.addRule('zenMath', {
      filter: (node) => node.nodeName === 'SPAN' && node.classList.contains('math'),
      replacement: (c, node) => (node.classList.contains('math-display') ? `\n\n$$\n${node.dataset.tex}\n$$\n\n` : `$${node.dataset.tex}$`)
    });
  }
  return turndown;
}
function htmlToMarkdown() {
  // Turndown is given the element itself (it works on a copy), which skips re-parsing the page as HTML text.
  return ensureTurndown().turndown(rich)
    .replace(/​/g, '')
    .replace(/^(\s*)([-*]|\d+\.) {2,}/gm, '$1$2 ')
    .replace(/\n{3,}/g, '\n\n');
}
let richRendered = false;
function richReady() { return Boolean(window.marked && window.DOMPurify && window.TurndownService); }
function schedulePreview() {
  if (fromRich || editor.dataset.view !== 'rich') return;
  renderRich();
}
async function renderRich() {
  if (!richReady()) return;
  // The Markdown is the source of truth here, so any conversion still waiting would be stale.
  clearTimeout(richTimer);
  richDirty = false;
  const ids = [...writing.value.matchAll(imagePattern)].map((m) => m[1]).filter((id) => !imageCache.has(id));
  if (ids.length) await Promise.all(ids.map(loadImage));
  rich.innerHTML = markdownToHTML(writing.value);
  richRendered = true;
  tagImages(rich);
  rich.classList.toggle('is-empty', !writing.value.trim());
}
let richDirty = false;
function updateEmpty() {
  const empty = rich.childElementCount <= 1 && !rich.querySelector('img, .math') && !rich.textContent.replace(/\u200b/g, '').trim();
  rich.classList.toggle('is-empty', empty);
}
function runRichSync() {
  richDirty = false;
  const started = performance.now();
  fromRich = true;
  writing.value = htmlToMarkdown();
  updateEmpty();
  refresh();
  fromRich = false;
  persist();
  dbg('typing: Markdown sync ms', Math.round(performance.now() - started));
}
function syncFromRich() {
  richDirty = true;
  clearTimeout(richTimer);
  // Converting the whole page back to Markdown is the heaviest step, so it waits for a pause in typing.
  richTimer = setTimeout(runRichSync, 600);
}
// Finish any pending conversion right away (before saving, exporting or leaving the page).
function flushRich() {
  if (!richDirty || editor.dataset.view !== 'rich' || !richRendered) return;
  clearTimeout(richTimer);
  runRichSync();
}
function setView(view) {
  if (view === 'rich' && !richReady()) { status.textContent = 'Formatted view needs an internet connection'; view = 'code'; }
  if (editor.dataset.view === 'rich' && view === 'code' && richRendered) { clearTimeout(richTimer); richDirty = false; fromRich = true; writing.value = htmlToMarkdown(); fromRich = false; persist(); }
  editor.dataset.view = view;
  codeButton.setAttribute('aria-pressed', String(view === 'code'));
  try { localStorage.setItem('zen-view', view); } catch {}
  if (view === 'rich') renderRich();
  refresh();
  focusEditor();
}
function focusEditor() { (editor.dataset.view === 'rich' ? rich : writing).focus(); }
window.addEventListener('pagehide', flushRich);
// iPad Safari often skips pagehide when switching apps, so also save when the page is hidden.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushRich(); });
codeButton.addEventListener('click', () => setView(editor.dataset.view === 'code' ? 'rich' : 'code'));
try { if (localStorage.getItem('zen-view') === 'code') editor.dataset.view = 'code'; } catch {}
codeButton.setAttribute('aria-pressed', String(editor.dataset.view === 'code'));
window.addEventListener('load', () => { if (editor.dataset.view === 'rich') setView('rich'); });
// Prepare the Markdown converter ahead of time so the first pause in typing doesn't stall.
window.addEventListener('load', () => setTimeout(() => { try { if (window.TurndownService) ensureTurndown().turndown('<p>warm up</p>'); } catch {} }, 1500));

// Focus mode: the line being written stays bright while the text above and below fades.
const focusButton = document.querySelector('#focus-mode');
let focusOn = false;
let focusFrame = null;
try { focusOn = localStorage.getItem('zen-focus') === 'on'; } catch {}
function richLine() {
  const sel = getSelection();
  if (!sel.rangeCount || !rich.contains(sel.focusNode)) return null;
  let rect;
  if (!sel.isCollapsed) rect = sel.getRangeAt(0).getBoundingClientRect();
  else {
    const caret = document.createRange();
    caret.setStart(sel.focusNode, sel.focusOffset);
    caret.collapse(true);
    const rects = caret.getClientRects();
    rect = rects[rects.length - 1];
  }
  if (!rect || (!rect.height && !rect.top)) {
    // Empty lines have no caret box; use the element the caret sits in.
    let el = sel.focusNode.nodeType === 1 ? (sel.focusNode.childNodes[sel.focusOffset] || sel.focusNode) : sel.focusNode.parentElement;
    if (el?.nodeType !== 1) el = el?.parentElement || rich;
    const box = el.getBoundingClientRect(), lh = parseFloat(getComputedStyle(el).lineHeight) || 40;
    rect = {top: box.top, bottom: box.top + Math.min(box.height || lh, lh)};
  }
  const top = rich.getBoundingClientRect().top;
  return {top: rect.top - top, bottom: rect.bottom - top};
}
// A hidden copy of the textarea text finds where the caret's line is (textareas don't expose it).
const mirrorProps = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'lineHeight', 'letterSpacing', 'wordSpacing',
  'textIndent', 'textTransform', 'textAlign', 'tabSize', 'textWrap', 'wordBreak'];
let caretMirror = null;
function mirrorOffset(index, from = 0) {
  if (!caretMirror) {
    caretMirror = document.createElement('div');
    caretMirror.setAttribute('aria-hidden', 'true');
    document.body.append(caretMirror);
  }
  const cs = getComputedStyle(writing);
  for (const p of mirrorProps) if (cs[p] != null) caretMirror.style[p] = cs[p];
  Object.assign(caretMirror.style, {position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', height: 'auto', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word'});
  caretMirror.textContent = writing.value.slice(from, from + index);
  const marker = caretMirror.appendChild(document.createElement('span'));
  marker.textContent = '\u200b';
  return marker.offsetTop;
}
// Text before the current paragraph rarely changes while typing, so its height is cached; each
// keystroke then only measures the paragraph being written instead of the whole document.
let prefixCache = {text: null, width: 0, top: 0};
function caretTop(index) {
  const value = writing.value, start = value.lastIndexOf('\n', index - 1) + 1;
  const prefix = value.slice(0, start), width = writing.clientWidth;
  if (prefix !== prefixCache.text || width !== prefixCache.width) prefixCache = {text: prefix, width, top: mirrorOffset(start)};
  return prefixCache.top + mirrorOffset(index - start, start);
}
function textareaLine() {
  const lh = parseFloat(getComputedStyle(writing).lineHeight) || 28;
  const top = caretTop(writing.selectionStart);
  return {top, bottom: (writing.selectionEnd === writing.selectionStart ? top : caretTop(writing.selectionEnd)) + lh};
}
function updateFocus() {
  focusFrame = null;
  const el = editor.dataset.view === 'rich' ? rich : writing;
  if (!focusOn || document.activeElement !== el) return;
  const line = el === rich ? richLine() : textareaLine();
  if (!line) return;
  el.style.setProperty('--focus-top', `${Math.round(line.top - 4)}px`);
  el.style.setProperty('--focus-bottom', `${Math.round(line.bottom + 4)}px`);
}
function scheduleFocus() { if (focusOn) focusFrame ??= requestAnimationFrame(updateFocus); }
function setFocusMode(on) {
  focusOn = on;
  editor.classList.toggle('focusing', on);
  focusButton.setAttribute('aria-pressed', String(on));
  focusButton.title = on ? 'Focus mode is on: only the current line is bright' : 'Focus mode: dim everything except the line you are writing';
  try { localStorage.setItem('zen-focus', on ? 'on' : 'off'); } catch {}
}
focusButton.addEventListener('click', () => { setFocusMode(!focusOn); focusEditor(); scheduleFocus(); });
document.addEventListener('selectionchange', scheduleFocus);
[rich, writing].forEach((el) => ['input', 'focus', 'keyup', 'pointerup', 'select'].forEach((type) => el.addEventListener(type, scheduleFocus)));
window.addEventListener('resize', scheduleFocus);
setFocusMode(focusOn);

// Diagnostics for typing: how long a key waits, how soon the next frame paints, and the first key after tapping in.
if (debugOn) {
  let firstKey = true;
  const measure = (e) => {
    const started = performance.now(), wait = Math.round(started - e.timeStamp);
    if (wait >= 0 && wait < 10000) dbg('typing: input delay ms', wait);
    requestAnimationFrame(() => {
      const frame = Math.round(performance.now() - started);
      dbg('typing: to next frame ms', frame);
      dbg('typing: slowest frame ms', Math.max(typeof debugStats['typing: slowest frame ms'] === 'number' ? debugStats['typing: slowest frame ms'] : 0, frame));
      if (firstKey) { firstKey = false; dbg('typing: first key ms', frame + Math.max(0, wait)); }
    });
  };
  [rich, writing].forEach((el) => {
    el.addEventListener('beforeinput', measure);
    el.addEventListener('focus', () => { firstKey = true; });
  });
}

// Markdown-style shortcuts while writing formatted text.
function currentBlock() {
  const sel = getSelection();
  let node = sel.anchorNode;
  while (node && node.parentNode !== rich) node = node.parentNode;
  return node;
}
rich.addEventListener('beforeinput', (e) => {
  if (e.inputType !== 'insertText' || e.data !== ' ') return;
  const sel = getSelection();
  if (!sel.isCollapsed || sel.anchorNode?.nodeType !== 3) return;
  const before = sel.anchorNode.textContent.slice(0, sel.anchorOffset);
  const block = currentBlock();
  if (!block || (block.textContent.trim() !== before.trim())) return;
  const rules = {'#': 'h1', '##': 'h2', '###': 'h3', '>': 'blockquote'};
  const lists = {'-': 'insertUnorderedList', '*': 'insertUnorderedList', '1.': 'insertOrderedList'};
  if (!rules[before] && !lists[before]) return;
  e.preventDefault();
  sel.anchorNode.textContent = sel.anchorNode.textContent.slice(before.length);
  if (rules[before]) document.execCommand('formatBlock', false, rules[before]);
  else document.execCommand(lists[before]);
  syncFromRich();
});
rich.addEventListener('input', () => {
  updateEmpty(); // the placeholder disappears with the very first letter
  // **bold**, *italic* and `code` turn into formatting as soon as they close.
  const sel = getSelection();
  const node = sel.anchorNode;
  if (node?.nodeType === 3 && sel.isCollapsed) {
    const text = node.textContent.slice(Math.max(0, sel.anchorOffset - 300), sel.anchorOffset);
    const m = text.match(/(\*\*([^*]+)\*\*|(?<!\*)\*([^*\s][^*]*)\*|`([^`]+)`|(?<![\\$\w])\$([^$\s](?:[^$]*[^$\s])?)\$)$/);
    if (m) {
      const range = document.createRange();
      range.setStart(node, sel.anchorOffset - m[0].length);
      range.setEnd(node, sel.anchorOffset);
      range.deleteContents();
      let el;
      if (m[5]) {
        const t = document.createElement('template');
        t.innerHTML = mathHTML({tex: m[5], display: false});
        el = t.content.firstChild;
      } else {
        el = document.createElement(m[2] ? 'strong' : m[3] ? 'em' : 'code');
        el.textContent = m[2] || m[3] || m[4];
      }
      range.insertNode(el);
      const space = document.createTextNode('​');
      el.after(space);
      sel.collapse(space, 1);
    }
  }
  syncFromRich();
});
rich.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'b' || k === 'i') { e.preventDefault(); document.execCommand(k === 'b' ? 'bold' : 'italic'); syncFromRich(); }
});
rich.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  e.preventDefault();
  if (files.some(isImage)) { addImages(files); return; }
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  if (html && window.DOMPurify) document.execCommand('insertHTML', false, DOMPurify.sanitize(html, {FORBID_ATTR: ['style', 'class']}));
  else document.execCommand('insertText', false, text);
  syncFromRich();
});
rich.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener'); });

// Pictures in writing: button, paste or drop, in either view.
let savedRange = null;
rich.addEventListener('blur', () => { const s = getSelection(); if (s.rangeCount && rich.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); });
async function addImages(files) {
  const images = [...files].filter(isImage);
  if (!images.length) return false;
  status.textContent = 'Adding picture…';
  try {
    for (const file of images) {
      const id = await storeImage(await shrink(file));
      const alt = (file.name || 'picture').replace(/\.[^.]+$/, '').replace(/[[\]"<>]/g, '');
      if (editor.dataset.view === 'rich') {
        rich.focus();
        if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
        document.execCommand('insertHTML', false, `<p><img src="${imageCache.get(id)}" alt="${alt}" data-zen-id="${id}"></p><p><br></p>`);
        syncFromRich();
      } else {
        const {selectionStart: a, selectionEnd: b, value} = writing;
        const before = a > 0 && value[a - 1] !== '\n' ? '\n\n' : '';
        writing.setRangeText(`${before}![${alt}](img:${id})\n`, a, b, 'end');
        writing.dispatchEvent(new Event('input'));
      }
    }
    status.textContent = 'Picture added';
  } catch { status.textContent = 'Could not add this picture'; }
  return true;
}
document.querySelector('#add-image').addEventListener('click', () => document.querySelector('#image-file').click());
document.querySelector('#image-file').addEventListener('change', async (e) => { await addImages(e.target.files); e.target.value = ''; });
writing.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.some(isImage)) { e.preventDefault(); addImages(files); }
});
[writing, rich].forEach((el) => {
  el.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  el.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.some(isImage)) return;
    e.preventDefault();
    if (el === rich && document.caretRangeFromPoint) savedRange = document.caretRangeFromPoint(e.clientX, e.clientY);
    addImages(files);
  });
});

// Undo / redo for writing.
['undo', 'redo'].forEach((cmd) => document.querySelector(`#write-${cmd}`).addEventListener('click', () => {
  const target = editor.dataset.view === 'rich' ? rich : writing;
  target.focus();
  document.execCommand(cmd);
  if (target === rich) syncFromRich(); else writing.dispatchEvent(new Event('input'));
}));

// Export writing.
const exportSelect = document.querySelector('#export-writing');
const baseName = () => filename.replace(/\.md$/i, '') || 'zen';
async function writingHTML() {
  const md = writing.value;
  await Promise.all([...md.matchAll(imagePattern)].map((m) => loadImage(m[1])));
  const body = markdownToHTML(md) ?? `<pre>${md.replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]))}</pre>`;
  const title = (md.match(/^#\s+(.+)$/m)?.[1] || baseName()).replace(/[<>&]/g, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css"><style>
.math-display{display:block;text-align:center;margin:1em 0}
body{margin:0;background:#fff;color:#26282b;font:19px/1.85 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
main{max-width:700px;margin:0 auto;padding:72px 24px}h1,h2,h3{font-weight:400;line-height:1.25}h1{font-style:italic}
a{color:#5f7a74}blockquote{margin-left:0;padding-left:1em;border-left:2px solid #7f9590;color:#6b7076;font-style:italic}
code{font:.82em ui-monospace,Consolas,monospace;background:#f2f3f4;padding:.15em .4em;border-radius:5px}pre{background:#f5f6f7;padding:16px;border-radius:12px;overflow:auto}pre code{background:none}
img{max-width:100%;height:auto;display:block;margin:1.4em auto;border-radius:12px}hr{border:0;height:1px;background:#e5e7ea;margin:2.4em 0}
table{border-collapse:collapse}th,td{border-bottom:1px solid #e5e7ea;padding:.4em .8em;text-align:left}
@media print{main{padding:0}}</style></head><body><main>${body}</main></body></html>`;
}
exportSelect.addEventListener('change', async () => {
  flushRich();
  const kind = exportSelect.value;
  exportSelect.value = '';
  try {
    if (kind === 'md') download(new Blob([await withEmbeddedImages(writing.value)], {type: 'text/markdown;charset=utf-8'}), `${baseName()}.md`);
    if (kind === 'html') download(new Blob([await writingHTML()], {type: 'text/html;charset=utf-8'}), `${baseName()}.html`);
    if (kind === 'txt') download(new Blob([writing.value.replace(imagePattern, '](picture)')], {type: 'text/plain;charset=utf-8'}), `${baseName()}.txt`);
    if (kind === 'pdf') {
      const frame = Object.assign(document.createElement('iframe'), {title: 'Print'});
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
      document.body.append(frame);
      frame.srcdoc = await writingHTML();
      frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
    }
    if (kind) document.querySelector('#announcement').textContent = 'Export started';
  } catch { status.textContent = 'Could not export. Please try again.'; }
});

// ---------- Write / Board ----------
const modeButtons = document.querySelectorAll('.modes button');
const boardSection = document.querySelector('#board');
function setMode(mode) {
  document.body.dataset.mode = mode;
  modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  boardSection.hidden = mode !== 'board';
  try { localStorage.setItem('zen-mode', mode); } catch {}
  if (mode === 'board') board.open(); else focusEditor();
  if (mode === 'board' && document.body.classList.contains('menus-hidden')) setMenusHidden(false); // the board has its own hide button
}
modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelector('#board-hide').addEventListener('click', (e) => {
  const hidden = !document.body.classList.contains('board-clean');
  document.body.classList.toggle('board-clean', hidden);
  e.currentTarget.setAttribute('aria-pressed', String(hidden));
  e.currentTarget.title = hidden ? 'Show menus' : 'Hide menus';
});

// ---------- Endless whiteboard ----------
const board = (() => {
  const canvas = document.querySelector('#board-canvas');
  const ctx = canvas.getContext('2d');
  const layer = document.querySelector('#board-texts');
  const zoomLabel = document.querySelector('#board-zoom');
  const sizes = [['Fine', 2], ['Soft', 5], ['Bold', 12]];
  const shapes = ['rect', 'ellipse', 'triangle', 'line', 'arrow'];
  let items = [];
  let past = [];
  let future = [];
  let view = {x: 0, y: 0, z: 1};
  let tool = 'pen';
  let color = 'ink';
  let size = 0;
  let current = null;
  let selection = [];
  let marquee = null;
  let drag = null;
  let editing = null; // key of the text box being edited
  let loaded = false;
  let spaceHeld = false;
  let saveTimer;
  let frame;
  // Pointer handling. Once an Apple Pencil (or any stylus) is used, fingers and palms never draw:
  // one finger does nothing, two fingers pan and zoom, and touches are ignored while the pen is down.
  const touches = new Map();
  let activeId = null;
  let activeType = null;
  let lastTap = {};
  let penDown = null;
  let penSeen = false;
  try { penSeen = localStorage.getItem('zen-pen') === '1'; } catch {}
  let liveFrame = null;
  let pressureOn = true;
  try { pressureOn = localStorage.getItem('zen-pressure') !== 'off'; } catch {}
  const pressureButton = document.querySelector('#board-pressure');
  const showPressure = () => { pressureButton.setAttribute('aria-pressed', String(pressureOn)); pressureButton.title = `Pencil pressure: ${pressureOn ? 'on' : 'off'}`; };
  showPressure();
  pressureButton.addEventListener('click', () => {
    pressureOn = !pressureOn;
    try { localStorage.setItem('zen-pressure', pressureOn ? 'on' : 'off'); } catch {}
    showPressure();
    status.textContent = `Pencil pressure ${pressureOn ? 'on' : 'off'}`;
  });
  const bitmaps = new Map();
  const textNodes = new Map();
  let pinch = null;
  let panFrom = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => ({ink: css('--ink'), sage: css('--sage'), rose: css('--rose'), sky: css('--sky')});
  const toWorld = (sx, sy) => ({x: (sx - view.x) / view.z, y: (sy - view.y) / view.z});
  const kind = (it) => it.t || 's';
  const newKey = () => Math.random().toString(36).slice(2, 10);
  const isSelected = (it) => selection.includes(it);

  function bitmap(id) {
    if (bitmaps.has(id)) return bitmaps.get(id);
    const img = new Image();
    bitmaps.set(id, img);
    // Pictures are decoded in the background and drawn once ready, so adding photos never freezes the board.
    loadImage(id).then((url) => {
      img.src = url;
      const ready = () => { img.dataset.ready = '1'; redraw(); };
      if (img.decode) img.decode().then(ready, ready); else img.onload = ready;
    });
    return img;
  }
  const strokeBounds = new WeakMap();
  function bounds(it) {
    const k = kind(it);
    if (k === 's') {
      if (it !== current && strokeBounds.has(it)) return strokeBounds.get(it);
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (let i = 0; i < it.pts.length; i += 2) { a = Math.min(a, it.pts[i]); c = Math.max(c, it.pts[i]); b = Math.min(b, it.pts[i + 1]); d = Math.max(d, it.pts[i + 1]); }
      const pad = it.pr ? it.w * 1.75 : it.w;
      const box = {x: a - pad, y: b - pad, w: c - a + pad * 2, h: d - b + pad * 2};
      if (it !== current) strokeBounds.set(it, box);
      return box;
    }
    if (k === 'img') return {x: it.x, y: it.y, w: it.w, h: it.h};
    if (k === 'conn') {
      const g = connGeom(it);
      if (!g) return {x: 0, y: 0, w: 0, h: 0};
      const xs = g.samples.map((q) => q.x), ys = g.samples.map((q) => q.y);
      return {x: Math.min(...xs) - 6, y: Math.min(...ys) - 6, w: Math.max(...xs) - Math.min(...xs) + 12, h: Math.max(...ys) - Math.min(...ys) + 12};
    }
    if (k === 'text') return {x: it.x, y: it.y, w: it.w, h: it.h || 48};
    const pad = (it.w || 2) + 4;
    return {x: Math.min(it.x1, it.x2) - pad, y: Math.min(it.y1, it.y2) - pad, w: Math.abs(it.x2 - it.x1) + pad * 2, h: Math.abs(it.y2 - it.y1) + pad * 2};
  }
  // Connectors link two items by key and follow them when they move.
  const linkable = (it) => ['rect', 'ellipse', 'triangle', 'text', 'img'].includes(kind(it));
  const byKey = (k) => items.find((x) => x.k === k);
  function edgePoint(it, from) {
    const b = bounds(it), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const dx = from.x - cx, dy = from.y - cy;
    if (!dx && !dy) return {x: cx, y: cy};
    let t;
    if (kind(it) === 'ellipse') t = 1 / Math.hypot(dx / (b.w / 2 || 1), dy / (b.h / 2 || 1));
    else t = Math.min(Math.abs((b.w / 2) / (dx || 1e-9)), Math.abs((b.h / 2) / (dy || 1e-9)));
    const gap = 6 / Math.hypot(dx, dy);
    return {x: cx + dx * (t + gap), y: cy + dy * (t + gap)};
  }
  const centre = (it) => { const b = bounds(it); return {x: b.x + b.w / 2, y: b.y + b.h / 2}; };
  function connEnds(it, to) {
    const a = byKey(it.a), b = to ? null : byKey(it.b);
    if (!a || (!b && !to)) return null;
    const ca = centre(a), cb = b ? centre(b) : to;
    const p1 = edgePoint(a, cb), p2 = b ? edgePoint(b, ca) : to;
    return {x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y};
  }
  // Straight, curved or elbow paths between two items.
  function connGeom(it, to) {
    const a = byKey(it.a), b = to ? null : byKey(it.b);
    if (!a || (!b && !to)) return null;
    const route = it.route || 'straight';
    if (route === 'straight') {
      const e = connEnds(it, to);
      return {route, p1: {x: e.x1, y: e.y1}, p2: {x: e.x2, y: e.y2}, samples: [{x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}], ang: Math.atan2(e.y2 - e.y1, e.x2 - e.x1)};
    }
    const ba = bounds(a), bb = b ? bounds(b) : {x: to.x, y: to.y, w: 0, h: 0};
    const ca = {x: ba.x + ba.w / 2, y: ba.y + ba.h / 2}, cb = {x: bb.x + bb.w / 2, y: bb.y + bb.h / 2};
    const horiz = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y), g = 6, gb = b ? g : 0;
    const sx = Math.sign(cb.x - ca.x) || 1, sy = Math.sign(cb.y - ca.y) || 1;
    const p1 = horiz ? {x: ca.x + sx * (ba.w / 2 + g), y: ca.y} : {x: ca.x, y: ca.y + sy * (ba.h / 2 + g)};
    const p2 = horiz ? {x: cb.x - sx * (bb.w / 2 + gb), y: cb.y} : {x: cb.x, y: cb.y - sy * (bb.h / 2 + gb)};
    if (route === 'elbow') {
      const m = horiz ? (p1.x + p2.x) / 2 : (p1.y + p2.y) / 2;
      const pts = horiz ? [p1, {x: m, y: p1.y}, {x: m, y: p2.y}, p2] : [p1, {x: p1.x, y: m}, {x: p2.x, y: m}, p2];
      const last = pts[2].x === p2.x && pts[2].y === p2.y ? pts[1] : pts[2];
      return {route, p1, p2, pts, samples: pts, ang: Math.atan2(p2.y - last.y, p2.x - last.x) || (horiz ? (sx > 0 ? 0 : Math.PI) : sy * Math.PI / 2)};
    }
    const k = horiz ? (p2.x - p1.x) / 2 : (p2.y - p1.y) / 2;
    const c1 = horiz ? {x: p1.x + k, y: p1.y} : {x: p1.x, y: p1.y + k};
    const c2 = horiz ? {x: p2.x - k, y: p2.y} : {x: p2.x, y: p2.y - k};
    const samples = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      samples.push({x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x, y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y});
    }
    const prev = samples[22];
    return {route, p1, p2, c1, c2, samples, ang: Math.atan2(p2.y - prev.y, p2.x - prev.x)};
  }
  function arrowHead(g, w) {
    const head = Math.max(12, w * 4);
    return [[g.p2.x - head * Math.cos(g.ang - .45), g.p2.y - head * Math.sin(g.ang - .45)], [g.p2.x - head * Math.cos(g.ang + .45), g.p2.y - head * Math.sin(g.ang + .45)]];
  }
  function connSVGPath(g, w) {
    let d = `M${g.p1.x} ${g.p1.y}`;
    if (g.route === 'curve') d += `C${g.c1.x} ${g.c1.y} ${g.c2.x} ${g.c2.y} ${g.p2.x} ${g.p2.y}`;
    else if (g.route === 'elbow') d += g.pts.slice(1).map((q) => `L${q.x} ${q.y}`).join('');
    else d += `L${g.p2.x} ${g.p2.y}`;
    const [h1, h2] = arrowHead(g, w);
    return `${d}M${g.p2.x} ${g.p2.y}L${h1[0]} ${h1[1]}M${g.p2.x} ${g.p2.y}L${h2[0]} ${h2[1]}`;
  }
  const pruneConnectors = (list) => {
    const keys = new Set(list.filter((x) => x.k).map((x) => x.k));
    return list.filter((x) => kind(x) !== 'conn' || (keys.has(x.a) && keys.has(x.b)));
  };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    draw();
  }
  // Pencil pressure (0–1) scales the line: a light touch is thin, a firm one about twice the base width.
  const pressureWidth = (w, pr) => w * (.25 + 1.5 * Math.min(1, Math.max(0, pr)));
  // Draws a pressure stroke segment by segment, using the same midpoint curves as plain strokes.
  // `from`/`start` let the live renderer continue where it stopped; returns the new position.
  function drawPressure(c, it, from, start, finish = !start) {
    const p = it.pts, pr = it.pr, n = p.length / 2;
    if (n === 1) {
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(p[0], p[1], pressureWidth(it.w, pr[0]) / 2, 0, Math.PI * 2);
      c.fill();
      return {j: 1, x: p[0], y: p[1]};
    }
    let j = Math.max(1, from), x = start ? start.x : p[0], y = start ? start.y : p[1], width = null;
    for (; j < n - 1; j++) {
      const mx = (p[j * 2] + p[j * 2 + 2]) / 2, my = (p[j * 2 + 1] + p[j * 2 + 3]) / 2;
      // Widths are rounded to quarter pixels so neighbouring segments share one path (far fewer draw calls).
      const next = Math.round(pressureWidth(it.w, (pr[j - 1] + pr[j]) / 2) * 4) / 4;
      if (next !== width) {
        if (width !== null) c.stroke();
        width = next;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(x, y);
      }
      c.quadraticCurveTo(p[j * 2], p[j * 2 + 1], mx, my);
      x = mx; y = my;
    }
    if (width !== null) c.stroke();
    if (finish) { // finished stroke: close with the last point
      c.lineWidth = pressureWidth(it.w, pr[n - 1]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
      c.stroke();
    }
    return {j, x, y};
  }
  function drawItem(c, it, colors) {
    const k = kind(it);
    if (k === 'text') return; // drawn as live HTML on top of the canvas
    if (k === 'conn') {
      const g = connGeom(it, it.to);
      if (!g) return;
      c.strokeStyle = colors[it.c] || colors.ink;
      c.lineWidth = it.w;
      c.beginPath();
      c.moveTo(g.p1.x, g.p1.y);
      if (g.route === 'curve') c.bezierCurveTo(g.c1.x, g.c1.y, g.c2.x, g.c2.y, g.p2.x, g.p2.y);
      else if (g.route === 'elbow') {
        for (let i = 1; i < g.pts.length - 1; i++) c.arcTo(g.pts[i].x, g.pts[i].y, g.pts[i + 1].x, g.pts[i + 1].y, Math.min(10, Math.hypot(g.pts[i + 1].x - g.pts[i].x, g.pts[i + 1].y - g.pts[i].y) / 2, Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y) / 2));
        c.lineTo(g.p2.x, g.p2.y);
      } else c.lineTo(g.p2.x, g.p2.y);
      const [h1, h2] = arrowHead(g, it.w);
      c.moveTo(g.p2.x, g.p2.y); c.lineTo(...h1);
      c.moveTo(g.p2.x, g.p2.y); c.lineTo(...h2);
      c.stroke();
      return;
    }
    if (k === 'img') {
      const img = bitmap(it.id);
      if (img.dataset.ready && img.naturalWidth) c.drawImage(img, it.x, it.y, it.w, it.h);
      else { c.fillStyle = css('--grid'); c.fillRect(it.x, it.y, it.w, it.h); }
      return;
    }
    c.strokeStyle = colors[it.c] || colors.ink;
    c.lineWidth = it.w;
    if (k === 's' && it.pr) { drawPressure(c, it, 0, null); return; }
    c.beginPath();
    if (k === 's') {
      const p = it.pts;
      c.moveTo(p[0], p[1]);
      if (p.length === 2) c.lineTo(p[0] + .01, p[1]);
      for (let i = 2; i < p.length - 2; i += 2) c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      if (p.length > 2) c.lineTo(p[p.length - 2], p[p.length - 1]);
    } else {
      const {x1, y1, x2, y2} = it;
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      if (k === 'rect') c.roundRect ? c.roundRect(x, y, w, h, 4) : c.rect(x, y, w, h);
      if (k === 'ellipse') c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (k === 'triangle') { c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); }
      if (k === 'line' || k === 'arrow') { c.moveTo(x1, y1); c.lineTo(x2, y2); }
      if (k === 'arrow') {
        const ang = Math.atan2(y2 - y1, x2 - x1), head = Math.max(12, it.w * 4);
        c.moveTo(x2, y2); c.lineTo(x2 - head * Math.cos(ang - .45), y2 - head * Math.sin(ang - .45));
        c.moveTo(x2, y2); c.lineTo(x2 - head * Math.cos(ang + .45), y2 - head * Math.sin(ang + .45));
      }
    }
    c.stroke();
  }

  // Markdown text boxes live in an HTML layer that pans and zooms with the canvas.
  function syncTexts() {
    layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const colors = palette();
    const seen = new Set();
    for (const it of items) {
      if (kind(it) !== 'text') continue;
      seen.add(it.k);
      let node = textNodes.get(it.k);
      if (!node) { node = document.createElement('div'); node.className = 'board-text md'; layer.append(node); textNodes.set(it.k, node); }
      node.style.left = `${it.x}px`;
      node.style.top = `${it.y}px`;
      node.style.width = `${it.w}px`;
      node.classList.toggle('note', Boolean(it.note));
      node.style.color = it.note ? '' : colors[it.c] || colors.ink;
      node.style.setProperty('--note', it.note ? css(`--note-${it.c}`) || css('--note-ink') : '');
      node.classList.toggle('selected', isSelected(it));
      if (editing === it.k) continue;
      if (node.dataset.md !== it.md || node.querySelector('textarea')) {
        node.dataset.md = it.md;
        node.innerHTML = markdownToHTML(it.md) ?? escapeHTML(it.md);
      }
      it.h = node.offsetHeight;
    }
    for (const [k, node] of textNodes) if (!seen.has(k)) { node.remove(); textNodes.delete(k); }
  }
  function editText(it) {
    if (editing) finishEditing();
    editing = it.k;
    selection = [];
    syncTexts();
    const node = textNodes.get(it.k);
    node.classList.add('editing');
    const area = document.createElement('textarea');
    area.value = it.md;
    area.placeholder = it.note ? 'Note…' : 'Markdown or $math$…';
    area.spellcheck = true;
    node.replaceChildren(area);
    const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; };
    area.addEventListener('input', fit);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finishEditing(); }
      e.stopPropagation();
    });
    area.addEventListener('blur', () => finishEditing());
    requestAnimationFrame(() => { fit(); area.focus(); });
  }
  function finishEditing() {
    const key = editing;
    if (!key) return;
    editing = null;
    const node = textNodes.get(key);
    const md = node?.querySelector('textarea')?.value ?? '';
    node?.classList.remove('editing');
    const it = items.find((x) => x.k === key);
    if (!it) return;
    if (!md.trim() && it.md === '') { items = items.filter((x) => x !== it); past.pop(); persist(); redraw(); }
    else if (!md.trim()) commit(items.filter((x) => x !== it));
    else if (md !== it.md) commit(items.map((x) => (x === it ? {...it, md} : x)));
    else redraw();
  }

  function draw() {
    frame = null;
    snapView = null;
    clearTimeout(settleTimer);
    const drawStart = debugOn ? performance.now() : 0;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let gap = 32 * view.z;
    while (gap < 16) gap *= 2;
    while (gap > 64) gap /= 2;
    ctx.fillStyle = css('--grid');
    const ox = (view.x * dpr) % (gap * dpr), oy = (view.y * dpr) % (gap * dpr);
    for (let x = ox; x < w; x += gap * dpr) for (let y = oy; y < h; y += gap * dpr) ctx.fillRect(x, y, dpr * 1.2, dpr * 1.2);
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const colors = palette();
    // Only items that overlap the visible area (plus a margin) are drawn.
    const m = 40 / view.z, left = -view.x / view.z - m, top = -view.y / view.z - m;
    const right = (canvas.clientWidth - view.x) / view.z + m, bottom = (canvas.clientHeight - view.y) / view.z + m;
    const visible = (it) => { const b = bounds(it); return b.x < right && b.x + b.w > left && b.y < bottom && b.y + b.h > top; };
    let drawn = 0;
    for (const it of items) if (kind(it) === 'conn') drawItem(ctx, it, colors);
    for (const it of items) if (kind(it) !== 'conn' && kind(it) !== 'text' && visible(it)) { drawItem(ctx, it, colors); drawn++; }
    shownView = {...view};
    if (current) {
      drawItem(ctx, current, colors);
      if (current.pts) { const n = current.pts.length; current.mid = {x: current.pts[n - 2], y: current.pts[n - 1]}; current.next = current.pr ? n - 2 : n; }
    }
    if (current?.t === 'conn' && current.hover) {
      const b = bounds(current.hover), m = 6 / view.z;
      ctx.save(); ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2 / view.z; ctx.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2); ctx.restore();
    }
    syncTexts();
    ctx.save();
    ctx.strokeStyle = css('--accent');
    ctx.lineWidth = 1.2 / view.z;
    ctx.setLineDash([5 / view.z, 4 / view.z]);
    for (const it of selection) {
      const b = bounds(it), m = 4 / view.z;
      ctx.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
    }
    if (selection.length === 1 && ['img', 'text'].includes(kind(selection[0]))) {
      const b = bounds(selection[0]), r = 6 / view.z;
      ctx.setLineDash([]);
      ctx.fillStyle = css('--accent');
      ctx.fillRect(b.x + b.w - r, b.y + b.h - r, r * 2, r * 2);
    }
    if (marquee) {
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(127,149,144,.08)';
      const x = Math.min(marquee.x1, marquee.x2), y = Math.min(marquee.y1, marquee.y2);
      ctx.fillRect(x, y, Math.abs(marquee.x2 - marquee.x1), Math.abs(marquee.y2 - marquee.y1));
      ctx.strokeRect(x, y, Math.abs(marquee.x2 - marquee.x1), Math.abs(marquee.y2 - marquee.y1));
    }
    ctx.restore();
    zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
    updateButtons();
    if (debugOn) { dbg('board: redraw ms', Math.round(performance.now() - drawStart)); dbg('board: items', `${items.length} (${drawn} on screen)`); }
  }
  const redraw = () => { frame ??= requestAnimationFrame(draw); };
  let shownView = null, snapView = null, snapCanvas = null, moveFrame = null, settleTimer = null;
  function moveView() {
    if (!shownView || frame) { redraw(); return; }
    if (!snapView) {
      snapCanvas ??= document.createElement('canvas');
      snapCanvas.width = canvas.width;
      snapCanvas.height = canvas.height;
      snapCanvas.getContext('2d').drawImage(canvas, 0, 0);
      snapView = shownView;
    }
    moveFrame ??= requestAnimationFrame(() => {
      moveFrame = null;
      if (!snapView) return;
      const dpr = window.devicePixelRatio || 1, k = view.z / snapView.z;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(snapCanvas, (view.x - snapView.x * k) * dpr, (view.y - snapView.y * k) * dpr, snapCanvas.width * k, snapCanvas.height * k);
      layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
      zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
    });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(redraw, 140);
  }
  // A finished freehand stroke is already on screen from live drawing; only its last bit is added.
  function finishStroke(stroke, mid, next) {
    const dpr = window.devicePixelRatio || 1, p = stroke.pts;
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette()[stroke.c] || palette().ink;
    if (stroke.pr) { drawPressure(ctx, stroke, next / 2, mid, true); return; }
    ctx.lineWidth = stroke.w;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    let i = next;
    for (; i + 2 < p.length; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  // While a freehand stroke is in progress, only its new segments are drawn (no full repaint),
  // using the same midpoint curves as the final drawing so nothing shifts when the pen lifts.
  function drawLive() {
    liveFrame = null;
    if (frame || !current?.pts || current.mid == null) return;
    const dpr = window.devicePixelRatio || 1, p = current.pts;
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette()[current.c] || palette().ink;
    if (current.pr) {
      const r = drawPressure(ctx, current, current.next / 2, current.mid);
      current.next = r.j * 2;
      current.mid = {x: r.x, y: r.y};
      return;
    }
    ctx.lineWidth = current.w;
    ctx.beginPath();
    ctx.moveTo(current.mid.x, current.mid.y);
    let i = current.next;
    if (i + 2 >= p.length) return;
    while (i + 2 < p.length) {
      const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
      current.mid = {x: mx, y: my};
      i += 2;
    }
    current.next = i;
    ctx.stroke();
  }
  const redrawLive = () => { liveFrame ??= requestAnimationFrame(drawLive); };
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idb('board', 'readwrite', (s) => s.put({items, view}, 'main')).catch(() => {
      status.textContent = 'The board could not be saved on this device';
    }), 400);
  }
  function commit(next, silent = false, live = null) {
    next = pruneConnectors(next);
    if (!silent) { past.push(items); if (past.length > 100) past.shift(); future = []; }
    items = next;
    selection = selection.map((s) => items.find((x) => x === s || (s.k && x.k === s.k))).filter(Boolean);
    persist();
    if (live && !frame && !snapView && !selection.length && live.mid) {
      finishStroke(live.stroke, live.mid, live.next);
      updateButtons();
      dbg('board: items', items.length);
    } else redraw();
  }
  function undo() { finishEditing(); if (!past.length) return; future.push(items); items = past.pop(); selection = []; persist(); redraw(); }
  function redo() { finishEditing(); if (!future.length) return; past.push(items); items = future.pop(); selection = []; persist(); redraw(); }
  function updateButtons() {
    document.querySelector('#board-undo').disabled = !past.length;
    document.querySelector('#board-redo').disabled = !future.length;
  }
  function zoomAt(sx, sy, factor) {
    const z = Math.min(8, Math.max(.05, view.z * factor));
    const k = z / view.z;
    view = {x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k, z};
    persist();
    moveView();
  }
  function hitTest(p) {
    const r = 8 / view.z;
    for (let i = items.length - 1; i >= 0; i--) {
      let it = items[i];
      const k = kind(it);
      if (k === 's') {
        const b = bounds(it); // cheap box check first; most strokes are nowhere near the pen
        if (p.x < b.x - r || p.x > b.x + b.w + r || p.y < b.y - r || p.y > b.y + b.h + r) continue;
        for (let j = 0; j < it.pts.length; j += 2) if (Math.hypot(it.pts[j] - p.x, it.pts[j + 1] - p.y) < r + it.w / 2) return it;
      } else if (k === 'conn') {
        const g = connGeom(it);
        if (!g) continue;
        for (let j = 1; j < g.samples.length; j++) {
          const a = g.samples[j - 1], b = g.samples[j], dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
          if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < r + it.w) return it;
        }
      } else if (k === 'line' || k === 'arrow') {
        const dx = it.x2 - it.x1, dy = it.y2 - it.y1, len = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - it.x1) * dx + (p.y - it.y1) * dy) / len));
        if (Math.hypot(it.x1 + t * dx - p.x, it.y1 + t * dy - p.y) < r + it.w) return it._src || it;
      } else {
        const b = bounds(it);
        if (p.x >= b.x - r && p.x <= b.x + b.w + r && p.y >= b.y - r && p.y <= b.y + b.h + r) return it;
      }
    }
    return null;
  }
  function moved(it, dx, dy) {
    const k = kind(it);
    if (k === 'conn') return it;
    if (k === 's') return {...it, pts: it.pts.map((v, i) => +(v + (i % 2 ? dy : dx)).toFixed(1))};
    if (k === 'img' || k === 'text') return {...it, x: it.x + dx, y: it.y + dy};
    return {...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy};
  }
  function onHandle(p) {
    if (selection.length !== 1 || !['img', 'text'].includes(kind(selection[0]))) return false;
    const b = bounds(selection[0]);
    return Math.hypot(p.x - (b.x + b.w), p.y - (b.y + b.h)) < 14 / view.z;
  }
  const local = (e) => { const r = canvas.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };

  function startPinch() {
    const [a, b] = [...touches.values()];
    pinch = {d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2};
  }
  function cancelGesture() {
    if (activeId == null) return;
    activeId = null;
    current = null; drag = null; marquee = null; panFrom = null;
    redraw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') {
      if (!penSeen) { penSeen = true; dbg('pen mode', 'on'); try { localStorage.setItem('zen-pen', '1'); } catch {} }
      touches.clear();
      pinch = null;
      // A palm that got there first is discarded; an earlier pen stroke whose lift-off Safari
      // has not reported yet is kept and finished, never thrown away.
      if (activeId != null) {
        if (activeType === 'touch') { dbg('palm strokes discarded'); cancelGesture(); }
        else { dbg('strokes finished late'); end({pointerId: activeId}); }
      }
      penDown = e.pointerId;
    } else if (e.pointerType === 'mouse' && activeId != null) {
      end({pointerId: activeId});
    } else if (e.pointerType === 'touch') {
      if (penDown != null) { dbg('palm touches ignored'); return; } // palm while writing
      touches.set(e.pointerId, local(e));
      if (touches.size === 2) { cancelGesture(); startPinch(); return; }
      if (touches.size > 2) return;
      if (penSeen) { dbg('finger touches ignored'); return; } // with a stylus, one finger never draws
    }
    if (activeId != null) return;
    finishEditing();
    activeId = e.pointerId;
    activeType = e.pointerType;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    const s = local(e);
    if (tool === 'hand' || spaceHeld || e.button === 1) { panFrom = s; canvas.classList.add('grabbing'); return; }
    if (e.button !== 0) return;
    const p = toWorld(s.x, s.y);
    if (tool === 'eraser') { const hit = hitTest(p); if (hit) commit(items.filter((x) => x !== hit)); return; }
    if (tool === 'text' || tool === 'note') {
      const hit = hitTest(p);
      if (hit && kind(hit) === 'text') { editText(hit); return; }
      const it = tool === 'note'
        ? {t: 'text', note: true, k: newKey(), x: p.x - 110, y: p.y - 40, w: 220, md: '', c: color}
        : {t: 'text', k: newKey(), x: p.x, y: p.y - 14, w: 340, md: '', c: color};
      commit([...items, it]);
      editText(it);
      return;
    }
    if (tool === 'select') {
      if (onHandle(p)) { drag = {mode: 'resize', start: p, orig: selection[0], before: items}; return; }
      const hit = hitTest(p);
      // Double-tap a text box or note to edit it (touch screens get no dblclick here).
      if (hit && kind(hit) === 'text' && lastTap.k === hit.k && e.timeStamp - lastTap.t < 400) { lastTap = {}; activeId = null; editText(hit); return; }
      lastTap = hit ? {k: hit.k, t: e.timeStamp} : {};
      if (hit) {
        if (e.shiftKey) selection = isSelected(hit) ? selection.filter((x) => x !== hit) : [...selection, hit];
        else if (!isSelected(hit)) selection = [hit];
        drag = {mode: 'move', start: p, origs: [...selection], before: items, moved: false};
      } else {
        if (!e.shiftKey) selection = [];
        marquee = {x1: p.x, y1: p.y, x2: p.x, y2: p.y, base: [...selection]};
      }
      redraw();
      return;
    }
    selection = [];
    if (tool === 'connect') {
      const from = [...items].reverse().find((it) => linkable(it) && hitTest(p) === it) || items.slice().reverse().find((it) => { if (!linkable(it)) return false; const b = bounds(it); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
      if (!from) { status.textContent = 'Start a connector on a shape, note, text or picture'; return; }
      current = {t: 'conn', k: newKey(), a: from.k, c: color, w: sizes[size][1], route: connRoute, to: p};
      redraw();
      return;
    }
    if (shapes.includes(tool)) current = {t: tool, k: newKey(), c: color, w: sizes[size][1], x1: p.x, y1: p.y, x2: p.x, y2: p.y};
    else {
      current = {c: color, w: sizes[size][1], pts: [+p.x.toFixed(2), +p.y.toFixed(2)]};
      if (e.pointerType === 'pen' && pressureOn && e.pressure > 0) current.pr = [+e.pressure.toFixed(3)];
    }
    redraw();
  });
  canvas.addEventListener('dblclick', (e) => {
    const s = local(e), hit = hitTest(toWorld(s.x, s.y));
    if (hit && kind(hit) === 'text') editText(hit);
    else if (tool === 'select' && !hit) { setTool('text'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, local(e));
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      view.x += cx - pinch.cx;
      view.y += cy - pinch.cy;
        zoomAt(cx, cy, d / pinch.d);
        pinch = {d, cx, cy};
        return;
      }
    }
    if (e.pointerId !== activeId) {
      if (activeId == null && tool === 'select') canvas.style.cursor = onHandle(toWorld(local(e).x, local(e).y)) ? 'nwse-resize' : '';
      return;
    }
    const s = local(e);
    if (panFrom) { view.x += s.x - panFrom.x; view.y += s.y - panFrom.y; panFrom = s; persist(); moveView(); return; }
    const p = toWorld(s.x, s.y);
    if (tool === 'eraser' && e.buttons & 1) { const hit = hitTest(p); if (hit) commit(items.filter((x) => x !== hit)); return; }
    if (marquee) {
      marquee.x2 = p.x; marquee.y2 = p.y;
      const x1 = Math.min(marquee.x1, marquee.x2), x2 = Math.max(marquee.x1, marquee.x2);
      const y1 = Math.min(marquee.y1, marquee.y2), y2 = Math.max(marquee.y1, marquee.y2);
      const inside = items.filter((it) => { const b = bounds(it); return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1; });
      selection = [...new Set([...marquee.base, ...inside])];
      redraw();
      return;
    }
    if (drag) {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (drag.mode === 'move') {
        drag.moved = true;
        const map = new Map(drag.origs.map((o) => [o, moved(o, dx, dy)]));
        items = drag.before.map((x) => map.get(x) || x);
        selection = [...map.values()];
      } else {
        const o = drag.orig;
        const w = Math.max(kind(o) === 'text' ? (o.note ? 140 : 120) : 24, o.w + dx);
        const next = kind(o) === 'img' ? {...o, w, h: w * (o.h / o.w)} : {...o, w};
        items = drag.before.map((x) => (x === o ? next : x));
        selection = [next];
        drag.moved = true;
      }
      redraw();
      return;
    }
    if (!current) return;
    if (current.t === 'conn') {
      const over = items.slice().reverse().find((it) => { if (!linkable(it) || it.k === current.a) return false; const b = bounds(it); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
      current.hover = over || null;
      current.to = over ? centre(over) : p;
      redraw();
      return;
    }
    if (current.t) {
      current.x2 = p.x; current.y2 = p.y;
      if (e.shiftKey && current.t !== 'line' && current.t !== 'arrow') {
        const d = Math.max(Math.abs(p.x - current.x1), Math.abs(p.y - current.y1));
        current.x2 = current.x1 + Math.sign(p.x - current.x1 || 1) * d;
        current.y2 = current.y1 + Math.sign(p.y - current.y1 || 1) * d;
      }
      redraw();
      return;
    }
    const coalesced = e.getCoalescedEvents?.() || [];
    const r = canvas.getBoundingClientRect();
    for (const ev of coalesced.length ? coalesced : [e]) {
      const q = toWorld(ev.clientX - r.left, ev.clientY - r.top);
      const n = current.pts.length;
      if (Math.hypot(q.x - current.pts[n - 2], q.y - current.pts[n - 1]) > .35 / view.z) {
        current.pts.push(+q.x.toFixed(2), +q.y.toFixed(2));
        if (current.pr) {
          const last = current.pr[current.pr.length - 1], raw = ev.pressure > 0 ? ev.pressure : last;
          current.pr.push(+(last + (raw - last) * .45).toFixed(3));
        }
      }
    }
    redrawLive();
  });
  function end(e) {
    if (touches.delete(e.pointerId) && touches.size < 2) pinch = null;
    if (e.pointerId === penDown) penDown = null;
    if (e.pointerId !== activeId) return;
    if (e.target && e.target !== canvas && e.type === 'pointerup') dbg('lift-offs outside board');
    activeId = null;
    if (panFrom) { panFrom = null; canvas.classList.remove('grabbing'); }
    if (marquee) { marquee = null; redraw(); }
    if (drag) {
      if (drag.moved) { past.push(drag.before); future = []; persist(); }
      drag = null;
      redraw();
    }
    if (current) {
      const s = current; current = null;
      if (s.t === 'conn') {
        const exists = items.some((x) => kind(x) === 'conn' && ((x.a === s.a && x.b === s.hover?.k) || (x.b === s.a && x.a === s.hover?.k)));
        if (s.hover && !exists) commit([...items, {t: 'conn', k: s.k, a: s.a, b: s.hover.k, c: s.c, w: s.w, route: s.route}]);
        redraw();
        return;
      }
      if (s.t && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3) { redraw(); return; }
      dbg(s.pts ? 'strokes saved' : 'shapes saved');
      const {mid, next, ...saved} = s;
      commit([...items, saved], false, s.pts ? {stroke: saved, mid, next} : null);
    }
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  // Safety nets so a lift-off is never missed (end() ignores pointers it isn't tracking).
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === activeId) { dbg('capture lost mid-stroke'); end(e); } });
  // iPad Scribble (handwriting-to-text) and Safari's touch gestures can swallow Apple Pencil
  // input on web pages; claiming the touches on the board keeps every stroke for drawing.
  ['touchstart', 'touchmove', 'touchend'].forEach((type) => canvas.addEventListener(type, (e) => {
    if (e.cancelable) { e.preventDefault(); dbg('touch events blocked'); }
  }, {passive: false}));
  if (debugOn) {
    dbg('pen mode', penSeen ? 'on' : 'off until the Pencil draws once');
    let moves = 0, since = performance.now();
    canvas.addEventListener('pointerdown', (e) => dbg(`${e.pointerType} down`), true);
    canvas.addEventListener('pointerup', (e) => dbg(`${e.pointerType} up`), true);
    canvas.addEventListener('pointercancel', (e) => dbg(`${e.pointerType} cancel`), true);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'pen' || e.pointerId !== activeId) return;
      moves++;
      dbg('points per move', e.getCoalescedEvents?.().length || 1);
      dbg('pressure', e.pressure.toFixed(2));
      const now = performance.now();
      if (now - since >= 1000) { dbg('pen moves/s', Math.round(moves * 1000 / (now - since))); moves = 0; since = now; }
    }, true);
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = local(e);
    if (e.ctrlKey || e.metaKey) zoomAt(s.x, s.y, Math.exp(-e.deltaY * .01));
    else { view.x -= e.deltaX; view.y -= e.deltaY; persist(); moveView(); }
  }, {passive: false});

  // Pictures on the board.
  async function addImages(files, at) {
    const list = [...files].filter(isImage);
    if (!list.length) return;
    status.textContent = 'Adding picture…';
    const added = [];
    const centre = at || toWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    for (const [i, file] of list.entries()) {
      try {
        const id = await storeImage(await shrink(file));
        const img = bitmap(id);
        await new Promise((r) => { if (img.complete && img.naturalWidth) r(); else { img.addEventListener('load', r, {once: true}); img.addEventListener('error', r, {once: true}); } });
        const nw = img.naturalWidth || 400, nh = img.naturalHeight || 300;
        const scale = Math.min(1, 420 / view.z / Math.max(nw, nh));
        added.push({t: 'img', k: newKey(), id, x: centre.x - nw * scale / 2 + i * 24 / view.z, y: centre.y - nh * scale / 2 + i * 24 / view.z, w: nw * scale, h: nh * scale});
      } catch {}
    }
    if (!added.length) { status.textContent = 'Could not add this picture'; return; }
    setTool('select');
    commit([...items, ...added]);
    selection = [added[added.length - 1]];
    redraw();
    status.textContent = 'Picture added — drag to move, corner to resize';
  }
  document.querySelector('#board-image').addEventListener('click', () => document.querySelector('#board-image-file').click());
  document.querySelector('#board-image-file').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => { e.preventDefault(); const s = local(e); addImages(e.dataTransfer.files, toWorld(s.x, s.y)); });

  // Copy, paste and duplicate within the board.
  let clipboard = [];
  const cloneItems = (list, offset) => {
    const keys = new Map(list.filter((it) => it.k).map((it) => [it.k, newKey()]));
    return list
      .filter((it) => kind(it) !== 'conn' || (keys.has(it.a) && keys.has(it.b)))
      .map((it) => ({...moved(it, offset, offset), ...(it.k ? {k: keys.get(it.k)} : {}), ...(kind(it) === 'conn' ? {a: keys.get(it.a), b: keys.get(it.b)} : {})}));
  };
  function pasteItems(list) {
    const copies = cloneItems(list, 24 / view.z);
    commit([...items, ...copies]);
    selection = copies;
    clipboard = copies;
    redraw();
  }
  document.addEventListener('paste', (e) => {
    if (document.body.dataset.mode !== 'board' || editing || e.target.closest('input, textarea, select')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.some(isImage)) { e.preventDefault(); addImages(files); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text && !clipboard.length) {
      e.preventDefault();
      const p = toWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
      commit([...items, {t: 'text', k: newKey(), x: p.x - 170, y: p.y, w: 340, md: text, c: color}]);
    } else if (clipboard.length) { e.preventDefault(); pasteItems(clipboard); }
  });

  function setTool(t) {
    finishEditing();
    tool = t;
    if (t !== 'select') selection = [];
    document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    canvas.dataset.tool = t;
    canvas.style.cursor = '';
    redraw();
  }
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    document.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const recolor = selection.filter((it) => kind(it) !== 'img');
    if (recolor.length) {
      const map = new Map(recolor.map((it) => [it, {...it, c: color}]));
      commit(items.map((x) => map.get(x) || x));
      selection = selection.map((x) => map.get(x) || x);
      redraw();
    } else if (['eraser', 'hand', 'select'].includes(tool)) setTool('pen');
  }));
  const routes = [['straight', 'Straight'], ['curve', 'Curved'], ['elbow', 'Elbow']];
  let connRoute = 'straight';
  try { const r = localStorage.getItem('zen-conn-route'); if (routes.some(([v]) => v === r)) connRoute = r; } catch {}
  const routeButton = document.querySelector('#conn-route');
  const showRoute = () => { routeButton.textContent = routes.find(([v]) => v === connRoute)[1]; routeButton.dataset.route = connRoute; };
  showRoute();
  routeButton.addEventListener('click', () => {
    const conns = selection.filter((it) => kind(it) === 'conn');
    connRoute = routes[(routes.findIndex(([v]) => v === connRoute) + 1) % routes.length][0];
    try { localStorage.setItem('zen-conn-route', connRoute); } catch {}
    showRoute();
    if (conns.length) {
      const map = new Map(conns.map((it) => [it, {...it, route: connRoute}]));
      commit(items.map((x) => map.get(x) || x));
      selection = selection.map((x) => map.get(x) || x);
      redraw();
    } else if (tool !== 'connect') setTool('connect');
  });
  document.querySelector('#board-size').addEventListener('click', (e) => { size = (size + 1) % sizes.length; e.currentTarget.textContent = sizes[size][0]; });
  document.querySelector('#board-undo').addEventListener('click', undo);
  document.querySelector('#board-redo').addEventListener('click', redo);
  document.querySelector('#board-home').addEventListener('click', () => { view = {x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, z: 1}; persist(); redraw(); });
  document.querySelector('#board-clear').addEventListener('click', () => {
    if (items.length && window.confirm('Clear the whole board? You can undo this.')) { selection = []; commit([]); }
  });
  function deleteSelection() {
    if (!selection.length) return;
    const gone = new Set(selection);
    selection = [];
    commit(items.filter((x) => !gone.has(x)));
  }
  document.querySelector('#board-delete').addEventListener('click', deleteSelection);

  // Export the board.
  function extent() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) { const b = bounds(it); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
    const pad = 40;
    return {x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2};
  }
  async function readyImages() {
    await Promise.all(items.filter((it) => kind(it) === 'img').map((it) => new Promise((r) => {
      const img = bitmap(it.id);
      const started = performance.now();
      const check = () => (img.dataset.ready || performance.now() - started > 3000 ? r() : setTimeout(check, 50));
      check();
    })));
  }
  // Text boxes are exported as XHTML inside SVG (equations use the browser's own MathML).
  function textXHTML(it) {
    const div = document.createElement('div');
    div.innerHTML = markdownToHTML(it.md) ?? escapeHTML(it.md);
    const inner = new XMLSerializer().serializeToString(div).replace(/^<div[^>]*>|<\/div>$/g, '');
    const col = it.note ? css('--note-text') : palette()[it.c] || palette().ink;
    const note = it.note ? `background:${escapeHTML(css(`--note-${it.c}`) || css('--note-ink'))};padding:16px 18px;border-radius:4px 4px 14px 4px;min-height:150px;box-sizing:border-box;font-size:18px;` : '';
    return `<div xmlns="http://www.w3.org/1999/xhtml" style="font:20px/1.6 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;color:${escapeHTML(col)};width:${it.w}px;${note}"><style>.katex-html{display:none}p,h1,h2,h3,ul,ol,pre,blockquote{margin:0 0 .5em}h1,h2,h3{font-weight:400}code{font-family:monospace}img{max-width:100%}</style>${inner}</div>`;
  }
  const textSVG = (it) => `<foreignObject x="${it.x}" y="${it.y}" width="${it.w}" height="${(it.h || 48) + 8}">${textXHTML(it)}</foreignObject>`;
  function wrapText(c, it, colors) {
    let y = it.y + 22;
    if (it.note) {
      c.fillStyle = css(`--note-${it.c}`) || css('--note-ink');
      c.fillRect(it.x, it.y, it.w, it.h || 150);
      it = {...it, x: it.x + 18, w: it.w - 36};
      y += 16;
    }
    c.fillStyle = it.note ? css('--note-text') : colors[it.c] || colors.ink;
    c.font = "20px 'Iowan Old Style', Palatino, Georgia, serif";
    for (const para of it.md.replace(/[#*`>$_]/g, '').split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (c.measureText(test).width > it.w && line) { c.fillText(line, it.x, y); y += 32; line = word; } else line = test;
      }
      c.fillText(line, it.x, y); y += 32;
    }
  }
  async function toCanvas(richText = true) {
    await readyImages();
    const e = extent(), scale = Math.min(2, 8000 / Math.max(e.w, e.h));
    const out = document.createElement('canvas');
    out.width = Math.ceil(e.w * scale);
    out.height = Math.ceil(e.h * scale);
    const c = out.getContext('2d');
    c.fillStyle = css('--paper');
    c.fillRect(0, 0, out.width, out.height);
    c.setTransform(scale, 0, 0, scale, -e.x * scale, -e.y * scale);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const colors = palette();
    for (const it of items) {
      if (kind(it) !== 'text') { drawItem(c, it, colors); continue; }
      if (!richText) { wrapText(c, it, colors); continue; }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${it.w}" height="${(it.h || 48) + 8}">${textSVG({...it, x: 0, y: 0})}</svg>`;
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.onerror = r; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
      if (img.naturalWidth) c.drawImage(img, it.x, it.y, it.w, (it.h || 48) + 8); else wrapText(c, it, colors);
    }
    try { out.toDataURL(); return out; } catch { return richText ? toCanvas(false) : out; } // some browsers block HTML-in-SVG on canvas
  }
  async function toSVG() {
    const e = extent(), colors = palette();
    const parts = [];
    for (const it of items) {
      const k = kind(it), col = escapeHTML(colors[it.c] || colors.ink), st = `fill="none" stroke="${col}" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"`;
      if (k === 'conn') {
        const g = connGeom(it);
        if (!g) continue;
        parts.unshift(`<path d="${connSVGPath(g, it.w)}" ${st}/>`);
      } else if (k === 'text') parts.push(textSVG(it));
      else if (k === 'img') parts.push(`<image href="${await loadImage(it.id)}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" preserveAspectRatio="none"/>`);
      else if (k === 's' && it.pr) {
        const p = it.pts, pr = it.pr, n = p.length / 2, segs = [];
        let x = p[0], y = p[1];
        if (n === 1) segs.push(`<circle cx="${x}" cy="${y}" r="${pressureWidth(it.w, pr[0]) / 2}" fill="${col}"/>`);
        for (let j = 1; j < n; j++) {
          const end = j < n - 1 ? [(p[j * 2] + p[j * 2 + 2]) / 2, (p[j * 2 + 1] + p[j * 2 + 3]) / 2] : [p[j * 2], p[j * 2 + 1]];
          const d = j < n - 1 ? `M${x} ${y}Q${p[j * 2]} ${p[j * 2 + 1]} ${end[0]} ${end[1]}` : `M${x} ${y}L${end[0]} ${end[1]}`;
          segs.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${pressureWidth(it.w, (pr[j - 1] + pr[j]) / 2).toFixed(2)}" stroke-linecap="round"/>`);
          [x, y] = end;
        }
        parts.push(`<g>${segs.join('')}</g>`);
      }
      else if (k === 's') { const p = it.pts; let d = `M${p[0]} ${p[1]}`; for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`; if (p.length === 2) d += 'l.01 0'; parts.push(`<path d="${d}" ${st}/>`); }
      else {
        const {x1, y1, x2, y2} = it, x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
        if (k === 'rect') parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ${st}/>`);
        if (k === 'ellipse') parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${st}/>`);
        if (k === 'triangle') parts.push(`<path d="M${x + w / 2} ${y}L${x + w} ${y + h}L${x} ${y + h}Z" ${st}/>`);
        if (k === 'line' || k === 'arrow') {
          let d = `M${x1} ${y1}L${x2} ${y2}`;
          if (k === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), hd = Math.max(12, it.w * 4); d += `M${x2} ${y2}L${x2 - hd * Math.cos(a - .45)} ${y2 - hd * Math.sin(a - .45)}M${x2} ${y2}L${x2 - hd * Math.cos(a + .45)} ${y2 - hd * Math.sin(a + .45)}`; }
          parts.push(`<path d="${d}" ${st}/>`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e.x} ${e.y} ${e.w} ${e.h}" width="${Math.round(e.w)}" height="${Math.round(e.h)}"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${escapeHTML(css('--paper'))}"/>${parts.join('')}</svg>`;
  }
  const boardExport = document.querySelector('#board-export');
  boardExport.addEventListener('change', async () => {
    const k = boardExport.value;
    boardExport.value = '';
    finishEditing();
    if (!items.length) { status.textContent = 'The board is empty'; return; }
    try {
      if (k === 'png' || k === 'jpg') (await toCanvas()).toBlob((b) => download(b, `zen-board.${k}`), k === 'png' ? 'image/png' : 'image/jpeg', .92);
      if (k === 'svg') download(new Blob([await toSVG()], {type: 'image/svg+xml'}), 'zen-board.svg');
      if (k === 'pdf') {
        const url = (await toCanvas()).toDataURL('image/png');
        const frame = Object.assign(document.createElement('iframe'), {title: 'Print'});
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
        document.body.append(frame);
        frame.srcdoc = `<!doctype html><title>Zen board</title><style>@page{margin:12mm}html,body{margin:0;height:100%}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style><img src="${url}">`;
        frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
      }
      if (k === 'json') download(new Blob([JSON.stringify({items: await Promise.all(items.map(async (it) => (kind(it) === 'img' ? {...it, src: await loadImage(it.id)} : it)))})], {type: 'application/json'}), 'zen-board.json');
    } catch { status.textContent = 'Could not export the board'; }
  });

  // Open a board file saved with Export → Board file (.json).
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  async function importBoard(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { status.textContent = 'This is not a board file'; return; }
    const list = Array.isArray(data?.items) ? data.items : Array.isArray(data?.strokes) ? data.strokes : null;
    if (!list) { status.textContent = 'This is not a board file'; return; }
    status.textContent = 'Opening board…';
    const next = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const k = raw.t || 's', c = typeof raw.c === 'string' ? raw.c : 'ink', w = num(raw.w) ? raw.w : 2;
      const key = typeof raw.k === 'string' && /^[\w-]{1,40}$/.test(raw.k) ? raw.k : newKey();
      if (k === 's' && Array.isArray(raw.pts) && raw.pts.length >= 2 && raw.pts.every(num)) next.push({c, w, pts: raw.pts, ...(Array.isArray(raw.pr) && raw.pr.length * 2 === raw.pts.length && raw.pr.every(num) ? {pr: raw.pr} : {})});
      else if (shapes.includes(k) && [raw.x1, raw.y1, raw.x2, raw.y2].every(num)) next.push({t: k, k: key, c, w, x1: raw.x1, y1: raw.y1, x2: raw.x2, y2: raw.y2});
      else if (k === 'text' && typeof raw.md === 'string' && num(raw.x) && num(raw.y)) next.push({t: 'text', ...(raw.note === true ? {note: true} : {}), k: key, x: raw.x, y: raw.y, w: num(raw.w) ? raw.w : 340, md: raw.md, c});
      else if (k === 'img' && [raw.x, raw.y, raw.w, raw.h].every(num)) {
        let id = null;
        try {
          if (typeof raw.src === 'string' && /^data:image\//.test(raw.src)) id = await storeImage(await (await fetch(raw.src)).blob());
          else if (typeof raw.id === 'string' && await loadImage(raw.id)) id = raw.id;
        } catch {}
        if (id) next.push({t: 'img', k: key, id, x: raw.x, y: raw.y, w: raw.w, h: raw.h});
      }
    }
    for (const raw of list) {
      if (raw?.t === 'conn' && typeof raw.a === 'string' && typeof raw.b === 'string') next.push({t: 'conn', k: newKey(), a: raw.a, b: raw.b, c: typeof raw.c === 'string' ? raw.c : 'ink', w: num(raw.w) ? raw.w : 2, route: ['curve', 'elbow'].includes(raw.route) ? raw.route : 'straight'});
    }
    if (!next.length) { status.textContent = 'This board file is empty'; return; }
    finishEditing();
    selection = [];
    commit(next);
    const e = extent();
    const z = Math.min(1, Math.max(.05, Math.min(canvas.clientWidth / e.w, canvas.clientHeight / e.h) * .9));
    view = {x: canvas.clientWidth / 2 - (e.x + e.w / 2) * z, y: canvas.clientHeight / 2 - (e.y + e.h / 2) * z, z};
    persist();
    redraw();
    status.textContent = `Board opened (${next.length} items) — Undo brings back the previous board`;
  }
  const importInput = document.querySelector('#board-import-file');
  document.querySelector('.board-open').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); importInput.click(); }
  });
  importInput.addEventListener('change', () => { if (importInput.files[0]) importBoard(importInput.files[0]); importInput.value = ''; });

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.mode !== 'board' || editing || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && key === 'a') { e.preventDefault(); setTool('select'); selection = [...items]; redraw(); return; }
    if (mod && key === 'c' && selection.length) { clipboard = [...selection]; return; }
    if (mod && key === 'x' && selection.length) { clipboard = [...selection]; deleteSelection(); return; }
    if (mod && key === 'd' && selection.length) { e.preventDefault(); pasteItems(selection); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) { e.preventDefault(); deleteSelection(); return; }
    if (e.key === 'Escape' && selection.length) { selection = []; redraw(); return; }
    if (e.key === 'Enter' && selection.length === 1 && kind(selection[0]) === 'text') { e.preventDefault(); editText(selection[0]); return; }
    if (e.key === ' ' && !spaceHeld) { spaceHeld = true; canvas.classList.add('panning'); e.preventDefault(); }
    const keys = {p: 'pen', e: 'eraser', h: 'hand', v: 'select', r: 'rect', o: 'ellipse', t: 'triangle', l: 'line', a: 'arrow', x: 'text', n: 'note', c: 'connect'};
    if (!mod && !e.altKey && keys[key]) setTool(keys[key]);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceHeld = false; canvas.classList.remove('panning'); } });
  window.addEventListener('resize', () => { if (!boardSection.hidden) resize(); });
  window.addEventListener('zen-theme', redraw);

  return {
    async open() {
      resize();
      if (loaded) return;
      loaded = true;
      view = {x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, z: 1};
      try {
        const saved = await idb('board', 'readonly', (s) => s.get('main'));
        if (saved) { items = (saved.items || saved.strokes || []).map((it) => (kind(it) !== 's' && !it.k ? {...it, k: newKey()} : it)); view = saved.view || view; }
      } catch {}
      setTool('pen');
      redraw();
    }
  };
})();
try { if (localStorage.getItem('zen-mode') === 'board') setMode('board'); } catch {}

refresh();
