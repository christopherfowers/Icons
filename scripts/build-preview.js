#!/usr/bin/env node
/**
 * The gallery.
 *
 * Emits two files from one source of truth:
 *   preview/index.html   standalone document, opens from a clone, no build,
 *                        no network beyond the webfont
 *   build/artifact.html  the same page without the document skeleton, for
 *                        publishing as a hosted artifact
 *
 * The page is built around *growing* the set, not just looking at it: one tile
 * per icon name showing every variant side by side, so a missing variant is
 * visible rather than something you have to go looking for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { dartMemberName } from './build-dart.js';
import { readMetadata } from './build-outlines.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500'
  + '&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600&display=swap';

/* Layout: sticky control rail over a dense catalogue grid; detail opens in a
   side panel on desktop, a bottom sheet on phones. Dark-first, because this is
   tooling for a dark game UI, with a real light mode underneath. */
const STYLE = `
:root {
  --bg: #0d1116;
  --panel: #131922;
  --panel-2: #1a222d;
  --line: #232d3a;
  --fg: #dde5ed;
  --fg-dim: #8899aa;
  --fg-faint: #5d6b7a;
  --accent: #6fd3e6;
  --accent-ink: #062028;
  --warn: #d98b3a;
  --focus: #6fd3e6;
  --shadow: rgba(0, 0, 0, .5);
  color-scheme: dark;

  --sans: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --cond: "IBM Plex Sans Condensed", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #f4f6f8;
    --panel: #ffffff;
    --panel-2: #eef1f4;
    --line: #d9e0e7;
    --fg: #19222c;
    --fg-dim: #5b6a79;
    --fg-faint: #8494a3;
    --accent: #1b7f96;
    --accent-ink: #ffffff;
    --warn: #a4611d;
    --focus: #1b7f96;
    --shadow: rgba(20, 30, 40, .16);
    color-scheme: light;
  }
}
:root[data-theme="light"] {
  --bg: #f4f6f8;
  --panel: #ffffff;
  --panel-2: #eef1f4;
  --line: #d9e0e7;
  --fg: #19222c;
  --fg-dim: #5b6a79;
  --fg-faint: #8494a3;
  --accent: #1b7f96;
  --accent-ink: #ffffff;
  --warn: #a4611d;
  --focus: #1b7f96;
  --shadow: rgba(20, 30, 40, .16);
  color-scheme: light;
}

* { box-sizing: border-box; }
/* Components below set display:flex, which outranks the UA rule for [hidden];
   script toggles .hidden on tiles, sections, swatches and the detail panel. */
[hidden] { display: none !important; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
}
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }

/* ---- header ---------------------------------------------------------- */
header {
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 20;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 16px 20px 12px;
}
.masthead { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
h1 {
  font-family: var(--cond);
  font-weight: 600;
  font-size: 18px;
  letter-spacing: .02em;
  margin: 0;
  text-wrap: balance;
}
.stats { display: flex; gap: 14px; flex-wrap: wrap; font-family: var(--mono); font-size: 11.5px; color: var(--fg-dim); font-variant-numeric: tabular-nums; }
.stats b { color: var(--fg); font-weight: 500; }
.stats .gap { color: var(--warn); }

.controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.search-wrap { position: relative; flex: 1 1 240px; min-width: 0; }
input[type=search] {
  width: 100%;
  padding: 8px 12px 8px 32px;
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  -webkit-appearance: none;
}
input[type=search]::placeholder { color: var(--fg-faint); }
.search-wrap::before {
  content: "";
  position: absolute; left: 11px; top: 50%;
  width: 12px; height: 12px; margin-top: -7px;
  border: 1.6px solid var(--fg-faint); border-radius: 50%;
  pointer-events: none;
}
.search-wrap::after {
  content: "";
  position: absolute; left: 21px; top: 50%; margin-top: 2px;
  width: 6px; height: 1.6px; background: var(--fg-faint);
  transform: rotate(45deg); transform-origin: left center;
  pointer-events: none;
}
.chips { display: flex; gap: 5px; flex-wrap: wrap; }
.chip {
  font: inherit;
  font-size: 12px;
  padding: 5px 11px;
  cursor: pointer;
  color: var(--fg-dim);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 999px;
  white-space: nowrap;
}
.chip:hover { color: var(--fg); border-color: var(--fg-faint); }
.chip[aria-pressed="true"] { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.chip.warn[aria-pressed="true"] { background: var(--warn); border-color: var(--warn); color: var(--accent-ink); }
.rail-label {
  font-family: var(--cond);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--fg-faint);
  margin-right: -4px;
}

/* ---- grid ------------------------------------------------------------ */
main { padding: 20px; padding-bottom: 40px; transition: padding-right .16s; }
@media (min-width: 721px) {
  :root.detail-open main { padding-right: 380px; }
}
@media (prefers-reduced-motion: reduce) { main { transition: none; } }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
  gap: 8px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 8px 11px;
  font: inherit;
  color: inherit;
  text-align: center;
  cursor: pointer;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tile:hover { background: var(--panel-2); border-color: var(--fg-faint); }
.tile[aria-current="true"] { border-color: var(--accent); }
.swatches { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 34px; }
.swatch svg { width: var(--size, 28px); height: var(--size, 28px); fill: currentColor; display: block; }
.swatch.absent {
  width: var(--size, 28px);
  height: var(--size, 28px);
  border: 1.5px dashed var(--line);
  border-radius: 4px;
}
.tile .name { font-size: 11.5px; line-height: 1.3; word-break: break-word; min-width: 0; }
.tile .cp { font-family: var(--mono); font-size: 10px; color: var(--fg-faint); font-variant-numeric: tabular-nums; }
.tile .grp {
  font-family: var(--cond); font-size: 9.5px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg-faint);
}
.tile .flag { color: var(--warn); }

/* ---- pager ----------------------------------------------------------- */
.pager {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  margin-top: 20px; padding-top: 16px;
  border-top: 1px solid var(--line);
}
.pager-count {
  font-family: var(--mono); font-size: 11.5px; color: var(--fg-dim);
  font-variant-numeric: tabular-nums;
}
.pager-count b { color: var(--fg); font-weight: 500; }
.pager-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.page-btn {
  min-width: 32px; padding: 5px 9px;
  font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
  cursor: pointer;
  color: var(--fg-dim); background: var(--panel);
  border: 1px solid var(--line); border-radius: 6px;
}
.page-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--fg-faint); }
.page-btn[aria-current="page"] { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.page-btn:disabled { opacity: .4; cursor: default; }
.page-gap { padding: 0 2px; color: var(--fg-faint); }
.per-page { display: flex; align-items: center; gap: 6px; }
.per-page select {
  font: inherit; font-size: 12px; padding: 5px 8px;
  color: var(--fg); background: var(--panel);
  border: 1px solid var(--line); border-radius: 6px;
}

.empty { color: var(--fg-dim); padding: 40px 0; text-align: center; }

/* ---- detail ---------------------------------------------------------- */
#detail {
  position: fixed;
  right: 0; top: 0; bottom: 0;
  width: min(360px, 100%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  padding-top: calc(20px + env(safe-area-inset-top, 0px));
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  background: var(--panel);
  border-left: 1px solid var(--line);
  box-shadow: -8px 0 28px var(--shadow);
}
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.detail-head h3 { font-family: var(--cond); font-size: 17px; margin: 0; letter-spacing: .01em; }
.detail-head .sub { font-family: var(--mono); font-size: 11.5px; color: var(--fg-dim); }
.close {
  font: inherit; font-size: 18px; line-height: 1;
  padding: 4px 9px; cursor: pointer;
  color: var(--fg-dim); background: transparent;
  border: 1px solid var(--line); border-radius: 6px;
}
.close:hover { color: var(--fg); border-color: var(--fg-faint); }
.previews { display: flex; gap: 10px; }
.preview-cell {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 8px 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.preview-cell svg { width: 52px; height: 52px; fill: currentColor; }
.preview-cell .tag {
  font-family: var(--cond); font-size: 10px; letter-spacing: .09em;
  text-transform: uppercase; color: var(--fg-faint);
}
.preview-cell.absent { color: var(--fg-faint); }
.preview-cell .missing { font-size: 11px; color: var(--warn); height: 52px; display: flex; align-items: center; }
.sizes { display: flex; align-items: flex-end; justify-content: center; gap: 14px; padding: 12px 8px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
.sizes figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.sizes svg { fill: currentColor; }
.sizes figcaption { font-family: var(--mono); font-size: 9.5px; color: var(--fg-faint); }
.rows { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-direction: column; gap: 3px; }
.row .k { font-family: var(--cond); font-size: 10px; text-transform: uppercase; letter-spacing: .09em; color: var(--fg-faint); }
.copy {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 10px;
  font-family: var(--mono); font-size: 11.5px; text-align: left;
  color: var(--fg); background: var(--panel-2);
  border: 1px solid var(--line); border-radius: 6px;
  cursor: pointer; min-width: 0;
}
.copy:hover { border-color: var(--fg-faint); }
.copy span { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
.copy span::-webkit-scrollbar { display: none; }
.copy em { font-family: var(--cond); font-style: normal; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--fg-faint); }

.toast {
  position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%) translateY(10px);
  z-index: 40;
  padding: 9px 16px;
  font-size: 12px;
  color: var(--accent-ink); background: var(--accent);
  border-radius: 6px;
  opacity: 0; pointer-events: none;
  transition: opacity .15s, transform .15s;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 620px) {
  header { padding: 14px 16px 10px; }
  main { padding: 16px; padding-bottom: 60px; }
  #detail {
    right: 0; left: 0; top: auto;
    width: 100%; max-height: 78vh;
    border-left: none; border-top: 1px solid var(--line);
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -8px 28px var(--shadow);
  }
}
@media (prefers-reduced-motion: reduce) {
  .toast { transition: none; }
}
`;

const SCRIPT = String.raw`
const $ = (s) => document.querySelector(s);
const state = { q: '', group: 'all', variant: 'all', gapsOnly: false, page: 1, per: 48 };

const grid = $('#grid');
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The filtered set, in group-then-name order. */
function matching() {
  const q = state.q.trim().toLowerCase();
  return ICONS.filter((icon) => {
    if (state.group !== 'all' && icon.group !== state.group) return false;
    if (state.variant !== 'all' && !icon.has.includes(state.variant)) return false;
    if (state.gapsOnly && icon.has.length === VARIANTS.length) return false;
    if (q === '' ) return true;
    return icon.name.includes(q) || icon.group.includes(q) || ('u+' + icon.hex.toLowerCase()).includes(q);
  });
}

function svgFor(pathData, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + VIEWBOX + ' ' + VIEWBOX);
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', pathData);
  svg.append(p);
  return svg;
}

function tileFor(icon) {
  const complete = icon.has.length === VARIANTS.length;
  const button = document.createElement('button');
  button.className = 'tile';
  button.type = 'button';
  button.dataset.index = icon.index;
  button.setAttribute('aria-label', icon.name + ', ' + icon.group + ', U+' + icon.hex);

  const swatches = document.createElement('span');
  swatches.className = 'swatches';
  for (const v of VARIANTS) {
    const cell = document.createElement('span');
    cell.dataset.variant = v.name;
    if (icon.d[v.name]) {
      cell.className = 'swatch';
      cell.append(svgFor(icon.d[v.name]));
    } else {
      cell.className = 'swatch absent';
      cell.title = v.name + ' not drawn yet';
    }
    cell.hidden = state.variant !== 'all' && v.name !== state.variant;
    swatches.append(cell);
  }

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = icon.name;
  if (!complete) {
    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.textContent = ' ·';
    name.append(flag);
  }

  const group = document.createElement('span');
  group.className = 'grp';
  group.textContent = icon.group;

  const cp = document.createElement('span');
  cp.className = 'cp';
  cp.textContent = 'U+' + icon.hex;

  button.append(swatches, name, group, cp);
  button.addEventListener('click', () => openDetail(icon, button));
  return button;
}

/** Page numbers with ellipses, so a thousand icons still fits one row. */
function pageButtons(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push('gap');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push('gap');
  out.push(total);
  return out;
}

function render() {
  const items = matching();
  const per = state.per === 0 ? Math.max(items.length, 1) : state.per;
  const totalPages = Math.max(1, Math.ceil(items.length / per));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const start = (state.page - 1) * per;
  const slice = items.slice(start, start + per);
  grid.replaceChildren(...slice.map(tileFor));

  $('#empty').hidden = items.length > 0;
  $('#pager').hidden = items.length === 0;
  $('#shown').textContent = items.length;
  $('#count').innerHTML = items.length
    ? '<b>' + (start + 1) + '</b>&ndash;<b>' + (start + slice.length) + '</b> of <b>' + items.length + '</b>'
    : '';

  const nav = $('#pages');
  nav.replaceChildren();
  const step = (to, label, disabled, current) => {
    const b = document.createElement('button');
    b.className = 'page-btn';
    b.type = 'button';
    b.textContent = label;
    b.disabled = !!disabled;
    if (current) b.setAttribute('aria-current', 'page');
    if (!disabled) b.addEventListener('click', () => { state.page = to; render(); scrollTop(); });
    return b;
  };
  nav.append(step(state.page - 1, '‹', state.page === 1));
  for (const p of pageButtons(state.page, totalPages)) {
    if (p === 'gap') {
      const span = document.createElement('span');
      span.className = 'page-gap';
      span.textContent = '…';
      nav.append(span);
    } else {
      nav.append(step(p, String(p), false, p === state.page));
    }
  }
  nav.append(step(state.page + 1, '›', state.page === totalPages));
}

function scrollTop() {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior });
}

function reset() { state.page = 1; render(); }

function bindChips(selector, key) {
  const chips = [...document.querySelectorAll(selector)];
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      state[key] = chip.dataset[key];
      for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
      reset();
    });
  }
}
bindChips('.chip[data-group]', 'group');
bindChips('.chip[data-variant]', 'variant');

for (const chip of document.querySelectorAll('.chip[data-size]')) {
  chip.addEventListener('click', () => {
    document.documentElement.style.setProperty('--size', chip.dataset.size + 'px');
    for (const other of document.querySelectorAll('.chip[data-size]')) {
      other.setAttribute('aria-pressed', String(other === chip));
    }
  });
}

const gapsChip = $('#gaps');
gapsChip.addEventListener('click', () => {
  state.gapsOnly = !state.gapsOnly;
  gapsChip.setAttribute('aria-pressed', String(state.gapsOnly));
  reset();
});

const search = $('#search');
search.addEventListener('input', () => { state.q = search.value; reset(); });

const per = $('#per');
per.addEventListener('change', () => { state.per = Number(per.value); reset(); });

document.addEventListener('keydown', (e) => {
  const typing = document.activeElement === search;
  if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); return; }
  if (e.key === 'Escape') {
    if (!$('#detail').hidden) closeDetail();
    else if (search.value) { search.value = ''; state.q = ''; reset(); }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') { state.page--; render(); }
  if (e.key === 'ArrowRight') { state.page++; render(); }
});

/* ---- detail ---------------------------------------------------------- */
const detail = $('#detail');

function closeDetail() {
  detail.hidden = true;
  document.documentElement.classList.remove('detail-open');
  for (const t of grid.children) t.removeAttribute('aria-current');
}
$('#close').addEventListener('click', closeDetail);

function openDetail(icon, tile) {
  for (const t of grid.children) t.removeAttribute('aria-current');
  tile.setAttribute('aria-current', 'true');

  $('#d-name').textContent = icon.name;
  $('#d-sub').textContent = icon.group + '  ·  U+' + icon.hex;

  $('#d-previews').replaceChildren(...VARIANTS.map((v) => {
    const cell = document.createElement('div');
    cell.className = 'preview-cell';
    if (icon.d[v.name]) {
      cell.append(svgFor(icon.d[v.name]));
    } else {
      cell.classList.add('absent');
      const note = document.createElement('div');
      note.className = 'missing';
      note.textContent = 'not drawn yet';
      cell.append(note);
    }
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = v.name;
    cell.append(tag);
    return cell;
  }));

  const first = VARIANTS.find((v) => icon.d[v.name]);
  $('#d-sizes').replaceChildren(...(first ? [16, 24, 32, 48].map((px) => {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = px;
    figure.append(svgFor(icon.d[first.name], px), caption);
    return figure;
  }) : []));

  const rows = [];
  for (const v of VARIANTS) {
    if (!icon.d[v.name]) continue;
    const cls = [...(VARIANT_CLASSES[v.name] || []).map((c) => CSS_PREFIX + '-' + c),
      CSS_PREFIX + '-' + icon.name].join(' ');
    rows.push([v.name + ' · css', cls]);
    rows.push([v.name + ' · dart', icon.dart[v.name]]);
  }
  rows.push(['codepoint', '0x' + icon.hex.toLowerCase()]);
  rows.push(['name', icon.name]);

  $('#d-rows').replaceChildren(...rows.map(([k, value]) => {
    const row = document.createElement('div');
    row.className = 'row';
    const key = document.createElement('span');
    key.className = 'k';
    key.textContent = k;
    const button = document.createElement('button');
    button.className = 'copy';
    button.type = 'button';
    button.dataset.value = value;
    const text = document.createElement('span');
    text.textContent = value;
    const tag = document.createElement('em');
    tag.textContent = 'copy';
    button.append(text, tag);
    row.append(key, button);
    return row;
  }));

  detail.hidden = false;
  document.documentElement.classList.add('detail-open');
}

/* ---- copy ------------------------------------------------------------ */
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

document.addEventListener('click', async (e) => {
  const button = e.target.closest('.copy');
  if (!button) return;
  const value = button.dataset.value;
  try {
    await navigator.clipboard.writeText(value);
    toast('Copied  ' + value);
  } catch {
    // Some app views refuse the clipboard; select the text so it can be copied by hand.
    const range = document.createRange();
    range.selectNodeContents(button.querySelector('span'));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Select and copy');
  }
});

render();
`;

export function buildPreview({ quiet = false } = {}) {
  const config = loadConfig();
  const metadata = readMetadata();
  const log = quiet ? () => {} : (...args) => console.log(...args);
  // Every style shares the grid, so any present variant answers for viewBox.
  const viewBox = config.variantSpec(metadata.variants[0].name).viewBox;

  // Defaults first, so the neutral set leads the gallery.
  const ordered = metadata.variants
    .slice()
    .sort((a, b) => (a.classes.length - b.classes.length))
    .map((v) => v.name);

  // Collapse (variant, group, icon) into one record per icon *name*, which is
  // what the codepoint is keyed by and what a missing variant is a gap in.
  const byName = new Map();
  for (const variant of metadata.variants) {
    for (const group of variant.groups) {
      for (const icon of group.icons) {
        if (!byName.has(icon.name)) {
          byName.set(icon.name, {
            name: icon.name,
            group: group.name,
            codepoint: icon.codepoint,
            hex: icon.codepoint.toString(16).toUpperCase().padStart(4, '0'),
            variants: {},
            dart: {},
          });
        }
        const record = byName.get(icon.name);
        record.variants[variant.name] = icon.pathData;
        record.dart[variant.name] =
          `${config.classFor(variant.name, group.name)}.${dartMemberName(icon.name)}`;
      }
    }
  }

  const icons = [...byName.values()].sort((a, b) =>
    (a.group === b.group ? (a.name < b.name ? -1 : 1) : (a.group < b.group ? -1 : 1)));
  const groups = [...new Set(icons.map((i) => i.group))].sort();

  const counts = Object.fromEntries(ordered.map((v) =>
    [v, icons.filter((i) => i.variants[v]).length]));
  const gaps = icons.filter((i) => ordered.some((v) => !i.variants[v])).length;
  const glyphs = icons.reduce((n, i) => n + Object.keys(i.variants).length, 0);

  const data = icons.map((icon, index) => ({
    index,
    name: icon.name,
    group: icon.group,
    hex: icon.hex,
    has: ordered.filter((v) => icon.variants[v]),
    dart: icon.dart,
    d: icon.variants,
  }));

  const tile = (icon, index) => {
    const complete = ordered.every((v) => icon.variants[v]);
    const present = ordered.filter((v) => icon.variants[v]);
    const swatches = ordered.map((v) => (icon.variants[v]
      ? `<span class="swatch" data-variant="${esc(v)}"><svg viewBox="0 0 ${viewBox} ${viewBox}" aria-hidden="true"><path d="${icon.variants[v]}"/></svg></span>`
      : `<span class="swatch absent" data-variant="${esc(v)}" title="${esc(v)} not drawn yet"></span>`)).join('');
    const search = `${icon.name} ${icon.group} ${present.join(' ')}`.toLowerCase();
    return [
      `        <button class="tile" type="button" data-index="${index}"`,
      `          data-group="${esc(icon.group)}" data-variants="${esc(present.join(','))}"`,
      `          data-complete="${complete}" data-search="${esc(search)}"`,
      `          aria-label="${esc(icon.name)}, ${esc(icon.group)}, U+${icon.hex}">`,
      `          <span class="swatches">${swatches}</span>`,
      `          <span class="name">${esc(icon.name)}${complete ? '' : ' <span class="flag">·</span>'}</span>`,
      `          <span class="grp">${esc(icon.group)}</span>`,
      `          <span class="cp">U+${icon.hex}</span>`,
      '        </button>',
    ].join('\n');
  };

  // The first page is rendered into the markup so the page is complete before
  // script runs; script re-renders from the data on every filter or page change.
  const FIRST_PAGE = 48;
  const firstPage = icons.slice(0, FIRST_PAGE)
    .map((icon, index) => tile(icon, index)).join('\n');

  const statLine = ordered.map((v) =>
    `<span><b>${counts[v]}</b>/${icons.length} ${esc(v)}</span>`).join('\n      ');

  const head = `<title>${esc(metadata.displayName)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>`;

  const body = `<header>
  <div class="masthead">
    <h1>${esc(metadata.displayName)}</h1>
    <div class="stats">
      <span><b id="shown">${icons.length}</b> shown</span>
      <span><b>${glyphs}</b> glyphs</span>
      ${statLine}
      ${gaps ? `<span class="gap"><b>${gaps}</b> incomplete</span>` : ''}
    </div>
  </div>
  <div class="controls">
    <div class="search-wrap">
      <input id="search" type="search" placeholder="Search icons &mdash; press /" autocomplete="off" spellcheck="false" aria-label="Search icons">
    </div>
    <div class="chips" role="group" aria-label="Variant">
      <span class="rail-label">variant</span>
      <button class="chip" type="button" data-variant="all" aria-pressed="true">all</button>
      ${ordered.map((v) => `<button class="chip" type="button" data-variant="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('\n      ')}
      <button class="chip warn" id="gaps" type="button" aria-pressed="false">incomplete</button>
    </div>
    <div class="chips" role="group" aria-label="Group">
      <span class="rail-label">group</span>
      <button class="chip" type="button" data-group="all" aria-pressed="true">all</button>
      ${groups.map((g) => `<button class="chip" type="button" data-group="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('\n      ')}
    </div>
    <div class="chips" role="group" aria-label="Size">
      <span class="rail-label">size</span>
      ${[16, 24, 28, 40].map((px) => `<button class="chip" type="button" data-size="${px}" aria-pressed="${px === 28}">${px}</button>`).join('\n      ')}
    </div>
  </div>
</header>

<main>
  <div class="grid" id="grid">
${firstPage}
  </div>
  <p class="empty" id="empty" hidden>No icons match that search.</p>
  <nav class="pager" id="pager" aria-label="Pagination">
    <span class="pager-count" id="count"></span>
    <span class="pager-nav" id="pages"></span>
    <span class="per-page">
      <label for="per">Per page</label>
      <select id="per">
        <option value="24">24</option>
        <option value="48" selected>48</option>
        <option value="96">96</option>
        <option value="192">192</option>
        <option value="0">All</option>
      </select>
    </span>
  </nav>
</main>

<aside id="detail" hidden aria-label="Icon detail">
  <div class="detail-head">
    <div>
      <h3 id="d-name"></h3>
      <div class="sub" id="d-sub"></div>
    </div>
    <button class="close" id="close" type="button" aria-label="Close detail">&times;</button>
  </div>
  <div class="previews" id="d-previews"></div>
  <div class="sizes" id="d-sizes"></div>
  <div class="rows" id="d-rows"></div>
</aside>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
const VIEWBOX = ${viewBox};
const CSS_PREFIX = ${JSON.stringify(metadata.cssPrefix)};
const DEFAULT_VARIANT = ${JSON.stringify(metadata.variants.find((v) => v.classes.length === 0)?.name ?? ordered[0])};
const VARIANT_CLASSES = ${JSON.stringify(Object.fromEntries(metadata.variants.map((v) => [v.name, v.classes])))};
const VARIANTS = ${JSON.stringify(ordered.map((name) => ({ name })))};
const ICONS = ${JSON.stringify(data)};
${SCRIPT}
</script>
`;

  fs.mkdirSync(PATHS.preview, { recursive: true });
  fs.writeFileSync(path.join(PATHS.preview, 'index.html'), [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<!-- GENERATED FILE - DO NOT EDIT. Regenerate with `npm run build`. -->',
    head,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n'));

  // Same page without the document skeleton, which is what the artifact host
  // wraps for itself.
  fs.mkdirSync(PATHS.build, { recursive: true });
  const artifact = `${head}\n${body}`;
  fs.writeFileSync(path.join(PATHS.build, 'artifact.html'), artifact);

  log(`  gallery: ${icons.length} icons, ${glyphs} glyphs, ${gaps} incomplete `
    + `(${(artifact.length / 1024).toFixed(0)} KiB)`);
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) buildPreview();
