import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Layers, FileText, Sparkles, Split, Zap, BarChart3, Fingerprint,
  Globe, FlaskConical, BookOpen, RefreshCw, PenTool, Image, GalleryVerticalEnd
} from "lucide-react";
import { useState } from "react";

export default function ContentCommand() {
  const [scriptTopic, setScriptTopic] = useState("");
  const [scriptStyle, setScriptStyle] = useState("educational");
  const [atomizerTitle, setAtomizerTitle] = useState("");
  const [atomizerPlatform, setAtomizerPlatform] = useState("youtube");

  const { data: scripts = [], isLoading } = useQuery({ queryKey: ["/api/nexus/scripts"] });
  const { data: hookData = [] } = useQuery({ queryKey: ["/api/nexus/hook-scores"] });
  const { data: thumbTests = [] } = useQuery({ queryKey: ["/api/nexus/thumbnail-tests"] });
  const { data: empireNodes = [] } = useQuery({ queryKey: ["/api/nexus/content-empire"] });
  const { data: atomizerJobs = [] } = useQuery({ queryKey: ["/api/nexus/content-atomizer"] });
  const { data: seoLab = [] } = useQuery({ queryKey: ["/api/nexus/seo-lab"] });
  const { data: viralChains = [] } = useQuery({ queryKey: ["/api/nexus/viral-chains"] });

  const generateScript = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/script-generate", { title: scriptTopic, topic: scriptTopic, style: scriptStyle, targetLength: "medium" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/scripts"] }); setScriptTopic(""); },
  });

  const atomizeContent = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/content-atomizer", { sourceTitle: atomizerTitle, sourcePlatform: atomizerPlatform }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/content-atomizer"] }); setAtomizerTitle(""); },
  });

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Content Command</h1>
            <p className="text-sm text-blue-300">AI-powered content creation, optimization & distribution</p>
          </div>
        </div>

        <Tabs defaultValue="scripts" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1 flex-wrap">
            <TabsTrigger value="scripts" data-testid="tab-scripts">AI Script Writer</TabsTrigger>
            <TabsTrigger value="atomizer" data-testid="tab-atomizer">Content Atomizer</TabsTrigger>
            <TabsTrigger value="hooks" data-testid="tab-hooks">Hook Analyzer</TabsTrigger>
            <TabsTrigger value="thumbnails" data-testid="tab-thumbnails">Thumbnail A/B</TabsTrigger>
            <TabsTrigger value="empire" data-testid="tab-empire">Empire Map</TabsTrigger>
            <TabsTrigger value="seo" data-testid="tab-seo">SEO Lab</TabsTrigger>
            <TabsTrigger value="viral" data-testid="tab-viral">Viral Chains</TabsTrigger>
          </TabsList>

          <TabsContent value="scripts" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><PenTool className="w-5 h-5 text-blue-400" /> AI Script Writer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Input placeholder="What's your video about?" value={scriptTopic} onChange={(e) => setScriptTopic(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-script-topic" />
                  <select value={scriptStyle} onChange={(e) => setScriptStyle(e.target.value)} className="bg-gray-800/60 border border-gray-700/30 rounded-md px-3 text-white text-sm" data-testid="select-script-style">
                    <option value="educational">Educational</option>
                    <option value="entertaining">Entertaining</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="storytelling">Storytelling</option>
                    <option value="review">Review</option>
                  </select>
                  <Button onClick={() => generateScript.mutate()} disabled={generateScript.isPending || !scriptTopic} data-testid="button-generate-script">
                    <Sparkles className={`w-4 h-4 mr-1 ${generateScript.isPending ? "animate-spin" : ""}`} /> Generate
                  </Button>
                </div>
              </CardContent>
            </Card>
            {(scripts as any[]).map((script: any) => (
              <Card key={script.id} className="bg-gray-900/60 border-gray-700/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-lg">{script.title}</CardTitle>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400">{script.style}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {script.hookOptions?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-purple-400 mb-1">Hook Options:</p>
                      {script.hookOptions.map((hook: string, i: number) => (
                        <p key={i} className="text-sm text-gray-300 p-2 bg-gray-800/40 rounded mb-1">"{hook}"</p>
                      ))}
                    </div>
                  )}
                  <div className="p-4 bg-gray-800/40 rounded-lg max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{script.script}</pre>
                  </div>
                  {script.seoKeywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {script.seoKeywords.map((kw: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">{kw}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="atomizer" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Split className="w-5 h-5 text-cyan-400" /> Cross-Platform Content Atomizer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">Take one piece of content and split it into optimized versions for every platform.</p>
                <div className="flex gap-3">
                  <Input placeholder="Content title or URL" value={atomizerTitle} onChange={(e) => setAtomizerTitle(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-atomizer-title" />
                  <select value={atomizerPlatform} onChange={(e) => setAtomizerPlatform(e.target.value)} className="bg-gray-800/60 border border-gray-700/30 rounded-md px-3 text-white text-sm" data-testid="select-atomizer-platform">
                    <option value="youtube">YouTube</option>
                    <option value="twitch">Twitch</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                  <Button onClick={() => atomizeContent.mutate()} disabled={atomizeContent.isPending || !atomizerTitle} data-testid="button-atomize">
                    <Split className={`w-4 h-4 mr-1 ${atomizeContent.isPending ? "animate-spin" : ""}`} /> Atomize
                  </Button>
                </div>
              </CardContent>
            </Card>
            {(atomizerJobs as any[]).map((job: any) => (
              <Card key={job.id} className="bg-gray-900/60 border-gray-700/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base">{job.sourceTitle}</CardTitle>
                    <Badge variant="outline" className={job.status === "completed" ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}>{job.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(job.outputs || []).map((output: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">{output.platform}</Badge>
                          <span className="text-xs text-gray-400">{output.contentType}</span>
                        </div>
                        <p className="text-sm text-white font-medium">{output.title}</p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{output.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="hooks">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" /> Hook Analyzer</CardTitle>
              </CardHeader>
              <CardContent>
                {(hookData as any[]).length ? (
                  <div className="space-y-3">
                    {(hookData as any[]).map((h: any) => (
                      <div key={h.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white">{h.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-purple-400">{h.score}/100</span>
                          </div>
                        </div>
                        {h.hookText && <p className="text-sm text-gray-300 italic">"{h.hookText}"</p>}
                        {h.improvedHook && <p className="text-sm text-green-400 mt-1">Suggested: "{h.improvedHook}"</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Hook analysis will appear as your content is processed by the AI.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="thumbnails">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Image className="w-5 h-5 text-pink-400" /> Thumbnail A/B Testing</CardTitle>
              </CardHeader>
              <CardContent>
                {(thumbTests as any[]).length ? (
                  <div className="space-y-3">
                    {(thumbTests as any[]).map((t: any) => (
                      <div key={t.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className={t.status === "completed" ? "border-green-500/30 text-green-400" : "border-blue-500/30 text-blue-400"}>{t.status}</Badge>
                          <span className="text-xs text-gray-400">{t.testDurationHours}h test</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {(t.variants || []).map((v: any, i: number) => (
                            <div key={i} className={`p-2 rounded border ${v.isWinner ? "border-green-500/30 bg-green-900/10" : "border-gray-700/20"}`}>
                              <p className="text-xs text-white">{v.description}</p>
                              <p className="text-xs text-gray-400">CTR: {(v.ctr * 100).toFixed(1)}%</p>
                              {v.isWinner && <Badge className="text-xs mt-1 bg-green-600">Winner</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Thumbnail A/B tests will run automatically when you upload new content.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="empire">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Globe className="w-5 h-5 text-purple-400" /> Content Empire Map</CardTitle>
              </CardHeader>
              <CardContent>
                {(empireNodes as any[]).length ? (
                  <div className="relative">
                    <svg width="100%" viewBox="0 0 600 400" className="mx-auto">
                      {(empireNodes as any[]).map((node: any, i: number) => {
                        const angle = (i / (empireNodes as any[]).length) * 2 * Math.PI;
                        const r = 100 + (node.valueScore || 0) * 2;
                        const x = 300 + r * Math.cos(angle);
                        const y = 200 + r * Math.sin(angle);
                        const nodeSize = Math.max(4, Math.min(20, (node.views || 0) / 1000));
                        const color = node.platform === "youtube" ? "#ff0000" : node.platform === "tiktok" ? "#ff2d55" : node.platform === "twitch" ? "#9146ff" : "#3b82f6";
                        return (
                          <g key={i}>
                            <line x1="300" y1="200" x2={x} y2={y} stroke="rgba(139,92,246,0.1)" strokeWidth="1" />
                            <circle cx={x} cy={y} r={nodeSize} fill={color} opacity={0.7} />
                            <text x={x} y={y + nodeSize + 10} textAnchor="middle" className="fill-gray-400 text-[8px]">{node.title?.slice(0, 20)}</text>
                          </g>
                        );
                      })}
                      <circle cx="300" cy="200" r="8" fill="#a855f7" />
                      <text x="300" y="225" textAnchor="middle" className="fill-white text-[10px] font-bold">YOU</text>
                    </svg>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Your content galaxy map will appear as your content ecosystem grows.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seo">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><FlaskConical className="w-5 h-5 text-emerald-400" /> Hashtag & SEO Laboratory</CardTitle>
              </CardHeader>
              <CardContent>
                {(seoLab as any[]).length ? (
                  <div className="space-y-3">
                    {(seoLab as any[]).map((exp: any) => (
                      <div key={exp.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white capitalize">{exp.experimentType}</span>
                          <Badge variant="outline" className={exp.status === "completed" ? "border-green-500/30 text-green-400" : "border-blue-500/30 text-blue-400"}>{exp.status}</Badge>
                        </div>
                        {exp.winningVariant && <p className="text-sm text-green-400">Winner: {exp.winningVariant} (+{exp.improvement?.toFixed(1)}%)</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">SEO experiments will run automatically as AI tests different titles, tags, and descriptions.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="viral">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Zap className="w-5 h-5 text-orange-400" /> Viral Chain Reaction Tracker</CardTitle>
              </CardHeader>
              <CardContent>
                {(viralChains as any[]).length ? (
                  <div className="space-y-2">
                    {(viralChains as any[]).map((v: any) => (
                      <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/40">
                        <Zap className="w-4 h-4 text-orange-400" />
                        <div className="flex-1">
                          <p className="text-sm text-white">{v.eventType} from {v.sourceChannel}</p>
                          <p className="text-xs text-gray-400">+{v.viewsGained} views, +{v.sharesGained} shares</p>
                        </div>
                        <Badge variant="outline" className="text-xs">Depth: {v.chainDepth}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Viral chain reactions will be tracked in real-time when your content starts spreading.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
