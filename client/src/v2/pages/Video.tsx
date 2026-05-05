import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Download, Trash2, Loader2, HardDrive } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

const downloadSchema = z.object({
  url: z.string().url("Must be a valid URL").refine(
    (u) => u.includes("youtube.com") || u.includes("youtu.be"),
    "Only YouTube URLs supported",
  ),
});

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

export default function VideoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({});

  const { data: vault = [], isLoading: vaultLoading } = useQuery<any[]>({
    queryKey: ["/api/video/vault"],
  });

  const { data: downloads = [] } = useQuery<any[]>({
    queryKey: ["/api/video/downloads"],
  });

  const form = useForm({ resolver: zodResolver(downloadSchema), defaultValues: { url: "" } });

  const downloadMutation = useMutation({
    mutationFn: ({ url }: { url: string }) => apiRequest("POST", "/api/video/download", { url }),
    onSuccess: (data: any) => {
      form.reset();
      qc.invalidateQueries({ queryKey: ["/api/video/downloads"] });
      toast({ title: "Download queued", description: `Job ${data.jobId}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/video/vault/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/video/vault"] }),
  });

  useSSE({
    "video:download-progress": (data: any) =>
      setDownloadProgress((p) => ({ ...p, [data.downloadId]: data.percent })),
    "video:download-complete": () => {
      setDownloadProgress({});
      qc.invalidateQueries({ queryKey: ["/api/video/vault"] });
      qc.invalidateQueries({ queryKey: ["/api/video/downloads"] });
      toast({ title: "Download complete!" });
    },
    "video:download-failed": (data: any) => {
      toast({ title: "Download failed", description: (data as any).error, variant: "destructive" });
    },
  });

  const activeDownloads = downloads.filter((d: any) => d.status === "downloading" || d.status === "pending");

  return (
    <div className="space-y-6" data-testid="page-video">
      <h1 className="text-2xl font-bold">Video Vault</h1>

      {/* Download form */}
      <Card data-testid="card-download-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Download Video
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => downloadMutation.mutate(d))} className="flex gap-3">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        placeholder="https://youtube.com/watch?v=..."
                        data-testid="input-youtube-url"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={downloadMutation.isPending} data-testid="btn-download">
                {downloadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Active downloads */}
      {activeDownloads.length > 0 && (
        <Card data-testid="card-active-downloads">
          <CardHeader><CardTitle>Downloading</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {activeDownloads.map((d: any) => (
              <div key={d.id} data-testid={`download-progress-${d.id}`}>
                <p className="text-sm font-medium truncate">{d.youtubeUrl}</p>
                <Progress value={downloadProgress[d.id] ?? 0} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">{downloadProgress[d.id] ?? 0}%</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vault */}
      <Card data-testid="card-vault">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Vault ({vault.length} files)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vaultLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : vault.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No files in vault. Download a video to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {vault.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`vault-item-${item.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.fileSizeBytes ? formatBytes(item.fileSizeBytes) : "Unknown size"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`btn-delete-vault-${item.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
