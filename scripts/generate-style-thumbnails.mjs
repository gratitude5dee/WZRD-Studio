/**
 * Authors the project-setup video-style thumbnail set into
 * `public/style-thumbnails/`. Thumbnails are deterministic, dependency-free SVGs
 * so they render identically in the browser, in Electron, and in tests.
 *
 * Run: node scripts/generate-style-thumbnails.mjs
 * Verify: node scripts/check-style-thumbnails.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "style-thumbnails");

const W = 160;
const H = 160;

const frame = (id, body) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${id} style preview">\n${body}\n</svg>\n`;

const linear = (id, stops, angle = "x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"") =>
	`  <defs><linearGradient id="${id}" ${angle}>${stops
		.map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`)
		.join("")}</linearGradient></defs>`;

const bg = (fill) => `  <rect width="${W}" height="${H}" fill="${fill}"/>`;

const styles = {
	none: [
		bg("#141418"),
		`  <rect x="8" y="8" width="144" height="144" fill="none" stroke="#3a3a44" stroke-width="2" stroke-dasharray="6 6" rx="10"/>`,
		`  <line x1="34" y1="126" x2="126" y2="34" stroke="#5a5a66" stroke-width="3" stroke-linecap="round"/>`,
		`  <circle cx="80" cy="80" r="34" fill="none" stroke="#5a5a66" stroke-width="3"/>`,
	],
	cinematic: [
		linear("cin", [
			["0%", "#1b1f2e"],
			["55%", "#7b3f1d"],
			["100%", "#f0a05a"],
		]),
		bg("url(#cin)"),
		`  <rect y="0" width="${W}" height="22" fill="#08080c"/>`,
		`  <rect y="138" width="${W}" height="22" fill="#08080c"/>`,
		`  <ellipse cx="112" cy="62" rx="46" ry="16" fill="#ffd9a8" opacity="0.55"/>`,
		`  <path d="M0 138 L58 74 L96 138 Z" fill="#0d0f16" opacity="0.85"/>`,
	],
	scribble: [
		bg("#f6f2e8"),
		`  <path d="M14 120 C40 60 60 130 86 66 C104 24 126 96 148 44" fill="none" stroke="#22201c" stroke-width="3" stroke-linecap="round"/>`,
		`  <path d="M18 138 C52 108 82 148 132 112" fill="none" stroke="#6b665c" stroke-width="2" stroke-linecap="round"/>`,
		`  <circle cx="52" cy="44" r="18" fill="none" stroke="#22201c" stroke-width="3"/>`,
		`  <path d="M96 24 L120 30 L110 52 Z" fill="none" stroke="#22201c" stroke-width="2"/>`,
	],
	"film-noir": [
		bg("#0b0b0b"),
		`  <path d="M0 0 L${W} 0 L${W} ${H} Z" fill="#151515"/>`,
		`  <path d="M18 0 L52 0 L96 ${H} L58 ${H} Z" fill="#f2f2f2" opacity="0.85"/>`,
		`  <path d="M104 0 L120 0 L154 ${H} L134 ${H} Z" fill="#f2f2f2" opacity="0.45"/>`,
		`  <circle cx="120" cy="40" r="14" fill="#ffffff" opacity="0.9"/>`,
	],
	anime: [
		linear("ani", [
			["0%", "#ffd3e0"],
			["50%", "#8fc7ff"],
			["100%", "#2b3f7a"],
		]),
		bg("url(#ani)"),
		`  <circle cx="112" cy="44" r="20" fill="#fff3b0"/>`,
		`  <path d="M0 122 L46 78 L84 122 Z" fill="#2b3f7a" opacity="0.75"/>`,
		`  <path d="M62 132 L112 76 L${W} 132 Z" fill="#1b2a55" opacity="0.85"/>`,
		`  <g stroke="#ffffff" stroke-width="2" opacity="0.7"><line x1="10" y1="20" x2="46" y2="20"/><line x1="10" y1="30" x2="34" y2="30"/></g>`,
	],
	watercolor: [
		bg("#fbf7f0"),
		`  <circle cx="58" cy="60" r="36" fill="#7fb2d9" opacity="0.55"/>`,
		`  <circle cx="98" cy="88" r="40" fill="#e0908f" opacity="0.45"/>`,
		`  <circle cx="76" cy="112" r="30" fill="#f0d08a" opacity="0.5"/>`,
		`  <circle cx="116" cy="48" r="22" fill="#9ad2b6" opacity="0.45"/>`,
	],
	"pixel-art": [
		bg("#101828"),
		`  <g fill="#6ee7b7">${[
			[16, 96],
			[32, 96],
			[48, 80],
			[64, 80],
			[80, 96],
			[96, 96],
			[112, 80],
			[128, 80],
		]
			.map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="16"/>`)
			.join("")}</g>`,
		`  <g fill="#f9a8d4">${[
			[48, 48],
			[64, 48],
			[80, 32],
			[96, 48],
		]
			.map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="16"/>`)
			.join("")}</g>`,
		`  <g fill="#334155">${[
			[16, 128],
			[48, 128],
			[80, 128],
			[112, 128],
		]
			.map(([x, y]) => `<rect x="${x}" y="${y}" width="32" height="16"/>`)
			.join("")}</g>`,
	],
	cyberpunk: [
		linear("cyb", [
			["0%", "#12002e"],
			["60%", "#3b0764"],
			["100%", "#0b0b14"],
		]),
		bg("url(#cyb)"),
		`  <g stroke="#22d3ee" stroke-width="3" opacity="0.9"><line x1="20" y1="140" x2="20" y2="70"/><line x1="44" y1="140" x2="44" y2="50"/><line x1="116" y1="140" x2="116" y2="58"/><line x1="140" y1="140" x2="140" y2="84"/></g>`,
		`  <g stroke="#f472b6" stroke-width="3" opacity="0.9"><line x1="68" y1="140" x2="68" y2="34"/><line x1="92" y1="140" x2="92" y2="62"/></g>`,
		`  <line x1="0" y1="140" x2="${W}" y2="140" stroke="#22d3ee" stroke-width="2" opacity="0.6"/>`,
	],
	fantasy: [
		linear("fan", [
			["0%", "#2a1b57"],
			["55%", "#6d4bb0"],
			["100%", "#f3d9a4"],
		]),
		bg("url(#fan)"),
		`  <circle cx="118" cy="40" r="16" fill="#fff6d0" opacity="0.9"/>`,
		`  <path d="M0 140 L40 84 L72 140 Z" fill="#1d1440" opacity="0.9"/>`,
		`  <path d="M56 140 L104 62 L${W} 140 Z" fill="#2a1b57" opacity="0.9"/>`,
		`  <g fill="#fff6d0" opacity="0.85"><circle cx="26" cy="34" r="2"/><circle cx="52" cy="20" r="1.6"/><circle cx="84" cy="38" r="2.2"/><circle cx="140" cy="72" r="1.6"/></g>`,
	],
	documentary: [
		linear("doc", [
			["0%", "#dfe6ec"],
			["100%", "#8b9aa8"],
		]),
		bg("url(#doc)"),
		`  <rect x="0" y="104" width="${W}" height="56" fill="#5c6b78"/>`,
		`  <rect x="28" y="52" width="42" height="52" fill="#3f4c57"/>`,
		`  <rect x="80" y="70" width="34" height="34" fill="#46545f"/>`,
		`  <circle cx="126" cy="34" r="14" fill="#ffffff" opacity="0.8"/>`,
	],
	horror: [
		linear("hor", [
			["0%", "#05060a"],
			["70%", "#131a1a"],
			["100%", "#2a1414"],
		]),
		bg("url(#hor)"),
		`  <path d="M0 150 L28 96 L46 130 L70 78 L96 132 L120 92 L${W} 150 Z" fill="#04050a"/>`,
		`  <circle cx="66" cy="52" r="26" fill="#20282a" opacity="0.9"/>`,
		`  <g fill="#b91c1c"><circle cx="58" cy="50" r="3"/><circle cx="74" cy="50" r="3"/></g>`,
	],
	vintage: [
		linear("vin", [
			["0%", "#e8cfa4"],
			["55%", "#c08a52"],
			["100%", "#4a3527"],
		]),
		bg("url(#vin)"),
		`  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#3a2a1d" stroke-width="10" opacity="0.5"/>`,
		`  <circle cx="64" cy="66" r="24" fill="#f5e3c0" opacity="0.7"/>`,
		`  <path d="M0 140 L52 96 L92 140 Z" fill="#4a3527" opacity="0.7"/>`,
		`  <g stroke="#3a2a1d" stroke-width="1" opacity="0.35"><line x1="24" y1="0" x2="24" y2="${H}"/><line x1="104" y1="0" x2="104" y2="${H}"/></g>`,
	],
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, body] of Object.entries(styles)) {
	const file = path.join(OUT_DIR, `${name}.svg`);
	writeFileSync(file, frame(name, body.join("\n")), "utf8");
	console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
