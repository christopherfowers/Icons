#!/usr/bin/env node
/**
 * Step 2 of the pipeline: convert every stroked source icon into a single
 * filled path, and assign codepoints (step 3) while we are here.
 *
 * Writes:
 *   build/outlines/<group>/<name>.svg  - one filled <path>, same 24x24 viewBox
 *   build/metadata.json                - what the later steps consume
 *   codepoints.json                    - committed, permanent name -> codepoint
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { outlineSvg, flattenSolid } from './lib/outline.js';
import { assignCodepoints, writeCodepoints } from './lib/codepoints.js';

export function buildOutlines({ quiet = false } = {}) {
  const config = loadConfig();
  const log = quiet ? () => {} : (...args) => console.log(...args);

  const iconNames = config.allIcons().map((icon) => icon.name);
  const { assignments, next, changes } = assignCodepoints(iconNames, config.codepoints);
  const codepointsChanged = writeCodepoints(next);
  for (const change of changes) log(`  codepoints: ${change}`);

  fs.rmSync(PATHS.outlines, { recursive: true, force: true });

  const groups = [];
  const warnings = [];
  for (const group of config.groups) {
    const outDir = path.join(PATHS.outlines, group.name);
    fs.mkdirSync(outDir, { recursive: true });
    const spec = config.specFor(group.name);
    const icons = [];
    for (const name of group.icons) {
      const source = fs.readFileSync(path.join(group.dir, `${name}.svg`), 'utf8');
      // Line icons are stroked centerlines and must be outlined; solid icons
      // are already silhouettes and only need a normalising union.
      const { pathData, bounds, shapeCount, fallback } = spec.style === 'solid'
        ? flattenSolid(source, { viewBox: spec.viewBox })
        : outlineSvg(source, { viewBox: spec.viewBox, strokeWidth: spec.strokeWidth });
      if (fallback) {
        warnings.push(`${group.name}/${name}: ${fallback} - emitted overlapping contours instead`);
      }
      const size = spec.viewBox;
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
        `  <path d="${pathData}" fill="currentColor"/>`,
        '</svg>',
        '',
      ].join('\n');
      const file = path.join(outDir, `${name}.svg`);
      fs.writeFileSync(file, svg);
      icons.push({
        name,
        codepoint: assignments.get(name),
        outline: path.relative(PATHS.build, file),
        pathData,
        bounds,
        shapeCount,
      });
    }
    groups.push({ name: group.name, family: config.familyFor(group.name), style: spec.style, icons });
  }

  const metadata = {
    generatedBy: 'npm run build',
    name: config.name,
    displayName: config.displayName,
    packageName: config.packageName,
    styles: config.styles,
    font: config.font,
    groups,
  };
  fs.mkdirSync(PATHS.build, { recursive: true });
  fs.writeFileSync(PATHS.metadata, `${JSON.stringify(metadata, null, 2)}\n`);

  for (const warning of warnings) console.warn(`  warning: ${warning}`);
  log(`  outlined ${iconNames.length} icons into build/outlines/`);
  if (codepointsChanged) log('  codepoints.json updated - commit it');

  return metadata;
}

export function readMetadata() {
  if (!fs.existsSync(PATHS.metadata)) {
    throw new Error('build/metadata.json is missing - run `npm run build` first');
  }
  return JSON.parse(fs.readFileSync(PATHS.metadata, 'utf8'));
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) buildOutlines();
