// Adapted from OpenReel Video (MIT License)

/**
 * Karaoke canvas renderer — draws word-by-word highlighted captions onto a
 * 2D canvas so karaoke timing survives the client-side export.
 *
 * Mirrors the preview's KaraokeRenderer: word states come from
 * getKaraokeSegments(); this module only handles canvas layout and paint.
 *
 * @module lib/captions/karaoke-canvas
 */

import type { SubtitleStyle } from "@qcut-app/types/timeline";
import type { WordItem } from "@qcut-app/types/word-timeline";
import { hexToRgba } from "./subtitle-style";
import { getKaraokeSegments } from "./karaoke-utils";
import type { KaraokeSegment } from "./karaoke-types";

interface KaraokeCanvasParams {
	ctx: CanvasRenderingContext2D;
	canvas: { width: number; height: number };
	/** Fully-resolved subtitle style (see resolveSubtitleStyle). */
	style: SubtitleStyle;
	/** Words inside the active caption window, timeline-global seconds. */
	words: WordItem[];
	/** Current timeline time in seconds. */
	currentTime: number;
}

interface PositionedWord {
	segment: KaraokeSegment;
	x: number;
	y: number;
	width: number;
}

/**
 * Draw karaoke-timed caption words onto the canvas.
 * Returns false when there is nothing to draw (caller should fall back to
 * the static caption renderer).
 */
export function renderKaraokeCaptionToCanvas({
	ctx,
	canvas,
	style,
	words,
	currentTime,
}: KaraokeCanvasParams): boolean {
	const mode = style.karaokeMode ?? "none";
	if (mode === "none" || words.length === 0) return false;

	const segments = getKaraokeSegments(
		words,
		currentTime,
		mode,
		style.highlightColor ?? "#ffff00",
		// Same default as the preview's KaraokeRenderer.
		style.upcomingColor ?? "#808080"
	);
	const visible = segments.filter((s) => s.state !== "hidden" || s.opacity > 0);
	if (visible.length === 0) return false;

	const fontWeight = style.bold ? "bold" : "normal";
	const fontStyle = style.italic ? "italic" : "normal";

	ctx.save();
	ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";

	// Lay words out into wrapped lines.
	const gap = Math.max(4, style.fontSize * 0.25);
	const maxWidth = canvas.width * 0.8;
	const lineHeight = style.fontSize * style.lineSpacing;

	const lines: PositionedWord[][] = [[]];
	let lineWidth = 0;
	for (const segment of visible) {
		const width = ctx.measureText(segment.text).width;
		const currentLine = lines[lines.length - 1];
		const nextWidth =
			currentLine.length === 0 ? width : lineWidth + gap + width;
		if (currentLine.length > 0 && nextWidth > maxWidth) {
			lines.push([{ segment, x: 0, y: 0, width }]);
			lineWidth = width;
		} else {
			currentLine.push({
				segment,
				x: currentLine.length === 0 ? 0 : lineWidth + gap,
				y: 0,
				width,
			});
			lineWidth = nextWidth;
		}
	}

	const totalHeight = lines.length * lineHeight;
	let centerY: number;
	switch (style.position.align) {
		case "top":
			centerY = totalHeight / 2 + style.fontSize;
			break;
		case "center":
			centerY = canvas.height / 2;
			break;
		default:
			centerY = canvas.height - totalHeight / 2 - style.fontSize;
			break;
	}
	const centerX = canvas.width / 2;

	// Background box behind all lines.
	if (style.bgOpacity > 0) {
		const maxLineWidth = Math.max(
			...lines.map((line) => {
				const last = line[line.length - 1];
				return last ? last.x + last.width : 0;
			})
		);
		const padding = 16;
		ctx.fillStyle = hexToRgba(style.backgroundColor, style.bgOpacity);
		ctx.fillRect(
			centerX - maxLineWidth / 2 - padding,
			centerY - totalHeight / 2 - padding / 2,
			maxLineWidth + padding * 2,
			totalHeight + padding
		);
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.length === 0) continue;
		const last = line[line.length - 1];
		const lineTotalWidth = last.x + last.width;
		const lineStartX = centerX - lineTotalWidth / 2;
		const y = centerY - totalHeight / 2 + (i + 0.5) * lineHeight;

		for (const positioned of line) {
			drawWord({
				ctx,
				positioned,
				x: lineStartX + positioned.x,
				y,
				style,
			});
		}
	}

	ctx.restore();
	return true;
}

function drawWord({
	ctx,
	positioned,
	x,
	y,
	style,
}: {
	ctx: CanvasRenderingContext2D;
	positioned: PositionedWord;
	x: number;
	y: number;
	style: KaraokeCanvasParams["style"];
}) {
	const { segment, width } = positioned;
	if (segment.opacity <= 0) return;

	ctx.save();
	ctx.globalAlpha = style.fontOpacity * Math.min(1, Math.max(0, segment.opacity));

	// Scale/offset around the word's own center, like the preview's transform.
	const wordCenterX = x + width / 2;
	const wordCenterY = y + segment.offsetY;
	ctx.translate(wordCenterX, wordCenterY);
	ctx.scale(segment.scale, segment.scale);
	ctx.translate(-wordCenterX, -wordCenterY);

	const fill = resolveWordFill({
		ctx,
		color: segment.color,
		fallback: style.fontColor,
		x,
		width,
	});

	if (style.outlineWidth > 0) {
		ctx.strokeStyle = style.outlineColor;
		ctx.lineWidth = style.outlineWidth * 2;
		ctx.lineJoin = "round";
		ctx.strokeText(segment.text, x, wordCenterY);
	}

	if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
		ctx.fillStyle = style.shadowColor;
		ctx.fillText(
			segment.text,
			x + style.shadowOffset.x,
			wordCenterY + style.shadowOffset.y
		);
	}

	ctx.fillStyle = fill;
	ctx.fillText(segment.text, x, wordCenterY);

	ctx.restore();
}

const GRADIENT_PATTERN =
	/^linear-gradient\(90deg,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+?)\s+\d+(?:\.\d+)?%\)$/;

/**
 * Convert a segment color into a canvas fill. The karaoke-fill mode encodes
 * word progress as `linear-gradient(90deg, <hi> pct%, <up> pct%)`; recreate
 * that hard-stop sweep with a canvas gradient across the word's width.
 */
function resolveWordFill({
	ctx,
	color,
	fallback,
	x,
	width,
}: {
	ctx: CanvasRenderingContext2D;
	color: string | undefined;
	fallback: string;
	x: number;
	width: number;
}): string | CanvasGradient {
	if (!color) return fallback;
	const match = GRADIENT_PATTERN.exec(color);
	if (!match) return color;

	const [, highlight, pctRaw, upcoming] = match;
	const pct = Math.min(1, Math.max(0, Number(pctRaw) / 100));
	const gradient = ctx.createLinearGradient(x, 0, x + Math.max(1, width), 0);
	gradient.addColorStop(0, highlight);
	gradient.addColorStop(pct, highlight);
	gradient.addColorStop(pct, upcoming);
	gradient.addColorStop(1, upcoming);
	return gradient;
}
