import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Film, Download, Trash2, Upload, Image, LayoutGrid, Send, ArrowLeft,
  Loader2, Play, Eye, Clock, HardDrive, Sparkles, Check, X,
  Monitor, ListVideo, UserPlus, Link2, RefreshCw,
} from "lucide-react";

interface StudioVideoMetadata {
  tags?: string[];
  categoryId?: string;
  privacyStatus?: string;
  channelId?: number;
  sourceUrl?: string;
  downloadProgress?: number;
  customThumbnail?: string;
  thumbnailPrompt?: string;
  thumbnailOptions?: Array<{ url: string; prompt: string; predictedCtr?: number }>;
  endScreen?: {
    enabled: boolean;
    elements: EndScreenElement[];
  };
  publishProgress?: number;
  publishStatus?: string;
  publishedYoutubeId?: string;
  seoScore?: number;
}

interface StudioVideo {
  id: number;
  userId: string;
  videoId: number | null;
  youtubeId: string | null;
  title: string;
  description: string | null;
  filePath: string | null;
  fileSize: number | null;
  thumbnailUrl: string | null;
  duration: string | null;
  status: string;
  metadata: StudioVideoMetadata | null;
  createdAt: string;
  updatedAt: string;
}

interface ContentVideo {
  id: number;
  title: string;
  type: string;
  status: string;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
}

interface EndScreenElement {
  type: "video" | "playlist" | "subscribe" | "channel" | "link";
  position: string;
  timing: string;
  text?: string;
  enabled: boolean;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    downloading: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    publishing: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    published: "bg-green-500/15 text-green-400 border-green-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colorMap[status] || ""}`} data-testid={`status-badge-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function EndScreenEditor({
  elements,
  onChange,
}: {
  elements: EndScreenElement[];
  onChange: (elements: EndScreenElement[]) => void;
}) {
  const typeIcons: Record<string, typeof Monitor> = {
    video: Monitor,
    playlist: ListVideo,
    subscribe: UserPlus,
    channel: Film,
    link: Link2,
  };

  const positionOptions = [
    "top-left", "top-right", "bottom-left", "bottom-right", "center",
  ];

  const timingOptions = [
    "last 5 seconds", "last 10 seconds", "last 15 seconds", "last 20 seconds", "last 25 seconds", "last 30 seconds",
  ];

  const updateElement = (index: number, updates: Partial<EndScreenElement>) => {
    const newElements = [...elements];
    newElements[index] = { ...newElements[index], ...updates };
    onChange(newElements);
  };

  return (
    <div className="space-y-4" data-testid="endscreen-editor">
      <div className="aspect-video bg-muted/50 rounded-lg border border-border/50 relative overflow-hidden" data-testid="endscreen-preview">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          <Film className="h-8 w-8 opacity-30 mr-2" />
          End Screen Preview
        </div>
        {elements.filter(el => el.enabled).map((el, i) => {
          const posMap: Record<string, string> = {
            "top-left": "top-3 left-3",
            "top-right": "top-3 right-3",
            "bottom-left": "bottom-3 left-3",
            "bottom-right": "bottom-3 right-3",
            "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          };
          const Icon = typeIcons[el.type] || Monitor;
          return (
            <div
              key={i}
              className={`absolute ${posMap[el.position] || "bottom-3 left-3"} bg-background/90 border border-primary/30 rounded-lg px-3 py-2 flex items-center gap-2 text-xs shadow-lg`}
              data-testid={`endscreen-element-preview-${i}`}
            >
              <Icon className="h-3.5 w-3.5 text-primary" />
              <span>{el.text || el.type}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {elements.map((el, i) => {
          const Icon = typeIcons[el.type] || Monitor;
          return (
            <div
              key={i}
              className={`border rounded-lg p-3 space-y-3 transition-opacity ${el.enabled ? "border-border/50 opacity-100" : "border-border/20 opacity-50"}`}
              data-testid={`endscreen-element-${i}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{el.type}</span>
                </div>
                <Switch
                  checked={el.enabled}
                  onCheckedChange={(checked) => updateElement(i, { enabled: checked })}
                  data-testid={`endscreen-toggle-${i}`}
                />
              </div>
              {el.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Position</Label>
                    <Select value={el.position} onValueChange={(v) => updateElement(i, { position: v })}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`endscreen-position-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {positionOptions.map(p => (
                          <SelectItem key={p} value={p}>{p.replace("-", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Timing</Label>
                    <Select value={el.timing} onValueChange={(v) => updateElement(i, { timing: v })}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`endscreen-timing-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timingOptions.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      value={el.text || ""}
                      onChange={(e) => updateElement(i, { text: e.target.value })}
                      className="h-8 text-xs"
                      placeholder="Element label..."
                      data-testid={`endscreen-text-${i}`}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThumbnailPanel({
  studioVideo,
  onUpdate,
}: {
  studioVideo: StudioVideo;
  onUpdate: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const meta = studioVideo.metadata || {};
  const thumbnailOptions: Array<{ url: string; prompt: string; predictedCtr?: number }> = meta.thumbnailOptions || [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/studio/videos/${studioVideo.id}/thumbnail/generate`, {
        prompt: prompt || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Thumbnail Generated", description: "New thumbnail option added." });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos", studioVideo.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      onUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const imageData = reader.result as string;
            await apiRequest("POST", `/api/studio/videos/${studioVideo.id}/thumbnail/upload`, { imageData });
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      toast({ title: "Thumbnail Uploaded", description: "Custom thumbnail set." });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos", studioVideo.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      onUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: "File Too Large", description: "Maximum thumbnail size is 5MB.", variant: "destructive" });
          return;
        }
        uploadMutation.mutate(file);
      }
    };
    input.click();
  };

  const selectThumbnail = async (url: string) => {
    await apiRequest("PUT", `/api/studio/videos/${studioVideo.id}`, {
      metadata: { customThumbnail: url },
    });
    queryClient.invalidateQueries({ queryKey: ["/api/studio/videos", studioVideo.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
    toast({ title: "Thumbnail Selected" });
    onUpdate();
  };

  return (
    <div className="space-y-4" data-testid="thumbnail-panel">
      <div className="flex items-center gap-2">
        <Image className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Thumbnail Designer</span>
      </div>

      <div className="aspect-video bg-muted/30 rounded-lg border border-border/50 overflow-hidden flex items-center justify-center" data-testid="thumbnail-preview">
        {meta.customThumbnail ? (
          <img src={meta.customThumbnail} alt="Selected thumbnail" className="w-full h-full object-cover" />
        ) : studioVideo.thumbnailUrl ? (
          <img src={studioVideo.thumbnailUrl} alt="Current thumbnail" className="w-full h-full object-cover" />
        ) : (
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <Image className="h-6 w-6 opacity-30" />
            1280 × 720
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">AI Prompt (optional)</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the thumbnail you want..."
          className="text-sm min-h-[60px]"
          data-testid="input-thumbnail-prompt"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || uploadMutation.isPending}
            className="flex-1"
            data-testid="button-generate-thumbnail"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleFileUpload}
            disabled={uploadMutation.isPending || generateMutation.isPending}
            data-testid="button-upload-thumbnail"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            Upload
          </Button>
        </div>
      </div>

      {thumbnailOptions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Generated Options</Label>
          <div className="grid grid-cols-2 gap-2">
            {thumbnailOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => selectThumbnail(opt.url)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover:border-primary/70 ${
                  meta.customThumbnail === opt.url ? "border-primary ring-2 ring-primary/20" : "border-border/30"
                }`}
                data-testid={`thumbnail-option-${i}`}
              >
                <img src={opt.url} alt={`Option ${i + 1}`} className="w-full h-full object-cover" />
                {opt.predictedCtr && (
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                    ~{opt.predictedCtr}% CTR
                  </div>
                )}
                {meta.customThumbnail === opt.url && (
                  <div className="absolute top-1 left-1 bg-primary rounded-full p-0.5">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoEditor({
  studioVideo,
  onBack,
}: {
  studioVideo: StudioVideo;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(studioVideo.title);
  const [description, setDescription] = useState(studioVideo.description || "");
  const [tags, setTags] = useState((studioVideo.metadata?.tags || []).join(", "));
  const [endScreenElements, setEndScreenElements] = useState<EndScreenElement[]>(
    studioVideo.metadata?.endScreen?.elements || []
  );
  const [activeTab, setActiveTab] = useState("metadata");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/studio/videos/${studioVideo.id}`, {
        title,
        description,
        metadata: {
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          endScreen: {
            enabled: endScreenElements.some(el => el.enabled),
            elements: endScreenElements,
          },
        },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes Saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos", studioVideo.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      const res = await apiRequest("POST", `/api/studio/videos/${studioVideo.id}/publish`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Publishing Started", description: "Your video is being updated on YouTube." });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
    },
    onError: (err: Error) => {
      toast({ title: "Publish Failed", description: err.message, variant: "destructive" });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/videos/download", {
        studioVideoId: studioVideo.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Download Started", description: "Video is being downloaded to storage." });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
    },
    onError: (err: Error) => {
      toast({ title: "Download Failed", description: err.message, variant: "destructive" });
    },
  });

  const meta = studioVideo.metadata || {};
  const isPublishing = studioVideo.status === "publishing";
  const isDownloading = studioVideo.status === "downloading";

  return (
    <div className="space-y-4" data-testid="video-editor">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate" data-testid="text-video-title">{studioVideo.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={studioVideo.status} />
            {studioVideo.youtubeId && (
              <span className="text-[10px] text-muted-foreground">YT: {studioVideo.youtubeId}</span>
            )}
            {studioVideo.fileSize && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> {formatFileSize(studioVideo.fileSize)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!studioVideo.filePath && studioVideo.youtubeId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadMutation.mutate()}
              disabled={isDownloading || downloadMutation.isPending}
              data-testid="button-download"
            >
              {isDownloading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Downloading</>
              ) : (
                <><Download className="h-3.5 w-3.5 mr-1.5" /> Download</>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Save</span>
          </Button>
          <Button
            size="sm"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || isPublishing || (!studioVideo.youtubeId && !studioVideo.filePath)}
            data-testid="button-publish"
          >
            {isPublishing || publishMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Publishing</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-1.5" /> Publish to YouTube</>
            )}
          </Button>
        </div>
      </div>

      {(isPublishing || isDownloading) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium" data-testid="text-progress-status">
                  {meta.publishStatus || (isDownloading ? "Downloading video..." : "Publishing...")}
                </p>
                <Progress value={meta.publishProgress || meta.downloadProgress || 0} className="mt-1.5 h-1.5" />
              </div>
              <span className="text-xs text-muted-foreground">
                {meta.publishProgress || meta.downloadProgress || 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {studioVideo.status === "published" && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-green-400">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium" data-testid="text-published-success">Published successfully</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="metadata" data-testid="tab-metadata">
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Metadata
              </TabsTrigger>
              <TabsTrigger value="endscreen" data-testid="tab-endscreen">
                <Monitor className="h-3.5 w-3.5 mr-1.5" /> End Screen
              </TabsTrigger>
              <TabsTrigger value="thumbnail" data-testid="tab-thumbnail">
                <Image className="h-3.5 w-3.5 mr-1.5" /> Thumbnail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="metadata" className="mt-4 space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1"
                  data-testid="input-title"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 min-h-[150px]"
                  data-testid="input-description"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tags (comma separated)</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="mt-1"
                  placeholder="gaming, tutorial, highlights..."
                  data-testid="input-tags"
                />
              </div>
              {meta.seoScore && (
                <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">SEO Score:</span>
                  <span className="text-sm font-bold" data-testid="text-seo-score">{meta.seoScore}/100</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="endscreen" className="mt-4">
              <EndScreenEditor
                elements={endScreenElements}
                onChange={setEndScreenElements}
              />
            </TabsContent>

            <TabsContent value="thumbnail" className="mt-4">
              <ThumbnailPanel
                studioVideo={studioVideo}
                onUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/studio/videos", studioVideo.id] });
                }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Video Preview</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="aspect-video bg-muted/30 rounded-lg border border-border/50 flex items-center justify-center overflow-hidden" data-testid="video-preview">
                {studioVideo.filePath ? (
                  <video
                    controls
                    className="w-full h-full rounded-lg"
                    poster={meta.customThumbnail || studioVideo.thumbnailUrl || undefined}
                    data-testid="video-player"
                  >
                    <source src={`/api/studio/videos/${studioVideo.id}/stream`} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : studioVideo.thumbnailUrl || meta.customThumbnail ? (
                  <div className="relative w-full h-full">
                    <img
                      src={meta.customThumbnail || studioVideo.thumbnailUrl || ""}
                      alt={studioVideo.title}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/50 rounded-full p-3">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[9px] px-2 py-1 rounded">
                      Download video for playback
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Film className="h-8 w-8 opacity-30" />
                    <span className="text-xs">No preview available</span>
                    <span className="text-[10px]">Download the video to enable playback</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={studioVideo.status} />
              </div>
              {studioVideo.duration && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Duration</span>
                  <span data-testid="text-duration">{studioVideo.duration}</span>
                </div>
              )}
              {studioVideo.fileSize && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">File Size</span>
                  <span data-testid="text-filesize">{formatFileSize(studioVideo.fileSize)}</span>
                </div>
              )}
              {studioVideo.youtubeId && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">YouTube ID</span>
                  <a
                    href={`https://youtube.com/watch?v=${studioVideo.youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    data-testid="link-youtube"
                  >
                    {studioVideo.youtubeId}
                  </a>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Imported</span>
                <span>{new Date(studioVideo.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contentVideos, isLoading } = useQuery<ContentVideo[]>({
    queryKey: ["/api/videos"],
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: async (videoId: number) => {
      const res = await apiRequest("POST", "/api/studio/videos/import", { videoId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Video Imported", description: "Video added to Studio." });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      setOpen(false);
      onImported();
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-import">
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Import from Content
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle>Import Video to Studio</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[50vh] space-y-2 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (contentVideos || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No videos in your content library.</p>
          ) : (
            (contentVideos || []).map((v: ContentVideo) => (
              <button
                key={v.id}
                onClick={() => importMutation.mutate(v.id)}
                disabled={importMutation.isPending}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                data-testid={`import-video-${v.id}`}
              >
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" className="w-20 h-12 object-cover rounded" />
                ) : (
                  <div className="w-20 h-12 bg-muted/30 rounded flex items-center justify-center">
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {v.type} · {v.status}
                    {v.metadata?.youtubeId ? ` · YT: ${String(v.metadata.youtubeId)}` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VideoStudio() {
  usePageTitle("Video Studio");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: studioVideos = [], isLoading } = useQuery<StudioVideo[]>({
    queryKey: ["/api/studio/videos"],
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: selectedVideo } = useQuery<StudioVideo>({
    queryKey: ["/api/studio/videos", selectedId],
    enabled: !!selectedId,
    refetchInterval: 5_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/studio/videos/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Video Removed" });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
    },
  });

  if (selectedId && selectedVideo) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <VideoEditor
          studioVideo={selectedVideo}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" data-testid="video-studio-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Film className="h-6 w-6 text-primary" />
            Video Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit metadata, thumbnails, end screens, and publish to YouTube
          </p>
        </div>
        <ImportDialog onImported={() => {}} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/30">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Film className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-total-videos">{studioVideos.length}</p>
              <p className="text-[10px] text-muted-foreground">Total Videos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Check className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-published-count">
                {studioVideos.filter(v => v.status === "published").length}
              </p>
              <p className="text-[10px] text-muted-foreground">Published</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <HardDrive className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-downloaded-count">
                {studioVideos.filter(v => v.filePath).length}
              </p>
              <p className="text-[10px] text-muted-foreground">Downloaded</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : studioVideos.length === 0 ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Film className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No videos in your studio yet.</p>
            <p className="text-xs text-muted-foreground">Import videos from your content library to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studioVideos.map((video) => (
            <Card
              key={video.id}
              className="border-border/30 hover:border-primary/30 transition-colors cursor-pointer group"
              onClick={() => setSelectedId(video.id)}
              data-testid={`card-studio-video-${video.id}`}
            >
              <div className="aspect-video bg-muted/30 rounded-t-lg overflow-hidden relative">
                {video.thumbnailUrl || video.metadata?.customThumbnail ? (
                  <img
                    src={video.metadata?.customThumbnail || video.thumbnailUrl || ""}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-2">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </div>
                </div>
                <div className="absolute top-2 right-2">
                  <StatusBadge status={video.status} />
                </div>
                {video.duration && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    <Clock className="h-3 w-3 inline mr-0.5" />{video.duration}
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <h3 className="text-sm font-medium truncate" data-testid={`text-video-title-${video.id}`}>
                  {video.title}
                </h3>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {video.fileSize ? formatFileSize(video.fileSize) : "Not downloaded"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(video.id);
                    }}
                    data-testid={`button-delete-${video.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
