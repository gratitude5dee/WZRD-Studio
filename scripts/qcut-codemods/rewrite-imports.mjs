#!/usr/bin/env node
/**
 * Phase 1 codemod: rewrite QCut app imports for the WZRD quarantine.
 *
 * - `@/foo`          -> `@qcut-app/foo`
 * - `@tanstack/react-router` -> `@qcut-app/lib/router-shim`
 * - `zod`            -> `zod3` (only within src/qcut/**)
 */

import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.turbo') continue;
      out.push(...walk(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

function rewrite(content) {
  let next = content;

  // '@/...' -> '@qcut-app/...'
  next = next.replaceAll("from '@/", "from '@qcut-app/");
  next = next.replaceAll("from \"@/", "from \"@qcut-app/");
  next = next.replaceAll("require('@/", "require('@qcut-app/");
  next = next.replaceAll("require(\"@/", "require(\"@qcut-app/");

  // Also handle dynamic imports / type imports / vi.mock strings etc.
  // (Any '@/' reference inside src/qcut/** must resolve to the vendored QCut app root,
  // not the host '@' alias which points to src/.)
  next = next.replaceAll("'@/", "'@qcut-app/");
  next = next.replaceAll('"@/', '"@qcut-app/');

  // Handle bare import '@/x'
  next = next.replaceAll("import '@/", "import '@qcut-app/");
  next = next.replaceAll("import \"@/", "import \"@qcut-app/");

  // TanStack Router -> router shim
  next = next.replaceAll("'@tanstack/react-router'", "'@qcut-app/lib/router-shim'");
  next = next.replaceAll('"@tanstack/react-router"', '"@qcut-app/lib/router-shim"');

  // zod -> zod3 (imports only)
  next = next.replaceAll("from 'zod'", "from 'zod3'");
  next = next.replaceAll('from "zod"', 'from "zod3"');
  next = next.replaceAll("require('zod')", "require('zod3')");
  next = next.replaceAll('require("zod")', 'require("zod3")');

  return next;
}

function main() {
  const repoRoot = path.resolve(process.cwd());
  const qcutRoot = path.join(repoRoot, 'src', 'qcut');
  if (!fs.existsSync(qcutRoot)) {
    console.error(`Missing ${qcutRoot} (run vendor-qcut first)`);
    process.exit(2);
  }

  const files = walk(qcutRoot).filter((p) => TEXT_EXTS.has(path.extname(p)));
  let changed = 0;

  for (const p of files) {
    const before = fs.readFileSync(p, 'utf-8');
    const after = rewrite(before);
    if (after !== before) {
      fs.writeFileSync(p, after, 'utf-8');
      changed++;
    }
  }

  console.log(`[rewrite-imports] updated ${changed} files`);
}

main();
