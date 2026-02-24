import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeArray } from "@/lib/safe-data";
import { usePageTitle } from "@/hooks/use-page-title";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/PageState";
import {
  Gift, BarChart3, Trophy, Star, Shield, Plus, Loader2, Users,
  Crown, Award, Medal, Target, MessageSquare, Calendar,
  ChevronRight, Trash2, Check, Vote, Sparkles,
} from "lucide-react";

type CommunityTab = "giveaways" | "polls" | "challenges" | "loyalty" | "moderation";

type Giveaway = {
  id: number;
  title: string;
  prize: string;
  platforms: string[];
  entryMethod: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "ended";
  winner?: string;
  entryCount?: number;
};

type Poll = {
  id: number;
  question: string;
  options: { label: string; votes: number }[];
  status: "draft" | "active" | "ended";
  totalVotes: number;
};

type Challenge = {
  id: number;
  title: string;
  description: string;
  type: string;
  prize: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  submissionCount: number;
  status: "draft" | "active" | "ended";
};

type LoyaltyMember = {
  id: number;
  username: string;
  points: number;
  level: "bronze" | "silver" | "gold" | "platinum";
  rank: number;
};

type ModerationAction = {
  id: number;
  platform: string;
  type: string;
  target: string;
  reason: string;
  moderator: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  ended: "secondary",
};

const LEVEL_COLORS: Record<string, string> = {
  bronze: "text-amber-700 dark:text-amber-500",
  silver: "text-slate-400",
  gold: "text-yellow-500",
  platinum: "text-cyan-400",
};

const LEVEL_ICONS: Record<string, typeof Medal> = {
  bronze: Medal,
  silver: Award,
  gold: Star,
  platinum: Crown,
};

function GiveawaysTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", prize: "", platforms: "", entryMethod: "follow", startDate: "", endDate: "",
  });

  const { data, isLoading, error } = useQuery<Giveaway[]>({
    queryKey: ["/api/community/giveaways"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/community/giveaways", {
        ...form,
        platforms: form.platforms.split(",").map((p) => p.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/giveaways"] });
      toast({ title: "Giveaway created" });
      setShowForm(false);
      setForm({ title: "", prize: "", platforms: "", entryMethod: "follow", startDate: "", endDate: "" });
    },
    onError: () => toast({ title: "Failed to create giveaway", variant: "destructive" }),
  });

  const drawMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/community/giveaways/${id}/draw`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/giveaways"] });
      toast({ title: "Winner drawn" });
    },
    onError: () => toast({ title: "Failed to draw winner", variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid="tab-content-giveaways">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          <Gift className="h-3.5 w-3.5" /> Giveaways
        </h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-giveaway">
          <Plus className="h-3 w-3 mr-1" /> New
        </Button>
      </div>

      {showForm && (
        <Card data-testid="card-giveaway-form">
          <CardContent className="p-2 space-y-1.5">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="text-xs"
              data-testid="input-giveaway-title"
            />
            <Input
              placeholder="Prize"
              value={form.prize}
              onChange={(e) => setForm({ ...form, prize: e.target.value })}
              className="text-xs"
              data-testid="input-giveaway-prize"
            />
            <Input
              placeholder="Platforms (comma-separated)"
              value={form.platforms}
              onChange={(e) => setForm({ ...form, platforms: e.target.value })}
              className="text-xs"
              data-testid="input-giveaway-platforms"
            />
            <Select value={form.entryMethod} onValueChange={(v) => setForm({ ...form, entryMethod: v })}>
              <SelectTrigger className="text-xs" data-testid="select-entry-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="follow">Follow</SelectItem>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="share">Share</SelectItem>
                <SelectItem value="subscribe">Subscribe</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="text-xs flex-1"
                data-testid="input-giveaway-start"
              />
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="text-xs flex-1"
                data-testid="input-giveaway-end"
              />
            </div>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.title}
              data-testid="button-create-giveaway"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Create Giveaway
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-1" data-testid="skeleton-giveaways">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load giveaways" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/community/giveaways"] })} />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          type="community"
          title="No Community Activity"
          description="Community interactions will appear here as your audience grows."
        />
      ) : (
        <div className="space-y-1">
          {safeArray<Giveaway>(data).map((g) => (
            <Card key={g.id} data-testid={`card-giveaway-${g.id}`}>
              <CardContent className="p-2">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" data-testid={`text-giveaway-title-${g.id}`}>
                      {g.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                      <span data-testid={`text-giveaway-prize-${g.id}`}>{g.prize}</span>
                      <span>|</span>
                      <span>{g.entryCount ?? 0} entries</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={STATUS_VARIANT[g.status]} className="text-[10px]" data-testid={`badge-giveaway-status-${g.id}`}>
                      {g.status}
                    </Badge>
                    {g.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => drawMutation.mutate(g.id)}
                        disabled={drawMutation.isPending}
                        data-testid={`button-draw-${g.id}`}
                      >
                        {drawMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Draw
                      </Button>
                    )}
                    {g.winner && (
                      <Badge variant="default" className="text-[10px]" data-testid={`badge-winner-${g.id}`}>
                        Winner: {g.winner}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PollsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const { data, isLoading, error } = useQuery<Poll[]>({
    queryKey: ["/api/community/polls"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/community/polls", {
        question,
        options: options.filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/polls"] });
      toast({ title: "Poll created" });
      setShowForm(false);
      setQuestion("");
      setOptions(["", ""]);
    },
    onError: () => toast({ title: "Failed to create poll", variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid="tab-content-polls">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          <BarChart3 className="h-3.5 w-3.5" /> Polls
        </h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-poll">
          <Plus className="h-3 w-3 mr-1" /> New
        </Button>
      </div>

      {showForm && (
        <Card data-testid="card-poll-form">
          <CardContent className="p-2 space-y-1.5">
            <Input
              placeholder="Question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="text-xs"
              data-testid="input-poll-question"
            />
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...options];
                    newOpts[i] = e.target.value;
                    setOptions(newOpts);
                  }}
                  className="text-xs"
                  data-testid={`input-poll-option-${i}`}
                />
                {options.length > 2 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    data-testid={`button-remove-option-${i}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOptions([...options, ""])}
              data-testid="button-add-option"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Option
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !question || options.filter(Boolean).length < 2}
              data-testid="button-create-poll"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Create Poll
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-1" data-testid="skeleton-polls">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load polls" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/community/polls"] })} />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          type="community"
          title="No Community Activity"
          description="Community interactions will appear here as your audience grows."
        />
      ) : (
        <div className="space-y-1">
          {safeArray<Poll>(data).map((poll) => {
            const pollOptions = safeArray<{ label: string; votes: number }>(poll?.options);
            const maxVotes = Math.max(...pollOptions.map((o) => o.votes), 1);
            return (
              <Card key={poll.id} data-testid={`card-poll-${poll.id}`}>
                <CardContent className="p-2 space-y-1">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <p className="text-xs font-medium" data-testid={`text-poll-question-${poll.id}`}>
                      {poll.question}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={STATUS_VARIANT[poll.status]} className="text-[10px]" data-testid={`badge-poll-status-${poll.id}`}>
                        {poll.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-poll-votes-${poll.id}`}>
                        {poll.totalVotes} votes
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="space-y-0.5" data-testid={`poll-option-${poll.id}-${i}`}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span>{opt.label}</span>
                          <span className="text-muted-foreground">{opt.votes}</span>
                        </div>
                        <div className="h-1 rounded-full bg-secondary">
                          <div
                            className="h-1 rounded-full bg-primary transition-all"
                            style={{ width: `${(opt.votes / maxVotes) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChallengesTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", type: "creative", prize: "", startDate: "", endDate: "",
  });

  const { data, isLoading, error } = useQuery<Challenge[]>({
    queryKey: ["/api/community/challenges"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/community/challenges", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/challenges"] });
      toast({ title: "Challenge created" });
      setShowForm(false);
      setForm({ title: "", description: "", type: "creative", prize: "", startDate: "", endDate: "" });
    },
    onError: () => toast({ title: "Failed to create challenge", variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid="tab-content-challenges">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5" /> Challenges
        </h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-challenge">
          <Plus className="h-3 w-3 mr-1" /> New
        </Button>
      </div>

      {showForm && (
        <Card data-testid="card-challenge-form">
          <CardContent className="p-2 space-y-1.5">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="text-xs"
              data-testid="input-challenge-title"
            />
            <Textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="text-xs min-h-[40px]"
              data-testid="input-challenge-description"
            />
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="text-xs" data-testid="select-challenge-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creative">Creative</SelectItem>
                <SelectItem value="gaming">Gaming</SelectItem>
                <SelectItem value="educational">Educational</SelectItem>
                <SelectItem value="social">Social</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Prize"
              value={form.prize}
              onChange={(e) => setForm({ ...form, prize: e.target.value })}
              className="text-xs"
              data-testid="input-challenge-prize"
            />
            <div className="flex gap-1">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="text-xs flex-1"
                data-testid="input-challenge-start"
              />
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="text-xs flex-1"
                data-testid="input-challenge-end"
              />
            </div>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.title}
              data-testid="button-create-challenge"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Create Challenge
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-1" data-testid="skeleton-challenges">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load challenges" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/community/challenges"] })} />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          type="community"
          title="No Community Activity"
          description="Community interactions will appear here as your audience grows."
        />
      ) : (
        <div className="space-y-1">
          {safeArray<Challenge>(data).map((c) => (
            <Card key={c.id} data-testid={`card-challenge-${c.id}`}>
              <CardContent className="p-2">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" data-testid={`text-challenge-title-${c.id}`}>
                      {c.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />{c.participantCount}
                      </span>
                      <span>|</span>
                      <span>{c.submissionCount} submissions</span>
                      {c.prize && <><span>|</span><span>{c.prize}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-challenge-type-${c.id}`}>
                      {c.type}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px]" data-testid={`badge-challenge-status-${c.id}`}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LoyaltyTab() {
  const { toast } = useToast();
  const [awardUser, setAwardUser] = useState("");
  const [awardPoints, setAwardPoints] = useState("");

  const { data, isLoading, error } = useQuery<LoyaltyMember[]>({
    queryKey: ["/api/community/loyalty"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const awardMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/community/loyalty/award", {
        username: awardUser,
        points: parseInt(awardPoints, 10),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/loyalty"] });
      toast({ title: "Points awarded" });
      setAwardUser("");
      setAwardPoints("");
    },
    onError: () => toast({ title: "Failed to award points", variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid="tab-content-loyalty">
      <h2 className="text-sm font-semibold flex items-center gap-1">
        <Star className="h-3.5 w-3.5" /> Loyalty Points
      </h2>

      <Card data-testid="card-award-points">
        <CardContent className="p-2">
          <p className="text-[10px] text-muted-foreground mb-1">Award Points</p>
          <div className="flex items-center gap-1">
            <Input
              placeholder="Username"
              value={awardUser}
              onChange={(e) => setAwardUser(e.target.value)}
              className="text-xs flex-1"
              data-testid="input-award-username"
            />
            <Input
              type="number"
              placeholder="Points"
              value={awardPoints}
              onChange={(e) => setAwardPoints(e.target.value)}
              className="text-xs w-20"
              data-testid="input-award-points"
            />
            <Button
              size="sm"
              onClick={() => awardMutation.mutate()}
              disabled={awardMutation.isPending || !awardUser || !awardPoints}
              data-testid="button-award-points"
            >
              {awardMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-1" data-testid="skeleton-loyalty">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load leaderboard" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/community/loyalty"] })} />
      ) : !data?.length ? (
        <Card data-testid="empty-loyalty">
          <CardContent className="p-4 text-center">
            <Star className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">No loyalty data yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0.5">
          {safeArray<LoyaltyMember>(data).map((m) => {
            const LevelIcon = LEVEL_ICONS[m.level] || Medal;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-1 p-1.5 rounded-md border border-border"
                data-testid={`loyalty-member-${m.id}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0" data-testid={`text-rank-${m.id}`}>
                    #{m.rank}
                  </span>
                  <LevelIcon className={`h-3.5 w-3.5 shrink-0 ${LEVEL_COLORS[m.level]}`} />
                  <span className="text-xs font-medium truncate" data-testid={`text-username-${m.id}`}>
                    {m.username}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${LEVEL_COLORS[m.level]}`} data-testid={`badge-level-${m.id}`}>
                    {m.level}
                  </Badge>
                  <span className="text-xs font-semibold tabular-nums" data-testid={`text-points-${m.id}`}>
                    {m.points.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModerationTab() {
  const { toast } = useToast();
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: "", type: "warning", target: "", reason: "" });

  const { data, isLoading, error } = useQuery<ModerationAction[]>({
    queryKey: ["/api/community/moderation"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/community/moderation", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/moderation"] });
      toast({ title: "Moderation action added" });
      setShowForm(false);
      setForm({ platform: "", type: "warning", target: "", reason: "" });
    },
    onError: () => toast({ title: "Failed to add action", variant: "destructive" }),
  });

  const filtered = useMemo(() => data?.filter((a) => {
    if (filterPlatform !== "all" && a.platform !== filterPlatform) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  }) ?? [], [data, filterPlatform, filterType]);

  const platforms = useMemo(() => Array.from(new Set(data?.map((a) => a.platform) || [])), [data]);
  const types = useMemo(() => Array.from(new Set(data?.map((a) => a.type) || [])), [data]);

  return (
    <div className="space-y-2" data-testid="tab-content-moderation">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" /> Moderation Log
        </h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-moderation">
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {showForm && (
        <Card data-testid="card-moderation-form">
          <CardContent className="p-2 space-y-1.5">
            <Input
              placeholder="Platform"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="text-xs"
              data-testid="input-mod-platform"
            />
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="text-xs" data-testid="select-mod-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
                <SelectItem value="ban">Ban</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Target user"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              className="text-xs"
              data-testid="input-mod-target"
            />
            <Textarea
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="text-xs min-h-[40px]"
              data-testid="input-mod-reason"
            />
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.target}
              data-testid="button-create-moderation"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Add Action
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="text-xs w-28" data-testid="select-filter-platform">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="text-xs w-24" data-testid="select-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-1" data-testid="skeleton-moderation">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load moderation log" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/community/moderation"] })} />
      ) : !filtered?.length ? (
        <Card data-testid="empty-moderation">
          <CardContent className="p-4 text-center">
            <Shield className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">No moderation actions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0.5">
          {safeArray<ModerationAction>(filtered).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-1 p-1.5 rounded-md border border-border"
              data-testid={`moderation-action-${a.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]" data-testid={`badge-mod-type-${a.id}`}>
                    {a.type}
                  </Badge>
                  <span className="text-xs font-medium truncate" data-testid={`text-mod-target-${a.id}`}>
                    {a.target}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5" data-testid={`text-mod-reason-${a.id}`}>
                  {a.reason}
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0 text-[10px] text-muted-foreground">
                <span data-testid={`text-mod-platform-${a.id}`}>{a.platform}</span>
                <span data-testid={`text-mod-date-${a.id}`}>{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Community() {
  usePageTitle("Community");
  const [activeTab, setActiveTab] = useState<CommunityTab>("giveaways");

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto page-enter" data-testid="page-community">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">Community</h1>
        <p className="text-sm text-muted-foreground mt-1">Engage your audience with giveaways, polls, challenges, and more</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CommunityTab)}>
        <TabsList data-testid="tabs-community">
          <TabsTrigger value="giveaways" data-testid="tab-giveaways">
            <Gift className="h-3.5 w-3.5 mr-1.5" />Giveaways
          </TabsTrigger>
          <TabsTrigger value="polls" data-testid="tab-polls">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Polls
          </TabsTrigger>
          <TabsTrigger value="challenges" data-testid="tab-challenges">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />Challenges
          </TabsTrigger>
          <TabsTrigger value="loyalty" data-testid="tab-loyalty">
            <Star className="h-3.5 w-3.5 mr-1.5" />Loyalty
          </TabsTrigger>
          <TabsTrigger value="moderation" data-testid="tab-moderation">
            <Shield className="h-3.5 w-3.5 mr-1.5" />Moderation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="giveaways" className="mt-2">
          <UpgradeTabGate requiredTier="starter" featureName="Giveaways" description="Run engaging giveaways across all your platforms to grow your audience and reward loyal fans.">
            <GiveawaysTab />
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="polls" className="mt-2">
          <UpgradeTabGate requiredTier="starter" featureName="Polls" description="Create interactive polls to engage your community and gather valuable audience insights.">
            <PollsTab />
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="challenges" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Community Challenges" description="Create engaging challenges that boost audience participation and build a loyal community.">
            <ChallengesTab />
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="loyalty" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Loyalty Program" description="Build a loyalty points system to reward your most engaged community members and drive retention.">
            <LoyaltyTab />
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="moderation" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Moderation Tools" description="Advanced moderation tools to keep your community safe and maintain a positive environment.">
            <ModerationTab />
          </UpgradeTabGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}
