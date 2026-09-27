#!/usr/bin/env node
/**
 * Fails if the build produced changes that are not committed.
 *
 * Generated files that ship (codepoints.json, the Dart package, the fonts, the
 * preview) are committed on purpose: consumers get them straight from a clone,
 * and reviewers see what a source change did to the output. That only holds if
 * they are actually regenerated, so CI runs the build and then checks this.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from './lib/paths.js';

const TRACKED = [
  'codepoints.json', 'fonts', 'preview',
  'flutter/lib', 'flutter/fonts', 'flutter/pubspec.yaml', 'flutter/example/pubspec.yaml',
];

const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  const dirty = git('status', '--porcelain', '--', ...TRACKED).trim();
  if (!dirty) {
    console.log('generated files are up to date');
    process.exit(0);
  }
  console.error('Generated files are stale. Run `npm run build` and commit the result.\n');
  console.error(dirty);
  console.error('\n--- diff ---');
  // Binary fonts show as "Binary files differ", which is the useful signal.
  console.error(git('diff', '--stat', '--', ...TRACKED));
  process.exit(1);
}
