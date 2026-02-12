import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Lightbulb } from "lucide-react";

interface DailyBriefingSectionProps {
  briefing: any;
}

export default function DailyBriefingSection({ briefing }: DailyBriefingSectionProps) {
  if (!briefing) return null;

  return (
    <SectionErrorBoundary fallbackTitle="Daily Briefing failed to load">
      <Card data-testid="card-daily-briefing">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Daily Briefing
            </CardTitle>
            {briefing.date && (
              <span className="text-xs text-muted-foreground">{new Date(briefing.date).toLocaleDateString()}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {briefing.summary && <p data-testid="text-briefing-summary" className="text-sm text-muted-foreground">{briefing.summary}</p>}
          {briefing.actionItems && briefing.actionItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Action Items</p>
              {briefing.actionItems.slice(0, 4).map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm" data-testid={`briefing-action-${i}`}>
                  <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="text-muted-foreground">{item.title || item.description || item}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
