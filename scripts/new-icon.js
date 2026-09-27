#!/usr/bin/env node
/**
 * Scaffolds a new source icon with the spec's boilerplate already in place:
 *
 *     npm run new -- core/bookmark
 *
 * Draw the centerline inside the safe area, then run `npm run build`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/paths.js';
import { loadConfig, discoverGroups } from './lib/config.js';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function main() {
  const config = loadConfig();
  const target = process.argv[2];

  if (!target || !target.includes('/')) {
    const groups = discoverGroups().map((g) => g.name);
    console.error('usage: npm run new -- <group>/<icon-name>');
    console.error(`\nexisting groups: ${groups.join(', ') || '(none yet)'}`);
    console.error('a group that does not exist yet is created for you');
    process.exit(1);
  }

  const [group, name] = target.split('/');
  for (const [label, value] of [['group', group], ['icon name', name]]) {
    if (!KEBAB_CASE.test(value)) {
      console.error(`${label} "${value}" must be kebab-case: lowercase letters, digits, single hyphens`);
      process.exit(1);
    }
  }

  const existing = discoverGroups().find((g) => g.icons.includes(name));
  if (existing) {
    console.error(`"${name}" already exists in group "${existing.name}" - icon names are unique across the whole set`);
    process.exit(1);
  }

  const spec = config.specFor(group);
  const { style, viewBox, padding, strokeWidth, linecap, linejoin } = spec;
  const safe = `${padding}..${viewBox - padding}`;

  const template = style === 'solid'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" fill="currentColor" stroke="none">
  <!-- Draw ${name} as a filled silhouette. Keep it inside ${safe} on both axes.
       Fills only: no stroke, no transform, no style, no fill-rule.
       Cut a hole by winding that contour against its parent.
       Delete this comment and the placeholder below. -->
  <path d="M${padding} ${padding}h${viewBox - padding * 2}v${viewBox - padding * 2}h-${viewBox - padding * 2}z"/>
</svg>
`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}">
  <!-- Draw ${name} here. Keep every coordinate inside ${safe} on both axes.
       Strokes only: no fill, no transform, no style, currentColor only.
       Delete this comment and the placeholder below. -->
  <path d="M${padding} ${viewBox / 2}h${viewBox - padding * 2}"/>
</svg>
`;

  const dir = path.join(PATHS.svg, group);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.svg`);
  fs.writeFileSync(file, template);

  console.log(`created svg/${group}/${name}.svg (${style} style)`);
  console.log('\nnext:');
  console.log(`  1. draw the icon in svg/${group}/${name}.svg (centerlines inside ${safe})`);
  console.log('  2. npm run build');
  console.log('  3. commit the source SVG together with the regenerated files');
}

main();
