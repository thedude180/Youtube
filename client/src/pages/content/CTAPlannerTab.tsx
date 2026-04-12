import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useVideos } from "@/hooks/use-videos";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Plus, Link2, ExternalLink, Video, Loader2 } from "lucide-react";

const CTA_TYPES = [
  { value: "subscribe", label: "Subscribe" },
  { value: "link", label: "Link in Description" },
  { value: "product", label: "Product Promo" },
  { value: "lead-magnet", label: "Lead Magnet" },
  { value: "community", label: "Join Community" },
  { value: "custom", label: "Custom" },
];

const CTA_POSITIONS = [
  { value: "intro", label: "Intro (0-30s)" },
  { value: "mid", label: "Mid-roll" },
  { value: "end", label: "End Screen" },
  { value: "pinned", label: "Pinned Comment" },
  { value: "description", label: "Description" },
];

export default function CTAPlannerTab() {
  const { data: videos, isLoading: videosLoading } = useVideos();
  const { toast } = useToast();
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [ctaType, setCtaType] = useState("subscribe");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [position, setPosition] = useState("end");

  const { data: existingCtas, isLoading: ctasLoading } = useQuery<{ ctas: any[] }>({
    queryKey: ["/api/content", selectedVideo, "ctas"],
    queryFn: () => selectedVideo ? fetch(`/api/content/${selectedVideo}/ctas`).then(r => r.json()) : Promise.resolve({ ctas: [] }),
    enabled: !!selectedVideo,
  });

  const attachMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/content/cta", {
        contentId: selectedVideo,
        ctaType,
        ctaText,
        ctaUrl: ctaUrl || undefined,
        position,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "CTA attached", description: "CTA has been linked to this content." });
      queryClient.invalidateQueries({ queryKey: ["/api/content", selectedVideo, "ctas"] });
      setCtaText("");
      setCtaUrl("");
    },
    onError: () => toast({ title: "Failed", description: "Could not attach CTA.", variant: "destructive" }),
  });

  if (videosLoading) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const videoList = (videos || []).filter(v => v.type === "vod" || v.type === "short");

  return (
    <div className="space-y-4" data-testid="section-cta-planner">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            CTA Planner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Video</label>
              <Select value={selectedVideo} onValueChange={setSelectedVideo}>
                <SelectTrigger data-testid="select-video">
                  <SelectValue placeholder="Select a video" />
                </SelectTrigger>
                <SelectContent>
                  {videoList.map(v => (
                    <SelectItem key={v.id} value={String(v.id)} data-testid={`option-video-${v.id}`}>
                      <span className="truncate">{v.title || `Video #${v.id}`}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">CTA Type</label>
              <Select value={ctaType} onValueChange={setCtaType}>
                <SelectTrigger data-testid="select-cta-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CTA_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">CTA Text</label>
              <Input
                data-testid="input-cta-text"
                placeholder='e.g. "Download the free guide"'
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL (optional)</label>
              <Input
                data-testid="input-cta-url"
                placeholder="https://..."
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Position</label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger data-testid="select-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CTA_POSITIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              data-testid="button-attach-cta"
              onClick={() => attachMutation.mutate()}
              disabled={!selectedVideo || !ctaText || attachMutation.isPending}
              className="shrink-0"
            >
              {attachMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Attach CTA
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedVideo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              CTAs for This Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ctasLoading ? <Skeleton className="h-16 w-full" /> : (
              existingCtas?.ctas?.length ? (
                <div className="space-y-2">
                  {existingCtas.ctas.map((cta: any, i: number) => (
                    <div key={cta.id || i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30" data-testid={`row-cta-${i}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{cta.ctaText}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{cta.ctaType}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{cta.position}</Badge>
                        </div>
                      </div>
                      {cta.ctaUrl && (
                        <a href={cta.ctaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />Link
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No CTAs attached yet. Add one above.</p>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
