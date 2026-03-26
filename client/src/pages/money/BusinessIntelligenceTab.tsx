import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, Shield, TrendingUp, DollarSign, BarChart3,
  AlertTriangle, CheckCircle2, XCircle, Layers,
  Target, Activity, Zap, Heart, BookOpen, Briefcase
} from "lucide-react";

function LoadingCard({ title }: { title: string }) {
  return (
    <Card className="card-empire" data-testid={`card-${title.toLowerCase().replace(/\s+/g, "-")}-loading`}>
      <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><Skeleton className="h-24 w-full" /></CardContent>
    </Card>
  );
}

function ErrorCard({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Card className="card-empire" data-testid={`card-${title.toLowerCase().replace(/\s+/g, "-")}-error`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded bg-destructive/10">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <span>Unable to load data. Will retry automatically.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSummaryCard() {
  const { data, isLoading, isError } = useQuery<{
    revenueTruth: { totalRevenue: number; verifiedRevenue: number; verificationRate: number; confidenceLabel: string };
    sellability: { overallScore: number; grade: string };
    valuation: { estimatedValue: number; valuationRange: { low: number; high: number }; methodology: string };
    riskProfile: { level: string; score: number };
    aiDisplacementRisk: string;
    moatStrength: string;
    wellnessLevel: string;
    velocityMetrics: { revenuePerContentDay: number; maturityLevel: string };
    capitalHealth: string;
  }>({
    queryKey: ["/api/business/dashboard-summary"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Dashboard Summary" />;
  if (isError || !data) return <ErrorCard title="Dashboard Summary" icon={<Brain className="h-4 w-4 text-primary" />} />;

  const grade = data.sellability?.grade || "F";
  const gradeColor = grade.startsWith("A") ? "text-emerald-400" :
    grade.startsWith("B") ? "text-blue-400" :
    grade.startsWith("C") ? "text-amber-400" : "text-red-400";

  const riskLevel = data.riskProfile?.level || "high";
  const riskColor = riskLevel === "low" ? "text-emerald-400" :
    riskLevel === "moderate" ? "text-amber-400" : "text-red-400";

  const capitalColor = data.capitalHealth === "healthy" ? "text-emerald-400" :
    data.capitalHealth === "stretched" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire col-span-full" data-testid="card-dashboard-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Business Intelligence Overview
          <Badge variant="outline" className={`ml-auto text-[10px] ${gradeColor}`}>
            Grade: {grade}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1" data-testid="stat-valuation">
            <div className="text-xs text-muted-foreground">Estimated Value</div>
            <div className="text-xl font-bold">${(data.valuation?.estimatedValue || 0).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{data.valuation?.methodology || "SDE"}</div>
          </div>
          <div className="space-y-1" data-testid="stat-sellability">
            <div className="text-xs text-muted-foreground">Sellability Score</div>
            <div className={`text-xl font-bold ${gradeColor}`}>{data.sellability?.overallScore || 0}/100</div>
          </div>
          <div className="space-y-1" data-testid="stat-risk-profile">
            <div className="text-xs text-muted-foreground">Risk Profile</div>
            <div className={`text-xl font-bold capitalize ${riskColor}`}>{riskLevel}</div>
          </div>
          <div className="space-y-1" data-testid="stat-revenue-truth">
            <div className="text-xs text-muted-foreground">Revenue Verified</div>
            <div className="text-xl font-bold">{(data.revenueTruth?.verificationRate || 0).toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground">{data.revenueTruth?.confidenceLabel || "unverified"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-3 border-t border-border/50">
          <div className="space-y-1" data-testid="stat-ai-displacement">
            <div className="text-xs text-muted-foreground">AI Displacement</div>
            <div className="text-sm font-semibold capitalize">{data.aiDisplacementRisk || "unknown"}</div>
          </div>
          <div className="space-y-1" data-testid="stat-moat">
            <div className="text-xs text-muted-foreground">Moat Strength</div>
            <div className="text-sm font-semibold capitalize">{data.moatStrength || "unknown"}</div>
          </div>
          <div className="space-y-1" data-testid="stat-wellness">
            <div className="text-xs text-muted-foreground">Wellness</div>
            <div className="text-sm font-semibold capitalize">{data.wellnessLevel || "unknown"}</div>
          </div>
          <div className="space-y-1" data-testid="stat-capital-health">
            <div className="text-xs text-muted-foreground">Capital Health</div>
            <div className={`text-sm font-semibold capitalize ${capitalColor}`}>{data.capitalHealth || "unknown"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SellabilityCard() {
  const { data, isLoading, isError } = useQuery<{
    overallScore: number;
    grade: string;
    components: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  }>({
    queryKey: ["/api/business/sellability-score"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Sellability Score" />;
  if (isError || !data) return <ErrorCard title="Sellability Score" icon={<Target className="h-4 w-4 text-primary" />} />;

  const components = Object.entries(data.components || {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="card-empire" data-testid="card-sellability-score">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Sellability Score
          <Badge variant="outline" className="ml-auto text-[10px]">
            {data.grade} ({data.overallScore}/100)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {components.slice(0, 5).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs" data-testid={`row-sellability-${key}`}>
              <span className="capitalize font-medium">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              <Badge variant="outline" className="text-[10px]">{typeof val === "number" ? val.toFixed(0) : val}/100</Badge>
            </div>
          ))}
        </div>
        {(data.recommendations || []).length > 0 && (
          <div className="mt-3 space-y-1">
            {data.recommendations.slice(0, 2).map((r, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-sellability-rec-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValuationCard() {
  const { data, isLoading, isError } = useQuery<{
    estimatedValue: number;
    valueRange: { low: number; high: number };
    methodologies: { name: string; value: number; weight: number }[];
    contentAssetValue: number;
    audienceValue: number;
    annualizedRevenue: number;
    growthRate: number;
  }>({
    queryKey: ["/api/business/dynamic-valuation"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Dynamic Valuation" />;
  if (isError || !data) return <ErrorCard title="Dynamic Valuation" icon={<DollarSign className="h-4 w-4 text-primary" />} />;

  return (
    <Card className="card-empire" data-testid="card-dynamic-valuation">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Dynamic Valuation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div data-testid="stat-estimated-value">
            <div className="text-xs text-muted-foreground">Estimated Value</div>
            <div className="text-2xl font-bold text-emerald-400">${(data.estimatedValue || 0).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">
              Range: ${(data.valueRange?.low || 0).toLocaleString()} — ${(data.valueRange?.high || 0).toLocaleString()}
            </div>
          </div>
          {(data.methodologies || []).slice(0, 3).map((m, i) => (
            <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-methodology-${i}`}>
              <span className="font-medium">{m.name}</span>
              <Badge variant="outline" className="text-[10px]">${(m.value || 0).toLocaleString()}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskIntelligenceCard() {
  const { data, isLoading, isError } = useQuery<{
    overallRiskProfile: string;
    aiDisplacement: { riskLevel: string; factors: string[] };
    humanValueMoat: { moatLevel: string; strengths: string[] };
    creatorWellness: { level: string; factors: string[] };
  }>({
    queryKey: ["/api/business/risk-intelligence"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Risk Intelligence" />;
  if (isError || !data) return <ErrorCard title="Risk Intelligence" icon={<Shield className="h-4 w-4 text-primary" />} />;

  const riskColors: Record<string, string> = { low: "text-emerald-400", moderate: "text-amber-400", elevated: "text-orange-400", high: "text-red-400" };

  return (
    <Card className="card-empire" data-testid="card-risk-intelligence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Risk Intelligence
          <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${riskColors[data.overallRiskProfile] || ""}`}>
            {data.overallRiskProfile || "unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs" data-testid="row-ai-displacement">
            <span className="font-medium flex items-center gap-1"><Zap className="h-3 w-3" />AI Displacement</span>
            <Badge variant="outline" className={`text-[10px] capitalize ${riskColors[data.aiDisplacement?.riskLevel] || ""}`}>
              {data.aiDisplacement?.riskLevel || "unknown"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs" data-testid="row-moat-strength">
            <span className="font-medium flex items-center gap-1"><Layers className="h-3 w-3" />Human Value Moat</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {data.humanValueMoat?.moatLevel || "unknown"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs" data-testid="row-wellness">
            <span className="font-medium flex items-center gap-1"><Heart className="h-3 w-3" />Creator Wellness</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {data.creatorWellness?.level || "unknown"}
            </Badge>
          </div>
          {(data.humanValueMoat?.strengths || []).length > 0 && (
            <div className="mt-2 space-y-1">
              {data.humanValueMoat.strengths.slice(0, 2).map((s, i) => (
                <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-moat-strength-${i}`}>
                  <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CapitalAllocationCard() {
  const { data, isLoading, isError } = useQuery<{
    budgetHealth: string;
    allocations: { category: string; recommendedPercent: number; recommendedAllocation: number; currentAllocation: number; priority: string }[];
    emergencyReserve: { amount: number; monthsCovered: number; adequate: boolean };
    recommendations: string[];
  }>({
    queryKey: ["/api/business/capital-allocation"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Capital Allocation" />;
  if (isError || !data) return <ErrorCard title="Capital Allocation" icon={<BarChart3 className="h-4 w-4 text-primary" />} />;

  const statusColor = data.budgetHealth === "healthy" ? "text-emerald-400" :
    data.budgetHealth === "stretched" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-capital-allocation">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Capital Allocation
          <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${statusColor}`}>
            {data.budgetHealth || "unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(data.allocations || []).slice(0, 5).map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-allocation-${i}`}>
              <span className="capitalize font-medium">{a.category}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">${(a.recommendedAllocation || 0).toLocaleString()}</span>
                <Badge variant="outline" className="text-[10px]">{a.recommendedPercent || 0}%</Badge>
              </div>
            </div>
          ))}
        </div>
        {(data.recommendations || []).length > 0 && (
          <div className="mt-3 space-y-1">
            {data.recommendations.slice(0, 2).map((r, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-capital-rec-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RevenueVelocityCard() {
  const { data, isLoading, isError } = useQuery<{
    velocity: { revenuePerContentDay: number; revenuePerHour: number; trend: string };
    infrastructure: { maturityLevel: string; components: string[] };
    narrative: { title: string; summary: string };
  }>({
    queryKey: ["/api/business/revenue-velocity"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Revenue Velocity" />;
  if (isError || !data) return <ErrorCard title="Revenue Velocity" icon={<TrendingUp className="h-4 w-4 text-primary" />} />;

  const trendColor = (data.velocity?.trend || "declining") === "accelerating" ? "text-emerald-400" :
    (data.velocity?.trend || "declining") === "stable" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-revenue-velocity">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Revenue Velocity
          <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${trendColor}`}>
            {data.velocity?.trend || "unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1" data-testid="stat-revenue-per-day">
            <div className="text-xs text-muted-foreground">$/Content Day</div>
            <div className="text-lg font-bold">${(data.velocity?.revenuePerContentDay || 0).toFixed(2)}</div>
          </div>
          <div className="space-y-1" data-testid="stat-revenue-per-hour">
            <div className="text-xs text-muted-foreground">$/Hour</div>
            <div className="text-lg font-bold">${(data.velocity?.revenuePerHour || 0).toFixed(2)}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1" data-testid="stat-maturity-level">
          <div className="text-xs text-muted-foreground">Infrastructure Maturity</div>
          <div className="text-sm font-semibold capitalize">{data.infrastructure?.maturityLevel || "unknown"}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentAssetValuationCard() {
  const { data, isLoading, isError } = useQuery<{
    totalAssets: number;
    totalEstimatedValue: number;
    topAssets: { title: string; estimatedValue: number; trend: string }[];
    libraryHealth: string;
    ipSummary: { fullOwnership: number; shared: number; unclear: number };
  }>({
    queryKey: ["/api/business/content-asset-valuation"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Content Asset Valuation" />;
  if (isError || !data) return <ErrorCard title="Content Asset Valuation" icon={<Briefcase className="h-4 w-4 text-primary" />} />;

  return (
    <Card className="card-empire" data-testid="card-content-asset-valuation">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Content Asset Value
          <Badge variant="outline" className="ml-auto text-[10px]">
            ${(data.totalEstimatedValue || 0).toLocaleString()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.topAssets || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-assets">No content assets valued yet</div>
        ) : (
          <div className="space-y-2">
            {(data.topAssets || []).slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-asset-${i}`}>
                <span className="font-medium truncate max-w-[60%]">{a.title}</span>
                <Badge variant="outline" className="text-[10px]">${(a.estimatedValue || 0).toLocaleString()}</Badge>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-library-health">
          <Activity className="h-3 w-3 shrink-0" />
          Library health: {data.libraryHealth || "unknown"} ({data.totalAssets || 0} assets)
        </div>
      </CardContent>
    </Card>
  );
}

function FounderDependencyCard() {
  const { data, isLoading, isError } = useQuery<{
    overallScore: number;
    riskLevel: string;
    factors: {
      contentCreation: number;
      revenueGeneration: number;
      audienceRelationship: number;
      operationalControl: number;
      brandIdentity: number;
    };
    mitigations: string[];
    delegationOpportunities: string[];
  }>({
    queryKey: ["/api/business/founder-dependency"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Founder Dependency" />;
  if (isError || !data) return <ErrorCard title="Founder Dependency" icon={<AlertTriangle className="h-4 w-4 text-primary" />} />;

  const depColor = (data.overallScore || 0) < 40 ? "text-emerald-400" :
    (data.overallScore || 0) < 70 ? "text-amber-400" : "text-red-400";

  const factorEntries = data.factors ? Object.entries(data.factors) : [];

  return (
    <Card className="card-empire" data-testid="card-founder-dependency">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Founder Dependency
          <Badge variant="outline" className={`ml-auto text-[10px] ${depColor}`}>
            {data.overallScore || 0}/100
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {factorEntries.slice(0, 5).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs" data-testid={`row-dependency-factor-${key}`}>
              <span className="capitalize font-medium">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              <Badge variant="outline" className="text-[10px]">{typeof val === "number" ? val.toFixed(0) : val}/100</Badge>
            </div>
          ))}
        </div>
        {(data.mitigations || []).length > 0 && (
          <div className="mt-3 space-y-1">
            {data.mitigations.slice(0, 2).map((m, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-mitigation-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {m}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EstatePlanCard() {
  const { data, isLoading, isError } = useQuery<{
    succession: { readinessScore: number; planElements: { element: string; status: string }[] };
    digitalAssets: { channels: number; contentPieces: number; revenueStreams: number; estimatedAnnualRevenue: number };
    keyRisks: string[];
    revenueConfidence: { confidenceLabel: string };
  }>({
    queryKey: ["/api/business/estate-succession"],
    refetchInterval: 120000,
  });

  if (isLoading) return <LoadingCard title="Estate & Succession" />;
  if (isError || !data) return <ErrorCard title="Estate & Succession" icon={<BookOpen className="h-4 w-4 text-primary" />} />;

  const readyScore = data.succession?.readinessScore || 0;
  const readyColor = readyScore >= 70 ? "text-emerald-400" : readyScore >= 40 ? "text-amber-400" : "text-red-400";
  const statusColors: Record<string, string> = { complete: "text-emerald-400", partial: "text-amber-400", missing: "text-red-400" };

  return (
    <Card className="card-empire" data-testid="card-estate-succession">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Estate & Succession
          <Badge variant="outline" className={`ml-auto text-[10px] ${readyColor}`}>
            {readyScore}/100 ready
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-1" data-testid="stat-digital-channels">
            <div className="text-xs text-muted-foreground">Channels</div>
            <div className="text-sm font-bold">{data.digitalAssets?.channels || 0}</div>
          </div>
          <div className="space-y-1" data-testid="stat-content-pieces">
            <div className="text-xs text-muted-foreground">Content Pieces</div>
            <div className="text-sm font-bold">{data.digitalAssets?.contentPieces || 0}</div>
          </div>
        </div>
        {(data.succession?.planElements || []).length > 0 && (
          <div className="space-y-2">
            {(data.succession.planElements || []).slice(0, 4).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-estate-element-${i}`}>
                <span className="font-medium">{p.element}</span>
                <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[p.status] || ""}`}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
        {(data.keyRisks || []).length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded p-2" data-testid="alert-estate-risks">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {data.keyRisks.length} key risk{data.keyRisks.length > 1 ? "s" : ""} identified
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessLearningCard() {
  const { data, isLoading, isError } = useQuery<{
    maturityAssessment: { stage: string; score: number; nextMilestone: string };
    signals: { signal: string; type: string }[];
    feedbackLoops: { loop: string; status: string; impact: string }[];
    patterns: { revenuePatterns: string[]; contentPatterns: string[]; growthPatterns: string[] };
  }>({
    queryKey: ["/api/business/business-learning"],
    refetchInterval: 120000,
  });

  if (isLoading) return <LoadingCard title="Business Learning" />;
  if (isError || !data) return <ErrorCard title="Business Learning" icon={<Activity className="h-4 w-4 text-primary" />} />;

  const maturityColor = data.maturityAssessment?.stage === "scale" || data.maturityAssessment?.stage === "mature" ? "text-emerald-400" :
    data.maturityAssessment?.stage === "growth" ? "text-blue-400" :
    data.maturityAssessment?.stage === "early" ? "text-amber-400" : "text-muted-foreground";

  const statusColors: Record<string, string> = { active: "text-emerald-400", dormant: "text-amber-400", missing: "text-red-400" };

  return (
    <Card className="card-empire" data-testid="card-business-learning">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Business Learning
          <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${maturityColor}`}>
            {data.maturityAssessment?.stage || "unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 space-y-1" data-testid="stat-maturity">
          <div className="text-xs text-muted-foreground">Maturity Score</div>
          <div className="text-sm font-bold">{data.maturityAssessment?.score || 0}/100</div>
          {data.maturityAssessment?.nextMilestone && (
            <div className="text-[10px] text-muted-foreground">Next: {data.maturityAssessment.nextMilestone}</div>
          )}
        </div>
        {(data.feedbackLoops || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-feedback-loops">No feedback loops tracked yet</div>
        ) : (
          <div className="space-y-2">
            {(data.feedbackLoops || []).slice(0, 5).map((fl, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-feedback-loop-${i}`}>
                <span className="font-medium">{fl.loop}</span>
                <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[fl.status] || ""}`}>{fl.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SponsorIntelligenceCard() {
  const { data, isLoading, isError } = useQuery<{
    sponsorFitScores: { category: string; fitScore: { score: number; label: string }; estimatedDealRange: { low: number; high: number } }[];
    marketRates: { cpm: { estimated: number; marketAvg: number; premium: boolean }; flatRate: { estimated: number } };
    audienceProfile: { totalSubscribers: number; totalViews: number };
    recommendations: string[];
  }>({
    queryKey: ["/api/business/sponsor-intelligence"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Sponsor Intelligence" />;
  if (isError || !data) return <ErrorCard title="Sponsor Intelligence" icon={<Briefcase className="h-4 w-4 text-primary" />} />;

  return (
    <Card className="card-empire" data-testid="card-sponsor-intelligence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Sponsor Intelligence
          <Badge variant="outline" className="ml-auto text-[10px]">
            {(data.sponsorFitScores || []).length} categories
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-1" data-testid="stat-estimated-cpm">
            <div className="text-xs text-muted-foreground">Est. CPM</div>
            <div className="text-lg font-bold">${(data.marketRates?.cpm?.estimated || 0).toFixed(2)}</div>
          </div>
          <div className="space-y-1" data-testid="stat-flat-rate">
            <div className="text-xs text-muted-foreground">Flat Rate</div>
            <div className="text-lg font-bold">${(data.marketRates?.flatRate?.estimated || 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-2">
          {(data.sponsorFitScores || []).slice(0, 4).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-sponsor-category-${i}`}>
              <span className="font-medium">{s.category}</span>
              <Badge variant="outline" className="text-[10px]">{s.fitScore?.label || "N/A"}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CommerceIntelligenceCard() {
  const { data, isLoading, isError } = useQuery<{
    nativeCheckoutReadiness: number;
    commerceMetrics: { totalCommerceRevenue: number; commerceRevenueShare: number; topCommerceSource: string; avgOrderValue: number };
    offerOperatingSystem: { activeOffers: { name: string; type: string }[]; recommendedOffers: { name: string; type: string }[]; conversionOptimizations: string[] };
    recommendations: string[];
  }>({
    queryKey: ["/api/business/commerce-intelligence"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Commerce Intelligence" />;
  if (isError || !data) return <ErrorCard title="Commerce Intelligence" icon={<DollarSign className="h-4 w-4 text-primary" />} />;

  const readinessColor = (data.nativeCheckoutReadiness || 0) >= 70 ? "text-emerald-400" :
    (data.nativeCheckoutReadiness || 0) >= 40 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-commerce-intelligence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Commerce Intelligence
          <Badge variant="outline" className={`ml-auto text-[10px] ${readinessColor}`}>
            {data.nativeCheckoutReadiness || 0}% ready
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-1" data-testid="stat-commerce-revenue">
            <div className="text-xs text-muted-foreground">Commerce Revenue</div>
            <div className="text-lg font-bold">${(data.commerceMetrics?.totalCommerceRevenue || 0).toLocaleString()}</div>
          </div>
          <div className="space-y-1" data-testid="stat-avg-order">
            <div className="text-xs text-muted-foreground">Avg Order</div>
            <div className="text-lg font-bold">${(data.commerceMetrics?.avgOrderValue || 0).toFixed(2)}</div>
          </div>
        </div>
        {(data.recommendations || []).length > 0 && (
          <div className="space-y-1">
            {data.recommendations.slice(0, 3).map((r, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-commerce-rec-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelResilienceCard() {
  const { data, isLoading, isError } = useQuery<{
    overallResilience: number;
    grade: string;
    scenarios: { scenario: string; probability: string; revenueImpact: number; survivalScore: number }[];
    strengths: string[];
    vulnerabilities: string[];
    contingencyPlan: string[];
  }>({
    queryKey: ["/api/business/channel-resilience"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Channel Resilience" />;
  if (isError || !data) return <ErrorCard title="Channel Resilience" icon={<Shield className="h-4 w-4 text-primary" />} />;

  const gradeColor = data.grade === "A" ? "text-emerald-400" :
    data.grade === "B" ? "text-blue-400" :
    data.grade === "C" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-channel-resilience">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Channel Resilience
          <Badge variant="outline" className={`ml-auto text-[10px] ${gradeColor}`}>
            {data.grade} ({data.overallResilience || 0}/100)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(data.scenarios || []).slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-scenario-${i}`}>
              <span className="font-medium truncate max-w-[60%]">{s.scenario}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{s.probability}</Badge>
            </div>
          ))}
        </div>
        {(data.vulnerabilities || []).length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded p-2" data-testid="alert-vulnerabilities">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {data.vulnerabilities.length} vulnerabilit{data.vulnerabilities.length > 1 ? "ies" : "y"} detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BusinessIntelligenceTab() {
  return (
    <div className="space-y-4" data-testid="section-business-intelligence">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashboardSummaryCard />
        <SellabilityCard />
        <ValuationCard />
        <RiskIntelligenceCard />
        <SponsorIntelligenceCard />
        <CommerceIntelligenceCard />
        <ChannelResilienceCard />
        <CapitalAllocationCard />
        <RevenueVelocityCard />
        <ContentAssetValuationCard />
        <FounderDependencyCard />
        <EstatePlanCard />
        <BusinessLearningCard />
      </div>
    </div>
  );
}
