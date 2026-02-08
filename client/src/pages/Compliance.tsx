import { useCompliance, useRunComplianceCheck } from "@/hooks/use-compliance";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function Compliance() {
  const { data: records, isLoading } = useCompliance();
  const { data: channels } = useChannels();
  const runCheck = useRunComplianceCheck();
  const [summary, setSummary] = useState<string>("");

  const handleRunCheck = async () => {
    const channelId = channels?.[0]?.id;
    const result = await runCheck.mutateAsync(channelId);
    if (result.summary) setSummary(result.summary);
  };

  const statusIcon = (status: string) => {
    if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    if (status === 'fail') return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return <Shield className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Compliance</h1>
        <Button data-testid="button-run-compliance" size="sm" onClick={handleRunCheck} disabled={runCheck.isPending}>
          {runCheck.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 mr-1.5" />}
          {runCheck.isPending ? "Checking..." : "Run Check"}
        </Button>
      </div>

      {summary && (
        <Card>
          <CardContent className="p-4">
            <p data-testid="text-compliance-summary" className="text-sm text-muted-foreground">{summary}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !records?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No compliance checks yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border/50">
            {records.map((record) => {
              const details = record.details as any;
              return (
                <div key={record.id} data-testid={`card-compliance-${record.id}`} className="p-4 flex items-start gap-3">
                  {statusIcon(record.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {record.checkType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      {details?.severity && (
                        <Badge variant="secondary" className="text-xs capitalize">{details.severity}</Badge>
                      )}
                    </div>
                    {details?.description && (
                      <p className="text-xs text-muted-foreground mt-1">{details.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
