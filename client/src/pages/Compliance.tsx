import { useCompliance, useRunComplianceCheck } from "@/hooks/use-compliance";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export default function Compliance() {
  const { data: records, isLoading } = useCompliance();
  const { data: channels } = useChannels();
  const runCheck = useRunComplianceCheck();
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>("");

  const handleRunCheck = async () => {
    const channelId = channels?.[0]?.id;
    const result = await runCheck.mutateAsync(channelId);
    setOverallScore(result.overallScore);
    if (result.summary) setSummary(result.summary);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Shield className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
      warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      critical: "bg-red-500/15 text-red-400 border-red-500/20",
    };
    return <Badge variant="outline" className={colors[severity] || colors.info}>{severity}</Badge>;
  };

  const passCount = records?.filter(r => r.status === 'pass').length || 0;
  const warnCount = records?.filter(r => r.status === 'warning').length || 0;
  const failCount = records?.filter(r => r.status === 'fail').length || 0;

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Compliance Monitor</h1>
          <p className="text-muted-foreground mt-1">Track platform rule compliance and avoid account strikes.</p>
        </div>
        <Button
          data-testid="button-run-compliance"
          onClick={handleRunCheck}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Shield className="w-4 h-4 mr-2" />
          )}
          {runCheck.isPending ? "Checking..." : "Run Compliance Check"}
        </Button>
      </div>

      {(overallScore !== null || (records && records.length > 0)) && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              {(overallScore ?? (records?.length ? Math.round(passCount / records.length * 100) : 100)) >= 80 ? (
                <ShieldCheck className="w-8 h-8 text-green-400" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-amber-400" />
              )}
              <div>
                <p className="text-2xl font-bold" data-testid="text-compliance-score">
                  {overallScore ?? (records?.length ? Math.round(passCount / records.length * 100) : 100)}%
                </p>
                <p className="text-xs text-muted-foreground">Overall Score</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-pass-count">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passing</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-warn-count">{warnCount}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-fail-count">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failures</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary && (
        <Card>
          <CardContent className="p-4">
            <p data-testid="text-compliance-summary" className="text-sm text-muted-foreground">{summary}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : !records?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No compliance checks yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Run a compliance check to scan your channel activity against platform rules and identify risks.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const details = record.details as any;
            return (
              <Card key={record.id} data-testid={`card-compliance-${record.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(record.status)}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">
                            {record.checkType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                          {details?.severity && getSeverityBadge(details.severity)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {record.createdAt ? format(new Date(record.createdAt), 'MMM d, h:mm a') : ''}
                        </span>
                      </div>
                      {details?.rule && (
                        <p className="text-xs text-muted-foreground">Rule: {details.rule}</p>
                      )}
                      {details?.description && (
                        <p className="text-sm text-foreground">{details.description}</p>
                      )}
                      {details?.recommendation && (
                        <div className="bg-accent/30 rounded-md p-2.5">
                          <p className="text-xs text-foreground">{details.recommendation}</p>
                        </div>
                      )}
                    </div>
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
