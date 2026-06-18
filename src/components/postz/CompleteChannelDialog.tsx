import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import type { PostzOAuthTarget } from "@/types/postz";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useFinalizePostzOauthTarget, usePostzOauthTargets } from "@/hooks/usePostz";
import { POSTZ_PROVIDER_META, providerLabel } from "@/components/postz/postzMeta";

function TargetRow({
  target,
  onSelect,
  selecting,
}: {
  target: PostzOAuthTarget;
  onSelect: (targetId: string) => void;
  selecting: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-100">{target.name}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{target.id}</div>
      </div>

      <Button
        type="button"
        size="sm"
        className="bg-orange-500 text-white hover:bg-orange-500/90"
        disabled={selecting}
        onClick={() => onSelect(target.id)}
      >
        {selecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Select
      </Button>
    </div>
  );
}

export function CompleteChannelDialog({
  open,
  onOpenChange,
  provider,
  stateId,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  stateId: string;
  onCompleted?: () => void;
}) {
  const targetsQuery = usePostzOauthTargets({ provider, state_id: stateId, enabled: open });
  const finalize = useFinalizePostzOauthTarget();

  const targets = useMemo(() => (targetsQuery.data ?? []) as PostzOAuthTarget[], [targetsQuery.data]);

  const meta = POSTZ_PROVIDER_META[provider] ?? null;
  const label = meta?.label ?? providerLabel(provider);

  const [selectingTargetId, setSelectingTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectingTargetId(null);
    }
  }, [open]);

  const handleSelect = async (targetId: string) => {
    try {
      setSelectingTargetId(targetId);
      await finalize.mutateAsync({ provider, state_id: stateId, target_id: targetId });
      onCompleted?.();
      onOpenChange(false);
    } finally {
      setSelectingTargetId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[#0b0c12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Finish connecting
            <Badge
              variant="secondary"
              className={cn(
                "border text-[10px] uppercase tracking-wide",
                meta?.colorClass ?? "border-white/10 bg-white/5 text-zinc-300",
              )}
            >
              {label}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Some providers have multiple profiles/pages/channels. Choose which one to connect to Postz.
          </DialogDescription>
        </DialogHeader>

        {targetsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-10 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : targetsQuery.isError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Unable to load connection targets.
          </div>
        ) : targets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-sm text-zinc-500">
            No selectable targets were found for this provider.
          </div>
        ) : (
          <div className="space-y-2">
            {targets.map((target) => (
              <TargetRow
                key={target.id}
                target={target}
                onSelect={handleSelect}
                selecting={finalize.isPending && selectingTargetId === target.id}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
