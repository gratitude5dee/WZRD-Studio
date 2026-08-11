/**
 * WZRD-EDIT: naming exported files after what is actually in them.
 *
 * The browser may not be able to encode the requested container (Chromium on
 * Linux has no AAC encoder, Firefox no H.264), so the WebCodecs engine falls
 * back to another one. Every save path — the engine's own download helper and
 * `saveExportedVideo` — resolves the name through here so a WebM fallback is
 * never handed to the user as `clip.mp4`.
 */

import { ExportFormat, FORMAT_INFO } from "@qcut-app/types/export";

function baseTypes(info: (typeof FORMAT_INFO)[ExportFormat]): string[] {
	return info.mimeTypes.map((mime) => mime.split(";")[0].trim());
}

/** The container the blob really is, which is not always the requested one. */
export function actualFormat(blob: Blob, requested: ExportFormat): ExportFormat {
	const type = blob.type.split(";")[0].trim();

	// MOV and MP4 share a MIME type, so an unchanged container keeps its label.
	if (!type || baseTypes(FORMAT_INFO[requested]).includes(type)) {
		return requested;
	}

	const matched = (
		Object.entries(FORMAT_INFO) as Array<
			[ExportFormat, (typeof FORMAT_INFO)[ExportFormat]]
		>
	).find(([, info]) => baseTypes(info).includes(type));
	return matched ? matched[0] : requested;
}

/** The format a filename's extension names, if it names one at all. */
function formatFromFilename(filename: string): ExportFormat | null {
	const matched = (
		Object.entries(FORMAT_INFO) as Array<
			[ExportFormat, (typeof FORMAT_INFO)[ExportFormat]]
		>
	).find(([, info]) => filename.endsWith(info.extension));
	return matched ? matched[0] : null;
}

/**
 * `filename` with the extension of the container the blob actually holds.
 * A name that already carries a known export extension has it replaced rather
 * than appended, so nothing ends up as `clip.mp4.webm`.
 *
 * `requested` disambiguates containers that share a MIME type (MP4 and MOV);
 * without it the filename's own extension is used.
 */
export function resolveExportFilename(
	blob: Blob,
	filename: string,
	requested: ExportFormat = formatFromFilename(filename) ?? ExportFormat.MP4
): string {
	const extension = FORMAT_INFO[actualFormat(blob, requested)].extension;
	const stem = Object.values(FORMAT_INFO)
		.map((info) => info.extension as string)
		.reduce(
			(name, ext) => (name.endsWith(ext) ? name.slice(0, -ext.length) : name),
			filename
		);
	return `${stem}${extension}`;
}
