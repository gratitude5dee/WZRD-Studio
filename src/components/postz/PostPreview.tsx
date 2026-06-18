import { Badge } from "@/components/ui/badge";
import type { PostzChannel } from "@/types/postz";
import { providerLabel } from "@/components/postz/postzMeta";

export function PostPreview({
  channels,
  channelIds,
  getContent,
}: {
  channels: PostzChannel[];
  channelIds: string[];
  getContent: (channelId: string) => string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-zinc-100">Preview (Phase 2)</div>
      <p className="mt-1 text-xs text-zinc-500">Lightweight previews. Platform-accurate previews land in Phase 3+.</p>

      <div className="mt-4 space-y-2">
        {channelIds.map((id) => {
          const channel = channels.find((ch) => ch.id === id);
          if (!channel) return null;
          const content = getContent(id);

          return (
            <div key={id} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-200">{providerLabel(channel.provider)}</span>
                <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-300">
                  {content.length} chars
                </Badge>
              </div>
              <div className="mt-2 line-clamp-4 text-xs text-zinc-300">{content || "(empty)"}</div>
            </div>
          );
        })}

        {channelIds.length === 0 && (
          <div className="rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">Select a channel to preview.</div>
        )}
      </div>
    </div>
  );
}
