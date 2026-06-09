import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Image, Upload, CheckCircle2, AlertTriangle,
  Loader2, RefreshCcw, Tv2, Info,
} from "lucide-react";

interface LiveMeta {
  isLive: boolean;
  broadcastId: string | null;
  channelDbId: number | null;
  streamId: number | null;
  currentTitle: string;
  aiTitle: string;
  aiDescription: string;
  gameName: string;
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const pct = len / max;
  const color = pct > 0.95 ? "text-red-400" : pct > 0.8 ? "text-amber-400" : "text-muted-foreground";
  return <span className={`text-[10px] ${color}`}>{len}/{max}</span>;
}

export default function LiveMetadataControls() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbBase64, setThumbBase64] = useState<string | null>(null);
  const [thumbMime, setThumbMime] = useState("image/jpeg");
  const [metaPushed, setMetaPushed] = useState(false);
  const [thumbPushed, setThumbPushed] = useState(false);

  const { data: meta, isLoading, refetch } = useQuery<LiveMeta>({
    queryKey: ["/api/youtube/stream/live-metadata"],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (meta && !title && !description) {
      setTitle(meta.aiTitle || meta.currentTitle || "");
      setDescription(meta.aiDescription || "");
    }
  }, [meta]);

  const applyMeta = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/youtube/stream/apply-metadata", { title, description }),
    onSuccess: () => {
      setMetaPushed(true);
      toast({ title: "Title & description pushed to YouTube ✓" });
      setTimeout(() => setMetaPushed(false), 8_000);
    },
    onError: (err: any) => {
      toast({
        title: "Push failed",
        description: err?.message || "Could not update broadcast metadata",
        variant: "destructive",
      });
    },
  });

  const uploadThumb = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/youtube/stream/upload-thumbnail", {
        imageBase64: thumbBase64,
        mimeType: thumbMime,
      }),
    onSuccess: () => {
      setThumbPushed(true);
      toast({ title: "Thumbnail uploaded to YouTube ✓" });
      setTimeout(() => setThumbPushed(false), 8_000);
    },
    onError: (err: any) => {
      toast({
        title: "Thumbnail upload failed",
        description: err?.message || "Could not set thumbnail",
        variant: "destructive",
      });
    },
  });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large — max 2 MB", variant: "destructive" });
      return;
    }
    setThumbMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setThumbPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setThumbBase64(base64);
      setThumbPushed(false);
    };
    reader.readAsDataURL(file);
  }

  const isActive = !!meta?.broadcastId;

  return (
    <div className="space-y-3" data-testid="live-metadata-controls">

      {/* Header row */}
      <div className="flex items-center gap-2">
        <Tv2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Live Stream Controls</span>
        {isLoading ? (
          <Skeleton className="h-5 w-20 ml-auto" />
        ) : isActive ? (
          <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-400/30 animate-pulse">
            ● BROADCAST LIVE
          </Badge>
        ) : (
          <Badge variant="outline" className="ml-auto text-muted-foreground">
            Not streaming
          </Badge>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => refetch()}
          data-testid="btn-refresh-live-meta">
          <RefreshCcw className="h-3 w-3" />
        </Button>
      </div>

      {!isActive && !isLoading && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-3">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Go live on YouTube first — the controls below will activate automatically once a
            broadcast is detected. You can pre-fill the fields now and push when ready.
          </span>
        </div>
      )}

      {/* ── SEO Metadata Panel ── */}
      <Card className="card-empire">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Title &amp; Description
            {meta?.aiTitle && (
              <Badge variant="outline" className="text-[9px] ml-auto text-blue-400 border-blue-400/30">
                AI pre-filled
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Stream Title
                  </label>
                  <CharCount value={title} max={100} />
                </div>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setMetaPushed(false); }}
                  placeholder="Your stream title…"
                  maxLength={100}
                  className="h-8 text-sm"
                  data-testid="input-live-title"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Description
                  </label>
                  <CharCount value={description} max={5000} />
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setMetaPushed(false); }}
                  placeholder="Stream description, links, hashtags…"
                  maxLength={5000}
                  rows={5}
                  className="text-sm resize-y"
                  data-testid="textarea-live-description"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 h-8"
                  disabled={!title.trim() || applyMeta.isPending || !isActive}
                  onClick={() => applyMeta.mutate()}
                  data-testid="btn-push-metadata"
                >
                  {applyMeta.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pushing…</>
                  ) : metaPushed ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />Pushed!</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5 mr-1.5" />Push to YouTube</>
                  )}
                </Button>
                {!isActive && (
                  <span className="text-[10px] text-muted-foreground">
                    (go live first)
                  </span>
                )}
              </div>

              {applyMeta.isError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {(applyMeta.error as any)?.message || "Push failed — check quota"}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Thumbnail Panel ── */}
      <Card className="card-empire">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <Image className="h-3.5 w-3.5 text-primary" />
            Thumbnail
            <span className="text-[10px] text-muted-foreground font-normal ml-1">
              JPEG/PNG, max 2 MB, 16:9 recommended
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Preview */}
          {thumbPreview ? (
            <div className="relative rounded overflow-hidden border border-border/40 bg-muted/30"
              data-testid="img-thumb-preview">
              <img src={thumbPreview} alt="Thumbnail preview"
                className="w-full object-cover max-h-44" />
              <button
                className="absolute top-1.5 right-1.5 bg-background/80 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => { setThumbPreview(null); setThumbBase64(null); setThumbPushed(false); if (fileRef.current) fileRef.current.value = ""; }}
                data-testid="btn-clear-thumb"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              className="w-full border-2 border-dashed border-border/40 rounded-lg p-6 text-center hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={() => fileRef.current?.click()}
              data-testid="btn-pick-thumbnail"
            >
              <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Click to choose a thumbnail image</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">JPEG or PNG · max 2 MB · 1280×720 ideal</p>
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFileChange}
            data-testid="input-thumb-file"
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => fileRef.current?.click()}
              data-testid="btn-change-thumb"
            >
              {thumbPreview ? "Change image" : "Choose image"}
            </Button>

            <Button
              size="sm"
              className="flex-1 h-8"
              disabled={!thumbBase64 || uploadThumb.isPending || !isActive}
              onClick={() => uploadThumb.mutate()}
              data-testid="btn-upload-thumbnail"
            >
              {uploadThumb.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
              ) : thumbPushed ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />Uploaded!</>
              ) : (
                <><Upload className="h-3.5 w-3.5 mr-1.5" />Upload Thumbnail</>
              )}
            </Button>
          </div>

          {!isActive && thumbBase64 && (
            <p className="text-[10px] text-muted-foreground text-center">
              Go live first — the thumbnail will upload to your active broadcast.
            </p>
          )}

          {uploadThumb.isError && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {(uploadThumb.error as any)?.message || "Upload failed — check quota or file format"}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            💡 Custom thumbnails require your YouTube channel to be verified.
            Thumbnails uploaded while live appear on the VOD once the stream ends.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
