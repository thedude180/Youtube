import { useQuery } from "@tanstack/react-query";
import { useVideos } from "@/hooks/use-videos";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink, CheckCircle2, FileText, Hash, Type,
  Loader2, Video, Eye, ChevronDown, ChevronUp, ArrowRight,
  Clock, Pencil,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";

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
  thumbnail: Video,
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  tags: "Tags",
  thumbnail: "Thumbnail",
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

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function formatTags(value: string | null): string {
  if (!value) return "(none)";
  try {
    const tags = JSON.parse(value);
    if (Array.isArray(tags)) return tags.join(", ");
    return value;
  } catch {
    return value;
  }
}

function FieldDiff({ field, oldValue, newValue }: { field: string; oldValue: string | null; newValue: string | null }) {
  const isTagField = field === "tags";
  const displayOld = isTagField ? formatTags(oldValue) : (oldValue || "(empty)");
  const displayNew = isTagField ? formatTags(newValue) : (newValue || "(empty)");

  if (field === "description") {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
          <p className="text-xs font-medium text-red-400 mb-1">Before</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {truncateText(displayOld, 500)}
          </p>
        </div>
        <div className="rounded-md border border-green-500/20 bg-green-500/5 p-2.5">
          <p className="text-xs font-medium text-green-400 mb-1">After</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {truncateText(displayNew, 500)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 flex-wrap">
      <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 flex-1 min-w-0">
        <p className="text-xs text-muted-foreground break-words">{truncateText(displayOld, 200)}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1.5" />
      <div className="rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1.5 flex-1 min-w-0">
        <p className="text-xs text-muted-foreground break-words">{truncateText(displayNew, 200)}</p>
      </div>
    </div>
  );
}

function VideoUpdateCard({ youtubeVideoId, entries }: { youtubeVideoId: string; entries: UpdateHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const videoTitle = entries[0]?.videoTitle || "Untitled";
  const studioUrl = entries[0]?.youtubeStudioUrl;
  const latestDate = entries[0]?.createdAt;
  const isPending = youtubeVideoId.startsWith("pending-") || youtubeVideoId.startsWith("local-");

  const uniqueFields = [...new Set(entries.map(e => e.field))];
  const totalChanges = entries.length;

  return (
    <Card data-testid={`card-update-history-${youtubeVideoId}`}>
      <CardContent className="p-3">
        <div
          className="flex items-center justify-between gap-3 flex-wrap cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${youtubeVideoId}`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isPending ? (
              <Video className="h-4 w-4 text-purple-400 shrink-0" />
            ) : (
              <SiYoutube className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate" data-testid={`text-video-title-${youtubeVideoId}`}>
                {videoTitle}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {uniqueFields.map((field) => {
                  const Icon = FIELD_ICONS[field] || Pencil;
                  return (
                    <Badge key={field} variant="secondary" className="text-xs">
                      <Icon className="h-3 w-3 mr-1" />
                      {FIELD_LABELS[field] || field}
                    </Badge>
                  );
                })}
                <Badge variant="outline" className="text-xs">
                  {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                </Badge>
                {isPending && (
                  <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/30">
                    Scheduled
                  </Badge>
                )}
                {latestDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {studioUrl && !isPending && (
              <a
                href={studioUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-studio-${youtubeVideoId}`}
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  YouTube Studio
                </Button>
              </a>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-3" data-testid={`section-changes-${youtubeVideoId}`}>
            {entries.map((entry) => {
              const Icon = FIELD_ICONS[entry.field] || Pencil;
              return (
                <div key={entry.id} className="space-y-2" data-testid={`change-entry-${entry.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{FIELD_LABELS[entry.field] || entry.field}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {entry.createdAt && format(new Date(entry.createdAt), "MMM d, h:mm a")}
                    </div>
                    {entry.status === "pushed" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    )}
                    {entry.status === "optimized" && (
                      <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/30">
                        AI Optimized
                      </Badge>
                    )}
                  </div>
                  <FieldDiff field={entry.field} oldValue={entry.oldValue} newValue={entry.newValue} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
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
          <h3 className="font-semibold text-sm">Update History</h3>
          <Badge variant="secondary" className="text-xs">{updatedVideos.length} video{updatedVideos.length !== 1 ? "s" : ""}</Badge>
        </div>
        {updatedVideos.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No video updates yet. When CreatorOS optimizes your videos, you'll see a before/after changelog here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {updatedVideos.map(([youtubeVideoId, entries]) => (
              <VideoUpdateCard key={youtubeVideoId} youtubeVideoId={youtubeVideoId} entries={entries} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default UpdatedVideosTab;
