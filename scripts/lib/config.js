import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './paths.js';

/** kebab-case -> PascalCase ("chevron-up" -> "ChevronUp"). */
export const pascal = (s) =>
  s.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** kebab-case -> lowerCamelCase ("chevron-up" -> "chevronUp"). */
export const camel = (s) => {
  const pc = pascal(s);
  return pc[0].toLowerCase() + pc.slice(1);
};

/**
 * Discover icon groups from the `svg/` tree. Each immediate subdirectory is a
 * group; every `*.svg` directly inside it is an icon. Groups are the unit of
 * bundling: one font file, one Dart class and one importable Dart library each,
 * so an app only pays for the groups it imports.
 */
export function discoverGroups(svgRoot = PATHS.svg) {
  if (!fs.existsSync(svgRoot)) return [];
  return fs
    .readdirSync(svgRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .map((name) => ({
      name,
      dir: path.join(svgRoot, name),
      icons: fs
        .readdirSync(path.join(svgRoot, name))
        .filter((f) => f.endsWith('.svg'))
        .map((f) => f.slice(0, -4))
        .sort(),
    }));
}

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(PATHS.config, 'utf8'));
  const groups = discoverGroups();

  /**
   * Which drawing style a group is authored in. `line` icons are stroked
   * centerlines that the build converts to outlines; `solid` icons are already
   * filled silhouettes and go through untouched apart from a cleanup union.
   */
  const styleFor = (group) => config.groupStyles?.[group] ?? config.defaultStyle;
  const specFor = (group) => {
    const style = styleFor(group);
    const spec = config.styles[style];
    if (!spec) throw new Error(`group "${group}" uses unknown style "${style}"`);
    return { style, ...spec };
  };

  return {
    ...config,
    styleFor,
    specFor,
    groups,
    /** Font family + Dart class name for a group, e.g. "core" -> "GlyphCore". */
    familyFor: (group) => `${config.fontFamilyPrefix}${pascal(group)}`,
    classFor: (group) => `${config.classPrefix}${pascal(group)}`,
    /** Dart library file for a group, e.g. "core" -> "glyph_core.dart". */
    libraryFor: (group) => `${config.name}_${group.replace(/-/g, '_')}.dart`,
    allIcons: () => groups.flatMap((g) => g.icons.map((name) => ({ group: g.name, name, style: styleFor(g.name) }))),
  };
}
