import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ExternalLink, CheckCircle2, FileText, Hash, Type,
  Loader2, ArrowRight, Clock, Copy, Search, Zap,
  Send, RefreshCw, Scissors, Image, Sparkles, Film,
  ChevronDown, ChevronUp, Filter, Link, Upload,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import SmartEditPanel from "./SmartEditPanel";

interface AutopilotEntry {
  id: number;
  type: string;
  targetPlatform: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  metadata: any;
}

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

type ChangeKind = "seo" | "thumbnail" | "seo_and_thumbnail" | "unknown";
type FilterType = "all" | "seo" | "thumbnail" | "content";

function classifyEntries(entries: UpdateHistoryEntry[]): ChangeKind {
  const fields = new Set(entries.map(e => e.field));
  const hasSeo = fields.has("title") || fields.has("description") || fields.has("tags");
  const hasThumb = fields.has("thumbnail") || fields.has("thumbnailUrl");
  if (hasSeo && hasThumb) return "seo_and_thumbnail";
  if (hasThumb) return "thumbnail";
  if (hasSeo) return "seo";
  return "unknown";
}

const KIND_CONFIG: Record<ChangeKind, {
  label: string;
  badgeClass: string;
  icon: typeof Type;
  dot: string;
}> = {
  seo: {
    label: "SEO Updated",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Sparkles,
    dot: "bg-blue-400",
  },
  thumbnail: {
    label: "Thumbnail Updated",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: Image,
    dot: "bg-orange-400",
  },
  seo_and_thumbnail: {
    label: "SEO + Thumbnail",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Sparkles,
    dot: "bg-purple-400",
  },
  unknown: {
    label: "AI Optimized",
    badgeClass: "bg-muted text-muted-foreground border-border/30",
    icon: Zap,
    dot: "bg-muted-foreground",
  },
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
            <p className="text-[10px] font-medium text-red-400 mb-1 uppercase tracking-wide">Before</p>
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
            <p className="text-[10px] font-medium text-red-400 mb-0.5 uppercase tracking-wide">Before</p>
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

function VideoUpdateCard({ videoId, entries }: { videoId: string; entries: UpdateHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const latestDate = entries[0]?.createdAt;
  const studioUrl = entries[0]?.youtubeStudioUrl;
  const isPending = videoId.startsWith("pending-") || videoId.startsWith("local-") || videoId.startsWith("pipeline-");

  const titleEntry = entries.find(e => e.field === "title");
  const descEntry = entries.find(e => e.field === "description");
  const tagsEntry = entries.find(e => e.field === "tags");
  const thumbEntry = entries.find(e => e.field === "thumbnail" || e.field === "thumbnailUrl");

  const currentTitle = titleEntry?.newValue || entries[0]?.videoTitle || "Untitled";
  const kind = classifyEntries(entries);
  const cfg = KIND_CONFIG[kind];
  const KindIcon = cfg.icon;

  return (
    <Card data-testid={`card-update-history-${videoId}`} className="border-border/50">
      <CardContent className="p-4">
        <div
          className="flex items-start justify-between gap-3 flex-wrap cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${videoId}`}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="relative shrink-0 mt-0.5">
              <SiYoutube className="h-5 w-5 text-red-500" />
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${cfg.dot} border border-background`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm" data-testid={`text-video-title-${videoId}`}>
                  {currentTitle}
                </p>
                <CopyButton text={currentTitle} label="Title" />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {latestDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
                  </span>
                )}
                <Badge variant="outline" className={`text-xs flex items-center gap-1 ${cfg.badgeClass}`} data-testid={`badge-change-kind-${videoId}`}>
                  <KindIcon className="h-3 w-3" />
                  {cfg.label}
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
              <a href={studioUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`link-studio-${videoId}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  YouTube Studio
                </Button>
              </a>
            )}
            {!studioUrl && !isPending && (
              <a href="https://studio.youtube.com/channel/videos" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`link-studio-search-${videoId}`}>
                <Button variant="outline" size="sm">
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Find in Studio
                </Button>
              </a>
            )}
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border/40 pt-3" data-testid={`section-changes-${videoId}`}>
            {titleEntry && <ChangeRow icon={Type} label="Title" oldValue={titleEntry.oldValue} newValue={titleEntry.newValue} field="title" />}
            {descEntry && <ChangeRow icon={FileText} label="Description" oldValue={descEntry.oldValue} newValue={descEntry.newValue} field="description" />}
            {tagsEntry && <ChangeRow icon={Hash} label="Tags" oldValue={tagsEntry.oldValue} newValue={tagsEntry.newValue} field="tags" />}
            {thumbEntry && (
              <div className="space-y-1.5" data-testid={`change-row-thumbnail`}>
                <div className="flex items-center gap-1.5">
                  <Image className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thumbnail</span>
                </div>
                <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-2.5 py-2 text-xs text-muted-foreground">
                  New AI-generated thumbnail applied
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TYPE_ICONS: Record<string, typeof Zap> = {
  "auto-clip": Scissors,
  "cross-promo": Send,
  "content-recycle": RefreshCw,
};

const TYPE_LABELS: Record<string, string> = {
  "auto-clip": "AI Clips Extracted",
  "cross-promo": "Cross-Platform Post",
  "content-recycle": "Content Recycled",
};

const CONTENT_EDIT_TYPES = ["auto-clip", "content-recycle"];

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

function ContentEditCard({ type, platform, entries }: { type: string; platform: string; entries: AutopilotEntry[] }) {
  const Icon = TYPE_ICONS[type] || Film;
  const label = TYPE_LABELS[type] || type;
  const latestStatus = entries[0]?.status || "scheduled";
  const statusStyle = STATUS_STYLES[latestStatus] || "bg-muted text-muted-foreground";
  const latestDate = entries[0]?.createdAt;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5"
      data-testid={`activity-group-${type}-${platform}`}
    >
      <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{label}</span>
          {entries.length > 1 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">x{entries.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground capitalize">{platform}</span>
          {latestDate && (
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusStyle}`}>{latestStatus}</Badge>
    </div>
  );
}

function CrossPlatformCard({ type, platform, entries }: { type: string; platform: string; entries: AutopilotEntry[] }) {
  const Icon = TYPE_ICONS[type] || Send;
  const label = TYPE_LABELS[type] || type;
  const latestStatus = entries[0]?.status || "scheduled";
  const statusStyle = STATUS_STYLES[latestStatus] || "bg-muted text-muted-foreground";
  const latestDate = entries[0]?.createdAt;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/40"
      data-testid={`activity-group-${type}-${platform}`}
    >
      <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          {entries.length > 1 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">x{entries.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground capitalize">{platform}</span>
          {latestDate && (
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(latestDate), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusStyle}`}>{latestStatus}</Badge>
    </div>
  );
}

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
  const pollInterval = useAdaptiveInterval(10000);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAllSeo, setShowAllSeo] = useState(false);
  const [showAllContent, setShowAllContent] = useState(false);

  const { data: updateHistory, isLoading: historyLoading } = useQuery<UpdateHistoryEntry[]>({
    queryKey: ["/api/videos/update-history"],
    retry: 1,
  });

  const { data: processing, isLoading: procLoading } = useQuery<PipelineEntry[]>({
    queryKey: ["/api/videos/processing"],
    refetchInterval: pollInterval,
    retry: 1,
  });

  const { data: autopilotActivity } = useQuery<AutopilotEntry[]>({
    queryKey: ["/api/autopilot/recent-activity"],
    retry: 1,
  });

  const isLoading = historyLoading && procLoading;

  const safeHistory = safeArray<UpdateHistoryEntry>(updateHistory);
  const safeActivity = safeArray<AutopilotEntry>(autopilotActivity);

  const grouped = useMemo(() => {
    const map = new Map<string, UpdateHistoryEntry[]>();
    for (const entry of safeHistory) {
      const key = entry.youtubeVideoId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const dateA = a[0]?.createdAt ? new Date(a[0].createdAt).getTime() : 0;
      const dateB = b[0]?.createdAt ? new Date(b[0].createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [safeHistory]);

  const groupedActivity = useMemo(() => {
    const map = new Map<string, { type: string; platform: string; entries: AutopilotEntry[] }>();
    for (const e of safeActivity) {
      const key = `${e.type}::${e.targetPlatform}`;
      if (!map.has(key)) map.set(key, { type: e.type, platform: e.targetPlatform, entries: [] });
      map.get(key)!.entries.push(e);
    }
    return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length);
  }, [safeActivity]);

  const contentEdits = useMemo(() => groupedActivity.filter(g => CONTENT_EDIT_TYPES.includes(g.type)), [groupedActivity]);
  const crossPlatform = useMemo(() => groupedActivity.filter(g => !CONTENT_EDIT_TYPES.includes(g.type)), [groupedActivity]);

  const seoVideos = useMemo(() => {
    if (filter === "content") return [];
    if (filter === "thumbnail") return grouped.filter(([, e]) => classifyEntries(e) === "thumbnail" || classifyEntries(e) === "seo_and_thumbnail");
    if (filter === "seo") return grouped.filter(([, e]) => classifyEntries(e) === "seo" || classifyEntries(e) === "seo_and_thumbnail");
    return grouped;
  }, [grouped, filter]);

  const processingEntries = safeArray<PipelineEntry>(processing).filter(p => p.status === "queued" || p.status === "processing");

  const SHOW_LIMIT = 5;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  const hasAnything = grouped.length > 0 || groupedActivity.length > 0 || processingEntries.length > 0;

  return (
    <div className="space-y-6">
      {processingEntries.length > 0 && (
        <section data-testid="section-processing-videos">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
            <h3 className="font-semibold text-sm">Being Worked On Now</h3>
            <Badge variant="secondary" className="text-xs">{processingEntries.length}</Badge>
          </div>
          <div className="space-y-2">
            {processingEntries.map(entry => (
              <Card key={entry.id} data-testid={`card-processing-video-${entry.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Loader2 className="h-4 w-4 text-yellow-500 animate-spin shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" data-testid={`text-processing-title-${entry.id}`}>{entry.videoTitle}</p>
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

      {hasAnything && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-bar-change-type">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Filter:</span>
          {(["all", "seo", "thumbnail", "content"] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                filter === f
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
              }`}
              data-testid={`filter-${f}`}
            >
              {f === "all" ? "All Changes" : f === "seo" ? "SEO" : f === "thumbnail" ? "Thumbnail" : "App Edits"}
            </button>
          ))}
        </div>
      )}

      {(filter === "all" || filter === "seo" || filter === "thumbnail") && seoVideos.length > 0 && (
        <section data-testid="section-metadata-updates">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold text-sm">SEO {"&"} Thumbnail Updates</h3>
            </div>
            <Badge variant="secondary" className="text-xs">{seoVideos.length}</Badge>
            <span className="text-[10px] text-muted-foreground font-mono ml-1">original video untouched</span>
          </div>
          <div className="space-y-3">
            {(showAllSeo ? seoVideos : seoVideos.slice(0, SHOW_LIMIT)).map(([videoId, entries]) => (
              <VideoUpdateCard key={videoId} videoId={videoId} entries={entries} />
            ))}
          </div>
          {seoVideos.length > SHOW_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs text-muted-foreground"
              onClick={() => setShowAllSeo(!showAllSeo)}
              data-testid="button-toggle-seo-videos"
            >
              {showAllSeo ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show {seoVideos.length - SHOW_LIMIT} more</>}
            </Button>
          )}
        </section>
      )}

      {(filter === "all" || filter === "content") && contentEdits.length > 0 && (
        <section data-testid="section-content-edits">
          <div className="flex items-center gap-2 mb-3">
            <Film className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Edited by CreatorOS</h3>
            <Badge variant="secondary" className="text-xs">{contentEdits.reduce((n, g) => n + g.entries.length, 0)}</Badge>
            <span className="text-[10px] text-muted-foreground font-mono ml-1">clips cut, content repurposed</span>
          </div>
          <div className="space-y-2">
            {(showAllContent ? contentEdits : contentEdits.slice(0, SHOW_LIMIT)).map(({ type, platform, entries }) => (
              <ContentEditCard key={`${type}-${platform}`} type={type} platform={platform} entries={entries} />
            ))}
          </div>
          {contentEdits.length > SHOW_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs text-muted-foreground"
              onClick={() => setShowAllContent(!showAllContent)}
              data-testid="button-toggle-content-edits"
            >
              {showAllContent ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show {contentEdits.length - SHOW_LIMIT} more</>}
            </Button>
          )}
        </section>
      )}

      {(filter === "all") && crossPlatform.length > 0 && (
        <section data-testid="section-cross-platform">
          <div className="flex items-center gap-2 mb-3">
            <Send className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Cross-Platform Posts</h3>
            <Badge variant="secondary" className="text-xs">{crossPlatform.reduce((n, g) => n + g.entries.length, 0)}</Badge>
          </div>
          <div className="space-y-2">
            {crossPlatform.slice(0, SHOW_LIMIT).map(({ type, platform, entries }) => (
              <CrossPlatformCard key={`${type}-${platform}`} type={type} platform={platform} entries={entries} />
            ))}
            {crossPlatform.length > SHOW_LIMIT && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{crossPlatform.length - SHOW_LIMIT} more
              </p>
            )}
          </div>
        </section>
      )}

      {!hasAnything && (
        <Card data-testid="card-no-activity">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">When CreatorOS updates your video SEO, generates thumbnails, or cuts clips, you will see every change here — separated by type.</p>
          </CardContent>
        </Card>
      )}

      <VodUrlInputCard />
      <CatalogRedetectCard />
      <SmartEditPanel />
    </div>
  );
}

interface VodUrlResult {
  success: boolean;
  message: string;
  alreadyExisted: boolean;
  video?: { id: number; title: string; youtubeId: string; thumbnailUrl: string };
  smartEditJobId?: number;
  smartEditStatus?: string;
  durationSec?: number;
  scheduledAt?: string;
  pipeline?: {
    smartEdit: string;
    seoOptimization: string;
    thumbnailGeneration: string;
    scheduling: string;
  };
}

function VodUrlInputCard() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<VodUrlResult | null>(null);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async (videoUrl: string) => {
      const res = await apiRequest("POST", "/api/content/from-url", { url: videoUrl });
      return res.json() as Promise<VodUrlResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/content/smart-edit/jobs"] });
      toast({
        title: data.alreadyExisted ? "Already processed" : "VOD pipeline started",
        description: data.message,
      });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to process URL";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setResult(null);
    submitMutation.mutate(url.trim());
  };

  return (
    <Card className="border-primary/20 bg-card/60" data-testid="card-vod-url-input">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="h-3.5 w-3.5 text-primary" />
          </div>
          Long-Form VOD Pipeline
          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 ml-auto">AI Editor</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste a YouTube link for any video over 15 minutes. CreatorOS will auto-edit highlight reels, optimize SEO, generate a thumbnail, and schedule the upload.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2" data-testid="form-vod-url">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="https://youtu.be/... or youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9 h-9 text-sm"
              disabled={submitMutation.isPending}
              data-testid="input-vod-url"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-9 px-4"
            disabled={submitMutation.isPending || !url.trim()}
            data-testid="button-submit-vod-url"
          >
            {submitMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</>
            ) : (
              <><Film className="h-3.5 w-3.5 mr-1.5" />Process VOD</>
            )}
          </Button>
        </form>

        {result && result.success && (
          <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2" data-testid="vod-url-result">
            <div className="flex items-start gap-3">
              {result.video?.thumbnailUrl && (
                <img
                  src={result.video.thumbnailUrl}
                  alt=""
                  className="w-20 h-12 rounded-md object-cover shrink-0"
                  data-testid="img-vod-thumbnail"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-vod-title">{result.video?.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{result.message}</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            </div>
            {result.pipeline && !result.alreadyExisted && (
              <div className="flex flex-wrap gap-1.5 mt-2" data-testid="vod-pipeline-status">
                {Object.entries(result.pipeline).map(([step, status]) => (
                  <Badge
                    key={step}
                    variant="outline"
                    className={`text-[10px] ${status === "queued" || status === "running" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : status === "scheduled" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border/30"}`}
                    data-testid={`badge-pipeline-${step}`}
                  >
                    {step === "smartEdit" ? "Smart Edit" : step === "seoOptimization" ? "SEO" : step === "thumbnailGeneration" ? "Thumbnail" : "Schedule"}: {status}
                  </Badge>
                ))}
              </div>
            )}
            {result.scheduledAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Scheduled: {new Date(result.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogRedetectCard() {
  const [result, setResult] = useState<{ total: number; taskId: number } | null>(null);
  const { toast } = useToast();

  const redetectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/content/catalog-redetect");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setResult({ total: data.total, taskId: data.taskId });
        toast({ title: "Catalog redetection started", description: `Processing ${data.total} videos with AI vision` });
        queryClient.invalidateQueries({ queryKey: ["/api/content/videos"] });
      }
    },
    onError: () => {
      toast({ title: "Failed to start", description: "Could not start catalog redetection", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-catalog-redetect">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Game Detection Rerun
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Re-analyze your entire catalog using AI vision to correctly identify games from actual gameplay frames. Fixes wrong SEO packages caused by title-only detection.
        </p>
        <Button
          onClick={() => redetectMutation.mutate()}
          disabled={redetectMutation.isPending}
          className="w-full"
          variant="outline"
          data-testid="button-catalog-redetect"
        >
          {redetectMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rerun Entire Catalog
            </>
          )}
        </Button>
        {result && (
          <div className="text-xs text-emerald-400 flex items-center gap-1.5" data-testid="text-redetect-status">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Processing {result.total} videos — SEO will update automatically
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UpdatedVideosTab;
