#!/usr/bin/env node
/**
 * Step 4 of the pipeline: one TTF per group.
 *
 * Groups are the unit of bundling. An app that only imports
 * `package:<name>_icons/<name>_core.dart` only ever references glyphs in the
 * GlyphCore font, so Flutter's release-mode icon tree-shaker can empty out the
 * other families entirely.
 *
 * Writes:
 *   build/fonts/<Family>.svg  intermediate SVG font, handy for debugging
 *   fonts/<Family>.ttf        the committed deliverable, for any consumer
 *   flutter/fonts/<Family>.ttf  the same file, inside the Flutter package,
 *                             because Flutter can only load assets that live
 *                             under the package that declares them
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import { PATHS, p } from './lib/paths.js';
import { readMetadata } from './build-outlines.js';

/**
 * Builds are reproducible so CI can diff the committed TTFs. TrueType stores a
 * creation date in `head`, which would otherwise change on every run, so it is
 * pinned rather than taken from the clock.
 */
const FONT_TIMESTAMP = 0;

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

export async function buildFonts({ quiet = false } = {}) {
  const metadata = readMetadata();
  const log = quiet ? () => {} : (...args) => console.log(...args);

  const destinations = [PATHS.fonts, PATHS.fontsOut, p('flutter', 'fonts')];
  for (const dir of destinations) fs.mkdirSync(dir, { recursive: true });

  // Drop fonts for groups that no longer exist, so a renamed or deleted group
  // does not leave a stale asset behind.
  const expected = new Set(metadata.groups.map((g) => `${g.family}.ttf`));
  for (const dir of destinations) {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.ttf') && !expected.has(file)) {
        fs.rmSync(path.join(dir, file));
        log(`  removed stale font ${path.relative(p(), path.join(dir, file))}`);
      }
    }
  }

  const built = [];
  for (const group of metadata.groups) {
    const svgFont = await svgFontFor(group, metadata);
    fs.writeFileSync(path.join(PATHS.fonts, `${group.family}.svg`), svgFont);

    const ttf = Buffer.from(
      svg2ttf(svgFont, { description: metadata.displayName, ts: FONT_TIMESTAMP }).buffer,
    );
    for (const dir of destinations) fs.writeFileSync(path.join(dir, `${group.family}.ttf`), ttf);
    built.push({ family: group.family, icons: group.icons.length, bytes: ttf.length });
  }

  for (const { family, icons, bytes } of built) {
    log(`  ${family}: ${icons} glyphs, ${(bytes / 1024).toFixed(1)} KiB`);
  }
  const total = built.reduce((n, b) => n + b.bytes, 0);
  log(`  ${built.length} fonts, ${(total / 1024).toFixed(1)} KiB total -> fonts/`);
  return built;
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) buildFonts();
