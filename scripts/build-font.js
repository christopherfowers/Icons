#!/usr/bin/env node
/**
 * Step 4 of the pipeline: one TTF per group.
 *
 * Groups are the unit of bundling. An app that only imports
 * `package:<name>_icons/<name>_core.dart` only ever references glyphs in the
 * GlyphCore font, so Flutter's release-mode icon tree-shaker can empty out the
 * other families entirely.
 *
 * The set has to work on desktop, mobile and web, which means two container
 * formats from the same glyphs:
 *   TTF    - Flutter (desktop + mobile), and anything that installs a font
 *   WOFF2  - the web, at roughly half the bytes
 *
 * Writes:
 *   build/fonts/<Family>.svg    intermediate SVG font, handy for debugging
 *   fonts/<Family>.ttf          the committed deliverable, for any consumer
 *   fonts/<Family>.woff2        the same glyphs, for the web
 *   fonts/<name>-icons.css      @font-face blocks plus a class per icon
 *   flutter/fonts/<Family>.ttf  the same TTF, inside the Flutter package,
 *                               because Flutter can only load assets that live
 *                               under the package that declares them
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import { compress as woff2Compress } from 'wawoff2';
import { PATHS, p, isMain } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { readMetadata } from './build-outlines.js';

/**
 * Builds are reproducible so CI can diff the committed TTFs. TrueType stores a
 * creation date in `head`, which would otherwise change on every run, so it is
 * pinned rather than taken from the clock.
 */
const FONT_TIMESTAMP = 0;

const eachGroup = (metadata) => metadata.variants.flatMap((v) =>
  v.groups.map((g) => ({ variant: v, group: g })));

function svgFontFor(group, metadata) {
  const { unitsPerEm, descent } = metadata.font;
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new SVGIcons2SVGFontStream({
      fontName: group.family,
      fontHeight: unitsPerEm,
      descent,
      normalize: false,
      fixedWidth: true,
      centerHorizontally: false,
      log: () => {},
    });
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('finish', () => resolve(chunks.join('')));
    stream.on('error', reject);

    for (const icon of group.icons) {
      const file = path.join(PATHS.build, icon.outline);
      const glyph = Readable.from([fs.readFileSync(file, 'utf8')]);
      glyph.metadata = {
        name: icon.name,
        unicode: [String.fromCodePoint(icon.codepoint)],
      };
      stream.write(glyph);
    }
    stream.end();
  });
}

/**
 * The web stylesheet.
 *
 * A name maps to one codepoint, so `content` is written once per icon. Theme
 * and weight are chosen by swapping font family, and each contributes one
 * class - the defaults contribute none:
 *
 *     <i class="gi-home"></i>                     core, outline
 *     <i class="gi-filled gi-home"></i>           core, filled
 *     <i class="gi-eve gi-home"></i>              eve theme, outline
 *     <i class="gi-eve gi-filled gi-home"></i>    eve theme, filled
 */
function stylesheet(metadata, cssPrefix) {
  const px = cssPrefix;
  const lines = [
    `/* ${metadata.displayName} - GENERATED FILE, DO NOT EDIT. */`,
    '/* Regenerate with `npm run build` from the repository root. */',
    '',
  ];

  for (const { group } of eachGroup(metadata)) {
    lines.push(
      '@font-face {',
      `  font-family: "${group.family}";`,
      `  src: url("${group.family}.woff2") format("woff2"),`,
      `       url("${group.family}.ttf") format("truetype");`,
      '  font-weight: normal;',
      '  font-style: normal;',
      '  font-display: block;',
      '}',
      '',
    );
  }

  lines.push(
    `[class^="${px}-"],`,
    `[class*=" ${px}-"] {`,
    '  display: inline-block;',
    '  font-style: normal;',
    '  font-weight: normal;',
    '  font-variant: normal;',
    '  text-transform: none;',
    '  line-height: 1;',
    '  speak: never;',
    '  -webkit-font-smoothing: antialiased;',
    '  -moz-osx-font-smoothing: grayscale;',
    '}',
    '',
  );

  // Family selection, one rule per (variant, group).
  for (const variant of metadata.variants) {
    for (const group of variant.groups) {
      const names = group.icons.map((i) => i.name);
      const prefix = variant.classes.map((c) => `.${px}-${c}`).join('');
      lines.push(`/* ${group.name} - ${variant.name} */`);
      // The default theme and weight need no class at all, so the bare icon
      // class has to resolve on its own.
      if (prefix === '') {
        lines.push(`${names.map((n) => `.${px}-${n}`).join(',\n')} {`,
          `  font-family: "${group.family}";`, '}', '');
      } else {
        lines.push(`${names.map((n) => `${prefix}.${px}-${n}`).join(',\n')} {`,
          `  font-family: "${group.family}";`, '}', '');
      }
    }
  }

  // Codepoints, one rule per distinct icon name.
  const byName = new Map();
  for (const { group } of eachGroup(metadata)) {
    for (const icon of group.icons) byName.set(icon.name, icon.codepoint);
  }
  lines.push('/* codepoints */');
  for (const [name, codepoint] of [...byName].sort(([a], [b]) => (a < b ? -1 : 1))) {
    lines.push(`.${px}-${name}::before { content: "\\${codepoint.toString(16)}"; }`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function buildFonts({ quiet = false } = {}) {
  const metadata = readMetadata();
  const config = loadConfig();
  const log = quiet ? () => {} : (...args) => console.log(...args);

  const destinations = [PATHS.fonts, PATHS.fontsOut, p('flutter', 'fonts')];
  for (const dir of destinations) fs.mkdirSync(dir, { recursive: true });

  // Drop fonts for groups that no longer exist, so a renamed or deleted group
  // does not leave a stale asset behind.
  const expected = new Set(eachGroup(metadata)
    .flatMap(({ group }) => [`${group.family}.ttf`, `${group.family}.woff2`]));
  for (const dir of destinations) {
    for (const file of fs.readdirSync(dir)) {
      if ((file.endsWith('.ttf') || file.endsWith('.woff2')) && !expected.has(file)) {
        fs.rmSync(path.join(dir, file));
        log(`  removed stale font ${path.relative(p(), path.join(dir, file))}`);
      }
    }
  }

  const built = [];
  for (const { variant, group } of eachGroup(metadata)) {
    const svgFont = await svgFontFor(group, metadata);
    fs.writeFileSync(path.join(PATHS.fonts, `${group.family}.svg`), svgFont);

    const ttf = Buffer.from(
      svg2ttf(svgFont, { description: metadata.displayName, ts: FONT_TIMESTAMP }).buffer,
    );
    for (const dir of destinations) fs.writeFileSync(path.join(dir, `${group.family}.ttf`), ttf);

    // WOFF2 for the web. Same glyphs, roughly half the bytes.
    const woff2 = Buffer.from(await woff2Compress(ttf));
    for (const dir of [PATHS.fonts, PATHS.fontsOut]) {
      fs.writeFileSync(path.join(dir, `${group.family}.woff2`), woff2);
    }
    built.push({
      family: group.family, variant: variant.name, icons: group.icons.length,
      bytes: ttf.length, woff2: woff2.length,
    });
  }

  const css = stylesheet(metadata, config.cssPrefix);
  fs.writeFileSync(path.join(PATHS.fontsOut, `${metadata.name}-icons.css`), css);

  for (const { family, icons, bytes, woff2 } of built) {
    log(`  ${family}: ${icons} glyphs, ${(bytes / 1024).toFixed(1)} KiB ttf / ${(woff2 / 1024).toFixed(1)} KiB woff2`);
  }
  const total = built.reduce((n, b) => n + b.bytes, 0);
  const totalW = built.reduce((n, b) => n + b.woff2, 0);
  log(`  ${built.length} fonts -> fonts/ (${(total / 1024).toFixed(1)} KiB ttf, ${(totalW / 1024).toFixed(1)} KiB woff2)`);
  log(`  ${metadata.name}-icons.css written for web use`);
  return built;
}

if (isMain(import.meta.url)) buildFonts();
