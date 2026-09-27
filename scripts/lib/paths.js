import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const p = (...parts) => path.join(REPO_ROOT, ...parts);

export const PATHS = {
  config: p('icons.config.json'),
  svg: p('svg'),
  build: p('build'),
  outlines: p('build', 'outlines'),
  fonts: p('build', 'fonts'),
  fontsOut: p('fonts'),
  metadata: p('build', 'metadata.json'),
  codepoints: p('codepoints.json'),
  flutter: p('flutter'),
  flutterLib: p('flutter', 'lib'),
  preview: p('preview'),
};
