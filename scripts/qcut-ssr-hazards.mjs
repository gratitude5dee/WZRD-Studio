#!/usr/bin/env node
/**
 * List module-scope browser-API access inside the vendored QCut tree.
 *
 * The vendored editor is Vite-era browser-only code. Under `next build` any
 * module-scope `window` / `document` / `navigator` / `localStorage` access runs
 * on the server unless the importing route is a client-only island, so this
 * scanner is the inventory behind that guarantee.
 *
 * The walk is AST-based: it visits each top-level statement and descends into
 * everything except function-like bodies, so it reports exactly what runs at
 * import time. Access under a `typeof window !== "undefined"` guard still runs
 * at import time but is safe on the server, so it is counted separately.
 *
 * Usage: node scripts/qcut-ssr-hazards.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "src/qcut");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const GLOBALS = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "MediaRecorder",
  "matchMedia",
]);

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

/** Bodies that only run when something calls them, not at import time. */
function isDeferredBody(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  );
}

/**
 * A reference is only a hazard when the identifier resolves to the global —
 * `foo.window` and a locally declared `document` are not.
 */
function isGlobalReference(node) {
  if (!ts.isIdentifier(node) || !GLOBALS.has(node.text)) return false;
  const { parent } = node;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    ts.isTypeOfExpression(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isBindingElement(parent) ||
    ts.isParameter(parent) ||
    ts.isVariableDeclaration(parent) ||
    ts.isImportSpecifier(parent)
  ) {
    return false;
  }
  return true;
}

/** `typeof window !== "undefined"` and friends make the guarded body safe. */
function isTypeofGuard(node) {
  let found = false;
  const scan = (child) => {
    if (
      ts.isTypeOfExpression(child) &&
      ts.isIdentifier(child.expression) &&
      GLOBALS.has(child.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, scan);
  };
  scan(node);
  return found;
}

function findModuleScopeHazards(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const hazards = [];
  const lines = source.split("\n");

  const visit = (node, guarded) => {
    if (isDeferredBody(node)) return;

    if (isGlobalReference(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      hazards.push({
        line: line + 1,
        global: node.text,
        guarded,
        text: (lines[line] ?? "").trim().slice(0, 160),
      });
      return;
    }

    if (ts.isIfStatement(node) && isTypeofGuard(node.expression)) {
      visit(node.expression, guarded);
      visit(node.thenStatement, true);
      if (node.elseStatement) visit(node.elseStatement, guarded);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isTypeofGuard(node.left)
    ) {
      visit(node.left, guarded);
      visit(node.right, true);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, guarded));
  };

  ts.forEachChild(sourceFile, (node) => visit(node, false));
  return hazards;
}

const results = [];
for (const file of walk(SCAN_DIR)) {
  const hazards = findModuleScopeHazards(readFileSync(file, "utf8"), file);
  if (hazards.length) {
    results.push({ file: relative(ROOT, file), hazards });
  }
}

const count = (predicate) =>
  results.reduce((sum, r) => sum + r.hazards.filter(predicate).length, 0);
const unguarded = count((h) => !h.guarded);
const guarded = count((h) => h.guarded);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ unguarded, guarded, results }, null, 2));
} else {
  for (const { file, hazards } of results) {
    console.log(file);
    for (const hazard of hazards) {
      const tag = hazard.guarded ? "guarded" : "HAZARD ";
      console.log(`  ${tag} ${hazard.line}: [${hazard.global}] ${hazard.text}`);
    }
  }
  console.log(
    `\n${unguarded} unguarded module-scope browser-global access${unguarded === 1 ? "" : "es"}` +
      ` (plus ${guarded} behind a typeof guard) in ${results.length} file${results.length === 1 ? "" : "s"}.`,
  );
}
