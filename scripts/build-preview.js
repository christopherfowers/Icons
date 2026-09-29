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
main { padding: 20px; padding-bottom: 80px; transition: padding-right .16s; }
@media (min-width: 721px) {
  :root.detail-open main { padding-right: 380px; }
}
@media (prefers-reduced-motion: reduce) { main { transition: none; } }
section { margin-bottom: 28px; }
section h2 {
  font-family: var(--cond);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--fg-faint);
  margin: 0 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
section h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }
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
.tile .flag { color: var(--warn); }

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
const state = { q: '', group: 'all', variant: 'all', gapsOnly: false, size: 28, selected: null };

const tiles = [...document.querySelectorAll('.tile')];
const sections = [...document.querySelectorAll('section')];

function apply() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  for (const section of sections) {
    let visible = 0;
    for (const tile of section.querySelectorAll('.tile')) {
      const d = tile.dataset;
      const ok = (state.group === 'all' || d.group === state.group)
        && (state.variant === 'all' || d.variants.split(',').includes(state.variant))
        && (!state.gapsOnly || d.complete === 'false')
        && (q === '' || d.search.includes(q));
      tile.hidden = !ok;
      if (ok) visible++;
    }
    section.hidden = visible === 0;
    shown += visible;
  }
  // When one variant is isolated, hide the other swatch so the grid reads clean.
  for (const sw of document.querySelectorAll('.swatch')) {
    sw.hidden = state.variant !== 'all' && sw.dataset.variant !== state.variant;
  }
  $('#empty').hidden = shown > 0;
  $('#shown').textContent = shown;
}

function bindChips(selector, key, after) {
  const chips = [...document.querySelectorAll(selector)];
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      state[key] = chip.dataset[key];
      for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
      if (after) after();
      apply();
    });
  }
}
bindChips('.chip[data-group]', 'group');
bindChips('.chip[data-variant]', 'variant');

for (const chip of document.querySelectorAll('.chip[data-size]')) {
  chip.addEventListener('click', () => {
    state.size = Number(chip.dataset.size);
    document.documentElement.style.setProperty('--size', state.size + 'px');
    for (const other of document.querySelectorAll('.chip[data-size]')) {
      other.setAttribute('aria-pressed', String(other === chip));
    }
  });
}

const gapsChip = $('#gaps');
gapsChip.addEventListener('click', () => {
  state.gapsOnly = !state.gapsOnly;
  gapsChip.setAttribute('aria-pressed', String(state.gapsOnly));
  apply();
});

const search = $('#search');
search.addEventListener('input', () => { state.q = search.value; apply(); });

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  if (e.key === 'Escape') {
    if (!$('#detail').hidden) closeDetail();
    else if (search.value) { search.value = ''; state.q = ''; apply(); }
  }
});

/* ---- detail ---------------------------------------------------------- */
const detail = $('#detail');

function closeDetail() {
  detail.hidden = true;
  document.documentElement.classList.remove('detail-open');
  for (const t of tiles) t.removeAttribute('aria-current');
  state.selected = null;
}
$('#close').addEventListener('click', closeDetail);

function openDetail(tile) {
  const icon = ICONS[Number(tile.dataset.index)];
  state.selected = icon;
  for (const t of tiles) t.removeAttribute('aria-current');
  tile.setAttribute('aria-current', 'true');

  $('#d-name').textContent = icon.name;
  $('#d-sub').textContent = icon.group + '  ·  U+' + icon.hex;

  // The tile already carries the geometry, so clone it rather than shipping
  // every path a second time in the data.
  const svgFor = (variant) => {
    const source = tile.querySelector('.swatch[data-variant="' + variant + '"] svg');
    return source ? source.cloneNode(true) : null;
  };

  const previews = $('#d-previews');
  previews.replaceChildren(...VARIANTS.map((v) => {
    const cell = document.createElement('div');
    cell.className = 'preview-cell';
    const svg = svgFor(v.name);
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      cell.append(svg);
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

  const first = VARIANTS.find((v) => icon.has.includes(v.name));
  const sizes = $('#d-sizes');
  sizes.replaceChildren(...(first ? [16, 24, 32, 48].map((px) => {
    const figure = document.createElement('figure');
    const svg = svgFor(first.name);
    svg.setAttribute('width', px);
    svg.setAttribute('height', px);
    const caption = document.createElement('figcaption');
    caption.textContent = px;
    figure.append(svg, caption);
    return figure;
  }) : []));

  const rows = [];
  for (const v of VARIANTS) {
    if (!icon.has.includes(v.name)) continue;
    const cls = v.name === DEFAULT_VARIANT ? CSS_PREFIX + '-' + icon.name
      : CSS_PREFIX + '-' + v.name + ' ' + CSS_PREFIX + '-' + icon.name;
    rows.push([v.name + ' · css', cls]);
    rows.push([v.name + ' · dart', icon.dart[v.name]]);
  }
  rows.push(['codepoint', '0x' + icon.hex.toLowerCase()]);
  rows.push(['name', icon.name]);

  $('#d-rows').innerHTML = rows.map(([k, val]) =>
    '<div class="row"><span class="k">' + k + '</span>'
    + '<button class="copy" type="button" data-value="' + val.replace(/"/g, '&quot;') + '">'
    + '<span>' + val.replace(/</g, '&lt;') + '</span><em>copy</em></button></div>').join('');

  detail.hidden = false;
  document.documentElement.classList.add('detail-open');
}

for (const tile of tiles) tile.addEventListener('click', () => openDetail(tile));

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

apply();
`;

export function buildPreview({ quiet = false } = {}) {
  const config = loadConfig();
  const metadata = readMetadata();
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const viewBox = config.variantSpec(config.defaultVariant).viewBox;

  const variantNames = metadata.variants.map((v) => v.name);
  const ordered = [
    ...variantNames.filter((v) => v === metadata.defaultVariant),
    ...variantNames.filter((v) => v !== metadata.defaultVariant),
  ];

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

  // Path data lives in the markup so the page is complete before script runs;
  // the data block carries only what the detail panel cannot read off a tile.
  const data = icons.map((icon, index) => ({
    index,
    name: icon.name,
    group: icon.group,
    hex: icon.hex,
    has: ordered.filter((v) => icon.variants[v]),
    dart: icon.dart,
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
      `          <span class="cp">U+${icon.hex}</span>`,
      '        </button>',
    ].join('\n');
  };

  const indexOf = new Map(icons.map((icon, i) => [icon.name, i]));
  const sections = groups.map((group) => {
    const members = icons.filter((i) => i.group === group);
    return [
      `      <section data-group="${esc(group)}">`,
      `        <h2>${esc(group)} <span>${members.length}</span></h2>`,
      '        <div class="grid">',
      ...members.map((icon) => tile(icon, indexOf.get(icon.name))),
      '        </div>',
      '      </section>',
    ].join('\n');
  }).join('\n');

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
${sections}
  <p class="empty" id="empty" hidden>No icons match that search.</p>
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
const DEFAULT_VARIANT = ${JSON.stringify(metadata.defaultVariant)};
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
