#!/usr/bin/env node
/**
 * Derive a `filled` variant from its `outline` twin.
 *
 * Hand-drawing both weights produced two unrelated pictures — the wreath and
 * the snowflake shared no shape at all between them. A weight is supposed to be
 * the SAME icon drawn heavier, so the filled set is now generated from the
 * outline geometry and parity is structural rather than a thing to remember.
 *
 * The rule:
 *   closed contours  -> filled regions
 *   open strokes     -> their stroke outline (a ribbon)
 *   anything nested  -> a hole, via paper's containment-aware reorient
 *
 * A smile drawn as an open stroke inside a face therefore becomes a cut in the
 * solid face, which is exactly what it should be.
 */
import fs from 'node:fs';
import path from 'node:path';
import paper from 'paper-jsdom';
import { paperScope, outlineSvg } from './lib/outline.js';
import { PATHS, isMain } from './lib/paths.js';
import { loadConfig } from './lib/config.js';

const HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"'
  + ' fill="currentColor" stroke="none">';

/** A subpath is closed when it ends in Z; that is how the set is authored. */
const isClosed = (d) => /z\s*$/i.test(d.trim());

export function deriveFilled({ from, to, strokeWidth, quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);
  const src = path.join(PATHS.svg, from);
  if (!fs.existsSync(src)) throw new Error(`no such variant: svg/${from}`);

  let written = 0;
  for (const group of fs.readdirSync(src).sort()) {
    const dir = path.join(src, group);
    if (!fs.statSync(dir).isDirectory()) continue;
    const outDir = path.join(PATHS.svg, to, group);
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const ds = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
      if (!ds.length) throw new Error(`${from}/${group}/${file} has no paths`);

      const closed = ds.filter(isClosed);
      const open = ds.filter((d) => !isClosed(d));

      // Open strokes only exist as ink, so they have to be outlined before they
      // can take part in a fill.
      let ribbons = '';
      if (open.length) {
        const mini = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"`
          + ` stroke="currentColor" stroke-width="${strokeWidth}"`
          + ` stroke-linecap="round" stroke-linejoin="round">`
          + open.map((d) => `<path d="${d}"/>`).join('') + '</svg>';
        ribbons = outlineSvg(mini, { viewBox: 24, strokeWidth }).pathData;
      }

      const scope = paperScope(24);
      const compound = new paper.CompoundPath(closed.join('') + ribbons);
      // nonZero MUST be false here. With true, paper winds every child the same
      // way so nested contours can never cut — eyes, ring holes and ribbon cuts
      // all fill in and the icon collapses to a blob.
      compound.reorient(false, true);
      const d = compound.pathData;
      scope.project.clear();
      if (!d) throw new Error(`${from}/${group}/${file} produced empty geometry`);

      fs.writeFileSync(path.join(outDir, file),
        `${HEADER}\n  <path d="${d}"/>\n</svg>\n`, 'utf8');
      written++;
    }
  }
  log(`  ${to}: ${written} icons derived from ${from}`);
  return written;
}

if (isMain(import.meta.url)) {
  const config = loadConfig();
  const pairs = [];
  // `config.variants` is the DISCOVERED tree; the declared map is elsewhere.
  const declared = config.declaredVariants;
  for (const [name, v] of Object.entries(declared)) {
    if (v.weight !== 'filled') continue;
    const twin = Object.entries(declared)
      .find(([, o]) => o.theme === v.theme && o.weight === 'outline');
    if (twin) pairs.push([twin[0], name, config.styles[twin[1].style].strokeWidth]);
  }
  for (const [from, to, w] of pairs) {
    if (!fs.existsSync(path.join(PATHS.svg, from))) continue;
    deriveFilled({ from, to, strokeWidth: w });
  }
}
