import {
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import path from "node:path";

// Runtime-singleton packages: a second physical copy anywhere in node_modules
// means two React renderers / two Remotion runtimes can end up in one bundle.
const SINGLETON_PACKAGES = ["react", "react-dom", "remotion"];

// Total client JS budget for the Next build output (bytes). The build sits
// around 20 MB today; fail loudly if it grows past this rather than letting
// the editor bundle balloon silently.
const BUNDLE_BUDGET_BYTES = 30 * 1024 * 1024;

const failures = [];

// True when the path is (or links to) a directory. statSync follows
// symlinks, so linked packages (workspaces, file: deps, pnpm stores) count.
function isDirectory(fullPath) {
	try {
		return statSync(fullPath).isDirectory();
	} catch (error) {
		if (error.code === "ENOENT" || error.code === "ELOOP") return false; // dangling/cyclic symlink
		throw new Error(`cannot stat ${fullPath}: ${error.message}`);
	}
}

// Walk a node_modules directory with plain fs calls (no shell) so a scan
// failure surfaces as an error instead of silently passing the check.
// Symlinked packages are followed; `visited` holds real paths of package
// directories already scanned so link cycles and shared stores count once.
function collectPackageCopies(nodeModulesDir, pkg, copies, visited) {
	let entries;
	try {
		entries = readdirSync(nodeModulesDir, { withFileTypes: true });
	} catch (error) {
		throw new Error(`cannot read ${nodeModulesDir}: ${error.message}`);
	}
	const packageDirs = [];
	for (const entry of entries) {
		if (entry.name === ".bin" || entry.name === ".cache") continue;
		const fullPath = path.join(nodeModulesDir, entry.name);
		if (!isDirectory(fullPath)) continue;
		if (entry.name.startsWith("@")) {
			for (const scoped of readdirSync(fullPath, { withFileTypes: true })) {
				const scopedPath = path.join(fullPath, scoped.name);
				if (!isDirectory(scopedPath)) continue;
				packageDirs.push({
					name: `${entry.name}/${scoped.name}`,
					dir: scopedPath,
				});
			}
		} else {
			packageDirs.push({ name: entry.name, dir: fullPath });
		}
	}
	for (const { name, dir } of packageDirs) {
		const realDir = realpathSync(dir);
		if (visited.has(realDir)) continue;
		visited.add(realDir);
		const manifest = path.join(dir, "package.json");
		if (name === pkg && existsSync(manifest)) {
			copies.push(manifest);
		}
		const nested = path.join(dir, "node_modules");
		if (isDirectory(nested)) {
			collectPackageCopies(nested, pkg, copies, visited);
		}
	}
}

function findPackageCopies(pkg) {
	const copies = [];
	// Missing root node_modules just means nothing is installed; only failures
	// inside an existing tree should abort the scan.
	if (existsSync("node_modules")) {
		collectPackageCopies("node_modules", pkg, copies, new Set());
	}
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
