import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Target, Shield, Users, TrendingUp, AlertTriangle, Eye,
  Radar, Activity, BarChart3, Network, Fingerprint, Zap, RefreshCw,
  Search, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";

function ScoreRadar({ scores }: { scores: Record<string, number> }) {
  const categories = Object.entries(scores);
  const size = 200;
  const center = size / 2;
  const maxRadius = 80;
  const angleStep = (2 * Math.PI) / categories.length;

  return (
    <svg width={size} height={size} className="mx-auto">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon key={scale} points={categories.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return `${center + maxRadius * scale * Math.cos(angle)},${center + maxRadius * scale * Math.sin(angle)}`;
        }).join(" ")} fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="1" />
      ))}
      <polygon points={categories.map(([_, value], i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (value / 100) * maxRadius;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      }).join(" ")} fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.8)" strokeWidth="2" />
      {categories.map(([label, value], i) => {
        const angle = i * angleStep - Math.PI / 2;
        const labelR = maxRadius + 20;
        return (
          <text key={label} x={center + labelR * Math.cos(angle)} y={center + labelR * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 text-[10px]">
            {label.replace("Score", "")}
          </text>
        );
      })}
    </svg>
  );
}

function MindMapViz({ nodes }: { nodes: any[] }) {
  if (!nodes.length) return <div className="text-center py-8 text-gray-400">Generate your audience mind map to visualize segments</div>;
  const size = 400;
  const center = size / 2;

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto max-w-md">
      {nodes.map((node: any, i: number) => {
        const angle = (i / nodes.length) * 2 * Math.PI;
        const r = node.nodeType === "core" ? 0 : 80 + (i % 3) * 40;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        const nodeSize = Math.max(8, Math.min(30, (node.size || 10)));
        const color = node.nodeType === "core" ? "#a855f7" : node.nodeType === "segment" ? "#3b82f6" : node.nodeType === "interest" ? "#22c55e" : "#eab308";
        return (
          <g key={i}>
            {node.nodeType !== "core" && <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(139,92,246,0.2)" strokeWidth="1" />}
            <circle cx={x} cy={y} r={nodeSize} fill={color} opacity={0.7} className="transition-all hover:opacity-100" />
            <text x={x} y={y + nodeSize + 12} textAnchor="middle" className="fill-gray-300 text-[9px]">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface CreatorScoreData {
  overallScore?: number;
  trend?: string;
  engagementScore?: number;
  consistencyScore?: number;
  growthScore?: number;
  monetizationScore?: number;
  reachScore?: number;
  contentQualityScore?: number;
}

export default function IntelligenceHub() {
  const { data: creatorScore } = useQuery<CreatorScoreData>({ queryKey: ["/api/nexus/creator-score"] });
  const { data: mindMapNodes = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/audience-mind-map"] });
  const { data: anomalies = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/anomalies"] });
  const { data: sentiment = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/sentiment-timeline"] });
  const { data: overlaps = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/audience-overlaps"] });
  const { data: cohorts = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/cohort"] });
  const { data: platformRanks = [] } = useQuery<any[]>({ queryKey: ["/api/nexus/platform-priority"] });

  const calculateScore = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/creator-score/calculate"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/creator-score"] }),
  });

  const generateMindMap = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/audience-mind-map/generate"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/audience-mind-map"] }),
  });

  const scores = {
    Engagement: creatorScore?.engagementScore || 0,
    Consistency: creatorScore?.consistencyScore || 0,
    Growth: creatorScore?.growthScore || 0,
    Monetization: creatorScore?.monetizationScore || 0,
    Reach: creatorScore?.reachScore || 0,
    Quality: creatorScore?.contentQualityScore || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-indigo-950/20 to-gray-950 p-6" data-testid="page-intelligence-hub">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Intelligence Hub</h1>
            <p className="text-sm text-indigo-300" data-testid="text-page-subtitle">Deep analytics, audience insights & intelligence engines</p>
          </div>
        </div>

        <Tabs defaultValue="score" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1">
            <TabsTrigger value="score" data-testid="tab-creator-score">Creator Score</TabsTrigger>
            <TabsTrigger value="mindmap" data-testid="tab-mind-map">Audience Mind Map</TabsTrigger>
            <TabsTrigger value="anomalies" data-testid="tab-anomalies">Anomaly Detection</TabsTrigger>
            <TabsTrigger value="sentiment" data-testid="tab-sentiment">Sentiment Timeline</TabsTrigger>
            <TabsTrigger value="overlaps" data-testid="tab-overlaps">Audience Overlap</TabsTrigger>
            <TabsTrigger value="priority" data-testid="tab-priority">Platform Priority</TabsTrigger>
          </TabsList>

          <TabsContent value="score" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-creator-score">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2"><Target className="w-5 h-5 text-purple-400" /> Creator Health Score</CardTitle>
                    <Button size="sm" onClick={() => calculateScore.mutate()} disabled={calculateScore.isPending} data-testid="button-calculate-score">
                      <RefreshCw className={`w-3 h-3 mr-1 ${calculateScore.isPending ? "animate-spin" : ""}`} /> Calculate
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-6xl font-bold text-white" data-testid="text-overall-score">{creatorScore?.overallScore || 0}</div>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {creatorScore?.trend === "up" ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : creatorScore?.trend === "down" ? <ArrowDownRight className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-gray-400" />}
                      <span className={`text-sm ${creatorScore?.trend === "up" ? "text-green-400" : creatorScore?.trend === "down" ? "text-red-400" : "text-gray-400"}`} data-testid="text-score-trend">{creatorScore?.trend || "new"}</span>
                    </div>
                  </div>
                  <ScoreRadar scores={scores} />
                </CardContent>
              </Card>

              <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-score-breakdown">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-400" /> Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(scores).map(([label, value]) => (
                    <div key={label} data-testid={`score-breakdown-${label.toLowerCase()}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{label}</span>
                        <span className="text-sm font-bold text-white" data-testid={`text-score-${label.toLowerCase()}`}>{value}/100</span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mindmap">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2"><Network className="w-5 h-5 text-blue-400" /> Audience Mind Map</CardTitle>
                  <Button size="sm" onClick={() => generateMindMap.mutate()} disabled={generateMindMap.isPending} data-testid="button-generate-mindmap">
                    <Brain className={`w-3 h-3 mr-1 ${generateMindMap.isPending ? "animate-spin" : ""}`} /> Generate Map
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(mindMapNodes as any[]).length === 0 ? (
                  <div className="text-center py-12">
                    <Network className="w-12 h-12 text-blue-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Audience Mind Map Yet</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Generate your audience mind map to visualize segments, interests, and engagement patterns across your community.</p>
                  </div>
                ) : (
                  <MindMapViz nodes={mindMapNodes as any[]} />
                )}
                {(mindMapNodes as any[]).length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {(mindMapNodes as any[]).map((node: any, i: number) => (
                      <div key={i} className="p-2 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                        <p className="text-xs font-medium text-white">{node.label}</p>
                        <p className="text-xs text-gray-400">{node.nodeType}</p>
                        <p className="text-xs text-purple-400">{((node.engagement || 0) * 100).toFixed(0)}% engaged</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="anomalies">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-anomaly-detection">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Anomaly Detection</CardTitle>
              </CardHeader>
              <CardContent>
                {(anomalies as any[]).length ? (
                  <div className="space-y-3">
                    {(anomalies as any[]).map((a: any) => (
                      <div key={a.id} className={`p-4 rounded-lg border ${a.severity === "high" ? "bg-red-900/20 border-red-500/20" : a.severity === "medium" ? "bg-amber-900/20 border-amber-500/20" : "bg-blue-900/20 border-blue-500/20"}`} data-testid={`anomaly-item-${a.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={a.severity === "high" ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}>{a.severity}</Badge>
                            <span className="text-sm font-medium text-white">{a.anomalyType}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">{a.status}</Badge>
                        </div>
                        <p className="text-sm text-gray-300 mt-2">{a.description}</p>
                        {a.countermeasure && <p className="text-xs text-green-400 mt-1">Countermeasure: {a.countermeasure}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-anomalies">
                    <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-green-300 font-medium">No Anomalies Detected</p>
                    <p className="text-sm text-gray-400 mt-1">Real-time monitoring is active. You'll be alerted if anything unusual is detected.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sentiment">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-sentiment-timeline">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Activity className="w-5 h-5 text-green-400" /> Sentiment Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {(sentiment as any[]).length ? (
                  <div className="space-y-2">
                    {(sentiment as any[]).map((s: any) => (
                      <div key={s.id} className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/40" data-testid={`sentiment-item-${s.id}`}>
                        <div className="text-xs text-gray-400 w-24">{new Date(s.date).toLocaleDateString()}</div>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="h-2 bg-green-500/60 rounded" style={{ width: `${(s.positiveCount / (s.positiveCount + s.neutralCount + s.negativeCount)) * 100}%` }} />
                          <div className="h-2 bg-gray-500/60 rounded" style={{ width: `${(s.neutralCount / (s.positiveCount + s.neutralCount + s.negativeCount)) * 100}%` }} />
                          <div className="h-2 bg-red-500/60 rounded" style={{ width: `${(s.negativeCount / (s.positiveCount + s.neutralCount + s.negativeCount)) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{s.averageScore?.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Activity className="w-12 h-12 text-green-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Sentiment Data Yet</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Sentiment data will appear as your audience engagement grows. The AI tracks positive, neutral, and negative reactions across all platforms.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overlaps">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-audience-overlap">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Audience Overlap Detector</CardTitle>
              </CardHeader>
              <CardContent>
                {(overlaps as any[]).length ? (
                  <div className="space-y-3">
                    {(overlaps as any[]).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`overlap-item-${o.id}`}>
                        <div>
                          <p className="text-sm font-medium text-white">{o.creatorName}</p>
                          <p className="text-xs text-gray-400">{o.creatorPlatform} • {o.sharedViewers} shared viewers</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-purple-400">{o.overlapPercentage?.toFixed(1)}% overlap</p>
                          <p className="text-xs text-green-400">{o.untappedAudience} untapped viewers</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-cyan-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Audience Overlap Data</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Connect your platforms to detect audience overlap with other creators and discover untapped viewer segments.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="priority">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-platform-priority">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400" /> Platform Priority Ranker</CardTitle>
              </CardHeader>
              <CardContent>
                {(platformRanks as any[]).length ? (
                  <div className="space-y-3">
                    {(platformRanks as any[]).map((r: any, i: number) => (
                      <div key={r.id} className="flex items-center gap-4 p-4 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`platform-rank-${r.id}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">#{r.rank}</div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white capitalize">{r.platform}</p>
                          <p className="text-xs text-gray-400">{r.recommendation}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-green-400">ROI: {r.roiScore?.toFixed(1)}</p>
                          <p className="text-xs text-blue-400">Growth: {r.growthPotential?.toFixed(1)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <TrendingUp className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">Platform Rankings Coming Soon</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">AI will rank your platforms by ROI and growth potential once enough data is collected from your connected accounts.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
