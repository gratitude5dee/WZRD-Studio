import { CalendarClock, ChevronDown, Loader2, Sparkles } from "lucide-react";

import type { PostzPostState } from "@/types/postz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SchedulePopover({
  state,
  publishDate,
  publishDateWithTime,
  timeValue,
  onPublishDateChange,
  onTimeValueChange,
  onRecommendedSlot,
  recommendedLoading,
}: {
  state: PostzPostState;
  publishDate: Date;
  publishDateWithTime: Date;
  timeValue: string;
  onPublishDateChange: (date: Date) => void;
  onTimeValueChange: (value: string) => void;
  onRecommendedSlot: () => void;
  recommendedLoading: boolean;
}) {
  return (
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
          <Button type="button" size="sm" variant="secondary" className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10">
            Edit schedule
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] border-white/10 bg-[#0b0d13] p-3 text-zinc-100">
          <Calendar
            mode="single"
            selected={publishDate}
            onSelect={(next) => next && onPublishDateChange(next)}
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
                  onPublishDateChange(new Date(yy, mm - 1, dd));
                }}
                className="mt-1 border-white/10 bg-black/20 text-zinc-100"
                type="date"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500">Time</Label>
              <Input
                value={timeValue}
                onChange={(event) => onTimeValueChange(event.target.value)}
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
            onClick={onRecommendedSlot}
            disabled={recommendedLoading}
          >
            {recommendedLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Recommended slot
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
