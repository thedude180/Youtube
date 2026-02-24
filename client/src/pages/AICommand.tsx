import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Mic, BookOpen, Sparkles, Shield, Bot, Settings, User,
  Send, RefreshCw, GraduationCap, Calendar, FileText, Coffee
} from "lucide-react";
import { useState } from "react";

export default function AICommand() {
  const [voiceCommand, setVoiceCommand] = useState("");
  const [aiName, setAiName] = useState("");
  const [aiPersonality, setAiPersonality] = useState("professional");

  const { data: personalityConfig } = useQuery({ queryKey: ["/api/nexus/ai-personality"] });
  const { data: learningData = [] } = useQuery({ queryKey: ["/api/nexus/ai-learning"] });
  const { data: balanceScore } = useQuery({ queryKey: ["/api/nexus/balance-score"] });
  const { data: failoverRules = [] } = useQuery({ queryKey: ["/api/nexus/failover-rules"] });

  const processVoiceCommand = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/voice-command", { command: voiceCommand }),
    onSuccess: () => setVoiceCommand(""),
  });

  const savePersonality = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/ai-personality", { 
      aiName: aiName || (personalityConfig as any)?.aiName || "Nova", 
      personality: aiPersonality,
      traits: ["analytical", "encouraging", "direct"],
      communicationStyle: "balanced",
      isOpinionated: true 
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/ai-personality"] }),
  });

  const generateBriefing = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/daily-briefing/generate"),
  });

  const currentAiName = (personalityConfig as any)?.aiName || "Nova";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-violet-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">AI Command</h1>
            <p className="text-sm text-violet-300">Your AI team member — personality, voice commands, daily briefings & learning</p>
          </div>
        </div>

        <Tabs defaultValue="voice" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1 flex-wrap">
            <TabsTrigger value="voice" data-testid="tab-voice">Command Voice</TabsTrigger>
            <TabsTrigger value="personality" data-testid="tab-personality">AI Personality</TabsTrigger>
            <TabsTrigger value="briefing" data-testid="tab-briefing">Daily Briefing</TabsTrigger>
            <TabsTrigger value="learning" data-testid="tab-learning">AI Learning</TabsTrigger>
            <TabsTrigger value="defense" data-testid="tab-defense">Defense Systems</TabsTrigger>
          </TabsList>

          <TabsContent value="voice">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Mic className="w-5 h-5 text-violet-400" /> Creator Command Voice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">Tell {currentAiName} what to do in natural language. Examples: "Schedule my best clip from yesterday on TikTok at peak time" or "Generate a content calendar for next week".</p>
                <div className="flex gap-3">
                  <Input placeholder={`Tell ${currentAiName} what to do...`} value={voiceCommand} onChange={(e) => setVoiceCommand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && voiceCommand && processVoiceCommand.mutate()} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-voice-command" />
                  <Button onClick={() => processVoiceCommand.mutate()} disabled={processVoiceCommand.isPending || !voiceCommand} data-testid="button-send-command">
                    <Send className={`w-4 h-4 ${processVoiceCommand.isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                {processVoiceCommand.data && (
                  <div className="p-4 rounded-lg bg-violet-900/20 border border-violet-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="text-sm font-medium text-violet-300">{currentAiName}</span>
                    </div>
                    <p className="text-sm text-white">{(processVoiceCommand.data as any)?.result}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs border-violet-500/30">{(processVoiceCommand.data as any)?.parsedIntent}</Badge>
                      <Badge variant="outline" className="text-xs border-blue-500/30">{(processVoiceCommand.data as any)?.action}</Badge>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                  {[
                    "What's my best performing content this week?",
                    "Schedule posts for the next 3 days",
                    "Analyze my competitor's latest video",
                    "Generate a thumbnail concept for my latest video",
                    "Check if any of my platforms are shadow banned",
                    "What should I stream about tonight?"
                  ].map((suggestion, i) => (
                    <button key={i} onClick={() => { setVoiceCommand(suggestion); }} className="p-2 text-left text-xs text-gray-400 bg-gray-800/40 rounded-lg border border-gray-700/20 hover:border-violet-500/30 hover:text-violet-300 transition-all">
                      "{suggestion}"
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="personality">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><User className="w-5 h-5 text-pink-400" /> AI Personality Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">Customize your AI team member's personality, name, and communication style.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">AI Name</label>
                    <Input placeholder="Nova" value={aiName || (personalityConfig as any)?.aiName || ""} onChange={(e) => setAiName(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-ai-name" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Personality</label>
                    <select value={aiPersonality} onChange={(e) => setAiPersonality(e.target.value)} className="w-full bg-gray-800/60 border border-gray-700/30 rounded-md px-3 py-2 text-white text-sm">
                      <option value="professional">Professional & Focused</option>
                      <option value="friendly">Friendly & Casual</option>
                      <option value="motivational">Motivational Coach</option>
                      <option value="analytical">Data-Driven Analyst</option>
                      <option value="creative">Creative Visionary</option>
                      <option value="strategic">Strategic Advisor</option>
                    </select>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-gray-800/40">
                  <p className="text-xs text-gray-400 mb-2">Current Traits</p>
                  <div className="flex flex-wrap gap-1">
                    {((personalityConfig as any)?.traits || ["analytical", "encouraging", "direct"]).map((trait: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs border-purple-500/30 text-purple-400">{trait}</Badge>
                    ))}
                  </div>
                </div>
                <Button onClick={() => savePersonality.mutate()} disabled={savePersonality.isPending} className="bg-gradient-to-r from-violet-600 to-purple-600" data-testid="button-save-personality">
                  <Settings className="w-4 h-4 mr-1" /> Save Personality
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="briefing">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2"><Coffee className="w-5 h-5 text-amber-400" /> Daily Briefing</CardTitle>
                  <Button size="sm" onClick={() => generateBriefing.mutate()} disabled={generateBriefing.isPending} data-testid="button-generate-briefing">
                    <RefreshCw className={`w-3 h-3 mr-1 ${generateBriefing.isPending ? "animate-spin" : ""}`} /> Generate Today's Briefing
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {generateBriefing.data ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white">{(generateBriefing.data as any)?.title || "Good Morning!"}</h3>
                    <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-500/20">
                      <p className="text-xs font-medium text-amber-400 mb-1">Overnight Summary</p>
                      <p className="text-sm text-gray-300">{(generateBriefing.data as any)?.overnightSummary}</p>
                    </div>
                    {(generateBriefing.data as any)?.actionItems?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-blue-400 mb-2">Today's Action Items</p>
                        {(generateBriefing.data as any).actionItems.map((item: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-gray-800/40 rounded mb-1">
                            <div className="w-5 h-5 rounded-full border border-blue-500/30 flex items-center justify-center text-xs text-blue-400">{i + 1}</div>
                            <span className="text-sm text-gray-300">{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(generateBriefing.data as any)?.opportunities?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-400 mb-2">Opportunities Spotted</p>
                        {(generateBriefing.data as any).opportunities.map((opp: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-green-900/10 rounded mb-1">
                            <Sparkles className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-gray-300">{opp}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(generateBriefing.data as any)?.motivation && (
                      <div className="p-4 rounded-lg bg-purple-900/20 border border-purple-500/20 text-center">
                        <p className="text-sm text-purple-300 italic">"{(generateBriefing.data as any).motivation}"</p>
                        <p className="text-xs text-gray-400 mt-1">— {currentAiName}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Coffee className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Your AI Daily Briefing</p>
                    <p className="text-sm text-gray-400 mt-1">Generate your morning briefing to see what happened overnight and what's planned for today.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="learning">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><GraduationCap className="w-5 h-5 text-emerald-400" /> AI Learning Engine</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400 mb-4">{currentAiName} gets smarter about YOUR specific audience over time. Here's what it has learned:</p>
                {(learningData as any[]).length ? (
                  <div className="space-y-3">
                    {(learningData as any[]).map((l: any) => (
                      <div key={l.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-xs capitalize">{l.category}</Badge>
                          <span className="text-xs text-gray-400">{l.dataPoints} data points • {(l.confidence * 100).toFixed(0)}% confident</span>
                        </div>
                        <p className="text-sm text-white mt-1">{l.insight}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>Applied {l.appliedCount}x</span>
                          <span>Success rate: {(l.successRate * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Brain className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Learning in Progress</p>
                    <p className="text-sm text-gray-400 mt-1">{currentAiName} is continuously learning from your content, audience, and results. Insights will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="defense">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gray-900/60 border-gray-700/30">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" /> Platform Failover Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  {(failoverRules as any[]).length ? (
                    <div className="space-y-2">
                      {(failoverRules as any[]).map((r: any) => (
                        <div key={r.id} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/20">
                          <p className="text-sm text-white">If <span className="text-red-400 capitalize">{r.sourcePlatform}</span> goes down → Redirect to <span className="text-green-400">{(r.targetPlatforms || []).join(", ")}</span></p>
                          <p className="text-xs text-gray-400 mt-1">{r.triggerCondition}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Shield className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-sm">Failover rules will activate automatically if a platform bans or suspends your account.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900/60 border-gray-700/30">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-blue-400" /> Content Insurance Vault</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <BookOpen className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-300 font-medium">Auto-Backup Active</p>
                    <p className="text-sm text-gray-400 mt-1">All content metadata and analytics are automatically backed up. If a platform deletes your content, one click restores it elsewhere.</p>
                    <Badge variant="outline" className="mt-3 border-green-500/30 text-green-400">Protection Active</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
