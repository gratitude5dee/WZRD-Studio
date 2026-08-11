import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Runtime-singleton packages: a second physical copy anywhere in node_modules
// means two React renderers / two Remotion runtimes can end up in one bundle.
const SINGLETON_PACKAGES = ["react", "react-dom", "remotion"];

// Total client JS budget for the Next build output (bytes). The build sits
// around 20 MB today; fail loudly if it grows past this rather than letting
// the editor bundle balloon silently.
const BUNDLE_BUDGET_BYTES = 30 * 1024 * 1024;

const failures = [];

// Walk a node_modules directory with plain fs calls (no shell) so a scan
// failure surfaces as an error instead of silently passing the check.
function collectPackageCopies(nodeModulesDir, pkg, copies) {
	let entries;
	try {
		entries = readdirSync(nodeModulesDir, { withFileTypes: true });
	} catch (error) {
		throw new Error(`cannot read ${nodeModulesDir}: ${error.message}`);
	}
	const packageDirs = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
		if (entry.name === ".bin" || entry.name === ".cache") continue;
		const fullPath = path.join(nodeModulesDir, entry.name);
		if (entry.name.startsWith("@")) {
			for (const scoped of readdirSync(fullPath, { withFileTypes: true })) {
				if (!scoped.isDirectory() || scoped.isSymbolicLink()) continue;
				packageDirs.push({
					name: `${entry.name}/${scoped.name}`,
					dir: path.join(fullPath, scoped.name),
				});
			}
		} else {
			packageDirs.push({ name: entry.name, dir: fullPath });
		}
	}
	for (const { name, dir } of packageDirs) {
		const manifest = path.join(dir, "package.json");
		if (name === pkg && existsSync(manifest)) {
			copies.push(manifest);
		}
		const nested = path.join(dir, "node_modules");
		if (existsSync(nested)) {
			collectPackageCopies(nested, pkg, copies);
		}
	}
}

function findPackageCopies(pkg) {
	const copies = [];
	collectPackageCopies("node_modules", pkg, copies);
	return copies;
}

function checkSingletons() {
	for (const pkg of SINGLETON_PACKAGES) {
		const copies = findPackageCopies(pkg);
		if (copies.length === 0) {
			failures.push(`${pkg}: not installed`);
		} else if (copies.length > 1) {
			failures.push(
				`${pkg}: ${copies.length} physical copies installed:\n  ${copies.join("\n  ")}`
			);
		}
	}
}

function checkZod3Alias() {
	const aliasPath = "node_modules/zod3/package.json";
	if (!existsSync(aliasPath)) {
		failures.push("zod3 alias: not installed");
		return;
	}
	const { name, version } = JSON.parse(readFileSync(aliasPath, "utf8"));
	if (name !== "zod" || !version.startsWith("3.")) {
		failures.push(`zod3 alias: resolves to ${name}@${version}, expected zod@3.x`);
	}
}

function totalJsBytes(dir) {
	let total = 0;
	for (const entry of readdirSync(dir)) {
		const fullPath = path.join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			total += totalJsBytes(fullPath);
		} else if (entry.endsWith(".js")) {
			total += stat.size;
		}
	}
	return total;
}

function checkBundleBudget() {
	const chunksDir = ".next/static/chunks";
	if (!existsSync(chunksDir)) {
		failures.push(
			`bundle budget: ${chunksDir} not found — run \`bun run web:build\` first`
		);
		return;
	}
	const bytes = totalJsBytes(chunksDir);
	const mb = (bytes / (1024 * 1024)).toFixed(1);
	const budgetMb = (BUNDLE_BUDGET_BYTES / (1024 * 1024)).toFixed(0);
	if (bytes > BUNDLE_BUDGET_BYTES) {
		failures.push(
			`bundle budget: client JS is ${mb} MB, over the ${budgetMb} MB budget`
		);
	} else {
		console.log(`Bundle budget OK: ${mb} MB of ${budgetMb} MB.`);
	}
}

const bundleOnly = process.argv.includes("--bundle");

if (bundleOnly) {
	checkBundleBudget();
} else {
	checkSingletons();
	checkZod3Alias();
}

if (failures.length > 0) {
	console.error("Dependency/bundle budget check failed:");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log(
	bundleOnly
		? "Bundle budget check passed."
		: "Dependency budget check passed (single React/ReactDOM/Remotion, zod3 alias on zod@3)."
);
