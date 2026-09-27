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
 *   variant - how an icon is drawn (outline vs filled). The same icon name in
 *             both variants is the *same icon*: it keeps one codepoint, and the
 *             variant is chosen by picking a font family. That is how Font
 *             Awesome's regular/solid split works, and it means switching an
 *             icon's weight never changes what you address it by.
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

  /** Font family / Dart class for one (variant, group), e.g. "GlyphCoreFilled". */
  const familyFor = (variant, group) =>
    `${config.fontFamilyPrefix}${pascal(group)}${config.variants[variant].familySuffix}`;
  const classFor = (variant, group) =>
    `${config.classPrefix}${pascal(group)}${config.variants[variant].classSuffix}`;
  const libraryFor = (variant, group) => {
    const suffix = config.variants[variant].classSuffix;
    return `${config.name}_${snake(group)}${suffix ? `_${snake(suffix.toLowerCase())}` : ''}.dart`;
  };

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
    /** Every (variant, group, name) triple in the tree. */
    allIcons: () => variants.flatMap((v) =>
      v.groups.flatMap((g) => g.icons.map((name) => ({ variant: v.name, group: g.name, name })))),
    /** Distinct icon names across all variants - what codepoints are keyed by. */
    allNames: () => [...new Set(variants.flatMap((v) =>
      v.groups.flatMap((g) => g.icons)))].sort(),
  };
}
