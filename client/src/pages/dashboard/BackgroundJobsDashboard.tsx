import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Timer, Link2, Zap, CalendarClock, ChevronDown, ChevronRight, Cog } from "lucide-react";

function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "running":
    case "active":
    case "healthy":
      return "bg-emerald-500/10 text-emerald-500";
    case "paused":
    case "idle":
    case "pending":
      return "bg-amber-500/10 text-amber-500";
    case "failed":
    case "error":
    case "stopped":
      return "bg-red-500/10 text-red-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "N/A";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface JobSection {
  key: string;
  label: string;
  icon: typeof Timer;
  dataKey: string;
}

const sections: JobSection[] = [
  { key: "crons", label: "Cron Jobs", icon: Timer, dataKey: "cronJobs" },
  { key: "chains", label: "AI Chains", icon: Link2, dataKey: "aiChains" },
  { key: "rules", label: "Automation Rules", icon: Zap, dataKey: "automationRules" },
  { key: "scheduled", label: "Scheduled Items", icon: CalendarClock, dataKey: "scheduledItems" },
];

export default function BackgroundJobsDashboard() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/health/jobs"], refetchInterval: 30_000, staleTime: 20_000 });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div data-testid="jobs-loading" className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-md" />
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const hasData = data && (data.cronJobs?.length || data.aiChains?.length || data.automationRules?.length || data.scheduledItems?.length);

  if (!hasData && !data) {
    return (
      <Card data-testid="jobs-empty">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-2 py-6">
            <Cog className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No background jobs found.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summaryCards = [
    { label: "Cron Jobs", value: summary.totalCrons ?? data?.cronJobs?.length ?? 0, icon: Timer },
    { label: "AI Chains", value: summary.totalChains ?? data?.aiChains?.length ?? 0, icon: Link2 },
    { label: "Automation Rules", value: summary.totalRules ?? data?.automationRules?.length ?? 0, icon: Zap },
    { label: "Scheduled", value: summary.totalScheduled ?? data?.scheduledItems?.length ?? 0, icon: CalendarClock },
  ];

  return (
    <div data-testid="background-jobs-dashboard" className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} data-testid={`card-summary-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="text-2xl font-extrabold">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        {sections.map((section) => {
          const items: any[] = data?.[section.dataKey] ?? [];
          const Icon = section.icon;
          const isOpen = openSections[section.key] ?? false;

          return (
            <Card key={section.key} data-testid={`card-jobs-${section.key}`}>
              <Collapsible open={isOpen} onOpenChange={() => toggleSection(section.key)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {section.label}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate">
                          {items.length} items
                        </Badge>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No {section.label.toLowerCase()} configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item: any, i: number) => (
                          <div
                            key={item.id ?? item.name ?? i}
                            className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap"
                            data-testid={`job-item-${section.key}-${i}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{item.name ?? item.title ?? `${section.label} #${i + 1}`}</p>
                              {(item.lastRun || item.nextRun) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {item.lastRun && `Last: ${formatTimestamp(item.lastRun)}`}
                                  {item.lastRun && item.nextRun && " | "}
                                  {item.nextRun && `Next: ${formatTimestamp(item.nextRun)}`}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant="secondary"
                              className={`text-xs no-default-hover-elevate ${statusColor(item.status)}`}
                            >
                              {item.status ?? "unknown"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
