import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformBadge } from "@/components/PlatformIcon";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { safeArray } from "@/lib/safe-data";
import {
  Sparkles, TrendingUp, Users, ChevronDown, ChevronUp,
  CheckCircle2, DollarSign, Lightbulb, BarChart3,
} from "lucide-react";
import { useState } from "react";

const typeIcons: Record<string, any> = {
  monetize: DollarSign,
  expand: TrendingUp,
  membership: Users,
  sponsorship: Sparkles,
  affiliate: Lightbulb,
  superchat: DollarSign,
  optimize: BarChart3,
  rebalance: TrendingUp,
};

const priorityStyles: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-500/10", text: "text-red-400", label: "High Priority" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Medium" },
  low: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Low" },
};

function OpportunityCard({ opp, index }: { opp: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = typeIcons[opp.type] || Sparkles;
  const priority = priorityStyles[opp.priority] || priorityStyles.medium;

  return (
    <Card
      data-testid={`card-opportunity-${index}`}
      className="hover-elevate cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-md ${priority.bg} shrink-0`}>
              <Icon className={`h-4 w-4 ${priority.text}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold" data-testid={`text-opportunity-title-${index}`}>
                  {opp.title}
                </h3>
                {opp.platform && <PlatformBadge platform={opp.platform} />}
                <Badge
                  variant="secondary"
                  className={`text-xs no-default-hover-elevate no-default-active-elevate ${priority.bg} ${priority.text}`}
                  data-testid={`badge-opportunity-priority-${index}`}
                >
                  {priority.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1" data-testid={`text-opportunity-desc-${index}`}>
                {opp.description}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-400 font-medium" data-testid={`text-opportunity-impact-${index}`}>
                  {opp.estimatedImpact}
                </span>
              </div>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            data-testid={`button-expand-opportunity-${index}`}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4" data-testid={`section-opportunity-detail-${index}`}>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Your Channel</span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid={`text-opportunity-channel-${index}`}>
                {opp.channelContext}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Audience Fit</span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid={`text-opportunity-audience-${index}`}>
                {opp.audienceRelevance}
              </p>
            </div>

            {safeArray(opp?.steps).length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">How to Start</span>
                </div>
                <div className="space-y-1.5">
                  {safeArray(opp?.steps).map((step: string, stepIdx: number) => (
                    <div key={stepIdx} className="flex items-start gap-2" data-testid={`step-${index}-${stepIdx}`}>
                      <span className="text-xs text-muted-foreground font-medium mt-0.5 shrink-0 w-5 text-right">
                        {stepIdx + 1}.
                      </span>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OpportunitiesTab() {
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["/api/revenue/opportunities"], refetchInterval: 30_000, staleTime: 20_000 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <QueryErrorReset error={error} queryKey={["/api/revenue/opportunities"]} label="Failed to load opportunities" />;
  }

  const opportunities = data?.opportunities || [];
  const summary = data?.summary || {};

  if (opportunities.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No Opportunities Detected"
        description="Connect more platforms and add revenue records so the AI can identify new money-making opportunities for your channel."
      />
    );
  }

  const highCount = opportunities.filter((o: any) => o.priority === "high").length;
  const medCount = opportunities.filter((o: any) => o.priority === "medium").length;
  const lowCount = opportunities.filter((o: any) => o.priority === "low").length;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-opportunities-title" className="text-lg font-semibold">Opportunities</h2>
        <Badge
          variant="secondary"
          className="text-xs no-default-hover-elevate no-default-active-elevate bg-amber-500/10 text-amber-400"
          data-testid="badge-opportunity-count"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          {opportunities.length} found
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold" data-testid="text-summary-revenue">
              ${(summary.totalRevenue || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Platforms</p>
            <p className="text-lg font-bold" data-testid="text-summary-platforms">
              {summary.platformCount || 0} connected
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Revenue Streams</p>
            <p className="text-lg font-bold" data-testid="text-summary-streams">
              {summary.revenueStreams || 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Untapped</p>
            <p className="text-lg font-bold" data-testid="text-summary-untapped">
              {summary.unmonetizedPlatforms || 0} platforms
            </p>
          </CardContent>
        </Card>
      </div>

      {highCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-red-500/10 text-red-400">
            {highCount} high priority
          </Badge>
          {medCount > 0 && (
            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-amber-500/10 text-amber-400">
              {medCount} medium
            </Badge>
          )}
          {lowCount > 0 && (
            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-blue-500/10 text-blue-400">
              {lowCount} low
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">Click any opportunity to see how it fits your channel and audience</p>
        </div>
      )}

      <div className="space-y-3">
        {safeArray(opportunities).map((opp: any, idx: number) => (
          <OpportunityCard key={idx} opp={opp} index={idx} />
        ))}
      </div>
    </div>
  );
}
