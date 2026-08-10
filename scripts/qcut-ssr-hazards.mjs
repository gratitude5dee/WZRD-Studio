#!/usr/bin/env node
/**
 * List module-scope browser-API access inside the vendored QCut tree.
 *
 * The vendored editor is Vite-era browser-only code. Under `next build` any
 * module-scope `window` / `document` / `navigator` / `localStorage` access runs
 * on the server unless the importing route is a client-only island, so this
 * scanner is the inventory behind that guarantee.
 *
 * Usage: node scripts/qcut-ssr-hazards.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "src/qcut");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "MediaRecorder",
  "matchMedia",
];
const GLOBAL_PATTERN = new RegExp(`\\b(${GLOBALS.join("|")})\\b\\s*(\\.|\\[)`);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
      continue;
    }
    if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Track brace/paren/bracket depth so we only report statements that execute at
 * import time, not the (safe) bodies of functions, classes, and components.
 */
function findModuleScopeHazards(source) {
  const hazards = [];
  let depth = 0;
  let inBlockComment = false;
  let inTemplate = false;

  source.split("\n").forEach((rawLine, index) => {
    let line = rawLine;

    if (inTemplate) {
      const ticks = (line.match(/`/g) ?? []).length;
      if (ticks % 2 === 1) inTemplate = false;
      return;
    }

    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlockComment = false;
    }

    line = line.replace(/\/\*.*?\*\//g, "");

    const blockStart = line.indexOf("/*");
    if (blockStart !== -1 && !line.includes("*/", blockStart)) {
      line = line.slice(0, blockStart);
      inBlockComment = true;
    }

    let code = line.replace(/\/\/.*$/, "");

    // Drop single-line template literals, then detect an unterminated one.
    code = code.replace(/`[^`]*`/g, "``");
    if ((code.match(/`/g) ?? []).length % 2 === 1) {
      inTemplate = true;
      code = code.slice(0, code.indexOf("`"));
    }

    const openDepth = depth;

    if (openDepth === 0 && GLOBAL_PATTERN.test(code)) {
      const match = code.match(GLOBAL_PATTERN);
      hazards.push({
        line: index + 1,
        global: match[1],
        text: rawLine.trim().slice(0, 160),
      });
    }

    for (const char of code) {
      if (char === "{" || char === "(" || char === "[") depth++;
      else if (char === "}" || char === ")" || char === "]") depth--;
    }
    if (depth < 0) depth = 0;
  });

  return hazards;
}

const results = [];
for (const file of walk(SCAN_DIR)) {
  const hazards = findModuleScopeHazards(readFileSync(file, "utf8"));
  if (hazards.length) {
    results.push({ file: relative(ROOT, file), hazards });
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const { file, hazards } of results) {
    console.log(file);
    for (const hazard of hazards) {
      console.log(`  ${hazard.line}: [${hazard.global}] ${hazard.text}`);
    }
  }
  const total = results.reduce((sum, r) => sum + r.hazards.length, 0);
  console.log(
    `\n${total} module-scope browser-global access${total === 1 ? "" : "es"} in ${results.length} file${results.length === 1 ? "" : "s"}.`,
  );
}
