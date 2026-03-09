import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Eye, ThumbsUp, MessageSquare, Target,
  Sparkles, AlertTriangle, CheckCircle2, BarChart3,
} from "lucide-react";

export default function ContentPredictions() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("youtube");

  const { data: rawPredictions, isLoading } = useQuery<any[]>({ queryKey: ["/api/predictions"], refetchInterval: 30_000, staleTime: 20_000 });
  const predictions = safeArray(rawPredictions);

  const predictMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/predict-performance", {
        title,
        description,
        platform,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      setTitle("");
      setDescription("");
      toast({ title: "Performance prediction generated" });
    },
    onError: (e: any) => toast({ title: "Prediction failed", description: e.message, variant: "destructive" }),
  });

  const confidenceColor = (c: number) => {
    if (c >= 0.8) return "bg-emerald-500/10 text-emerald-400";
    if (c >= 0.5) return "bg-amber-500/10 text-amber-400";
    return "bg-red-500/10 text-red-400";
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-3" data-testid="content-predictions">
      <Card data-testid="card-prediction-form">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Predict Content Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-2">
          <Input
            placeholder="Content title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xs"
            data-testid="input-prediction-title"
          />
          <Textarea
            placeholder="Brief description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs min-h-[60px]"
            data-testid="input-prediction-description"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {["youtube", "twitch", "tiktok"].map((p) => (
              <Button
                key={p}
                size="sm"
                variant={platform === p ? "default" : "outline"}
                onClick={() => setPlatform(p)}
                data-testid={`button-platform-${p}`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={() => predictMutation.mutate()}
              disabled={!title.trim() || predictMutation.isPending}
              data-testid="button-predict"
            >
              <BarChart3 className="w-3 h-3 mr-1" />
              {predictMutation.isPending ? "Analyzing..." : "Predict"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-40" data-testid="skeleton-predictions" />}

      {predictions.length > 0 && (
        <div className="space-y-2">
          {predictions.map((pred: any) => (
            <Card key={pred.id} data-testid={`card-prediction-${pred.id}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" data-testid={`text-prediction-title-${pred.id}`}>{pred.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs no-default-hover-elevate" data-testid={`badge-prediction-platform-${pred.id}`}>
                        {pred.platform}
                      </Badge>
                      <Badge variant="secondary" className={`text-xs no-default-hover-elevate ${confidenceColor(pred.confidence || 0)}`} data-testid={`badge-prediction-confidence-${pred.id}`}>
                        {Math.round((pred.confidence || 0) * 100)}% confidence
                      </Badge>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {pred.createdAt ? new Date(pred.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 rounded bg-secondary/30 text-center" data-testid={`metric-views-${pred.id}`}>
                    <Eye className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-sm font-bold">{formatNumber(pred.predictedViews || 0)}</p>
                    <p className="text-xs text-muted-foreground">Views</p>
                  </div>
                  <div className="p-2 rounded bg-secondary/30 text-center" data-testid={`metric-likes-${pred.id}`}>
                    <ThumbsUp className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-sm font-bold">{formatNumber(pred.predictedLikes || 0)}</p>
                    <p className="text-xs text-muted-foreground">Likes</p>
                  </div>
                  <div className="p-2 rounded bg-secondary/30 text-center" data-testid={`metric-comments-${pred.id}`}>
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-sm font-bold">{formatNumber(pred.predictedComments || 0)}</p>
                    <p className="text-xs text-muted-foreground">Comments</p>
                  </div>
                  <div className="p-2 rounded bg-secondary/30 text-center" data-testid={`metric-engagement-${pred.id}`}>
                    <Target className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-sm font-bold">{((pred.engagementRate || 0) * 100).toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Engage</p>
                  </div>
                </div>

                {pred.factors && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {pred.factors.strengths?.length > 0 && (
                      <div className="p-2 rounded bg-emerald-500/5">
                        <p className="text-xs font-medium text-emerald-400 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Strengths
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {pred.factors.strengths.map((s: string, i: number) => (
                            <li key={i} className="truncate">- {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pred.factors.weaknesses?.length > 0 && (
                      <div className="p-2 rounded bg-amber-500/5">
                        <p className="text-xs font-medium text-amber-400 mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Weaknesses
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {pred.factors.weaknesses.map((w: string, i: number) => (
                            <li key={i} className="truncate">- {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pred.factors.suggestions?.length > 0 && (
                      <div className="p-2 rounded bg-blue-500/5">
                        <p className="text-xs font-medium text-blue-400 mb-1 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Suggestions
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {pred.factors.suggestions.map((s: string, i: number) => (
                            <li key={i} className="truncate">- {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && predictions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-predictions">No predictions yet. Enter a title above to get AI-powered performance estimates.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
