import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scissors, Wand2, Loader2, Clock, Zap, Tag } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShortsMetadata {
  title: string;
  description: string;
  tags: string[];
  suggestedDurationSec: number;
  hook: string;
}

export default function Shorts() {
  const { toast } = useToast();
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [result, setResult] = useState<ShortsMetadata | null>(null);

  const { data: videos = [], isLoading: videosLoading } = useQuery<any[]>({
    queryKey: ["/api/content/videos"],
  });

  const generateMutation = useMutation({
    mutationFn: (videoId: number) =>
      apiRequest<ShortsMetadata>("POST", `/api/content/videos/${videoId}/shorts`, {}),
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Shorts metadata generated!" });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const selectedVideo = videos.find((v: any) => String(v.id) === selectedVideoId);

  function handleGenerate() {
    if (!selectedVideoId) return;
    setResult(null);
    generateMutation.mutate(Number(selectedVideoId));
  }

  return (
    <div className="space-y-6" data-testid="page-shorts">
      <div>
        <h1 className="text-2xl font-bold">Shorts</h1>
        <p className="text-muted-foreground mt-1">
          Generate AI-optimized YouTube Shorts metadata from any of your videos.
        </p>
      </div>

      {/* Video selector */}
      <Card data-testid="card-shorts-generator">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="w-5 h-5" />
            Generate Shorts Metadata
          </CardTitle>
          <CardDescription>
            Select a video and let AI create a hook, title, description, and tags optimized for YouTube Shorts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Select
              value={selectedVideoId}
              onValueChange={setSelectedVideoId}
              disabled={videosLoading}
            >
              <SelectTrigger className="flex-1" data-testid="select-video">
                <SelectValue placeholder={videosLoading ? "Loading videos…" : "Select a video…"} />
              </SelectTrigger>
              <SelectContent>
                {videos.map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)} data-testid={`option-video-${v.id}`}>
                    {v.title} {v.game ? `· ${v.game}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleGenerate}
              disabled={!selectedVideoId || generateMutation.isPending}
              data-testid="btn-generate-shorts"
            >
              {generateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Wand2 className="w-4 h-4 mr-2" />
              }
              Generate
            </Button>
          </div>

          {selectedVideo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="selected-video-info">
              <Badge variant="outline" className="capitalize">{selectedVideo.status}</Badge>
              {selectedVideo.game && <span>{selectedVideo.game}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result */}
      {generateMutation.isPending && (
        <Card data-testid="card-generating">
          <CardContent className="pt-10 pb-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">AI is crafting your Shorts metadata…</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4" data-testid="section-shorts-result">
          {/* Hook */}
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-hook">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Opening Hook (first 3 seconds)</p>
                  <p className="text-sm font-medium">{result.hook}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Title */}
          <Card data-testid="card-shorts-title">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Title</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm bg-muted rounded px-3 py-2">{result.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{result.title.length} / 60 chars</p>
            </CardContent>
          </Card>

          {/* Description */}
          <Card data-testid="card-shorts-description">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm bg-muted rounded px-3 py-2 whitespace-pre-wrap">{result.description}</p>
              <p className="text-xs text-muted-foreground mt-1">{result.description.length} / 150 chars</p>
            </CardContent>
          </Card>

          {/* Duration + Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card data-testid="card-shorts-duration">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{result.suggestedDurationSec}s</p>
                  <p className="text-xs text-muted-foreground">Suggested duration</p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-shorts-tags">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs" data-testid={`shorts-tag-${i}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            data-testid="btn-regenerate"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Regenerate
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!result && !generateMutation.isPending && videos.length === 0 && (
        <Card className="border-dashed" data-testid="card-no-videos">
          <CardContent className="pt-10 pb-10 text-center">
            <Scissors className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Add some videos in the Videos page first, then come back here to generate Shorts metadata.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
