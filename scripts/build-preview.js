#!/usr/bin/env node
/**
 * Step 6 of the pipeline: the preview gallery.
 *
 * The gallery is committed and self-contained: it inlines the *outlined* path
 * data, which is exactly the geometry that ends up in the font, so it doubles
 * as a visual diff of what a change did to the glyphs. Opening
 * `preview/index.html` straight from a fresh clone works, with no build step
 * and no network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/paths.js';
import { loadConfig, pascal } from './lib/config.js';
import { dartMemberName } from './build-dart.js';
import { readMetadata } from './build-outlines.js';

/** Every (variant, group) pair in tree order. */
const allPairs = (metadata) => metadata.variants.flatMap((v) =>
  v.groups.map((g) => ({ variant: v, group: g })));

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #16181d; --muted: #6b7280; --line: #e5e7eb;
  --card: #ffffff; --hover: #f3f4f6; --accent: #2563eb;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1013; --fg: #e8eaed; --muted: #9aa1ab; --line: #24282f;
    --card: #15181d; --hover: #1d2128; --accent: #7aa2ff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
header {
  position: sticky; top: 0; z-index: 2; background: var(--bg);
  border-bottom: 1px solid var(--line); padding: 20px 24px 14px;
}
h1 { margin: 0 0 2px; font-size: 19px; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
input[type=search] {
  flex: 1 1 220px; min-width: 180px; padding: 8px 12px; font: inherit;
  color: var(--fg); background: var(--card);
  border: 1px solid var(--line); border-radius: 8px;
}
input[type=search]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 6px 11px; font: inherit; font-size: 12px; cursor: pointer;
  color: var(--muted); background: var(--card);
  border: 1px solid var(--line); border-radius: 999px;
}
.chip[aria-pressed=true] { color: var(--bg); background: var(--fg); border-color: var(--fg); }
main { padding: 20px 24px 60px; }
section { margin-bottom: 30px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 8px; }
.icon {
  display: flex; flex-direction: column; align-items: center; gap: 9px;
  padding: 16px 8px 12px; text-align: center; cursor: pointer;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  font: inherit; color: inherit;
}
.icon:hover { background: var(--hover); border-color: var(--muted); }
.icon svg { width: var(--size, 28px); height: var(--size, 28px); fill: currentColor; }
.icon .name { font-size: 11px; word-break: break-word; }
.icon .cp { font-size: 10px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.empty { color: var(--muted); padding: 30px 0; }
.toast {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(12px);
  padding: 9px 15px; border-radius: 8px; background: var(--fg); color: var(--bg);
  font-size: 12px; opacity: 0; pointer-events: none; transition: opacity .16s, transform .16s;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
[hidden] { display: none !important; }
`;

const SCRIPT = `
const search = document.getElementById('search');
const sizeChips = document.querySelectorAll('[data-size]');
const groupChips = document.querySelectorAll('.chip[data-group]');
const variantChips = document.querySelectorAll('.chip[data-variant]');
const toast = document.getElementById('toast');
let group = 'all';
let variant = 'all';

function apply() {
  const query = search.value.trim().toLowerCase();
  for (const section of document.querySelectorAll('section')) {
    const inGroup = (group === 'all' || section.dataset.group === group)
      && (variant === 'all' || section.dataset.variant === variant);
    let shown = 0;
    for (const icon of section.querySelectorAll('.icon')) {
      const match = inGroup && (query === '' || icon.dataset.search.includes(query));
      icon.hidden = !match;
      if (match) shown++;
    }
    section.hidden = shown === 0;
  }
  document.getElementById('empty').hidden =
    [...document.querySelectorAll('section')].some((s) => !s.hidden);
}

search.addEventListener('input', apply);
for (const chip of groupChips) {
  chip.addEventListener('click', () => {
    group = chip.dataset.group;
    for (const other of groupChips) other.setAttribute('aria-pressed', String(other === chip));
    apply();
  });
}
for (const chip of variantChips) {
  chip.addEventListener('click', () => {
    variant = chip.dataset.variant;
    for (const other of variantChips) other.setAttribute('aria-pressed', String(other === chip));
    apply();
  });
}
for (const chip of sizeChips) {
  chip.addEventListener('click', () => {
    document.documentElement.style.setProperty('--size', chip.dataset.size + 'px');
    for (const other of sizeChips) other.setAttribute('aria-pressed', String(other === chip));
  });
}

let toastTimer;
for (const icon of document.querySelectorAll('.icon')) {
  icon.addEventListener('click', async () => {
    const snippet = icon.dataset.copy;
    try { await navigator.clipboard.writeText(snippet); } catch { /* clipboard may be blocked */ }
    toast.textContent = 'Copied ' + snippet;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  });
}
`;

export function buildPreview({ quiet = false } = {}) {
  const config = loadConfig();
  const metadata = readMetadata();
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const size = config.variantSpec(config.defaultVariant).viewBox;
  const total = allPairs(metadata).reduce((n, { group }) => n + group.icons.length, 0);

  const sections = allPairs(metadata).map(({ variant, group }) => {
    const cards = group.icons.map((icon) => {
      const cp = icon.codepoint.toString(16).toUpperCase().padStart(4, '0');
      const dart = `${config.classFor(variant.name, group.name)}.${dartMemberName(icon.name)}`;
      const title = `${icon.name}  ·  U+${cp}  ·  ${variant.name}  ·  ${group.family}  ·  ${dart}`;
      return [
        `      <button class="icon" type="button" data-search="${escapeHtml(`${icon.name} ${group.name} ${variant.name} ${dart.toLowerCase()}`)}" data-copy="${escapeHtml(icon.name)}" title="${escapeHtml(title)}">`,
        `        <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${icon.pathData}"/></svg>`,
        `        <span class="name">${escapeHtml(icon.name)}</span>`,
        `        <span class="cp">U+${cp}</span>`,
        '      </button>',
      ].join('\n');
    });
    return [
      `    <section data-group="${escapeHtml(group.name)}" data-variant="${escapeHtml(variant.name)}">`,
      `      <h2>${escapeHtml(group.name)} &middot; ${escapeHtml(variant.name)} &middot; ${group.icons.length} &middot; <code>${escapeHtml(group.family)}</code></h2>`,
      '      <div class="grid">',
      ...cards,
      '      </div>',
      '    </section>',
    ].join('\n');
  });

  const groupNames = [...new Set(allPairs(metadata).map(({ group }) => group.name))].sort();
  const groupChips = [
    '      <button class="chip" type="button" data-group="all" aria-pressed="true">all</button>',
    ...groupNames.map(
      (g) => `      <button class="chip" type="button" data-group="${escapeHtml(g)}" aria-pressed="false">${escapeHtml(g)}</button>`,
    ),
  ].join('\n');
  const variantChips = [
    '      <button class="chip" type="button" data-variant="all" aria-pressed="true">all</button>',
    ...metadata.variants.map(
      (v) => `      <button class="chip" type="button" data-variant="${escapeHtml(v.name)}" aria-pressed="false">${escapeHtml(v.name)}</button>`,
    ),
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(metadata.displayName)}</title>
<!-- GENERATED FILE - DO NOT EDIT. Regenerate with \`npm run build\`. -->
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(metadata.displayName)}</h1>
  <p class="sub">${total} icons &middot; ${metadata.variants.map((v) => v.name).join(' + ')} &middot; ${size}&times;${size} grid, outlined for the font &middot; click an icon to copy its name</p>
  <div class="controls">
    <input id="search" type="search" placeholder="Search icons&hellip;" autocomplete="off" spellcheck="false">
    <div class="chips">
${variantChips}
    </div>
    <div class="chips">
${groupChips}
    </div>
    <div class="chips">
      <button class="chip" type="button" data-size="16" aria-pressed="false">16</button>
      <button class="chip" type="button" data-size="28" aria-pressed="true">28</button>
      <button class="chip" type="button" data-size="48" aria-pressed="false">48</button>
    </div>
  </div>
</header>
<main>
${sections.join('\n')}
  <p class="empty" id="empty" hidden>No icons match that search.</p>
</main>
<div class="toast" id="toast" role="status"></div>
<script>${SCRIPT}</script>
</body>
</html>
`;

  fs.mkdirSync(PATHS.preview, { recursive: true });
  fs.writeFileSync(path.join(PATHS.preview, 'index.html'), html);
  log(`  preview/index.html regenerated (${total} icons, ${(html.length / 1024).toFixed(0)} KiB)`);
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) buildPreview();
