import { Check, Film, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProjectAsset } from "@/types/assets";
import type { PostzMediaRef } from "@/types/postz";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function toMediaRef(asset: ProjectAsset): PostzMediaRef {
  const metadata = (asset.media_metadata ?? {}) as Record<string, unknown>;
  return {
    asset_id: asset.id,
    cdn_url: asset.cdn_url ?? undefined,
    mime_type: asset.mime_type ?? undefined,
    kind: asset.asset_type === "video" ? "video" : asset.asset_type === "image" ? "image" : undefined,
    width: typeof metadata.width === "number" ? metadata.width : undefined,
    height: typeof metadata.height === "number" ? metadata.height : undefined,
    duration_seconds: typeof metadata.duration_seconds === "number" ? metadata.duration_seconds : undefined,
    size_bytes: asset.file_size_bytes ?? undefined,
  };
}

function toggleSelected(current: PostzMediaRef[], next: PostzMediaRef): PostzMediaRef[] {
  const exists = current.some((item) => item.asset_id === next.asset_id);
  if (exists) return current.filter((item) => item.asset_id !== next.asset_id);
  return [...current, next];
}

export function MediaPicker({
  open,
  onOpenChange,
  assets,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: ProjectAsset[];
  value: PostzMediaRef[];
  onChange: (value: PostzMediaRef[]) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) => {
      const name = (asset.original_file_name ?? asset.file_name ?? "").toLowerCase();
      return name.includes(q);
    });
  }, [assets, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#0b0d13] text-zinc-100">
        <DialogHeader>
          <DialogTitle>Select media</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Attach finalized assets (videos) from Sourcify.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets…"
            className="h-8 border-0 bg-transparent px-0 text-sm text-zinc-100 focus-visible:ring-0"
          />
        </div>

        <ScrollArea className="h-[340px] rounded-lg border border-white/10">
          <div className="divide-y divide-white/10">
            {filtered.map((asset) => {
              const name = asset.original_file_name ?? asset.file_name ?? "Untitled";
              const selected = value.some((item) => item.asset_id === asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onChange(toggleSelected(value, toMediaRef(asset)))}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                    selected ? "bg-orange-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-200">
                    <Film className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">{name}</div>
                    <div className="text-xs text-zinc-500">
                      {asset.file_size_bytes ? `${Math.round(asset.file_size_bytes / 1024 / 1024)} MB` : ""}
                    </div>
                  </div>
                  <div className={cn("h-6 w-6 rounded-full border", selected ? "border-orange-400 bg-orange-500/20" : "border-white/10")}>
                    {selected && <Check className="h-5 w-5 p-0.5 text-orange-200" />}
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">No matching assets.</div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:items-center">
          <div className="text-xs text-zinc-500">Selected: {value.length}</div>
          <Button
            type="button"
            variant="secondary"
            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
