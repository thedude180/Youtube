import { useQuery } from "@tanstack/react-query";
import { useVideos } from "@/hooks/use-videos";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorReset } from "@/components/QueryErrorReset";
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

interface VideoEntry {
  id: number;
  title: string;
  type: string;
  status: string;
  thumbnailUrl: string | null;
  metadata: any;
  createdAt: Date | string | null;
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

const SOURCE_LABELS: Record<string, string> = {
  direct_push: "Direct Push",
  backlog_processing: "Backlog Queue",
  pipeline_step_title: "Pipeline (Title)",
  pipeline_step_description: "Pipeline (Description)",
  pipeline_step_tags: "Pipeline (Tags)",
  system: "System",
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

  const isSame = displayOld === displayNew;

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
      {!isSame && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1.5" />}
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

  const fieldGroups = new Map<string, UpdateHistoryEntry[]>();
  for (const entry of entries) {
    const existing = fieldGroups.get(entry.field) || [];
    existing.push(entry);
    fieldGroups.set(entry.field, existing);
  }

  const uniqueFields = Array.from(fieldGroups.keys());
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
            <SiYoutube className="h-4 w-4 text-red-500 shrink-0" />
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
                {latestDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
                  </span>
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
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_LABELS[entry.source] || entry.source}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {entry.createdAt && format(new Date(entry.createdAt), "MMM d, h:mm a")}
                    </div>
                    {entry.status === "pushed" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    )}
                  </div>
                  <FieldDiff field={entry.field} oldValue={entry.oldValue} newValue={entry.newValue} />
                </div>
              );
            })}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <a
                href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`link-watch-${youtubeVideoId}`}
              >
                <Button variant="ghost" size="sm">
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Watch on YouTube
                </Button>
              </a>
              {studioUrl && (
                <a
                  href={studioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-studio-verify-${youtubeVideoId}`}
                >
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Verify in Studio
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpdatedVideosTab() {
  const { data: updateHistory, isLoading: historyLoading, error: historyError } = useQuery<UpdateHistoryEntry[]>({
    queryKey: ["/api/videos/update-history"],
  });

  const { data: processing, isLoading: procLoading, error: procError } = useQuery<PipelineEntry[]>({
    queryKey: ["/api/videos/processing"],
    refetchInterval: 10000,
  });

  const { data: allVideos, isLoading: videosLoading, error: videosError } = useVideos();

  const isLoading = historyLoading || procLoading || videosLoading;
  const error = historyError || procError || videosError;

  if (error) {
    return <QueryErrorReset error={error} queryKey={["/api/videos/update-history"]} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full" />
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
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
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

  const publicVideos = (allVideos || []).filter((v: VideoEntry) =>
    v.status === "published" || v.status === "public"
  );

  return (
    <div className="space-y-8">
      <section data-testid="section-update-history">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <h3 className="font-semibold text-sm">Update History</h3>
          <Badge variant="secondary" className="text-xs">{updatedVideos.length} video{updatedVideos.length !== 1 ? "s" : ""}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Click any video to see exactly what changed. Use the "YouTube Studio" link to verify each update.
        </p>
        {updatedVideos.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No video updates yet. When CreatorOS optimizes your videos, you'll see a detailed before/after changelog here so you can verify every change in YouTube Studio.</p>
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

      <section data-testid="section-processing-videos">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
          <h3 className="font-semibold text-sm">Being Worked On</h3>
          <Badge variant="secondary" className="text-xs">{processingEntries.length}</Badge>
        </div>
        {processingEntries.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No videos are currently being optimized. The system automatically processes new and unoptimized videos.</p>
            </CardContent>
          </Card>
        ) : (
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
        )}
      </section>

      <section data-testid="section-public-videos">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-blue-500" />
          <h3 className="font-semibold text-sm">Public on YouTube</h3>
          <Badge variant="secondary" className="text-xs">{publicVideos.length}</Badge>
        </div>
        {publicVideos.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No public videos found. Connect your YouTube channel and sync your videos to see them here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {publicVideos.map((video: VideoEntry) => {
              const youtubeId = video.metadata?.youtubeId;
              return (
                <Card key={video.id} data-testid={`card-public-video-${video.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate" data-testid={`text-public-title-${video.id}`}>
                            {video.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {video.type === "short" ? "Short" : "VOD"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {youtubeId && (
                        <a
                          href={`https://www.youtube.com/watch?v=${youtubeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-public-youtube-${video.id}`}
                        >
                          <Button variant="ghost" size="icon">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default UpdatedVideosTab;
