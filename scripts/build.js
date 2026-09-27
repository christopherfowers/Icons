#!/usr/bin/env node
/**
 * The whole pipeline, in order. `npm run build`.
 *
 *   1. lint source SVGs against the design spec
 *   2. convert strokes to filled outlines
 *   3. assign codepoints (stable for existing names, next free for new ones)
 *   4. generate one TTF per group
 *   5. generate the Dart libraries and the package pubspec
 *   6. regenerate the preview gallery
 *
 * Steps 2 and 3 run together because the outline pass is what enumerates the
 * icons that need codepoints.
 */
import path from 'node:path';
import { lintAll } from './lint.js';
import { buildOutlines } from './build-outlines.js';
import { buildFonts } from './build-font.js';
import { buildDart } from './build-dart.js';
import { buildPreview } from './build-preview.js';

const steps = [
  ['lint source SVGs', () => {
    const report = lintAll();
    const total = report.reduce((n, entry) => n + entry.problems.length, 0);
    if (total > 0) {
      for (const { file, problems } of report) {
        console.error(`\n${file}`);
        for (const problem of problems) console.error(`  - ${problem}`);
      }
      throw new Error(`${total} spec violation(s) in ${report.length} file(s)`);
    }
    console.log('  all source icons conform to the spec');
  }],
  ['outline strokes + assign codepoints', () => buildOutlines()],
  ['generate fonts', () => buildFonts()],
  ['generate Dart package', () => buildDart()],
  ['regenerate preview', () => buildPreview()],
];

export async function build() {
  const started = Date.now();
  for (const [index, [title, run]] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}] ${title}`);
    await run();
  }
  console.log(`\nbuild complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  build().catch((error) => {
    console.error(`\nbuild failed: ${error.message}`);
    process.exit(1);
  });
}
