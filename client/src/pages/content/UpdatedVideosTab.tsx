import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink, CheckCircle2, FileText, Hash, Type,
  Loader2, ArrowRight, Clock, Copy, Search,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface UpdateHistoryEntry {
  id: number;
  userId: string;
  videoId: number | null;
  youtubeVideoId: string;
  videoTitle: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  status: string;
  youtubeStudioUrl: string | null;
  createdAt: string;
}

interface PipelineEntry {
  id: number;
  videoId: number | null;
  videoTitle: string;
  currentStep: string;
  status: string;
  completedSteps: string[];
  createdAt: string;
}

const FIELD_ICONS: Record<string, typeof Type> = {
  title: Type,
  description: FileText,
  tags: Hash,
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  tags: "Tags",
};

const STEP_LABELS: Record<string, string> = {
  analyze: "Analyzing",
  title: "Optimizing Title",
  description: "Optimizing Description",
  tags: "Optimizing Tags",
  thumbnail: "Generating Thumbnail",
  seo: "SEO Optimization",
  review: "Final Review",
};

function formatTags(value: string | null): string {
  if (!value || value === "(no tags)") return "None";
  try {
    const tags = JSON.parse(value);
    if (Array.isArray(tags)) return tags.join(", ");
    return value;
  } catch {
    return value;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: `${label} copied to clipboard` });
      }}
      data-testid={`button-copy-${label.toLowerCase()}`}
    >
      <Copy className="h-3 w-3" />
    </Button>
  );
}

function VideoUpdateCard({ videoId, entries }: { videoId: string; entries: UpdateHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const latestDate = entries[0]?.createdAt;
  const studioUrl = entries[0]?.youtubeStudioUrl;
  const isPending = videoId.startsWith("pending-") || videoId.startsWith("local-") || videoId.startsWith("pipeline-");

  const titleEntry = entries.find(e => e.field === "title");
  const descEntry = entries.find(e => e.field === "description");
  const tagsEntry = entries.find(e => e.field === "tags");

  const currentTitle = titleEntry?.newValue || entries[0]?.videoTitle || "Untitled";

  return (
    <Card data-testid={`card-update-history-${videoId}`}>
      <CardContent className="p-4">
        <div
          className="flex items-center justify-between gap-3 flex-wrap cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${videoId}`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <SiYoutube className="h-5 w-5 text-red-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm" data-testid={`text-video-title-${videoId}`}>
                  {currentTitle}
                </p>
                <CopyButton text={currentTitle} label="Title" />
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {latestDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
                  </span>
                )}
                <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/30">
                  AI Optimized
                </Badge>
                {isPending && (
                  <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
                    Not on YouTube yet
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {studioUrl && (
              <a
                href={studioUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-studio-${videoId}`}
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  YouTube Studio
                </Button>
              </a>
            )}
            {!studioUrl && !isPending && (
              <a
                href={`https://studio.youtube.com/channel/videos`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-studio-search-${videoId}`}
              >
                <Button variant="outline" size="sm">
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Find in Studio
                </Button>
              </a>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3" data-testid={`section-changes-${videoId}`}>
            {titleEntry && (
              <ChangeRow
                icon={Type}
                label="Title"
                oldValue={titleEntry.oldValue}
                newValue={titleEntry.newValue}
                field="title"
              />
            )}

            {descEntry && (
              <ChangeRow
                icon={FileText}
                label="Description"
                oldValue={descEntry.oldValue}
                newValue={descEntry.newValue}
                field="description"
              />
            )}

            {tagsEntry && (
              <ChangeRow
                icon={Hash}
                label="Tags"
                oldValue={tagsEntry.oldValue}
                newValue={tagsEntry.newValue}
                field="tags"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangeRow({ icon: Icon, label, oldValue, newValue, field }: {
  icon: typeof Type;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  field: string;
}) {
  const isTag = field === "tags";
  const displayOld = isTag ? formatTags(oldValue) : (oldValue || "(empty)");
  const displayNew = isTag ? formatTags(newValue) : (newValue || "(empty)");

  return (
    <div className="space-y-1.5" data-testid={`change-row-${field}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>

      {field === "description" ? (
        <div className="space-y-2">
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
            <p className="text-[10px] font-medium text-red-400 mb-1 uppercase tracking-wide">Original</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
              {displayOld.length > 400 ? displayOld.slice(0, 400) + "..." : displayOld}
            </p>
          </div>
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-2.5">
            <p className="text-[10px] font-medium text-green-400 mb-1 uppercase tracking-wide">AI Version</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
              {displayNew.length > 400 ? displayNew.slice(0, 400) + "..." : displayNew}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 flex-wrap">
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 flex-1 min-w-0">
            <p className="text-[10px] font-medium text-red-400 mb-0.5 uppercase tracking-wide">Original</p>
            <p className="text-xs text-muted-foreground break-words">{displayOld}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-4" />
          <div className="rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1.5 flex-1 min-w-0">
            <p className="text-[10px] font-medium text-green-400 mb-0.5 uppercase tracking-wide">AI Version</p>
            <p className="text-xs text-muted-foreground break-words">{displayNew}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function UpdatedVideosTab() {
  const { data: updateHistory, isLoading: historyLoading } = useQuery<UpdateHistoryEntry[]>({
    queryKey: ["/api/videos/update-history"],
    retry: 1,
  });

  const { data: processing, isLoading: procLoading } = useQuery<PipelineEntry[]>({
    queryKey: ["/api/videos/processing"],
    refetchInterval: 10000,
    retry: 1,
  });

  const isLoading = historyLoading && procLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const grouped = new Map<string, UpdateHistoryEntry[]>();
  if (updateHistory) {
    for (const entry of updateHistory) {
      const key = entry.youtubeVideoId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }
  }

  const updatedVideos = Array.from(grouped.entries())
    .sort(([, a], [, b]) => {
      const dateA = a[0]?.createdAt ? new Date(a[0].createdAt).getTime() : 0;
      const dateB = b[0]?.createdAt ? new Date(b[0].createdAt).getTime() : 0;
      return dateB - dateA;
    });

  const processingEntries = (processing || []).filter(p => p.status === "queued" || p.status === "processing");

  return (
    <div className="space-y-6">
      {processingEntries.length > 0 && (
        <section data-testid="section-processing-videos">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
            <h3 className="font-semibold text-sm">Being Worked On</h3>
            <Badge variant="secondary" className="text-xs">{processingEntries.length}</Badge>
          </div>
          <div className="space-y-2">
            {processingEntries.map((entry) => (
              <Card key={entry.id} data-testid={`card-processing-video-${entry.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Loader2 className="h-4 w-4 text-yellow-500 animate-spin shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" data-testid={`text-processing-title-${entry.id}`}>
                          {entry.videoTitle}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {STEP_LABELS[entry.currentStep] || entry.currentStep}
                          </Badge>
                          {entry.completedSteps.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {entry.completedSteps.length} step{entry.completedSteps.length !== 1 ? "s" : ""} done
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={entry.status === "processing" ? "default" : "secondary"} className="text-xs shrink-0">
                      {entry.status === "processing" ? "Processing" : "Queued"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section data-testid="section-update-history">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <h3 className="font-semibold text-sm">What Changed</h3>
          <Badge variant="secondary" className="text-xs">{updatedVideos.length} video{updatedVideos.length !== 1 ? "s" : ""}</Badge>
        </div>
        {updatedVideos.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No video updates yet. When CreatorOS optimizes your videos, you'll see the original vs. AI-changed title, description, and tags here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {updatedVideos.map(([videoId, entries]) => (
              <VideoUpdateCard key={videoId} videoId={videoId} entries={entries} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default UpdatedVideosTab;
