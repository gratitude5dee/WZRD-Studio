import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";

import { MobileBottomNav } from "@/components/home/MobileBottomNav";
import { Sidebar } from "@/components/home/Sidebar";
import { ChannelRail } from "@/components/postz/ChannelRail";
import { PostComposer } from "@/components/postz/PostComposer";
import { PostzCalendar } from "@/components/postz/PostzCalendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssets } from "@/hooks/useAssets";
import {
  usePostzChannels,
  usePostzGroup,
  usePostzPostsWindow,
  useReschedulePostzGroup,
  useSeedPostzChannels,
} from "@/hooks/usePostz";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function roundToNextQuarterHour(date: Date) {
  const d = new Date(date);
  d.setSeconds(0);
  d.setMilliseconds(0);
  const minutes = d.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  if (rounded === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }
  return d;
}

export default function Postz() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();

  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));

  const windowFrom = useMemo(() => startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }), [anchor]);
  const windowTo = useMemo(() => endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }), [anchor]);

  const channelsQuery = usePostzChannels();
  const seedChannels = useSeedPostzChannels();

  const postsQuery = usePostzPostsWindow({ from: windowFrom.toISOString(), to: windowTo.toISOString() });

  const reschedule = useReschedulePostzGroup();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<Date>(() => roundToNextQuarterHour(new Date()));
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const groupQuery = usePostzGroup(editingGroupId);

  const { data: finalizedAssets, isLoading: finalizedLoading } = useAssets({
    assetCategory: ["finalized"],
    assetType: ["video"],
    limit: 50,
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const handleHomeViewChange = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  const shiftMonth = (amount: number) => {
    setAnchor((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() + amount, 1)));
  };

  const openNewComposer = (date: Date) => {
    setEditingGroupId(null);
    setComposerDate(date);
    setComposerOpen(true);
  };

  const openEditComposer = (groupId: string) => {
    setEditingGroupId(groupId);
    setComposerDate(roundToNextQuarterHour(new Date()));
    setComposerOpen(true);
  };

  const handleMoveGroup = (groupId: string, targetDay: Date) => {
    const posts = postsQuery.data ?? [];
    const first = posts.find((post) => post.group_id === groupId);
    if (!first) return;

    const currentDate = new Date(first.publish_date);
    const next = new Date(targetDay);
    next.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);

    reschedule.mutate({ group_id: groupId, publish_date: next.toISOString() });
  };

  const channels = channelsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100">
      <div className="hidden md:block">
        <Sidebar activeView="postz" onViewChange={handleHomeViewChange} />
      </div>

      <motion.main
        className="min-h-screen pb-24 md:pb-8"
        animate={{ marginLeft: isMobile ? 0 : isCollapsed ? 0 : 256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        initial={false}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-6">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-orange-300" />
                <Badge variant="secondary" className="border-orange-300/20 bg-orange-400/10 text-orange-100">
                  Postiz
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">Postz</h1>
              <p className="mt-1 text-sm text-zinc-500">Schedule multi-channel posts (Phase 2: seeded demos + mock publish).</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="bg-orange-500 text-white hover:bg-orange-500/90"
                onClick={() => openNewComposer(roundToNextQuarterHour(new Date()))}
              >
                <Plus className="mr-2 h-4 w-4" />
                New post
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-40 text-center text-sm font-semibold text-zinc-200">{monthLabel(anchor)}</div>
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {postsQuery.isLoading ? (
                <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-16 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : postsQuery.isError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
                  Unable to load posts.
                </div>
              ) : (
                <PostzCalendar
                  anchor={anchor}
                  posts={postsQuery.data ?? []}
                  channels={channels}
                  onCreateAt={(day) => {
                    const d = new Date(day);
                    const now = new Date();
                    if (d.toDateString() === now.toDateString()) {
                      openNewComposer(roundToNextQuarterHour(now));
                      return;
                    }
                    d.setHours(9, 0, 0, 0);
                    openNewComposer(d);
                  }}
                  onEditGroup={openEditComposer}
                  onMoveGroup={handleMoveGroup}
                />
              )}

              {postsQuery.data && postsQuery.data.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-sm text-zinc-500">
                  No posts scheduled for this month. Click a day (or “New post”) to create one.
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <ChannelRail
                channels={channels}
                isLoading={channelsQuery.isLoading}
                onSeedDemo={() => seedChannels.mutate()}
                seedLoading={seedChannels.isPending}
              />

              <Card className="rounded-lg border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Finalized assets</h2>
                  <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-300">
                    {(finalizedAssets ?? []).length}
                  </Badge>
                </div>

                {finalizedLoading ? (
                  <div className="flex items-center justify-center py-8 text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : finalizedAssets && finalizedAssets.length > 0 ? (
                  <div className="space-y-2">
                    {finalizedAssets.slice(0, 8).map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-zinc-200">{asset.original_file_name}</div>
                          <div className="text-xs text-zinc-500">
                            {asset.file_size_bytes ? `${Math.round(asset.file_size_bytes / 1024 / 1024)} MB` : ""}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                          onClick={() => openNewComposer(roundToNextQuarterHour(new Date()))}
                        >
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                    Finalized Sourcify assets will appear here.
                  </div>
                )}
              </Card>

              {reschedule.isPending && (
                <div className={cn("rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400")}>
                  Rescheduling…
                </div>
              )}
            </aside>
          </section>
        </div>
      </motion.main>

      <MobileBottomNav activeView="postz" onViewChange={handleHomeViewChange} onCreateProject={handleCreateProject} />

      <PostComposer
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setEditingGroupId(null);
        }}
        channels={channels}
        assets={finalizedAssets ?? []}
        initialDate={composerDate}
        editingGroup={groupQuery.data ?? (editingGroupId ? null : undefined)}
      />
    </div>
  );
}
