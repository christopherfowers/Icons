import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const p = (...parts) => path.join(REPO_ROOT, ...parts);

/**
 * True when `metaUrl` is the script node was invoked with, i.e. this module is
 * the entry point rather than an import. Compare as file: URLs — on Windows
 * `path.resolve` yields `C:\dir\x.js`, which never equals the
 * `file:///C:/dir/x.js` form of `import.meta.url`.
 */
export const isMain = (metaUrl) =>
  Boolean(process.argv[1]) && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;

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
