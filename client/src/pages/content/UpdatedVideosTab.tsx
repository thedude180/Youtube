import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { EmptyState } from "@/components/EmptyState";
import {
  ExternalLink, CheckCircle2, FileText, Hash, Type, Clock,
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

function UpdatedVideosTab() {
  const { data: logs, isLoading, error } = useQuery<SyncLog[]>({
    queryKey: ["/api/videos/updated"],
  });

  if (error) {
    return <QueryErrorReset error={error} resetKeys={["/api/videos/updated"]} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No Updated Videos Yet"
        description="When CreatorOS optimizes and pushes updates to your YouTube videos, they'll appear here so you can verify the changes."
      />
    );
  }

  const grouped = new Map<string, SyncLog[]>();
  for (const log of logs) {
    const youtubeId = log.details?.youtubeId || "unknown";
    if (!grouped.has(youtubeId)) {
      grouped.set(youtubeId, []);
    }
    grouped.get(youtubeId)!.push(log);
  }

  const entries = Array.from(grouped.entries()).map(([youtubeId, logGroup]) => {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {entries.length} video{entries.length !== 1 ? "s" : ""} updated on YouTube
        </p>
        <Badge variant="outline" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          {logs.length} total update{logs.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="space-y-2">
        {entries.map(({ youtubeId, videoTitle, latest, allFields, updateCount }) => (
          <Card key={youtubeId} data-testid={`card-updated-video-${youtubeId}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="shrink-0 mt-0.5">
                    <SiYoutube className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate" data-testid={`text-video-title-${youtubeId}`}>
                      {videoTitle}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
                          {updateCount}x updated
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Last updated {formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true })}
                      {latest.details?.source && (
                        <span className="ml-1 text-muted-foreground/60">
                          via {latest.details.source.replace(/_/g, " ")}
                        </span>
                      )}
                    </p>
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
                    View on YouTube
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default UpdatedVideosTab;
