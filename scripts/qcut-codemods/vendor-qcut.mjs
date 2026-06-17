#!/usr/bin/env node
/**
 * Phase 1 vendoring script.
 *
 * Copies the supported QCut source subtrees from QCUT_SRC into src/qcut/**.
 *
 * Usage:
 *   node scripts/qcut-codemods/vendor-qcut.mjs --src /abs/path/to/qcut-master/qcut
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { src: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') {
      args.src = argv[i + 1];
      i++;
    }
  }
  return args;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }
  ensureDir(destDir);
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    force: true,
    dereference: false,
    filter: (srcPath) => {
      // Ignore build artifacts / deps.
      const base = path.basename(srcPath);
      if (base === 'node_modules' || base === 'dist' || base === '.turbo') return false;
      return true;
    },
  });
}

function copySelected(srcRoot, destRoot) {
  // Packages (pure TS + platform web adapter)
  copyDir(path.join(srcRoot, 'packages', 'editor-core', 'src'), path.join(destRoot, 'editor-core'));
  copyDir(path.join(srcRoot, 'packages', 'platform-core', 'src'), path.join(destRoot, 'platform', 'core'));
  copyDir(path.join(srcRoot, 'packages', 'platform-web', 'src'), path.join(destRoot, 'platform', 'web'));

  // App-layer: only the supported subfolders (no routes, no auth/db/license/blog)
  const appSrc = path.join(srcRoot, 'apps', 'web', 'src');
  const appDest = path.join(destRoot, 'app');
  const allowed = ['components', 'stores', 'lib', 'hooks', 'constants', 'types', 'config'];

  for (const name of allowed) {
    const from = path.join(appSrc, name);
    if (!fs.existsSync(from)) continue;
    copyDir(from, path.join(appDest, name));
  }

  // Remove explicitly out-of-scope heavy subsystems that may exist under allowed dirs.
  // (These will be stubbed/capability-flagged later.)
  const removeIfExists = (p) => {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  };

  removeIfExists(path.join(appDest, 'stores', 'moyin'));
  removeIfExists(path.join(appDest, 'lib', 'moyin'));
  removeIfExists(path.join(appDest, 'components', 'editor', 'media-panel', 'views', 'moyin'));
  removeIfExists(path.join(appDest, 'lib', 'license'));
  removeIfExists(path.join(appDest, 'hooks', 'auth'));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.src) {
    console.error('Missing --src');
    process.exit(2);
  }
  const srcRoot = path.resolve(args.src);
  const repoRoot = path.resolve(process.cwd());
  const destRoot = path.join(repoRoot, 'src', 'qcut');

  console.log(`[vendor-qcut] src:  ${srcRoot}`);
  console.log(`[vendor-qcut] dest: ${destRoot}`);

  ensureDir(destRoot);
  copySelected(srcRoot, destRoot);

  console.log('[vendor-qcut] done');
}

main();
