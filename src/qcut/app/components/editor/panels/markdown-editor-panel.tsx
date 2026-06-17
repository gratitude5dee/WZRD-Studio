import { MarkdownProperties } from "@qcut-app/components/editor/properties-panel/markdown-properties";
import type { MarkdownElement } from "@qcut-app/types/timeline";

interface MarkdownEditorPanelProps {
	element: MarkdownElement;
	trackId: string;
}

export function MarkdownEditorPanel({
	element,
	trackId,
}: MarkdownEditorPanelProps) {
	return <MarkdownProperties element={element} trackId={trackId} />;
}
