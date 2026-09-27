#!/usr/bin/env node
/**
 * Step 5 of the pipeline: the Flutter package's Dart surface and pubspec.
 *
 * One library per group, so an app imports only the groups it uses:
 *
 *     import 'package:glyph_icons/glyph_core.dart';   // just the core group
 *     import 'package:glyph_icons/glyph_icons.dart';  // everything
 *
 * Every icon is a `static const IconData`, which is what Flutter's release-mode
 * icon tree-shaker needs in order to strip unreferenced glyphs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, p } from './lib/paths.js';
import { loadConfig, camel, pascal } from './lib/config.js';
import { readMetadata } from './build-outlines.js';

const BANNER = [
  '// GENERATED FILE - DO NOT EDIT.',
  '//',
  '// Regenerate with `npm run build` from the repository root.',
  '',
];

/** Dart reserved words that cannot be used as a member name. */
const DART_RESERVED = new Set([
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export',
  'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'function',
  'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin',
  'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'set', 'show', 'static',
  'super', 'switch', 'sync', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void', 'while',
  'with', 'yield', 'hashCode', 'runtimeType', 'toString', 'noSuchMethod',
]);

/** kebab-case icon name -> a legal, non-colliding Dart member name. */
export function dartMemberName(name) {
  let member = camel(name);
  if (/^[0-9]/.test(member)) member = `n${pascal(name)}`;
  if (DART_RESERVED.has(member)) member = `${member}Icon`;
  return member;
}

const hex = (codepoint) => `0x${codepoint.toString(16)}`;
const unicode = (codepoint) => `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;

function groupLibrary(group, config, metadata) {
  const className = config.classFor(group.name);
  const lines = [
    ...BANNER,
    `/// ${metadata.displayName} - the \`${group.name}\` group.`,
    '///',
    `/// Importing this library pulls in the \`${group.family}\` font only, so an app`,
    '/// never pays for groups it does not use.',
    'library;',
    '',
    "import 'package:flutter/widgets.dart';",
    '',
    `/// The ${group.icons.length} icons in the \`${group.name}\` group.`,
    '///',
    '/// Every member is a `const IconData`, which lets `flutter build` strip the',
    '/// glyphs an app never references.',
    `class ${className} {`,
    `  const ${className}._();`,
    '',
    '  /// Font family backing every icon in this group.',
    `  static const String fontFamily = '${group.family}';`,
    '',
    '  /// Package that ships the font asset.',
    `  static const String fontPackage = '${config.packageName}';`,
    '',
  ];

  for (const icon of group.icons) {
    lines.push(
      `  /// The \`${icon.name}\` icon (${unicode(icon.codepoint)}).`,
      '  ///',
      `  /// Source: \`svg/${group.name}/${icon.name}.svg\``,
      `  static const IconData ${dartMemberName(icon.name)} =`,
      `      IconData(${hex(icon.codepoint)}, fontFamily: fontFamily, fontPackage: fontPackage);`,
      '',
    );
  }

  lines[lines.length - 1] = '}';
  lines.push('');
  return lines.join('\n');
}

function umbrellaLibrary(config, metadata) {
  const total = metadata.groups.reduce((n, g) => n + g.icons.length, 0);
  return [
    ...BANNER,
    `/// ${metadata.displayName}: all ${total} icons across ${metadata.groups.length} groups.`,
    '///',
    '/// Prefer importing a single group library when you only need part of the set:',
    '///',
    '/// ```dart',
    `/// import 'package:${config.packageName}/${config.libraryFor(metadata.groups[0].name)}';`,
    '/// ```',
    'library;',
    '',
    ...metadata.groups.map((g) => `export '${config.libraryFor(g.name)}';`),
    '',
  ].join('\n');
}

function catalogLibrary(config, metadata) {
  const lines = [
    ...BANNER,
    `/// Name-keyed lookup tables for ${metadata.displayName}.`,
    '///',
    '/// **Do not import this from production code.** Referencing a catalog marks',
    '/// every icon in it as used, which defeats Flutter\'s icon tree-shaking and',
    '/// ships the full font. It exists for galleries, documentation and tests.',
    'library;',
    '',
    "import 'package:flutter/widgets.dart';",
    '',
    ...metadata.groups.map((g) => `import '${config.libraryFor(g.name)}';`),
    '',
  ];

  for (const group of metadata.groups) {
    const variable = `${config.name}${pascal(group.name)}Catalog`;
    lines.push(
      `/// Every icon in the \`${group.name}\` group, keyed by its source name.`,
      `const Map<String, IconData> ${variable} = <String, IconData>{`,
      ...group.icons.map((icon) => `  '${icon.name}': ${config.classFor(group.name)}.${dartMemberName(icon.name)},`),
      '};',
      '',
    );
  }

  lines.push(
    '/// Every group, keyed by group name, in the order the groups are laid out',
    '/// under `svg/`.',
    `const Map<String, Map<String, IconData>> ${config.name}Catalog = <String, Map<String, IconData>>{`,
    ...metadata.groups.map((g) => `  '${g.name}': ${config.name}${pascal(g.name)}Catalog,`),
    '};',
    '',
  );
  return lines.join('\n');
}

function pubspec(config, metadata) {
  const lines = [
    '# GENERATED FILE - DO NOT EDIT.',
    '#',
    '# Regenerate with `npm run build` from the repository root. The font list is',
    '# derived from the directories under `svg/`.',
    `name: ${config.packageName}`,
    `description: ${config.packageDescription}`,
    `version: ${config.packageVersion}`,
    `repository: ${config.repository}`,
    '',
    'environment:',
    "  sdk: '>=3.0.0 <4.0.0'",
    "  flutter: '>=3.10.0'",
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    '',
    'dev_dependencies:',
    '  flutter_test:',
    '    sdk: flutter',
    '',
    'flutter:',
    '  fonts:',
  ];
  for (const group of metadata.groups) {
    lines.push(
      `    - family: ${group.family}`,
      '      fonts:',
      `        - asset: fonts/${group.family}.ttf`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function examplePubspec(config) {
  return [
    '# GENERATED FILE - DO NOT EDIT.',
    '#',
    '# Regenerate with `npm run build` from the repository root.',
    `name: ${config.packageName}_example`,
    `description: Example app showing every icon in ${config.displayName}.`,
    'publish_to: none',
    'version: 1.0.0',
    '',
    'environment:',
    "  sdk: '>=3.0.0 <4.0.0'",
    "  flutter: '>=3.10.0'",
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    `  ${config.packageName}:`,
    '    path: ../',
    '',
    'dev_dependencies:',
    '  flutter_test:',
    '    sdk: flutter',
    '',
    'flutter:',
    '  uses-material-design: true',
    '',
  ].join('\n');
}

/** Write `contents` to `file`, creating parents. Returns true if it changed. */
function writeIfChanged(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === contents) return false;
  fs.writeFileSync(file, contents);
  return true;
}

export function buildDart({ quiet = false } = {}) {
  const config = loadConfig();
  const metadata = readMetadata();
  const log = quiet ? () => {} : (...args) => console.log(...args);

  const files = new Map();
  files.set(p('flutter', 'pubspec.yaml'), pubspec(config, metadata));
  files.set(p('flutter', 'example', 'pubspec.yaml'), examplePubspec(config));
  files.set(path.join(PATHS.flutterLib, `${config.packageName}.dart`), umbrellaLibrary(config, metadata));
  files.set(path.join(PATHS.flutterLib, `${config.name}_catalog.dart`), catalogLibrary(config, metadata));
  for (const group of metadata.groups) {
    files.set(path.join(PATHS.flutterLib, config.libraryFor(group.name)), groupLibrary(group, config, metadata));
  }

  // Remove generated libraries for groups that no longer exist.
  const keep = new Set([...files.keys()]);
  if (fs.existsSync(PATHS.flutterLib)) {
    for (const file of fs.readdirSync(PATHS.flutterLib)) {
      const full = path.join(PATHS.flutterLib, file);
      if (file.endsWith('.dart') && !keep.has(full)) {
        fs.rmSync(full);
        log(`  removed stale library lib/${file}`);
      }
    }
  }

  let changed = 0;
  for (const [file, contents] of files) if (writeIfChanged(file, contents)) changed++;

  const total = metadata.groups.reduce((n, g) => n + g.icons.length, 0);
  log(`  generated ${files.size} Dart/pubspec files for ${total} icons (${changed} changed)`);

  // A renamed icon set leaves the hand-written example and tests importing the
  // old package, which fails in a confusing way. Catch it here instead.
  for (const file of [
    p('flutter', 'example', 'lib', 'main.dart'),
    p('flutter', 'test', `${config.packageName}_test.dart`),
  ]) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes(`package:${config.packageName}/`)) {
      console.warn(
        `  warning: ${path.relative(p(), file)} does not import package:${config.packageName}/ - `
        + 'update the hand-written example and tests after renaming the set',
      );
    }
  }

  return files.size;
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) buildDart();
