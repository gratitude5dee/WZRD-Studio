/**
 * Build-time asset-existence check: every video style declared in
 * `src/components/project-setup/videoStyles.ts` must have a non-empty thumbnail
 * file under `public/`. A missing thumbnail fails the build instead of shipping
 * a blank card.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const CATALOG = path.join(process.cwd(), "src", "components", "project-setup", "videoStyles.ts");

const source = readFileSync(CATALOG, "utf8");

const thumbnailDir = source.match(/STYLE_THUMBNAIL_DIR\s*=\s*'([^']+)'/)?.[1];
if (!thumbnailDir) {
	console.error(`[style-thumbnails] Could not read STYLE_THUMBNAIL_DIR from ${CATALOG}`);
	process.exit(1);
}

const entries = [...source.matchAll(/value:\s*'([a-z-]+)',\s*\n\s*label:/g)].map(([, value]) => value);
if (entries.length === 0) {
	console.error(`[style-thumbnails] Could not parse any styles from ${CATALOG}`);
	process.exit(1);
}

const declared = [...source.matchAll(/thumbnail:\s*`\$\{STYLE_THUMBNAIL_DIR\}\/([^`]+)`/g)].map(
	([, file]) => file,
);

if (declared.length !== entries.length) {
	console.error(
		`[style-thumbnails] ${entries.length} styles declared but ${declared.length} thumbnails found. ` +
			`Every style must declare a thumbnail.`,
	);
	process.exit(1);
}

const violations = [];

for (const [index, file] of declared.entries()) {
	const publicPath = path.join(process.cwd(), "public", thumbnailDir.replace(/^\//, ""), file);
	try {
		const stats = statSync(publicPath);
		if (!stats.isFile() || stats.size === 0) {
			violations.push(`${entries[index]}: ${publicPath} is empty or not a file`);
		}
	} catch {
		violations.push(`${entries[index]}: missing ${path.relative(process.cwd(), publicPath)}`);
	}
}

if (violations.length > 0) {
	console.error("[style-thumbnails] Missing video-style thumbnails:");
	for (const violation of violations) console.error(`  - ${violation}`);
	console.error("\nRun `node scripts/generate-style-thumbnails.mjs` to author the asset set.");
	process.exit(1);
}

console.log(`[style-thumbnails] OK — ${declared.length} style thumbnails present.`);
