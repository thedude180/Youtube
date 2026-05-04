import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, MessageCircle, Loader2, Play, Square } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

export default function Stream() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: active } = useQuery<any>({
    queryKey: ["/api/stream/active"],
    refetchInterval: 30_000,
  });

  const { data: chatMessages = [] } = useQuery<any[]>({
    queryKey: ["/api/stream/chat", active?.id ?? 0],
    enabled: !!active?.id,
    refetchInterval: active?.status === "live" ? 5_000 : false,
  });

  const { data: destinations = [] } = useQuery<any[]>({
    queryKey: ["/api/stream/destinations"],
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stream/start", { platform: "youtube" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stream/active"] });
      toast({ title: "Stream session started" });
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/stream/${id}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stream/active"] });
      toast({ title: "Stream ended" });
    },
  });

  useSSE({
    "stream:live": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
    "stream:chat-message": () => {
      if (active?.id) qc.invalidateQueries({ queryKey: [`/api/stream/${active.id}/chat`] });
    },
    "stream:ended": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
  });

  const isLive = active?.status === "live";

  return (
    <div className="space-y-6" data-testid="page-stream">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stream Center</h1>
        <Badge
          className={`text-base px-3 py-1 ${isLive ? "bg-red-600 animate-pulse" : "bg-zinc-600"} text-white border-0`}
          data-testid="badge-stream-status"
        >
          <Radio className="w-4 h-4 mr-2" />
          {isLive ? "LIVE" : "IDLE"}
        </Badge>
      </div>

      {/* Controls */}
      <Card data-testid="card-stream-controls">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            {!isLive ? (
              <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} data-testid="btn-start-stream">
                {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Start Session
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => endMutation.mutate(active.id)}
                disabled={endMutation.isPending}
                data-testid="btn-end-stream"
              >
                {endMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                End Stream
              </Button>
            )}
          </div>
          {isLive && (
            <p className="text-sm text-muted-foreground mt-2">
              {active.title ?? "Untitled stream"} · Started {new Date(active.startedAt).toLocaleTimeString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Chat */}
      {isLive && active?.id && (
        <Card data-testid="card-live-chat">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Live Chat ({chatMessages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-3">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No messages yet.</p>
                ) : (
                  chatMessages.map((msg: any) => (
                    <div key={msg.id} className="text-sm" data-testid={`chat-msg-${msg.id}`}>
                      <span className="font-medium text-primary">{msg.username}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span>{msg.message}</span>
                      {msg.sentiment && (
                        <Badge variant="outline" className="ml-2 text-xs capitalize">{msg.sentiment}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* RTMP Destinations */}
      {destinations.length > 0 && (
        <Card data-testid="card-destinations">
          <CardHeader><CardTitle>RTMP Destinations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {destinations.map((d: any) => (
                <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`destination-${d.id}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{d.platform}</p>
                    {d.streamKey && <p className="text-xs font-mono text-muted-foreground">{d.streamKey}</p>}
                  </div>
                  <Badge variant={d.enabled ? "default" : "secondary"}>{d.enabled ? "Active" : "Disabled"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
