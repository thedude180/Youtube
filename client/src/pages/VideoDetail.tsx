import { useVideo, useUpdateVideo, useGenerateMetadata } from "@/hooks/use-videos";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Sparkles, Save, Calendar, Globe, AlertTriangle, PlayCircle, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

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
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black relative">
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

              <div className="pt-4 border-t border-border/50">
                <Button data-testid="button-delete-video" variant="destructive" className="w-full">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Delete Video
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
