#!/usr/bin/env node
/**
 * Lints every source SVG against the design spec in README.md.
 *
 * The spec is not style advice: the build depends on it. Strokes must be
 * uniform for the outliner to produce consistent weights, colours must be
 * `currentColor` so Flutter can tint the glyph, and transforms / embedded
 * styles are banned because the font pipeline flattens geometry and would
 * silently drop them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PATHS, isMain } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { geometryBounds } from './lib/outline.js';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Elements each style may use. A `solid` icon has no strokes, so a zero-area
 *  element like <line> or <polyline> would simply vanish in the font. */
const ALLOWED_ELEMENTS = {
  line: new Set(['svg', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']),
  solid: new Set(['svg', 'path', 'circle', 'ellipse', 'rect', 'polygon']),
};

/** Attributes that may appear on the root <svg>. */
const ROOT_ATTRIBUTES = {
  line: new Set(['xmlns', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']),
  solid: new Set(['xmlns', 'viewBox', 'fill', 'stroke']),
};

/** Attributes that may appear on a shape element (beyond its own geometry). */
const SHAPE_ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
]);

const BANNED_ATTRIBUTES = [
  'transform', 'style', 'class', 'id', 'opacity', 'fill-opacity', 'stroke-opacity',
  // TrueType only has the nonzero rule. Holes are expressed by winding a
  // contour against its parent, never by fill-rule.
  'fill-rule', 'clip-rule', 'clip-path', 'mask', 'filter',
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  allowBooleanAttributes: true,
  preserveOrder: true,
  trimValues: true,
});

/** Flatten the preserveOrder tree into [{ name, attrs, depth }]. */
function walk(nodes, depth = 0, out = []) {
  for (const node of nodes) {
    for (const [name, value] of Object.entries(node)) {
      if (name === ':@' || name === '#text') continue;
      out.push({ name, attrs: node[':@'] || {}, depth });
      if (Array.isArray(value)) walk(value, depth + 1, out);
    }
  }
  return out;
}

const attr = (node, name) => node.attrs[`@${name}`];

function lintFile({ spec, name, file }) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const { style, viewBox, padding, strokeWidth, linecap, linejoin } = spec;
  // A style's NAME is free (line, round, ...); its KIND decides the rules, so a
  // new stroked style does not need a parallel copy of every table below.
  const kind = spec.kind ?? style;
  const allowedElements = ALLOWED_ELEMENTS[kind];
  const rootAttributes = ROOT_ATTRIBUTES[kind];
  if (!allowedElements) return [`uses unknown style kind "${kind}"`];

  if (!KEBAB_CASE.test(name)) {
    fail(`filename "${name}.svg" is not kebab-case (lowercase letters, digits and single hyphens)`);
  }

  const source = fs.readFileSync(file, 'utf8');

  if (/<!\[CDATA\[|<!DOCTYPE|<\?xml-stylesheet/i.test(source)) {
    fail('contains a DOCTYPE, CDATA block or stylesheet processing instruction');
  }

  let nodes;
  try {
    nodes = walk(parser.parse(source));
  } catch (error) {
    return [`is not well-formed XML: ${error.message}`];
  }

  const root = nodes.find((n) => n.depth === 0);
  if (!root || root.name !== 'svg') return ['does not have a single <svg> root element'];

  // --- root element ---------------------------------------------------------
  const expectedViewBox = `0 0 ${viewBox} ${viewBox}`;
  if (attr(root, 'viewBox') !== expectedViewBox) {
    fail(`root viewBox is "${attr(root, 'viewBox') ?? '(missing)'}", expected "${expectedViewBox}"`);
  }
  if (kind === 'line') {
    if (attr(root, 'fill') !== 'none') fail('root <svg> must carry fill="none"');
    if (attr(root, 'stroke') !== 'currentColor') fail('root <svg> must carry stroke="currentColor"');
    if (String(attr(root, 'stroke-width')) !== String(strokeWidth)) {
      fail(`root stroke-width must be "${strokeWidth}", found "${attr(root, 'stroke-width') ?? '(missing)'}"`);
    }
    if (attr(root, 'stroke-linecap') !== linecap) fail(`root stroke-linecap must be "${linecap}"`);
    if (attr(root, 'stroke-linejoin') !== linejoin) fail(`root stroke-linejoin must be "${linejoin}"`);
  } else {
    if (attr(root, 'fill') !== 'currentColor') fail('root <svg> must carry fill="currentColor"');
    if (attr(root, 'stroke') !== 'none') {
      fail('root <svg> must carry stroke="none" - solid icons are silhouettes, not outlines');
    }
  }
  if (attr(root, 'width') !== undefined || attr(root, 'height') !== undefined) {
    fail('root <svg> must not set width/height - the viewBox alone defines the canvas');
  }

  const shapes = nodes.filter((n) => n !== root);
  if (shapes.length === 0) fail('contains no drawable geometry');

  // --- every element --------------------------------------------------------
  for (const node of nodes) {
    if (!allowedElements.has(node.name)) {
      fail(`<${node.name}> is not allowed in a ${style} icon (permitted: ${[...allowedElements].join(', ')})`);
      continue;
    }
    for (const banned of BANNED_ATTRIBUTES) {
      if (attr(node, banned) !== undefined) fail(`<${node.name}> uses the banned attribute "${banned}"`);
    }
    for (const key of Object.keys(node.attrs)) {
      const bare = key.slice(1);
      const allowed = node === root
        ? rootAttributes.has(bare)
        : SHAPE_ATTRIBUTES.has(bare) || rootAttributes.has(bare);
      if (!allowed && !BANNED_ATTRIBUTES.includes(bare)) {
        fail(`<${node.name}> carries an unexpected attribute "${bare}"`);
      }
    }
    if (node !== root && kind === 'line') {
      const fill = attr(node, 'fill');
      if (fill !== undefined && fill !== 'none') {
        fail(`<${node.name}> sets fill="${fill}" - line icons are strokes only, fills must stay "none"`);
      }
      const stroke = attr(node, 'stroke');
      if (stroke !== undefined && stroke !== 'currentColor') {
        fail(`<${node.name}> sets stroke="${stroke}" - only "currentColor" is allowed`);
      }
      const width = attr(node, 'stroke-width');
      if (width !== undefined && String(width) !== String(strokeWidth)) {
        fail(`<${node.name}> overrides stroke-width to "${width}" - the set is a uniform ${strokeWidth}px weight`);
      }
    }
    if (node !== root && kind === 'solid') {
      const fill = attr(node, 'fill');
      if (fill !== undefined && fill !== 'currentColor') {
        fail(`<${node.name}> sets fill="${fill}" - solid icons inherit fill="currentColor" from the root`);
      }
      if (attr(node, 'stroke') !== undefined || attr(node, 'stroke-width') !== undefined) {
        fail(`<${node.name}> sets a stroke - solid icons are filled shapes only`);
      }
    }
  }

  // Colours anywhere in the markup.
  const colour = source.match(/(?:fill|stroke)\s*=\s*"(?!none"|currentColor")([^"]+)"/);
  if (colour) fail(`hard-coded colour "${colour[1]}" - use currentColor so Flutter can tint the icon`);

  // --- geometry -------------------------------------------------------------
  if (problems.length === 0) {
    let bounds;
    try {
      bounds = geometryBounds(source, viewBox);
    } catch (error) {
      return [`could not be parsed as geometry: ${error.message}`];
    }
    if (!bounds) {
      fail('contains no drawable geometry');
    } else {
      const min = padding;
      const max = viewBox - padding;
      const tolerance = 1e-6;
      const round = (n) => Math.round(n * 1000) / 1000;
      if (bounds.x < min - tolerance || bounds.y < min - tolerance
        || bounds.x + bounds.width > max + tolerance || bounds.y + bounds.height > max + tolerance) {
        fail(
          `geometry spans (${round(bounds.x)}, ${round(bounds.y)}) to `
          + `(${round(bounds.x + bounds.width)}, ${round(bounds.y + bounds.height)}), `
          + `which breaks the ${padding}px padding - keep ${kind === 'line' ? 'centerlines' : 'the silhouette'} inside ${min}..${max}`,
        );
      }
    }
  }

  return problems;
}

export function lintAll() {
  const config = loadConfig();
  const report = [];

  if (config.variants.length === 0) {
    return [{ file: 'svg/', problems: ['no variants found - expected svg/<variant>/<group>/<icon>.svg'] }];
  }

  for (const variant of config.variants) {
    let spec;
    try {
      spec = config.variantSpec(variant.name);
    } catch (error) {
      report.push({ file: `svg/${variant.name}/`, problems: [error.message] });
      continue;
    }

    const seen = new Map();
    for (const group of variant.groups) {
      if (!KEBAB_CASE.test(group.name)) {
        report.push({
          file: `svg/${variant.name}/${group.name}/`,
          problems: ['group directory name is not kebab-case'],
        });
      }
      if (group.icons.length === 0) {
        report.push({
          file: `svg/${variant.name}/${group.name}/`,
          problems: ['group contains no icons'],
        });
      }
      for (const name of group.icons) {
        const file = path.join(group.dir, `${name}.svg`);
        const problems = lintFile({ spec, name, file });
        // Within a variant a name is the public API and the codepoint key, so
        // it has to be unique even though the folders are separate.
        if (seen.has(name)) {
          problems.push(`duplicate icon name - also defined in group "${seen.get(name)}"`);
        } else {
          seen.set(name, group.name);
        }
        if (problems.length) {
          report.push({ file: `svg/${path.relative(PATHS.svg, file)}`, problems });
        }
      }
    }
  }

  // An icon present in one variant but not another is legal but worth saying
  // out loud, because a UI that switches weight will fall back unexpectedly.
  const byVariant = new Map(config.variants.map((v) => [
    v.name, new Set(v.groups.flatMap((g) => g.icons)),
  ]));
  const gaps = [];
  for (const name of config.allNames()) {
    const missing = [...byVariant.entries()].filter(([, names]) => !names.has(name)).map(([v]) => v);
    if (missing.length && missing.length < byVariant.size) {
      gaps.push(`"${name}" is missing from: ${missing.join(', ')}`);
    }
  }
  if (gaps.length) report.push({ file: 'svg/ (variant coverage)', problems: gaps, warning: true });

  return report;
}

if (isMain(import.meta.url)) {
  const report = lintAll().filter((e) => !e.warning);
  const warnings = lintAll().filter((e) => e.warning);
  for (const { file, problems } of warnings) {
    console.warn(`\n${file}`);
    for (const problem of problems) console.warn(`  ! ${problem}`);
  }
  const total = report.reduce((n, entry) => n + entry.problems.length, 0);
  if (total === 0) {
    const config = loadConfig();
    const icons = config.allIcons();
    const summary = config.variants
      .map((v) => `${v.groups.reduce((n, g) => n + g.icons.length, 0)} ${v.name}`).join(', ');
    console.log(
      `lint: ${icons.length} source files (${summary}) across `
      + `${config.allNames().length} distinct icons, all conform to the spec`,
    );
    process.exit(0);
  }
  for (const { file, problems } of report) {
    console.error(`\n${file}`);
    for (const problem of problems) console.error(`  - ${problem}`);
  }
  console.error(`\nlint failed: ${total} problem(s) in ${report.length} file(s)`);
  process.exit(1);
}
