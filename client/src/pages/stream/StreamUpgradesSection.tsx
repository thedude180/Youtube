import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Clock, Users, Zap, MessageSquare, Smile, Frown, Meh,
  Layers, Play, Pause, Calendar, Target, Radio, TrendingUp,
  ChevronRight, Loader2, RefreshCw,
} from "lucide-react";

type Highlight = {
  id: string;
  timestamp: string;
  triggerType: "chat_spike" | "donation" | "raid";
  viewerCount: number;
  title?: string;
};

type ChatSentiment = {
  overallScore: number;
  moods: { positive: number; neutral: number; negative: number };
  trendingTopics: string[];
};

type Overlay = {
  id: string;
  type: string;
  label: string;
  active: boolean;
};

type RaidPlan = {
  suggestions: { channel: string; viewerOverlap: number; bestTime: string; category: string }[];
};

type ScheduleSlot = {
  day: string;
  time: string;
  title: string;
  platform?: string;
};

const TRIGGER_ICONS: Record<string, typeof Zap> = {
  chat_spike: MessageSquare,
  donation: Sparkles,
  raid: Radio,
};

const TRIGGER_LABELS: Record<string, string> = {
  chat_spike: "Chat Spike",
  donation: "Donation",
  raid: "Raid",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function HighlightsSection() {
  const { data, isLoading, error } = useQuery<Highlight[]>({
    queryKey: ["/api/stream-upgrades/highlights"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  return (
    <Card data-testid="card-stream-highlights">
      <CardHeader className="p-2 flex flex-row items-center justify-between gap-1 space-y-0">
        <CardTitle className="text-xs font-semibold flex items-center gap-1">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Stream Highlights
        </CardTitle>
        <Badge variant="secondary" data-testid="badge-highlights-count">
          {data?.length ?? 0}
        </Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {isLoading ? (
          <div className="space-y-1" data-testid="skeleton-highlights">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground" data-testid="error-highlights">
            Failed to load highlights
          </p>
        ) : !data?.length ? (
          <p className="text-xs text-muted-foreground" data-testid="empty-highlights">
            No highlights detected yet
          </p>
        ) : (
          <div className="space-y-1">
            {data.map((h) => {
              const Icon = TRIGGER_ICONS[h.triggerType] || Zap;
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-1 p-1.5 rounded-md border border-border"
                  data-testid={`highlight-${h.id}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {h.title || TRIGGER_LABELS[h.triggerType]}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{h.timestamp}</span>
                        <Users className="h-2.5 w-2.5 ml-1" />
                        <span>{h.viewerCount}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-trigger-${h.id}`}>
                      {TRIGGER_LABELS[h.triggerType]}
                    </Badge>
                    <Button size="icon" variant="ghost" data-testid={`button-clip-${h.id}`}>
                      <Play className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChatSentimentSection() {
  const { data, isLoading, error } = useQuery<ChatSentiment>({
    queryKey: ["/api/stream-upgrades/chat-sentiment"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const moodTotal = data ? data.moods.positive + data.moods.neutral + data.moods.negative : 0;
  const pctPos = moodTotal ? Math.round((data!.moods.positive / moodTotal) * 100) : 0;
  const pctNeu = moodTotal ? Math.round((data!.moods.neutral / moodTotal) * 100) : 0;
  const pctNeg = moodTotal ? 100 - pctPos - pctNeu : 0;

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-500";
    if (score >= 40) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <Card data-testid="card-chat-sentiment">
      <CardHeader className="p-2 flex flex-row items-center justify-between gap-1 space-y-0">
        <CardTitle className="text-xs font-semibold flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
          Chat Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-2">
        {isLoading ? (
          <div className="space-y-1" data-testid="skeleton-sentiment">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground" data-testid="error-sentiment">
            Failed to load sentiment data
          </p>
        ) : !data ? (
          <p className="text-xs text-muted-foreground" data-testid="empty-sentiment">
            No sentiment data available
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2" data-testid="sentiment-score">
              <span className={`text-lg font-bold ${scoreColor(data.overallScore)}`}>
                {data.overallScore}
              </span>
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
            <div className="space-y-0.5" data-testid="mood-distribution">
              <div className="flex h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${pctPos}%` }}
                  data-testid="bar-positive"
                />
                <div
                  className="bg-amber-400 transition-all"
                  style={{ width: `${pctNeu}%` }}
                  data-testid="bar-neutral"
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${pctNeg}%` }}
                  data-testid="bar-negative"
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Smile className="h-2.5 w-2.5 text-emerald-500" />{pctPos}%
                </span>
                <span className="flex items-center gap-0.5">
                  <Meh className="h-2.5 w-2.5 text-amber-400" />{pctNeu}%
                </span>
                <span className="flex items-center gap-0.5">
                  <Frown className="h-2.5 w-2.5 text-red-500" />{pctNeg}%
                </span>
              </div>
            </div>
            {data.trendingTopics?.length > 0 && (
              <div className="space-y-0.5" data-testid="trending-topics">
                <p className="text-[10px] text-muted-foreground font-medium">Trending</p>
                <div className="flex flex-wrap gap-1">
                  {data.trendingTopics.map((t, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]" data-testid={`badge-topic-${i}`}>
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OverlaysSection() {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<Overlay[]>({
    queryKey: ["/api/stream-upgrades/overlay"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (overlay: Overlay) => {
      await apiRequest("POST", "/api/stream-upgrades/overlay", {
        id: overlay.id,
        active: !overlay.active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-upgrades/overlay"] });
      toast({ title: "Overlay updated" });
    },
    onError: () => {
      toast({ title: "Failed to update overlay", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-stream-overlays">
      <CardHeader className="p-2 flex flex-row items-center justify-between gap-1 space-y-0">
        <CardTitle className="text-xs font-semibold flex items-center gap-1">
          <Layers className="h-3.5 w-3.5 text-purple-500" />
          Stream Overlays
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {isLoading ? (
          <div className="space-y-1" data-testid="skeleton-overlays">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground" data-testid="error-overlays">
            Failed to load overlays
          </p>
        ) : !data?.length ? (
          <p className="text-xs text-muted-foreground" data-testid="empty-overlays">
            No overlays configured
          </p>
        ) : (
          <div className="space-y-1">
            {data.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-1 p-1.5 rounded-md border border-border"
                data-testid={`overlay-${o.id}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{o.label}</p>
                  <p className="text-[10px] text-muted-foreground">{o.type}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={o.active ? "default" : "outline"}
                    className="text-[10px]"
                    data-testid={`badge-overlay-status-${o.id}`}
                  >
                    {o.active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    checked={o.active}
                    onCheckedChange={() => toggleMutation.mutate(o)}
                    disabled={toggleMutation.isPending}
                    data-testid={`toggle-overlay-${o.id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RaidPlannerSection() {
  const { toast } = useToast();
  const [plan, setPlan] = useState<RaidPlan | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stream-upgrades/raid-plan");
      return res.json();
    },
    onSuccess: (data: RaidPlan) => {
      setPlan(data);
      toast({ title: "Raid plan generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate raid plan", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-raid-planner">
      <CardHeader className="p-2 flex flex-row items-center justify-between gap-1 space-y-0">
        <CardTitle className="text-xs font-semibold flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-red-500" />
          Raid Planner
        </CardTitle>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-raid"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          Generate
        </Button>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {generateMutation.isPending ? (
          <div className="space-y-1" data-testid="skeleton-raid">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !plan?.suggestions?.length ? (
          <p className="text-xs text-muted-foreground" data-testid="empty-raid">
            Click Generate for AI raid suggestions
          </p>
        ) : (
          <div className="space-y-1">
            {plan.suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-1 p-1.5 rounded-md border border-border"
                data-testid={`raid-suggestion-${i}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{s.channel}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Users className="h-2.5 w-2.5" />{s.viewerOverlap}% overlap
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />{s.bestTime}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0" data-testid={`badge-raid-cat-${i}`}>
                  {s.category}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleSection() {
  const { data, isLoading, error } = useQuery<ScheduleSlot[]>({
    queryKey: ["/api/stream-upgrades/schedule"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const slotsByDay = DAYS.reduce<Record<string, ScheduleSlot[]>>((acc, day) => {
    acc[day] = data?.filter((s) => s.day === day) || [];
    return acc;
  }, {});

  return (
    <Card data-testid="card-stream-schedule">
      <CardHeader className="p-2 flex flex-row items-center justify-between gap-1 space-y-0">
        <CardTitle className="text-xs font-semibold flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-green-500" />
          Stream Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {isLoading ? (
          <div className="grid grid-cols-7 gap-0.5" data-testid="skeleton-schedule">
            {DAYS.map((d) => (
              <Skeleton key={d} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground" data-testid="error-schedule">
            Failed to load schedule
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-0.5" data-testid="grid-schedule">
            {DAYS.map((day) => (
              <div key={day} className="text-center" data-testid={`schedule-day-${day}`}>
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{day}</p>
                {slotsByDay[day].length === 0 ? (
                  <div className="h-10 rounded-md border border-dashed border-border flex items-center justify-center">
                    <Pause className="h-2.5 w-2.5 text-muted-foreground/40" />
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {slotsByDay[day].map((slot, i) => (
                      <div
                        key={i}
                        className="rounded-md bg-primary/10 p-0.5"
                        data-testid={`schedule-slot-${day}-${i}`}
                      >
                        <p className="text-[9px] font-medium truncate">{slot.title}</p>
                        <p className="text-[8px] text-muted-foreground">{slot.time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StreamUpgradesSection() {
  return (
    <div className="space-y-2" data-testid="section-stream-upgrades">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <HighlightsSection />
        <ChatSentimentSection />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <OverlaysSection />
        <RaidPlannerSection />
      </div>
      <ScheduleSection />
    </div>
  );
}
