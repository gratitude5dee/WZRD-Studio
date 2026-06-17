import { CalendarClock, ChevronDown, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import type { ProjectAsset } from "@/types/assets";
import type { PostzChannel, PostzGroup, PostzMediaRef, PostzPerChannelValidation, PostzPostGroupCreateInput, PostzPostState } from "@/types/postz";
import { MediaPicker } from "@/components/postz/MediaPicker";
import { providerLabel } from "@/components/postz/postzMeta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCreatePostzGroup,
  useDeletePostzGroup,
  useFindPostzSlot,
  useUpdatePostzGroup,
  useValidatePostzGroup,
} from "@/hooks/usePostz";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeDateAndTime(date: Date, timeValue: string): Date {
  const [hh, mm] = timeValue.split(":").map((v) => Number(v));
  const next = new Date(date);
  if (!Number.isNaN(hh)) next.setHours(hh);
  if (!Number.isNaN(mm)) next.setMinutes(mm);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

type Overrides = Record<string, { content?: string; media?: PostzMediaRef[]; title?: string | null }>;

function buildGroupInput(params: {
  publishDate: Date;
  state: PostzPostState;
  channelIds: string[];
  channels: PostzChannel[];
  globalContent: string;
  globalMedia: PostzMediaRef[];
  globalTitle: string | null;
  overrides: Overrides;
}): PostzPostGroupCreateInput {
  const providerByChannel = new Map(params.channels.map((ch) => [ch.id, ch.provider]));

  return {
    publish_date: params.publishDate.toISOString(),
    state: params.state,
    channels: params.channelIds.map((channelId) => {
      const override = params.overrides[channelId] ?? {};
      return {
        channel_id: channelId,
        content: override.content ?? params.globalContent,
        media: override.media ?? params.globalMedia,
        title: override.title ?? params.globalTitle,
        settings: { provider: providerByChannel.get(channelId) },
      };
    }),
  };
}

function hasBlockingIssues(perChannel: PostzPerChannelValidation[]): boolean {
  return perChannel.some((row) => row.issues.some((issue) => issue.level === "error"));
}

export function PostComposer({
  open,
  onOpenChange,
  channels,
  assets,
  initialDate,
  editingGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: PostzChannel[];
  assets: ProjectAsset[];
  initialDate: Date;
  editingGroup?: PostzGroup | null;
}) {
  const createMutation = useCreatePostzGroup();
  const updateMutation = useUpdatePostzGroup();
  const deleteMutation = useDeletePostzGroup();
  const validateMutation = useValidatePostzGroup();
  const slotMutation = useFindPostzSlot();

  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [tab, setTab] = useState("global");
  const [state, setState] = useState<PostzPostState>("DRAFT");
  const [globalContent, setGlobalContent] = useState("");
  const [globalTitle, setGlobalTitle] = useState<string | null>(null);
  const [globalMedia, setGlobalMedia] = useState<PostzMediaRef[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [publishDate, setPublishDate] = useState<Date>(initialDate);
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date(initialDate);
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [validation, setValidation] = useState<PostzPerChannelValidation[]>([]);

  const isEditing = Boolean(editingGroup?.group_id);

  useEffect(() => {
    if (!open) return;

    if (editingGroup?.posts?.length) {
      const posts = editingGroup.posts;
      const first = posts[0];
      setSelectedChannelIds(posts.map((post) => post.channel_id));
      setState(first.state);
      setGlobalContent(first.content ?? "");
      setGlobalTitle(first.title ?? null);
      setGlobalMedia(Array.isArray(first.media) ? first.media : []);
      const date = new Date(first.publish_date);
      setPublishDate(date);
      setTimeValue(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);

      const nextOverrides: Overrides = {};
      for (const post of posts) {
        const o: Overrides[string] = {};
        if (post.content !== first.content) o.content = post.content;
        if ((post.title ?? null) !== (first.title ?? null)) o.title = post.title ?? null;
        if (JSON.stringify(post.media ?? []) !== JSON.stringify(first.media ?? [])) o.media = Array.isArray(post.media) ? post.media : [];
        if (Object.keys(o).length > 0) nextOverrides[post.channel_id] = o;
      }
      setOverrides(nextOverrides);
      setTab("global");
      setValidation([]);
      return;
    }

    setSelectedChannelIds(channels.map((ch) => ch.id));
    setState("DRAFT");
    setGlobalContent("");
    setGlobalTitle(null);
    setGlobalMedia([]);
    setOverrides({});
    setPublishDate(initialDate);
    setTimeValue(`${String(initialDate.getHours()).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")}`);
    setTab("global");
    setValidation([]);
  }, [open, channels, initialDate, editingGroup]);

  useEffect(() => {
    setOverrides((current) => {
      const next: Overrides = {};
      for (const channelId of selectedChannelIds) {
        if (current[channelId]) next[channelId] = current[channelId];
      }
      return next;
    });
  }, [selectedChannelIds]);

  const publishDateWithTime = useMemo(() => mergeDateAndTime(publishDate, timeValue), [publishDate, timeValue]);

  const groupInput = useMemo(() => {
    return buildGroupInput({
      publishDate: publishDateWithTime,
      state,
      channelIds: selectedChannelIds,
      channels,
      globalContent,
      globalMedia,
      globalTitle,
      overrides,
    });
  }, [publishDateWithTime, state, selectedChannelIds, channels, globalContent, globalMedia, globalTitle, overrides]);

  const debouncedValidate = useDebouncedCallback(async (payload: PostzPostGroupCreateInput) => {
    try {
      const result = await validateMutation.mutateAsync(payload);
      setValidation(result.per_channel);
    } catch {
      // Ignore validation errors during typing.
    }
  }, 350);

  useEffect(() => {
    if (!open) return;
    if (selectedChannelIds.length === 0) return;
    debouncedValidate(groupInput);
  }, [open, selectedChannelIds, groupInput, debouncedValidate]);

  const perChannelValidation = useMemo(() => {
    const map = new Map<string, PostzPerChannelValidation>();
    for (const row of validation) map.set(row.channel_id, row);
    return map;
  }, [validation]);

  const handleSave = async () => {
    if (selectedChannelIds.length === 0) return;

    try {
      const result = await validateMutation.mutateAsync(groupInput);
      setValidation(result.per_channel);
      if (hasBlockingIssues(result.per_channel)) {
        return;
      }

      if (isEditing && editingGroup?.group_id) {
        await updateMutation.mutateAsync({ group_id: editingGroup.group_id, group: groupInput });
      } else {
        await createMutation.mutateAsync(groupInput);
      }

      onOpenChange(false);
    } catch {
      // mutation hooks toast errors.
    }
  };

  const handleDelete = async () => {
    if (!editingGroup?.group_id) return;
    await deleteMutation.mutateAsync(editingGroup.group_id);
    onOpenChange(false);
  };

  const handleRecommended = async () => {
    const firstChannelId = selectedChannelIds[0] ?? null;
    const res = await slotMutation.mutateAsync(firstChannelId);
    const date = new Date(res.publish_date);
    setPublishDate(date);
    setTimeValue(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-white/10 bg-[#0b0d13] text-zinc-100">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit post" : "New post"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <Label className="text-xs text-zinc-500">Channels</Label>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => {
                  const selected = selectedChannelIds.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannelIds((current) => {
                          if (current.includes(channel.id)) return current.filter((id) => id !== channel.id);
                          return [...current, channel.id];
                        });
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        selected ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 bg-white/5 text-zinc-300",
                      )}
                    >
                      {providerLabel(channel.provider)}
                    </button>
                  );
                })}
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-white/5">
                <TabsTrigger value="global">Global</TabsTrigger>
                {selectedChannelIds.map((id) => {
                  const channel = channels.find((ch) => ch.id === id);
                  if (!channel) return null;
                  const issues = perChannelValidation.get(id)?.issues ?? [];
                  const hasError = issues.some((i) => i.level === "error");
                  return (
                    <TabsTrigger key={id} value={id} className={cn(hasError && "text-red-200")}> 
                      {providerLabel(channel.provider)}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="global" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Message</Label>
                  <Textarea
                    value={globalContent}
                    onChange={(event) => setGlobalContent(event.target.value)}
                    placeholder="Write once, tailor per channel…"
                    className="min-h-32 border-white/10 bg-black/20 text-zinc-100"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">Title (YouTube)</Label>
                    <Input
                      value={globalTitle ?? ""}
                      onChange={(event) => setGlobalTitle(event.target.value || null)}
                      placeholder="Optional title"
                      className="border-white/10 bg-black/20 text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">State</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={state === "DRAFT" ? "default" : "secondary"}
                        className={cn(
                          state === "DRAFT" ? "bg-white/10 text-zinc-100 hover:bg-white/15" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                        )}
                        onClick={() => setState("DRAFT")}
                      >
                        Draft
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={state === "QUEUE" ? "default" : "secondary"}
                        className={cn(
                          state === "QUEUE" ? "bg-orange-500 text-white hover:bg-orange-500/90" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                        )}
                        onClick={() => setState("QUEUE")}
                      >
                        Schedule
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-orange-200" />
                      <span className="text-sm font-medium text-zinc-100">{formatDateTime(publishDateWithTime)}</span>
                      <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-300">
                        {state === "QUEUE" ? "Scheduled" : "Draft"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Click to change the date/time.</div>
                  </div>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                      >
                        Edit schedule
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] border-white/10 bg-[#0b0d13] p-3 text-zinc-100">
                      <Calendar
                        mode="single"
                        selected={publishDate}
                        onSelect={(next) => next && setPublishDate(next)}
                        className="rounded-md border border-white/10"
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-zinc-500">Date</Label>
                          <Input
                            value={toDateInputValue(publishDate)}
                            onChange={(event) => {
                              const [yy, mm, dd] = event.target.value.split("-").map((v) => Number(v));
                              if (!yy || !mm || !dd) return;
                              setPublishDate(new Date(yy, mm - 1, dd));
                            }}
                            className="mt-1 border-white/10 bg-black/20 text-zinc-100"
                            type="date"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-zinc-500">Time</Label>
                          <Input
                            value={timeValue}
                            onChange={(event) => setTimeValue(event.target.value)}
                            className="mt-1 border-white/10 bg-black/20 text-zinc-100"
                            type="time"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-3 w-full border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                        onClick={handleRecommended}
                        disabled={slotMutation.isPending}
                      >
                        {slotMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Recommended slot
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">Media</div>
                      <div className="mt-0.5 text-xs text-zinc-500">Attach finalized assets (Phase 2).</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                      onClick={() => setMediaPickerOpen(true)}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Select
                    </Button>
                  </div>

                  {globalMedia.length === 0 ? (
                    <div className="mt-3 rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
                      No media attached.
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {globalMedia.map((media) => (
                        <li key={media.asset_id} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                          {media.asset_id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              {selectedChannelIds.map((id) => {
                const channel = channels.find((ch) => ch.id === id);
                if (!channel) return null;
                const issues = perChannelValidation.get(id)?.issues ?? [];
                const override = overrides[id] ?? {};
                return (
                  <TabsContent key={id} value={id} className="mt-4 space-y-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-100">{providerLabel(channel.provider)}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">Overrides fall back to Global values.</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                          onClick={() => {
                            setOverrides((current) => {
                              const next = { ...current };
                              delete next[id];
                              return next;
                            });
                          }}
                        >
                          Use global
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label className="text-xs text-zinc-500">Message override</Label>
                        <Textarea
                          value={override.content ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOverrides((current) => ({ ...current, [id]: { ...current[id], content: value || undefined } }));
                          }}
                          placeholder={globalContent || "(falls back to global message)"}
                          className="min-h-28 border-white/10 bg-black/20 text-zinc-100"
                        />
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label className="text-xs text-zinc-500">Media override</Label>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                          <span className="text-xs text-zinc-400">
                            {(override.media ?? []).length > 0 ? `${(override.media ?? []).length} attached` : "Using global media"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                            onClick={() => {
                              setMediaPickerOpen(true);
                            }}
                          >
                            Select
                          </Button>
                        </div>
                      </div>

                      {issues.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <Label className="text-xs text-zinc-500">Validation</Label>
                          <ul className="space-y-1 text-xs">
                            {issues.map((issue, idx) => (
                              <li
                                key={`${issue.message}-${idx}`}
                                className={cn(
                                  "rounded-md border px-3 py-2",
                                  issue.level === "error"
                                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-200",
                                )}
                              >
                                {issue.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-zinc-100">Preview (Phase 2)</div>
              <p className="mt-1 text-xs text-zinc-500">Lightweight previews. Platform-accurate previews land in Phase 3+.</p>
              <div className="mt-4 space-y-2">
                {selectedChannelIds.map((id) => {
                  const channel = channels.find((ch) => ch.id === id);
                  if (!channel) return null;
                  const override = overrides[id] ?? {};
                  const content = (override.content ?? globalContent).trim();
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
              </div>
            </div>

            {validation.length > 0 && hasBlockingIssues(validation) && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                Fix validation errors before saving.
              </div>
            )}
          </aside>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                className="bg-red-600 text-white hover:bg-red-600/90"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-orange-500 text-white hover:bg-orange-500/90"
              onClick={handleSave}
              disabled={saving || selectedChannelIds.length === 0}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isEditing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>

        <MediaPicker
          open={mediaPickerOpen}
          onOpenChange={setMediaPickerOpen}
          assets={assets}
          value={tab === "global" ? globalMedia : overrides[tab]?.media ?? globalMedia}
          onChange={(next) => {
            if (tab === "global") {
              setGlobalMedia(next);
              return;
            }
            setOverrides((current) => ({ ...current, [tab]: { ...current[tab], media: next } }));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
