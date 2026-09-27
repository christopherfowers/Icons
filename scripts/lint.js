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
import { PATHS } from './lib/paths.js';
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

function lintFile({ group, name, file, config }) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const spec = config.specFor(group);
  const { style, viewBox, padding, strokeWidth, linecap, linejoin } = spec;
  const allowedElements = ALLOWED_ELEMENTS[style];
  const rootAttributes = ROOT_ATTRIBUTES[style];

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
  if (style === 'line') {
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
    if (node !== root && style === 'line') {
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
    if (node !== root && style === 'solid') {
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
          + `which breaks the ${padding}px padding - keep ${style === 'line' ? 'centerlines' : 'the silhouette'} inside ${min}..${max}`,
        );
      }
    }
  }

  return problems;
}

export function lintAll() {
  const config = loadConfig();
  const report = [];
  const seen = new Map();

  if (config.groups.length === 0) report.push({ file: 'svg/', problems: ['no icon groups found'] });

  for (const group of config.groups) {
    if (!KEBAB_CASE.test(group.name)) {
      report.push({ file: `svg/${group.name}/`, problems: [`group directory name is not kebab-case`] });
    }
    if (group.icons.length === 0) {
      report.push({ file: `svg/${group.name}/`, problems: ['group contains no icons'] });
    }
    for (const name of group.icons) {
      const file = path.join(group.dir, `${name}.svg`);
      const relative = path.relative(PATHS.svg, file);
      const problems = lintFile({ group: group.name, name, file, config });
      // Names are the public API (and the codepoint key), so they must be
      // globally unique even though the folders are separate.
      if (seen.has(name)) {
        problems.push(`duplicate icon name - also defined in group "${seen.get(name)}"`);
      } else {
        seen.set(name, group.name);
      }
      if (problems.length) report.push({ file: `svg/${relative}`, problems });
    }
  }
  return report;
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  const report = lintAll();
  const total = report.reduce((n, entry) => n + entry.problems.length, 0);
  if (total === 0) {
    const config = loadConfig();
    const icons = config.allIcons();
    const byStyle = icons.reduce((acc, icon) => ({ ...acc, [icon.style]: (acc[icon.style] ?? 0) + 1 }), {});
    const summary = Object.entries(byStyle).map(([style, n]) => `${n} ${style}`).join(', ');
    console.log(`lint: ${icons.length} icons in ${config.groups.length} groups (${summary}), all conform to the spec`);
    process.exit(0);
  }
  for (const { file, problems } of report) {
    console.error(`\n${file}`);
    for (const problem of problems) console.error(`  - ${problem}`);
  }
  console.error(`\nlint failed: ${total} problem(s) in ${report.length} file(s)`);
  process.exit(1);
}
