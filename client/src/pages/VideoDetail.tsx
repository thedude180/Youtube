import { useVideo, useUpdateVideo, useGenerateMetadata } from "@/hooks/use-videos";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Sparkles, Save, Calendar, Globe, AlertTriangle } from "lucide-react";
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
    defaultValues: { title: "", description: "" }
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
  if (!video) return <div className="p-8">Video not found</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-display font-bold text-foreground">Edit Metadata</h1>
            <StatusBadge status={video.status} />
          </div>
          <p className="text-muted-foreground font-mono text-sm">{video.originalFilename}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => generateMetadata.mutate(id)}
            disabled={generateMetadata.isPending}
            className="flex items-center gap-2 bg-purple-600/10 text-purple-400 border border-purple-500/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-600/20 transition-all disabled:opacity-50"
          >
            <Sparkles className={cn("h-4 w-4", generateMetadata.isPending && "animate-spin")} />
            {generateMetadata.isPending ? "Generating..." : "AI Enhance"}
          </button>
          
          <button 
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateVideo.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateVideo.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Form */}
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
             <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Video Title</label>
                  <input 
                    {...form.register("title")}
                    className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium text-lg"
                  />
                  {form.formState.errors.title && <p className="text-destructive text-xs mt-1">{form.formState.errors.title.message}</p>}
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Description</label>
                  <textarea 
                    {...form.register("description")}
                    rows={12}
                    className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-mono text-sm leading-relaxed"
                  />
                </div>
             </div>
          </div>

          {/* AI Suggestions Panel */}
          {video.metadata?.aiSuggestions && (
             <div className="bg-gradient-to-br from-purple-900/10 to-transparent border border-purple-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4 text-purple-400">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="font-bold">AI Suggestions</h3>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-medium text-purple-300 mb-2">Thumbnail Critique</h4>
                        <p className="text-sm text-purple-200/80 leading-relaxed bg-purple-950/30 p-4 rounded-xl border border-purple-500/10">
                            {video.metadata.aiSuggestions.thumbnailCritique}
                        </p>
                    </div>

                    {video.metadata.aiSuggestions.titleHooks && (
                        <div>
                            <h4 className="text-sm font-medium text-purple-300 mb-2">Alternate Hooks</h4>
                            <ul className="space-y-2">
                                {video.metadata.aiSuggestions.titleHooks.map((hook, i) => (
                                    <li key={i} className="text-sm text-purple-200/80 bg-purple-950/30 px-4 py-2 rounded-lg border border-purple-500/10 cursor-pointer hover:bg-purple-900/50 transition-colors" onClick={() => form.setValue("title", hook)}>
                                        {hook}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
             </div>
          )}
        </div>

        <div className="space-y-6">
             {/* Preview Card */}
             <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="aspect-video bg-black relative">
                    {video.thumbnailUrl && (
                        <img src={video.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-80" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <PlayCircle className="h-16 w-16 text-white/50" />
                    </div>
                </div>
                <div className="p-4 border-t border-border/50">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Original File</span>
                        <span className="font-mono text-xs bg-secondary px-2 py-1 rounded">{video.type.toUpperCase()}</span>
                    </div>
                </div>
             </div>

             {/* Publish Settings */}
             <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Publishing</h3>
                
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="text-sm">Scheduled For</span>
                    </div>
                    <span className="text-sm font-medium">
                        {video.scheduledTime ? format(new Date(video.scheduledTime), "MMM d, HH:mm") : "Not Set"}
                    </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                    <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-sm">Visibility</span>
                    </div>
                    <span className="text-sm font-medium">Unlisted</span>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <button className="w-full py-2.5 rounded-xl border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Delete Video
                    </button>
                </div>
             </div>
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
                    <Skeleton className="h-96 w-full rounded-2xl" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-64 w-full rounded-2xl" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
             </div>
        </div>
    );
}
