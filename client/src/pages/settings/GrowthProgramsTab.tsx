import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformBadge } from "@/components/PlatformIcon";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  ExternalLink,
  TrendingUp,
  Target,
  DollarSign,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";

interface Requirement {
  metric: string;
  current: number;
  target: number;
  met: boolean;
}

interface AiRec {
  strategy: string;
  priority: string;
  estimatedTimeToEligible: string;
  actionItems: string[];
}

interface GrowthProgram {
  id: number;
  platform: string;
  programName: string;
  programType: string;
  status: string;
  eligibilityMet: boolean;
  requirements: Requirement[];
  benefits: string[];
  applicationUrl: string;
  aiRecommendations: AiRec | null;
  progress: number;
  lastChecked: string;
}

interface AiRecommendations {
  prioritizedPrograms: {
    programName: string;
    platform: string;
    priority: string;
    strategy: string;
    estimatedTimeToEligible: string;
    actionItems: string[];
    potentialEarnings: string;
  }[];
  crossPlatformStrategy: string;
  quickWins: string[];
  longTermGoals: string[];
}

const PLATFORM_ORDER = ["youtube", "twitch", "kick", "tiktok", "x", "discord"];

const PROGRAM_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  monetization: { label: "Monetization", color: "text-green-500" },
  partnership: { label: "Partnership", color: "text-blue-500" },
  "creator-fund": { label: "Creator Fund", color: "text-amber-500" },
  referral: { label: "Referral", color: "text-purple-500" },
  "ads-revenue": { label: "Ads Revenue", color: "text-emerald-500" },
  developer: { label: "Developer", color: "text-cyan-500" },
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          value >= 100 ? "bg-green-500" : value > 50 ? "bg-amber-500" : "bg-primary"
        }`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

export default function GrowthProgramsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedPrograms, setExpandedPrograms] = useState<Set<number>>(new Set());
  const [showAiRecs, setShowAiRecs] = useState(false);

  const { data: programs = [], isLoading } = useQuery<GrowthProgram[]>({
    queryKey: ["/api/growth-programs"],
  });

  const aiRecsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/growth-programs/recommendations", {});
      return res.json();
    },
    onSuccess: (data: AiRecommendations) => {
      setShowAiRecs(true);
      qc.invalidateQueries({ queryKey: ["/api/growth-programs"] });
      toast({ title: "AI recommendations generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate recommendations", variant: "destructive" });
    },
  });

  const toggleExpand = (id: number) => {
    setExpandedPrograms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const grouped = PLATFORM_ORDER.reduce<Record<string, GrowthProgram[]>>((acc, platform) => {
    const platformPrograms = programs.filter(p => p.platform === platform);
    if (platformPrograms.length > 0) acc[platform] = platformPrograms;
    return acc;
  }, {});

  const eligibleCount = programs.filter(p => p.eligibilityMet).length;
  const inProgressCount = programs.filter(p => p.status === "in_progress").length;
  const totalCount = programs.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-growth-heading">Platform Growth Programs</h2>
          <p className="text-sm text-muted-foreground">Maximize earnings by qualifying for every platform's creator programs</p>
        </div>
        <Button
          onClick={() => aiRecsMutation.mutate()}
          disabled={aiRecsMutation.isPending}
          data-testid="button-ai-growth-recs"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {aiRecsMutation.isPending ? "Analyzing..." : "AI Growth Strategy"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-eligible-count">{eligibleCount}</p>
              <p className="text-xs text-muted-foreground">Eligible</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-progress-count">{inProgressCount}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-count">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Total Programs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAiRecs && aiRecsMutation.data && (
        <Card data-testid="card-ai-growth-strategy">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-medium">AI Growth Strategy</CardTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowAiRecs(false)}>Close</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiRecsMutation.data.crossPlatformStrategy && (
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Cross-Platform Strategy</p>
                <p className="text-sm" data-testid="text-cross-strategy">{aiRecsMutation.data.crossPlatformStrategy}</p>
              </div>
            )}

            {aiRecsMutation.data.quickWins?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Quick Wins</p>
                <div className="space-y-1">
                  {aiRecsMutation.data.quickWins.map((win: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm" data-testid={`text-quick-win-${i}`}>
                      <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                      <span>{win}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiRecsMutation.data.prioritizedPrograms?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Prioritized Programs</p>
                <div className="space-y-2">
                  {aiRecsMutation.data.prioritizedPrograms.map((rec: any, i: number) => (
                    <div key={i} className="rounded-md border p-3 space-y-1" data-testid={`card-ai-program-${i}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <PlatformBadge platform={rec.platform} />
                        <span className="text-sm font-medium">{rec.programName}</span>
                        <Badge variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "default" : "secondary"} className="text-[10px]">
                          {rec.priority}
                        </Badge>
                        {rec.potentialEarnings && (
                          <Badge variant="outline" className="text-[10px]">
                            <DollarSign className="h-2.5 w-2.5 mr-0.5" />{rec.potentialEarnings}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{rec.strategy}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{rec.estimatedTimeToEligible}</span>
                      </div>
                      {rec.actionItems?.length > 0 && (
                        <div className="space-y-0.5 mt-1">
                          {rec.actionItems.map((item: string, j: number) => (
                            <div key={j} className="flex items-start gap-1.5 text-xs">
                              <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiRecsMutation.data.longTermGoals?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Long-Term Goals</p>
                <div className="space-y-1">
                  {aiRecsMutation.data.longTermGoals.map((goal: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm" data-testid={`text-long-goal-${i}`}>
                      <Target className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{goal}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([platform, platformPrograms]) => (
        <div key={platform} className="space-y-3">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={platform} />
            <h3 className="text-sm font-medium capitalize">{platform === "x" ? "X (Twitter)" : platform}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {platformPrograms.filter(p => p.eligibilityMet).length}/{platformPrograms.length} eligible
            </Badge>
          </div>

          {platformPrograms.map(program => {
            const expanded = expandedPrograms.has(program.id);
            const typeInfo = PROGRAM_TYPE_LABELS[program.programType] || { label: program.programType, color: "text-muted-foreground" };
            const reqs = (program.requirements || []) as Requirement[];

            return (
              <Card key={program.id} data-testid={`card-program-${program.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-program-name-${program.id}`}>{program.programName}</span>
                        <Badge variant="outline" className={`text-[10px] ${typeInfo.color}`}>{typeInfo.label}</Badge>
                        {program.eligibilityMet ? (
                          <Badge variant="default" className="text-[10px] bg-green-600">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Eligible
                          </Badge>
                        ) : program.status === "in_progress" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <TrendingUp className="h-2.5 w-2.5 mr-0.5" />{program.progress}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Not Started</Badge>
                        )}
                      </div>

                      <ProgressBar value={program.progress} />

                      {reqs.length > 0 && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {reqs.slice(0, expanded ? reqs.length : 2).map((req, i) => (
                            <span key={i} className={req.met ? "text-green-500" : ""}>
                              {req.met ? <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> : null}
                              {req.metric}: {req.current}/{req.target}
                            </span>
                          ))}
                          {!expanded && reqs.length > 2 && <span>+{reqs.length - 2} more</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {program.applicationUrl && (
                        <Button size="icon" variant="ghost" asChild>
                          <a href={program.applicationUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-apply-${program.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => toggleExpand(program.id)} data-testid={`button-expand-${program.id}`}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-3 border-t pt-3">
                      {reqs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Requirements</p>
                          <div className="space-y-2">
                            {reqs.map((req, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                                <span className={req.met ? "text-green-500" : ""}>{req.metric}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{req.current} / {req.target}</span>
                                  {req.met ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <div className="w-16">
                                      <ProgressBar value={req.target > 0 ? (req.current / req.target) * 100 : 0} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {program.benefits && program.benefits.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Benefits</p>
                          <div className="flex flex-wrap gap-1">
                            {program.benefits.map((benefit, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                <DollarSign className="h-2.5 w-2.5 mr-0.5" />{benefit}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {program.aiRecommendations && (
                        <div className="rounded-md border p-3 bg-muted/20">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            <p className="text-xs font-medium">AI Recommendation</p>
                            <Badge variant="secondary" className="text-[10px]">{program.aiRecommendations.priority}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{program.aiRecommendations.strategy}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3" />
                            <span>{program.aiRecommendations.estimatedTimeToEligible}</span>
                          </div>
                          {program.aiRecommendations.actionItems?.length > 0 && (
                            <div className="space-y-0.5 mt-2">
                              {program.aiRecommendations.actionItems.map((item, j) => (
                                <div key={j} className="flex items-start gap-1.5 text-xs">
                                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                  <span>{item}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
