import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PlatformBadge } from "@/components/PlatformIcon";
import {
  MessageSquare,
  Bot,
  Send,
  Users,
  Activity,
  Wifi,
  Shield,
  Zap,
  Radio,
  CheckCircle2,
  XCircle,
  Eye,
  MessageCircle,
} from "lucide-react";

interface ChatMessage {
  id: number;
  platform: string;
  author: string;
  message: string;
  isAiResponse: boolean;
  aiResponseTo: number | null;
  sentiment: string | null;
  priority: string | null;
  metadata: any;
  createdAt: string;
}

interface ChatStats {
  totalMessages: number;
  aiResponses: number;
  platformBreakdown: Record<string, number>;
  responseRate: string;
}

interface MultiStreamDest {
  id: number;
  platform: string;
  label: string;
  status: string;
  settings: any;
}

interface MultiStreamStatus {
  stream: any;
  destinations: MultiStreamDest[];
  isLive: boolean;
  platformCount: number;
}

interface PlatformBridgeInfo {
  connected?: boolean;
  channel?: string;
  canRespond?: boolean;
  mode?: string;
}

interface ChatBridgeStatus {
  active: boolean;
  platforms: Record<string, PlatformBridgeInfo>;
}

export function LiveChatPanel({ streamId }: { streamId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [simulateAuthor, setSimulateAuthor] = useState("");
  const [simulateMessage, setSimulateMessage] = useState("");
  const [simulatePlatform, setSimulatePlatform] = useState("youtube");

  const fastPoll = useAdaptiveInterval(15_000);
  const medPoll = useAdaptiveInterval(30_000);
  const slowPoll = useAdaptiveInterval(60_000);

  const chatQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/streams", streamId, "chat"],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${streamId}/chat`);
      if (!res.ok) throw new Error("Failed to load chat");
      return res.json();
    },
    refetchInterval: fastPoll,
  });

  const statsQuery = useQuery<ChatStats>({
    queryKey: ["/api/streams", streamId, "chat", "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${streamId}/chat/stats`);
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    refetchInterval: medPoll,
  });

  const multiStatusQuery = useQuery<MultiStreamStatus>({
    queryKey: ["/api/streams", streamId, "multi-status"],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${streamId}/multi-status`);
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
    refetchInterval: slowPoll,
  });

  const bridgeQuery = useQuery<ChatBridgeStatus>({
    queryKey: ["/api/chat-bridge/status"],
    queryFn: async () => {
      const res = await fetch("/api/chat-bridge/status");
      if (!res.ok) throw new Error("Failed to load bridge status");
      return res.json();
    },
    refetchInterval: slowPoll,
  });

  const sendChatMutation = useMutation({
    mutationFn: async (data: { platform: string; author: string; message: string; metadata?: any }) => {
      const res = await apiRequest("POST", `/api/streams/${streamId}/chat`, data);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/streams", streamId, "chat"] });
      qc.invalidateQueries({ queryKey: ["/api/streams", streamId, "chat", "stats"] });
      setSimulateMessage("");
      if (data.aiResponse) {
        toast({ title: `AI replied to ${data.aiResponse.author}` });
      }
    },
  });

  const messages = chatQuery.data || [];
  const stats = statsQuery.data;
  const multiStatus = multiStatusQuery.data;
  const bridge = bridgeQuery.data;

  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  const sentimentColor = (s: string | null) => {
    if (s === "positive") return "text-green-500";
    if (s === "negative") return "text-red-500";
    return "text-muted-foreground";
  };

  const modeIcon = (info: PlatformBridgeInfo) => {
    if (info.canRespond) return <MessageCircle className="h-3 w-3 text-green-500" />;
    if (info.connected) return <Eye className="h-3 w-3 text-yellow-500" />;
    return <XCircle className="h-3 w-3 text-muted-foreground" />;
  };

  const modeLabel = (info: PlatformBridgeInfo) => {
    if (info.canRespond) return "Read + AI Reply";
    if (info.connected) return "Reading Only";
    return "Offline";
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-chat-bridge-status">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Radio className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm font-medium">Chat Bridge</CardTitle>
            {bridge?.active && (
              <Badge variant="default" className="text-xs bg-purple-600">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                LIVE
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["youtube", "twitch", "kick", "discord"].map((platform) => {
              const info = bridge?.platforms?.[platform] || {};
              const isConnected = info.connected || (platform === "youtube" && bridge?.active);
              return (
                <div
                  key={platform}
                  className={`flex items-center gap-2 rounded-md border p-2.5 ${isConnected ? "border-green-500/30 bg-green-500/5" : "border-border"}`}
                  data-testid={`bridge-platform-${platform}`}
                >
                  <PlatformBadge platform={platform} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium capitalize">{platform}</p>
                    {info.channel && (
                      <p className="text-[10px] text-muted-foreground truncate">#{info.channel}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1">
                      {isConnected ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {modeIcon(info)}
                      <span className="text-[10px] text-muted-foreground">{modeLabel(info)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!bridge?.active && (
            <p className="text-xs text-muted-foreground mt-2">Chat bridge activates automatically when you go live</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-multi-stream-status">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Wifi className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-medium">Multi-Stream Status</CardTitle>
            {multiStatus?.isLive && (
              <Badge variant="destructive" className="text-xs">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                LIVE
              </Badge>
            )}
          </div>
          <Badge variant="secondary" data-testid="text-platform-count">
            {multiStatus?.platformCount || 0} Platforms
          </Badge>
        </CardHeader>
        <CardContent>
          {multiStatus?.destinations && multiStatus.destinations.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {multiStatus.destinations.map((dest) => (
                <div
                  key={dest.id}
                  className="flex items-center gap-2 rounded-md border p-2"
                  data-testid={`dest-status-${dest.id}`}
                >
                  <PlatformBadge platform={dest.platform} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{dest.label}</p>
                  </div>
                  <div className={`h-2 w-2 rounded-full shrink-0 ${dest.status === "live" ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No stream destinations configured. Add RTMP destinations to multi-stream.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-consolidated-chat">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-medium">Unified Chat</CardTitle>
            <Badge variant="outline" className="text-xs">
              <Bot className="h-3 w-3 mr-1" />
              AI Auto-Reply
            </Badge>
          </div>
          {stats && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs" data-testid="text-total-messages">
                <Users className="h-3 w-3 mr-1" />
                {stats.totalMessages} msgs
              </Badge>
              <Badge variant="secondary" className="text-xs" data-testid="text-ai-responses">
                <Bot className="h-3 w-3 mr-1" />
                {stats.aiResponses} replies
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-72 overflow-y-auto space-y-1.5 mb-3 rounded-md border p-2 bg-muted/20" data-testid="chat-feed">
            {chatQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-3/4" />)}
              </div>
            ) : sortedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No chat messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">Messages from YouTube, Twitch, and Kick appear here in real-time</p>
              </div>
            ) : (
              sortedMessages.map((msg) => {
                const platformInfo = bridge?.platforms?.[msg.platform] || {};
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 text-sm ${msg.isAiResponse ? "pl-4 border-l-2 border-primary/40" : ""}`}
                    data-testid={`chat-msg-${msg.id}`}
                  >
                    <PlatformBadge platform={msg.platform} />
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium text-xs ${msg.isAiResponse ? "text-primary" : sentimentColor(msg.sentiment)}`}>
                        {msg.isAiResponse ? (
                          <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            You (AI)
                            {platformInfo.canRespond ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 ml-1 border-green-500/50 text-green-600">
                                sent on {msg.platform}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 ml-1 border-yellow-500/50 text-yellow-600">
                                not delivered
                              </Badge>
                            )}
                          </span>
                        ) : msg.author}
                      </span>
                      <p className="text-xs break-words">{msg.message}</p>
                      {msg.isAiResponse && msg.metadata?.responseDelay && (
                        <span className="text-[10px] text-muted-foreground">
                          <Shield className="h-2.5 w-2.5 inline mr-0.5" />
                          {(msg.metadata.responseDelay / 1000).toFixed(0)}s natural delay
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {stats && stats.totalMessages > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
              {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-1">
                  <PlatformBadge platform={platform} />
                  <span>{count}</span>
                </div>
              ))}
              <span className="ml-auto">Response rate: {stats.responseRate}</span>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Simulate incoming chat (for testing)
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {["youtube", "twitch", "kick", "discord"].map(p => (
                  <Badge
                    key={p}
                    variant={simulatePlatform === p ? "default" : "outline"}
                    className="cursor-pointer text-xs toggle-elevate"
                    onClick={() => setSimulatePlatform(p)}
                    data-testid={`toggle-chat-platform-${p}`}
                  >
                    <PlatformBadge platform={p} />
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Viewer name"
                value={simulateAuthor}
                onChange={(e) => setSimulateAuthor(e.target.value)}
                className="w-28"
                data-testid="input-chat-author"
              />
              <Input
                placeholder="Chat message..."
                value={simulateMessage}
                onChange={(e) => setSimulateMessage(e.target.value)}
                className="flex-1"
                data-testid="input-chat-message"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && simulateAuthor && simulateMessage) {
                    sendChatMutation.mutate({
                      platform: simulatePlatform,
                      author: simulateAuthor,
                      message: simulateMessage,
                    });
                  }
                }}
              />
              <Button
                size="icon"
                onClick={() => {
                  if (simulateAuthor && simulateMessage) {
                    sendChatMutation.mutate({
                      platform: simulatePlatform,
                      author: simulateAuthor,
                      message: simulateMessage,
                    });
                  }
                }}
                disabled={!simulateAuthor || !simulateMessage || sendChatMutation.isPending}
                data-testid="button-send-chat"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
