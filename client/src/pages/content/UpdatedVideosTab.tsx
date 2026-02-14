import { useQuery } from "@tanstack/react-query";
import { useVideos } from "@/hooks/use-videos";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import {
  ExternalLink, CheckCircle2, FileText, Hash, Type,
  Loader2, Video, Eye,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";

interface SyncLog {
  id: number;
  action: string;
  target: string;
  details: {
    platform: string;
    youtubeId: string;
    updatedFields: string[];
    source: string;
  };
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

function UpdatedVideosTab() {
  const { data: syncLogs, isLoading: logsLoading, error: logsError } = useQuery<SyncLog[]>({
    queryKey: ["/api/videos/updated"],
  });

  const { data: processing, isLoading: procLoading, error: procError } = useQuery<PipelineEntry[]>({
    queryKey: ["/api/videos/processing"],
    refetchInterval: 10000,
  });

  const { data: allVideos, isLoading: videosLoading, error: videosError } = useVideos();

  const isLoading = logsLoading || procLoading || videosLoading;
  const error = logsError || procError || videosError;

  if (error) {
    return <QueryErrorReset error={error} resetKeys={["/api/videos/updated"]} />;
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

  const updatedYoutubeIds = new Set<string>();
  const grouped = new Map<string, SyncLog[]>();
  if (syncLogs) {
    for (const log of syncLogs) {
      const youtubeId = log.details?.youtubeId || "unknown";
      updatedYoutubeIds.add(youtubeId);
      if (!grouped.has(youtubeId)) {
        grouped.set(youtubeId, []);
      }
      grouped.get(youtubeId)!.push(log);
    }
  }

  const updatedEntries = Array.from(grouped.entries()).map(([youtubeId, logGroup]) => {
    const latest = logGroup[0];
    const allFields = new Set<string>();
    for (const l of logGroup) {
      for (const f of l.details?.updatedFields || []) {
        allFields.add(f);
      }
    }
    const videoTitle = latest.target?.replace("YouTube: ", "") || "Untitled Video";
    return { youtubeId, videoTitle, latest, allFields: Array.from(allFields), updateCount: logGroup.length };
  });

  const processingEntries = (processing || []).filter(p => p.status === "queued" || p.status === "processing");

  const processingVideoIds = new Set(processingEntries.map(p => p.videoId).filter(Boolean));

  const publicVideos = (allVideos || []).filter((v: VideoEntry) =>
    v.status === "published" || v.status === "public"
  );

  return (
    <div className="space-y-8">
      <section data-testid="section-updated-videos">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <h3 className="font-semibold text-sm">Updated on YouTube</h3>
          <Badge variant="secondary" className="text-xs">{updatedEntries.length}</Badge>
        </div>
        {updatedEntries.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">No videos have been updated on YouTube yet. Updates will appear here as CreatorOS optimizes your content.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {updatedEntries.map(({ youtubeId, videoTitle, latest, allFields, updateCount }) => (
              <Card key={youtubeId} data-testid={`card-updated-video-${youtubeId}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <SiYoutube className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" data-testid={`text-updated-title-${youtubeId}`}>
                          {videoTitle}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {allFields.map((field) => {
                            const Icon = FIELD_ICONS[field] || CheckCircle2;
                            return (
                              <Badge key={field} variant="secondary" className="text-xs">
                                <Icon className="h-3 w-3 mr-1" />
                                {FIELD_LABELS[field] || field}
                              </Badge>
                            );
                          })}
                          {updateCount > 1 && (
                            <Badge variant="outline" className="text-xs">
                              {updateCount}x
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-youtube-${youtubeId}`}
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Check on YouTube
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
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
          <h3 className="font-semibold text-sm">Public Videos</h3>
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
              const isUpdated = youtubeId && updatedYoutubeIds.has(youtubeId);
              const isProcessing = processingVideoIds.has(video.id);
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
                            {isUpdated && (
                              <Badge variant="secondary" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                                Optimized
                              </Badge>
                            )}
                            {isProcessing && (
                              <Badge variant="secondary" className="text-xs">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                In Progress
                              </Badge>
                            )}
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
