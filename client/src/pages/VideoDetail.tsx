import { useVideo, useUpdateVideo, useGenerateMetadata } from "@/hooks/use-videos";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { Sparkles, Save, Calendar, Globe, AlertTriangle, PlayCircle, ArrowLeft, Upload, Loader2, ThumbsUp, ThumbsDown, History } from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { VideoVersion } from "@shared/schema";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const id = parseInt(params?.id || "0");
  const { data: video, isLoading } = useVideo(id);
  const updateVideo = useUpdateVideo();
  const generateMetadata = useGenerateMetadata();
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

  useEffect(() => {
    if (video) {
      form.reset({
        title: video.title,
        description: video.description || "",
      });
    }
  }, [video, form]);

  const { toast } = useToast();

  const pushToYouTube = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/youtube/push-optimization/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Pushed to YouTube",
        description: `Updated "${data.title}" on YouTube with optimized metadata.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Push Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (rating: number) => {
      const res = await apiRequest("POST", "/api/feedback", {
        targetType: "video",
        targetId: id,
        rating,
        aiFunction: "metadata",
      });
      return res.json();
    },
    onSuccess: (_, rating) => {
      setFeedbackGiven(rating);
      toast({ title: "Feedback recorded", description: "Thank you for your feedback." });
    },
    onError: (error: any) => {
      toast({ title: "Feedback failed", description: error.message, variant: "destructive" });
    },
  });

  const abTestMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("PUT", `/api/videos/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
      toast({ title: "Title Updated", description: "The video title has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: versions } = useQuery<VideoVersion[]>({
    queryKey: ['/api/video-versions', id],
    queryFn: async () => {
      const res = await fetch(`/api/video-versions/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch version history");
      return res.json();
    },
    enabled: !!id,
  });

  const onSubmit = (data: FormData) => {
    updateVideo.mutate({ id, ...data });
  };

  if (isLoading) return <DetailSkeleton />;
  if (!video) return (
    <div className="p-8 flex flex-col items-center justify-center gap-4" data-testid="text-video-not-found">
      <p className="text-muted-foreground">Video not found</p>
      <Button variant="outline" asChild>
        <Link href="/videos"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Library</Link>
      </Button>
    </div>
  );

  const seoScore = video.metadata?.seoScore;
  const aiTitle = video.metadata?.aiSuggestions?.titleHooks?.[0];

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Button data-testid="button-back" variant="ghost" size="icon" asChild>
              <Link href="/videos"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Edit Metadata</h1>
            <StatusBadge status={video.status} />
          </div>
          <p className="text-muted-foreground font-mono text-sm ml-12">{video.originalFilename}</p>
        </div>
        <div className="flex gap-3">
          <Button
            data-testid="button-ai-enhance"
            variant="outline"
            onClick={() => generateMetadata.mutate(id)}
            disabled={generateMetadata.isPending}
          >
            <Sparkles className={cn("h-4 w-4 mr-2", generateMetadata.isPending && "animate-spin")} />
            {generateMetadata.isPending ? "Generating..." : "AI Enhance"}
          </Button>

          <Button
            data-testid="button-save-video"
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateVideo.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateVideo.isPending ? "Saving..." : "Save Changes"}
          </Button>

          {video.metadata?.youtubeId && (
            <Button
              data-testid="button-push-youtube"
              onClick={() => pushToYouTube.mutate()}
              disabled={pushToYouTube.isPending}
              className="bg-red-600 hover:bg-red-700 text-white border-red-700"
            >
              {pushToYouTube.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {pushToYouTube.isPending ? "Pushing..." : "Push to YouTube"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Video Title</label>
                <Input
                  data-testid="input-video-title"
                  {...form.register("title")}
                  className="text-lg font-medium"
                />
                {form.formState.errors.title && (
                  <p className="text-destructive text-xs mt-1">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <Textarea
                  data-testid="input-video-description"
                  {...form.register("description")}
                  rows={12}
                  className="font-mono text-sm leading-relaxed"
                />
              </div>
            </CardContent>
          </Card>

          {video.metadata?.aiSuggestions && (
            <Card className="border-purple-500/20 bg-gradient-to-br from-purple-900/10 to-transparent">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4 text-purple-400">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="font-bold">AI Suggestions</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-purple-300 mb-2">Thumbnail Critique</h4>
                    <p className="text-sm text-purple-200/80 leading-relaxed bg-purple-950/30 p-4 rounded-lg border border-purple-500/10">
                      {video.metadata.aiSuggestions.thumbnailCritique}
                    </p>
                  </div>

                  {video.metadata.aiSuggestions.titleHooks && (
                    <div>
                      <h4 className="text-sm font-medium text-purple-300 mb-2">Alternate Hooks</h4>
                      <ul className="space-y-2">
                        {video.metadata.aiSuggestions.titleHooks.map((hook: string, i: number) => (
                          <li
                            key={i}
                            data-testid={`button-apply-hook-${i}`}
                            className="text-sm text-purple-200/80 bg-purple-950/30 px-4 py-2 rounded-lg border border-purple-500/10 cursor-pointer hover-elevate transition-colors"
                            onClick={() => form.setValue("title", hook)}
                          >
                            {hook}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-purple-500/10">
                  <p className="text-sm text-purple-300 mb-3">Was this AI suggestion helpful?</p>
                  <div className="flex gap-3">
                    <Button
                      data-testid="button-feedback-thumbs-up"
                      variant="outline"
                      size="sm"
                      disabled={feedbackMutation.isPending || feedbackGiven !== null}
                      onClick={() => feedbackMutation.mutate(1)}
                      className={cn(
                        "border-purple-500/20",
                        feedbackGiven === 1 && "bg-green-500/20 border-green-500/40 text-green-400"
                      )}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Helpful
                    </Button>
                    <Button
                      data-testid="button-feedback-thumbs-down"
                      variant="outline"
                      size="sm"
                      disabled={feedbackMutation.isPending || feedbackGiven !== null}
                      onClick={() => feedbackMutation.mutate(-1)}
                      className={cn(
                        "border-purple-500/20",
                        feedbackGiven === -1 && "bg-red-500/20 border-red-500/40 text-red-400"
                      )}
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Not Helpful
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {aiTitle && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">A/B Test - Test Different Titles</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
                    <Badge variant="secondary" className="text-xs">Original</Badge>
                    <p data-testid="text-ab-original-title" className="text-sm font-medium">{video.title}</p>
                    <Button
                      data-testid="button-ab-use-original"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={abTestMutation.isPending}
                      onClick={() => abTestMutation.mutate(video.title)}
                    >
                      Use Original
                    </Button>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
                    <Badge variant="secondary" className="text-xs">AI Suggested</Badge>
                    <p data-testid="text-ab-ai-title" className="text-sm font-medium">{aiTitle}</p>
                    <Button
                      data-testid="button-ab-use-ai"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={abTestMutation.isPending}
                      onClick={() => abTestMutation.mutate(aiTitle)}
                    >
                      Use AI Title
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="overflow-visible">
            <div className="aspect-video bg-black relative rounded-t-md overflow-hidden">
              {video.thumbnailUrl && (
                <img src={video.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-80" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <PlayCircle className="h-16 w-16 text-white/50" />
              </div>
            </div>
            <CardContent className="p-4 border-t border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Original File</span>
                <span className="font-mono text-xs bg-secondary px-2 py-1 rounded">{video.type.toUpperCase()}</span>
              </div>
            </CardContent>
          </Card>

          {seoScore !== undefined && seoScore !== null && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">SEO Score</h3>
                <div className="flex items-center gap-3">
                  <Badge
                    data-testid="badge-seo-score"
                    variant="secondary"
                    className={cn(
                      "text-sm font-bold",
                      seoScore >= 80 && "bg-green-500/20 text-green-400 border-green-500/30",
                      seoScore >= 60 && seoScore < 80 && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                      seoScore < 60 && "bg-red-500/20 text-red-400 border-red-500/30"
                    )}
                  >
                    {seoScore}/100
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {seoScore >= 80 ? "Excellent" : seoScore >= 60 ? "Good" : "Needs Improvement"}
                  </span>
                </div>
                <Progress
                  data-testid="progress-seo-score"
                  value={seoScore}
                  className={cn(
                    "h-2",
                    seoScore >= 80 && "[&>div]:bg-green-500",
                    seoScore >= 60 && seoScore < 80 && "[&>div]:bg-amber-500",
                    seoScore < 60 && "[&>div]:bg-red-500"
                  )}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Publishing</h3>

              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm">Scheduled For</span>
                </div>
                <span data-testid="text-scheduled-time" className="text-sm font-medium">
                  {video.scheduledTime ? format(new Date(video.scheduledTime), "MMM d, HH:mm") : "Not Set"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-sm">Visibility</span>
                </div>
                <span data-testid="text-visibility" className="text-sm font-medium">Unlisted</span>
              </div>

              {video.metadata?.youtubeId && (
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-3">
                    <SiYoutube className="h-4 w-4 text-red-500" />
                    <span className="text-sm">YouTube ID</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{video.metadata.youtubeId}</span>
                </div>
              )}

              <div className="pt-4 border-t border-border/50 space-y-3">
                {video.metadata?.youtubeId && (
                  <Button
                    data-testid="button-push-youtube-sidebar"
                    onClick={() => pushToYouTube.mutate()}
                    disabled={pushToYouTube.isPending}
                    className="w-full bg-red-600 hover:bg-red-700 text-white border-red-700"
                  >
                    {pushToYouTube.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {pushToYouTube.isPending ? "Pushing..." : "Push to YouTube"}
                  </Button>
                )}
                <Button data-testid="button-delete-video" variant="destructive" className="w-full">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Delete Video
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Version History</h3>
            </div>
            {!versions || versions.length === 0 ? (
              <p data-testid="text-no-versions" className="text-sm text-muted-foreground">No version history yet</p>
            ) : (
              <div className="space-y-3" data-testid="list-version-history">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    data-testid={`version-entry-${version.id}`}
                    className="flex items-start justify-between gap-4 p-3 rounded-lg bg-secondary/30 border border-border/50"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">v{version.versionNumber}</Badge>
                        <span className="text-sm font-medium">{version.changeType}</span>
                      </div>
                      {version.previousData && (
                        <p className="text-xs text-muted-foreground">
                          {version.previousData.title && `Previous title: "${version.previousData.title}"`}
                          {version.previousData.description && !version.previousData.title && "Description changed"}
                          {version.previousData.tags && !version.previousData.title && !version.previousData.description && "Tags changed"}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {version.createdAt ? format(new Date(version.createdAt), "MMM d, yyyy HH:mm") : "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">{version.changedBy || "Unknown"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <Skeleton className="h-12 w-1/3 mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
