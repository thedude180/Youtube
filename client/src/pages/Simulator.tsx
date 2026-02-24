import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Clock, TrendingUp, Gauge, Timer, BarChart3, Zap, RefreshCw, ArrowRight, Target } from "lucide-react";
import { useState } from "react";

function ProjectionChart({ withAI, withoutAI, label }: { withAI: number[]; withoutAI: number[]; label: string }) {
  const max = Math.max(...withAI, ...withoutAI, 1);
  const h = 120;
  const w = 300;
  const getPoints = (data: number[]) => data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 20}`} className="max-w-sm">
        <polyline points={getPoints(withoutAI)} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,4" opacity="0.5" />
        <polyline points={getPoints(withAI)} fill="none" stroke="#22c55e" strokeWidth="2" />
        <text x="5" y={h + 15} className="fill-green-400 text-[9px]">With AI</text>
        <text x="80" y={h + 15} className="fill-red-400 text-[9px]">Without AI</text>
      </svg>
    </div>
  );
}

export default function Simulator() {
  const [scenarioName, setScenarioName] = useState("");
  const [postingFreq, setPostingFreq] = useState(3);
  const [platformFocus, setPlatformFocus] = useState("youtube");
  const [contentType, setContentType] = useState("mixed");

  const { data: scenarios = [], isLoading } = useQuery({ queryKey: ["/api/nexus/what-if"] });
  const { data: projections = [] } = useQuery({ queryKey: ["/api/nexus/time-machine"] });
  const { data: momentum } = useQuery({ queryKey: ["/api/nexus/momentum"] });
  const { data: peakTimes = [] } = useQuery({ queryKey: ["/api/nexus/peak-times"] });
  const { data: revenueAttr = [] } = useQuery({ queryKey: ["/api/nexus/revenue-attribution"] });

  const simulate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/what-if/simulate", { name: scenarioName || "Custom Scenario", variables: { postingFrequency: postingFreq, platformFocus, contentType }, timeframeWeeks: 12 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/what-if"] }); setScenarioName(""); },
  });

  const projectTimeMachine = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/time-machine/project"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/time-machine"] }),
  });

  const withAI = (projections as any[]).find((p: any) => p.projectionType === "with_ai");
  const withoutAI = (projections as any[]).find((p: any) => p.projectionType === "without_ai");

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
            <FlaskConical className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Simulator & Forecasting</h1>
            <p className="text-sm text-emerald-300">What-If scenarios, time machine projections & revenue forecasting</p>
          </div>
        </div>

        <Tabs defaultValue="whatif" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1">
            <TabsTrigger value="whatif" data-testid="tab-whatif">What-If Simulator</TabsTrigger>
            <TabsTrigger value="timemachine" data-testid="tab-timemachine">Time Machine</TabsTrigger>
            <TabsTrigger value="momentum" data-testid="tab-momentum">Momentum Engine</TabsTrigger>
            <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue Attribution</TabsTrigger>
          </TabsList>

          <TabsContent value="whatif" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><FlaskConical className="w-5 h-5 text-emerald-400" /> Scenario Builder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Scenario name (e.g., 'Double TikTok posting')" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-scenario-name" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Posts per week</label>
                    <input type="range" min="1" max="20" value={postingFreq} onChange={(e) => setPostingFreq(parseInt(e.target.value))} className="w-full accent-emerald-500" data-testid="slider-posting-freq" />
                    <span className="text-sm text-white">{postingFreq}x/week</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Platform Focus</label>
                    <select value={platformFocus} onChange={(e) => setPlatformFocus(e.target.value)} className="w-full bg-gray-800/60 border border-gray-700/30 rounded-md px-3 py-2 text-white text-sm" data-testid="select-platform-focus">
                      <option value="youtube">YouTube</option>
                      <option value="tiktok">TikTok</option>
                      <option value="twitch">Twitch</option>
                      <option value="all">All Platforms</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Content Type</label>
                    <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="w-full bg-gray-800/60 border border-gray-700/30 rounded-md px-3 py-2 text-white text-sm" data-testid="select-content-type">
                      <option value="mixed">Mixed</option>
                      <option value="longform">Long-form</option>
                      <option value="shorts">Shorts/Clips</option>
                      <option value="streaming">Live Streaming</option>
                    </select>
                  </div>
                </div>
                <Button onClick={() => simulate.mutate()} disabled={simulate.isPending} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600" data-testid="button-simulate">
                  <FlaskConical className={`w-4 h-4 mr-2 ${simulate.isPending ? "animate-spin" : ""}`} /> Run Simulation
                </Button>
              </CardContent>
            </Card>
            {(scenarios as any[]).map((s: any) => (
              <Card key={s.id} className="bg-gray-900/60 border-gray-700/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base">{s.name}</CardTitle>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">{(s.confidenceLevel * 100).toFixed(0)}% confidence</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(s.projectedOutcomes || {}).map(([key, value]: [string, any]) => (
                      <div key={key} className="text-center p-3 rounded-lg bg-gray-800/40">
                        <p className="text-xs text-gray-400 capitalize">{key}</p>
                        <p className="text-lg font-bold text-white">{typeof value === "number" ? value.toLocaleString() : value}</p>
                        {s.comparisonBaseline?.[key] && (
                          <p className="text-xs text-green-400">vs {typeof s.comparisonBaseline[key] === "number" ? s.comparisonBaseline[key].toLocaleString() : s.comparisonBaseline[key]} baseline</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="timemachine" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2"><Clock className="w-5 h-5 text-blue-400" /> Creator Time Machine</CardTitle>
                  <Button size="sm" onClick={() => projectTimeMachine.mutate()} disabled={projectTimeMachine.isPending} data-testid="button-project-timemachine">
                    <RefreshCw className={`w-3 h-3 mr-1 ${projectTimeMachine.isPending ? "animate-spin" : ""}`} /> Project 6 Months
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {withAI && withoutAI ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ProjectionChart withAI={withAI.subscribers || []} withoutAI={withoutAI.subscribers || []} label="Subscribers" />
                    <ProjectionChart withAI={withAI.revenue || []} withoutAI={withoutAI.revenue || []} label="Revenue ($)" />
                    <ProjectionChart withAI={withAI.views || []} withoutAI={withoutAI.views || []} label="Views" />
                    <ProjectionChart withAI={withAI.engagement || []} withoutAI={withoutAI.engagement || []} label="Engagement %" />
                    {withAI.milestones?.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400 mb-2">Projected Milestones</p>
                        <div className="flex flex-wrap gap-2">
                          {withAI.milestones.map((m: any, i: number) => (
                            <Badge key={i} variant="outline" className="border-blue-500/30 text-blue-400">Month {m.month}: {m.label}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Click "Project 6 Months" to see where you'll be with and without AI optimization.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="momentum">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Gauge className="w-5 h-5 text-orange-400" /> Momentum Engine</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6">
                  <div className="relative inline-flex items-center justify-center">
                    <svg width="200" height="200" className="transform -rotate-90">
                      <circle cx="100" cy="100" r="80" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
                      <circle cx="100" cy="100" r="80" stroke={((momentum as any)?.score || 50) > 70 ? "#22c55e" : ((momentum as any)?.score || 50) > 40 ? "#eab308" : "#ef4444"} strokeWidth="8" fill="none" strokeDasharray={502} strokeDashoffset={502 * (1 - ((momentum as any)?.score || 50) / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-4xl font-bold text-white">{(momentum as any)?.score || 50}</span>
                      <p className="text-xs text-gray-400">Momentum</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`mt-4 ${(momentum as any)?.trend === "up" ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}`}>
                    {(momentum as any)?.trend === "up" ? "Accelerating" : (momentum as any)?.trend === "down" ? "Decelerating" : "Steady"}
                  </Badge>
                </div>
                {(momentum as any)?.factors?.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {(momentum as any).factors.map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-sm text-gray-300">{f.factor}</span>
                        <span className={`text-sm font-bold ${f.direction === "up" ? "text-green-400" : "text-red-400"}`}>{f.direction === "up" ? "+" : ""}{f.impact}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-400" /> Revenue Attribution</CardTitle>
              </CardHeader>
              <CardContent>
                {(revenueAttr as any[]).length ? (
                  <div className="space-y-2">
                    {(revenueAttr as any[]).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40">
                        <div>
                          <p className="text-sm text-white">{r.contentTitle || "Unknown content"}</p>
                          <p className="text-xs text-gray-400 capitalize">{r.platform} • {r.revenueType}</p>
                        </div>
                        <span className="text-sm font-bold text-green-400">${r.amount?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Revenue attribution data will appear as your content generates income across platforms.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
