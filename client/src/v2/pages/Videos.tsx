import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Wand2, BarChart2, Scissors, ChevronRight } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertVideoSchema } from "@shared/schema/index";

const STATUS_TABS = ["all", "draft", "processing", "published"] as const;

const STATUS_COLOR: Record<string, string> = {
  published: "bg-green-600 text-white border-0",
  draft: "bg-zinc-600 text-white border-0",
  processing: "bg-blue-600 text-white border-0 animate-pulse",
  scheduled: "bg-purple-600 text-white border-0",
};

const addVideoSchema = insertVideoSchema.pick({ title: true, game: true, description: true });
type AddVideoValues = z.infer<typeof addVideoSchema>;

function AddVideoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<AddVideoValues>({
    resolver: zodResolver(addVideoSchema),
    defaultValues: { title: "", game: "", description: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: AddVideoValues) => apiRequest("POST", "/api/content/videos", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/content/videos"] });
      toast({ title: "Video added" });
      form.reset();
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-add-video">
        <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input placeholder="Video title…" data-testid="input-video-title" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="game" render={({ field }) => (
              <FormItem>
                <FormLabel>Game</FormLabel>
                <FormControl><Input placeholder="e.g. Elden Ring" data-testid="input-video-game" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Initial description…" rows={3} data-testid="input-video-desc" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="btn-save-video">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MetadataDialog({ video, onClose }: { video: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: drafts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/content/videos", video.id, "drafts"],
    queryFn: () => fetch(`/api/content/videos/${video.id}/drafts`).then((r) => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/content/videos/${video.id}/generate-metadata`, {}),
    onSuccess: () => {
      toast({ title: "Metadata generation queued" });
      qc.invalidateQueries({ queryKey: ["/api/content/videos", video.id, "drafts"] });
    },
  });

  const seoMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/content/videos/${video.id}/seo-audit`, {}),
    onSuccess: () => toast({ title: "SEO audit queued" }),
  });

  const getDraft = (type: string) => drafts.find((d: any) => d.type === type);
  const titlesDraft = getDraft("titles");
  const descDraft = getDraft("description");
  const tagsDraft = getDraft("tags");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-metadata">
        <DialogHeader>
          <DialogTitle className="truncate">{video.title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="btn-gen-metadata">
            {generateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Wand2 className="w-3 h-3 mr-1.5" />}
            Generate AI Metadata
          </Button>
          <Button size="sm" variant="outline" onClick={() => seoMutation.mutate()} disabled={seoMutation.isPending} data-testid="btn-seo-audit">
            {seoMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <BarChart2 className="w-3 h-3 mr-1.5" />}
            SEO Audit
          </Button>
        </div>

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No AI drafts yet. Click "Generate AI Metadata" to start.</p>
        ) : (
          <div className="space-y-4">
            {titlesDraft && (
              <div data-testid="section-titles">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Title Suggestions</p>
                <ul className="space-y-1">
                  {JSON.parse(titlesDraft.content).map((t: string, i: number) => (
                    <li key={i} className="text-sm flex items-start gap-1.5 bg-muted rounded px-2 py-1.5" data-testid={`title-option-${i}`}>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {descDraft && (
              <div data-testid="section-description">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm bg-muted rounded px-2 py-2 whitespace-pre-wrap">{descDraft.content}</p>
              </div>
            )}
            {tagsDraft && (
              <div data-testid="section-tags">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {JSON.parse(tagsDraft.content).map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs" data-testid={`tag-${i}`}>{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Videos() {
  const [tab, setTab] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);

  const { data: videos = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/content/videos"],
  });

  const filtered = tab === "all" ? videos : videos.filter((v: any) => v.status === tab);

  return (
    <div className="space-y-6" data-testid="page-videos">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Videos</h1>
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="btn-add-video">
          <Plus className="w-4 h-4 mr-2" />
          Add Video
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize" data-testid={`tab-${s}`}>{s}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed" data-testid="card-empty-videos">
              <CardContent className="pt-10 pb-10 text-center">
                <p className="text-muted-foreground text-sm">No videos{tab !== "all" ? ` with status "${tab}"` : ""} yet.</p>
                <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)} data-testid="btn-add-first-video">
                  <Plus className="w-4 h-4 mr-2" />
                  Add your first video
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((v: any) => (
                <Card key={v.id} className="overflow-hidden" data-testid={`card-video-${v.id}`}>
                  {/* Thumbnail */}
                  <div className="w-full aspect-video bg-muted relative">
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        No thumbnail
                      </div>
                    )}
                    <Badge className={`absolute top-2 right-2 text-xs ${STATUS_COLOR[v.status] ?? "bg-zinc-600 text-white border-0"}`}>
                      {v.status}
                    </Badge>
                  </div>

                  <CardContent className="pt-3 pb-3">
                    <p className="text-sm font-medium truncate mb-1">{v.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      {v.game && <span>{v.game}</span>}
                      {v.viewCount != null && <span>· {Number(v.viewCount).toLocaleString()} views</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => setSelectedVideo(v)}
                        data-testid={`btn-metadata-${v.id}`}
                      >
                        <Wand2 className="w-3 h-3 mr-1.5" />
                        AI Metadata
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => window.location.href = `/shorts?videoId=${v.id}`}
                        data-testid={`btn-shorts-${v.id}`}
                      >
                        <Scissors className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddVideoDialog open={showAdd} onClose={() => setShowAdd(false)} />
      {selectedVideo && <MetadataDialog video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
