import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

import postizGoalMarkdown from "../../../postizgoal.md?raw";

function stripFrontMatter(markdown: string) {
  // In case we ever add YAML frontmatter, keep the viewer resilient.
  if (markdown.startsWith("---")) {
    const end = markdown.indexOf("\n---", 3);
    if (end !== -1) return markdown.slice(end + 4);
  }
  return markdown;
}

export function PostzGoalDialog() {
  const { toast } = useToast();

  const markdown = useMemo(() => stripFrontMatter(postizGoalMarkdown), []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
        >
          <FileText className="mr-2 h-4 w-4" />
          Spec
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl border-white/10 bg-[#0b0c11] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Postz × Postiz build spec</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Rendered from <code className="text-zinc-300">postizgoal.md</code> in the repo root.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(markdown);
                toast({ title: "Copied", description: "postizgoal.md copied to clipboard." });
              } catch (error) {
                toast({
                  title: "Copy failed",
                  description: error instanceof Error ? error.message : "Clipboard API unavailable.",
                  variant: "destructive",
                });
              }
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy markdown
          </Button>
        </div>

        <ScrollArea className="h-[70vh] rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="prose prose-invert max-w-none prose-headings:scroll-mt-24 prose-a:text-orange-300 prose-strong:text-zinc-100 prose-code:text-zinc-200 prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
