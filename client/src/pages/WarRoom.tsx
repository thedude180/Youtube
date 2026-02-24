import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Siren, CheckCircle, RefreshCw, Radio, Activity, Zap } from "lucide-react";

export default function WarRoom() {
  const { data: incidents = [], isLoading } = useQuery({ queryKey: ["/api/nexus/war-room"] });
  const { data: anomalies = [] } = useQuery({ queryKey: ["/api/nexus/anomalies"] });

  const scanThreats = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/war-room/scan"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/war-room"] }); queryClient.invalidateQueries({ queryKey: ["/api/nexus/anomalies"] }); },
  });

  const activeIncidents = (incidents as any[]).filter((i: any) => i.status === "active");
  const hasActiveCrisis = activeIncidents.length > 0;

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className={`min-h-screen p-6 ${hasActiveCrisis ? "bg-gradient-to-br from-red-950 via-gray-950 to-red-950" : "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950"}`} data-testid="page-war-room">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasActiveCrisis ? "bg-gradient-to-br from-red-600 to-orange-600 animate-pulse" : "bg-gradient-to-br from-gray-600 to-gray-700"}`}>
              <Siren className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">AI War Room</h1>
              <p className={`text-sm ${hasActiveCrisis ? "text-red-300" : "text-gray-400"}`} data-testid="text-page-subtitle">{hasActiveCrisis ? `${activeIncidents.length} Active Incident${activeIncidents.length > 1 ? "s" : ""} — Crisis Mode Active` : "All clear — continuous monitoring active"}</p>
            </div>
          </div>
          <Button onClick={() => scanThreats.mutate()} disabled={scanThreats.isPending} variant="outline" className={hasActiveCrisis ? "border-red-500/30" : "border-gray-600/30"} data-testid="button-scan-threats">
            <RefreshCw className={`w-4 h-4 mr-2 ${scanThreats.isPending ? "animate-spin" : ""}`} /> Threat Scan
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="section-war-room-metrics">
          <Card className={`border ${hasActiveCrisis ? "bg-red-900/30 border-red-500/20" : "bg-green-900/30 border-green-500/20"}`} data-testid="card-threat-level">
            <CardContent className="p-4 text-center">
              {hasActiveCrisis ? <Siren className="w-8 h-8 text-red-400 mx-auto mb-1 animate-pulse" /> : <Shield className="w-8 h-8 text-green-400 mx-auto mb-1" />}
              <p className="text-lg font-bold text-white" data-testid="text-threat-level">{hasActiveCrisis ? "CRISIS" : "ALL CLEAR"}</p>
              <p className="text-xs text-gray-400">Threat Level</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-active-incidents">
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white" data-testid="text-active-incidents">{activeIncidents.length}</p>
              <p className="text-xs text-gray-400">Active Incidents</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-anomalies-count">
            <CardContent className="p-4 text-center">
              <Activity className="w-8 h-8 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white" data-testid="text-anomalies-count">{(anomalies as any[]).length}</p>
              <p className="text-xs text-gray-400">Anomalies Detected</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-resolved-count">
            <CardContent className="p-4 text-center">
              <Zap className="w-8 h-8 text-green-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white" data-testid="text-resolved-count">{(incidents as any[]).filter((i: any) => i.status === "resolved").length}</p>
              <p className="text-xs text-gray-400">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {activeIncidents.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-red-400 flex items-center gap-2"><Siren className="w-5 h-5 animate-pulse" /> Active Incidents</h2>
            {activeIncidents.map((incident: any) => (
              <Card key={incident.id} className={`border ${incident.severity === "critical" ? "bg-red-900/30 border-red-500/30" : incident.severity === "high" ? "bg-orange-900/30 border-orange-500/30" : "bg-amber-900/30 border-amber-500/30"}`} data-testid={`card-incident-${incident.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">{incident.title}</CardTitle>
                    <Badge variant="outline" className={`${incident.severity === "critical" ? "border-red-500 text-red-400" : incident.severity === "high" ? "border-orange-500 text-orange-400" : "border-amber-500 text-amber-400"}`}>{incident.severity?.toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-300">{incident.description}</p>
                  {incident.affectedPlatforms?.length > 0 && (
                    <div className="flex gap-1">
                      {incident.affectedPlatforms.map((p: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs capitalize">{p}</Badge>
                      ))}
                    </div>
                  )}
                  {incident.recoveryPlan?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-400 mb-2">Recovery Plan</p>
                      {incident.recoveryPlan.map((step: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-gray-800/40 mb-1">
                          {step.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Radio className="w-4 h-4 text-yellow-400" />}
                          <span className="text-sm text-gray-300">{step.step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {incident.automatedActions?.length > 0 && (
                    <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/20">
                      <p className="text-xs font-medium text-green-400 mb-1">Automated Actions Taken</p>
                      {incident.automatedActions.map((action: string, i: number) => (
                        <p key={i} className="text-xs text-gray-300">• {action}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!hasActiveCrisis && (
          <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-all-clear">
            <CardContent className="py-16 text-center">
              <Shield className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-green-300" data-testid="text-all-clear">All Systems Normal</h2>
              <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">AI is continuously monitoring for algorithm changes, content strikes, engagement drops, platform outages, and potential crises. You'll be alerted immediately if anything is detected.</p>
              <div className="flex justify-center gap-4 mt-6">
                {["Algorithm", "Content Strikes", "Engagement", "Platform Health", "Reputation"].map((monitor) => (
                  <div key={monitor} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-gray-400">{monitor}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(incidents as any[]).filter((i: any) => i.status === "resolved").length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-400">Resolved Incidents</h2>
            {(incidents as any[]).filter((i: any) => i.status === "resolved").map((incident: any) => (
              <Card key={incident.id} className="bg-gray-900/40 border-gray-700/20 opacity-60" data-testid={`card-resolved-${incident.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="text-sm text-white">{incident.title}</p>
                      <p className="text-xs text-gray-400">{incident.incidentType}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-green-500/30 text-green-400">Resolved</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
