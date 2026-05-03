import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Plus, Search } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500",
  ready: "bg-blue-500",
  scheduled: "bg-amber-500",
  published: "bg-green-600",
  failed: "bg-red-500",
};

export default function Content() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("videos");
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const { data: videosData, isLoading: videosLoading } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["/api/content/videos"],
  });

  const { data: ideas = [], isLoading: ideasLoading } = useQuery<any[]>({
    queryKey: ["/api/content/ideas"],
  });

  const generateMetaMutation = useMutation({
    mutationFn: (videoId: number) => apiRequest("POST", `/api/content/videos/${videoId}/generate-metadata`),
    onSuccess: (_data, videoId) => {
      setGeneratingId(videoId);
      toast({ title: "Generating metadata…", description: "You'll be notified when it's ready." });
    },
  });

  const generateIdeasMutation = useMutation({
    mutationFn: ({ game }: { game: string }) =>
      apiRequest("POST", "/api/content/ideas/generate", { game, count: 10 }),
    onSuccess: () => toast({ title: "Generating ideas…" }),
  });

  useSSE({
    "content:metadata-ready": (data: any) => {
      setGeneratingId(null);
      qc.invalidateQueries({ queryKey: ["/api/content/videos"] });
      qc.invalidateQueries({ queryKey: [`/api/content/videos/${data.videoId}/drafts`] });
      toast({ title: "Metadata ready", description: `${data.titles?.[0] ?? "Titles generated"}` });
    },
    "content:ideas-ready": () => {
      qc.invalidateQueries({ queryKey: ["/api/content/ideas"] });
      toast({ title: "Content ideas ready!" });
    },
  });

  return (
    <div className="space-y-6" data-testid="page-content">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content</h1>
        <Button size="sm" data-testid="btn-new-video">
          <Plus className="w-4 h-4 mr-2" />
          Add Video
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="tabs-content">
        <TabsList>
          <TabsTrigger value="videos" data-testid="tab-videos">Videos</TabsTrigger>
          <TabsTrigger value="ideas" data-testid="tab-ideas">Ideas</TabsTrigger>
        </TabsList>

        <TabsContent value="videos" className="mt-4 space-y-3">
          {videosLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : videosData?.items.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-videos">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No videos yet. Add one to get started.
              </CardContent>
            </Card>
          ) : (
            videosData?.items.map((v) => (
              <Card key={v.id} data-testid={`card-video-${v.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.title}</p>
                      <p className="text-xs text-muted-foreground">{v.game ?? "Unknown game"} · {v.viewCount?.toLocaleString() ?? 0} views</p>
                    </div>
                    <Badge
                      className={`${STATUS_COLORS[v.status] ?? ""} text-white border-0 capitalize text-xs`}
                      data-testid={`badge-status-${v.id}`}
                    >
                      {v.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generatingId === v.id || generateMetaMutation.isPending}
                      onClick={() => generateMetaMutation.mutate(v.id)}
                      data-testid={`btn-generate-meta-${v.id}`}
                    >
                      {generatingId === v.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="ideas" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Game name (e.g. Elden Ring)…"
              id="ideas-game-input"
              data-testid="input-game"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                const game = (document.getElementById("ideas-game-input") as HTMLInputElement).value.trim();
                if (game) generateIdeasMutation.mutate({ game });
              }}
              disabled={generateIdeasMutation.isPending}
              data-testid="btn-generate-ideas"
            >
              {generateIdeasMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate
            </Button>
          </div>

          {ideasLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : ideas.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-ideas">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No ideas yet. Enter a game name and generate some!
              </CardContent>
            </Card>
          ) : (
            ideas.map((idea) => (
              <Card key={idea.id} data-testid={`card-idea-${idea.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{idea.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{idea.concept}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {idea.priority}/10
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
