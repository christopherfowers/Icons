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

const snake = (s) => s.replace(/-/g, '_');

/**
 * Discover the icon tree: `svg/<variant>/<group>/<icon>.svg`.
 *
 * Two axes, and they do different jobs:
 *
 *   variant - a (theme, weight) pair, and how an icon is drawn. Font Awesome's
 *             model: `theme` is the design language (a neutral `core`, plus any
 *             flavoured set a project wants) and `weight` is outline vs filled
 *             within it. A name is the same icon across every variant - one
 *             codepoint, picked apart by font family - so restyling or
 *             reweighting an icon never changes what you address it by.
 *   group   - what the icon is for. Groups are the unit of bundling: one font
 *             per (variant, group), so an app only ships what it imports.
 */
export function discoverVariants(svgRoot = PATHS.svg) {
  if (!fs.existsSync(svgRoot)) return [];
  const dirs = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();

  return dirs(svgRoot).map((variant) => {
    const variantDir = path.join(svgRoot, variant);
    return {
      name: variant,
      dir: variantDir,
      groups: dirs(variantDir).map((group) => ({
        name: group,
        dir: path.join(variantDir, group),
        icons: fs.readdirSync(path.join(variantDir, group))
          .filter((f) => f.endsWith('.svg'))
          .map((f) => f.slice(0, -4))
          .sort(),
      })),
    };
  });
}

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(PATHS.config, 'utf8'));
  const variants = discoverVariants();

  const variantSpec = (variant) => {
    const declared = config.variants[variant];
    if (!declared) {
      throw new Error(
        `svg/${variant}/ is not a declared variant - add it to "variants" in icons.config.json`,
      );
    }
    const spec = config.styles[declared.style];
    if (!spec) throw new Error(`variant "${variant}" uses unknown style "${declared.style}"`);
    return { variant, ...declared, ...spec };
  };

  /**
   * The default theme and weight contribute nothing to a name, so the neutral
   * set keeps the short names (`GlyphCore`) and flavoured or heavier sets
   * extend them (`GlyphCoreFilled`, `GlyphCoreEve`, `GlyphCoreEveFilled`).
   */
  const parts = (variant) => {
    const declared = config.variants[variant];
    if (!declared) throw new Error(`svg/${variant}/ is not a declared variant`);
    return [
      declared.theme === config.defaultTheme ? '' : declared.theme,
      declared.weight === config.defaultWeight ? '' : declared.weight,
    ].filter(Boolean);
  };

  const familyFor = (variant, group) =>
    `${config.fontFamilyPrefix}${pascal(group)}${parts(variant).map(pascal).join('')}`;
  const classFor = (variant, group) =>
    `${config.classPrefix}${pascal(group)}${parts(variant).map(pascal).join('')}`;
  const libraryFor = (variant, group) =>
    `${[config.name, snake(group), ...parts(variant).map(snake)].join('_')}.dart`;

  /** The CSS classes that select a variant, e.g. ["eve", "filled"]. */
  const classesFor = (variant) => parts(variant);

  return {
    ...config,
    /** The declared variants from icons.config.json, keyed by name. */
    declaredVariants: config.variants,
    /** The variants actually present under svg/, with their groups and icons. */
    variants,
    variantSpec,
    familyFor,
    classFor,
    libraryFor,
    classesFor,
    themes: [...new Set(Object.values(config.variants).map((v) => v.theme))],
    /** Every (variant, group, name) triple in the tree. */
    allIcons: () => variants.flatMap((v) =>
      v.groups.flatMap((g) => g.icons.map((name) => ({ variant: v.name, group: g.name, name })))),
    /** Distinct icon names across all variants - what codepoints are keyed by. */
    allNames: () => [...new Set(variants.flatMap((v) =>
      v.groups.flatMap((g) => g.icons)))].sort(),
  };
}
