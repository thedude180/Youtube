import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, Network, Heart, Trophy, UserPlus, ArrowRightLeft, Megaphone,
  Gift, Star, Target, Sparkles, PartyPopper, MessageCircle, Vote,
  FileText, TrendingUp, DollarSign, PieChart, Activity, Briefcase, ChevronRight, CheckCircle, AlertCircle
} from "lucide-react";
import { useState } from "react";

export default function CreatorHub() {
  const { user } = useAuth();
  const userId = user?.id;
  const [networkName, setNetworkName] = useState("");
  const [networkDesc, setNetworkDesc] = useState("");

  const { data: reportCard } = useQuery({ 
    queryKey: ["/api/creator/report-card", userId],
    enabled: !!userId 
  });
  const { data: valuation } = useQuery({ 
    queryKey: ["/api/creator/valuation", userId],
    enabled: !!userId 
  });
  const { data: financials } = useQuery({ 
    queryKey: ["/api/creator/burn-rate", userId],
    enabled: !!userId 
  });

  const { data: networks = [], isLoading } = useQuery({ queryKey: ["/api/nexus/networks"] });
  const { data: achievements = [] } = useQuery({ queryKey: ["/api/nexus/achievements"] });
  const { data: cloneConfig } = useQuery({ queryKey: ["/api/nexus/creator-clone"] });
  const { data: overlaps = [] } = useQuery({ queryKey: ["/api/nexus/audience-overlaps"] });
  const { data: balanceScore } = useQuery({ queryKey: ["/api/nexus/balance-score"] });
  const { data: marketplace = [] } = useQuery({ queryKey: ["/api/nexus/marketplace"] });

  const createNetwork = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/networks", { name: networkName, description: networkDesc, category: "general" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/networks"] }); setNetworkName(""); setNetworkDesc(""); },
  });

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-pink-950/20 to-gray-950 p-6" data-testid="page-creator-hub">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-600 to-rose-600 flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Creator Hub</h1>
            <p className="text-sm text-pink-300" data-testid="text-page-subtitle">Networks, community, achievements & creator ecosystem</p>
          </div>
        </div>

        <Tabs defaultValue="report-card" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1 flex-wrap">
            <TabsTrigger value="report-card" data-testid="tab-report-card">Report Card</TabsTrigger>
            <TabsTrigger value="valuation" data-testid="tab-valuation">Valuation</TabsTrigger>
            <TabsTrigger value="financials" data-testid="tab-financials">Financials</TabsTrigger>
            <TabsTrigger value="networks" data-testid="tab-networks">Creator Networks</TabsTrigger>
            <TabsTrigger value="achievements" data-testid="tab-achievements">Achievements</TabsTrigger>
            <TabsTrigger value="clone" data-testid="tab-clone">AI Creator Clone</TabsTrigger>
            <TabsTrigger value="marketplace" data-testid="tab-marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="collab" data-testid="tab-collab">Collaboration Radar</TabsTrigger>
            <TabsTrigger value="wellness" data-testid="tab-wellness">Creator Wellness</TabsTrigger>
          </TabsList>

          <TabsContent value="report-card" className="space-y-4">
            {reportCard && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-purple-500/20">
                      {reportCard.overallGrade}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Creator Report Card</h2>
                      <p className="text-gray-400">Month of {reportCard.month}</p>
                    </div>
                  </div>
                  <div className="bg-gray-900/60 border border-gray-700/30 rounded-xl p-4 text-center min-w-[120px]">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Overall Score</p>
                    <p className="text-3xl font-bold text-purple-400">{reportCard.score}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {reportCard.kpis.map((kpi: any, idx: number) => (
                    <Card key={idx} className="bg-gray-900/60 border-gray-700/30 hover-elevate" data-testid={`kpi-card-${idx}`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm text-gray-400">{kpi.name}</p>
                          <Badge variant="outline" className={`
                            ${kpi.grade === 'A' ? 'border-green-500 text-green-400' : 
                              kpi.grade === 'B' ? 'border-blue-500 text-blue-400' :
                              kpi.grade === 'C' ? 'border-yellow-500 text-yellow-400' : 'border-red-500 text-red-400'}
                          `}>
                            {kpi.grade}
                          </Badge>
                        </div>
                        <p className="text-xl font-bold text-white">{kpi.value}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs ${kpi.trend.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                            {kpi.trend}
                          </span>
                          <span className="text-[10px] text-gray-500">vs {kpi.benchmark} bench</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" /> Top Wins
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {reportCard.topWins.map((win: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-200">{win}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-400" /> Opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {reportCard.topOpportunities.map((opp: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                          <AlertCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-200">{opp}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="valuation" className="space-y-6">
            {valuation && (
              <div className="space-y-6">
                <Card className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border-purple-500/30">
                  <CardContent className="p-8 text-center">
                    <p className="text-sm text-purple-300 uppercase tracking-widest mb-2 font-medium">Estimated Creator Net Worth</p>
                    <h2 className="text-6xl md:text-7xl font-bold text-white tracking-tight mb-4" data-testid="text-valuation-total">
                      {valuation.estimatedValue}
                    </h2>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-full max-w-md h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: '65%' }} />
                      </div>
                      <div className="flex justify-between w-full max-w-md text-xs text-gray-500">
                        <span>Low: {valuation.valueRange.low}</span>
                        <span>Mid: {valuation.valueRange.mid}</span>
                        <span>High: {valuation.valueRange.high}</span>
                      </div>
                      <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                        Methodology: {valuation.methodology}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-400 font-medium uppercase tracking-wider">Revenue Multiple</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-white">{valuation.multiples.revenueMultiple}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-400 font-medium uppercase tracking-wider">Audience Multiple</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-white">{valuation.multiples.audienceMultiple}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-400 font-medium uppercase tracking-wider">Growth Multiple</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-white">{valuation.multiples.growthMultiple}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" /> Valuation Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {valuation.breakdown.map((item: any, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">{item.factor}</span>
                            <span className="text-white font-medium">{item.contribution}</span>
                          </div>
                          <Progress value={item.weight * 100} className="h-1.5" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-400" /> Market Comparables
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {valuation.comparables.map((comp: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40 border border-gray-700/20">
                            <div>
                              <p className="text-sm font-medium text-white">{comp.channel}</p>
                              <p className="text-xs text-gray-500">{comp.size}</p>
                            </div>
                            <p className="text-sm font-bold text-purple-400">{comp.valuation}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-6">
            {financials && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wider">Monthly Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-green-400">{financials.monthlyRevenue}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wider">Monthly Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-red-400">{financials.monthlyExpenses}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wider">Net Profit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-blue-400">{financials.netProfit}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wider">Profit Margin</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-purple-400">{financials.profitMargin}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-red-400" /> Expense Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {financials.expensesByCategory.map((cat: any, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">{cat.category}</span>
                            <span className="text-white font-medium">{cat.amount} ({cat.percentage}%)</span>
                          </div>
                          <Progress value={cat.percentage} className="h-1.5 bg-gray-800" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-900/60 border-gray-700/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-400" /> Financial Trends
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-purple-500/20">
                          <div>
                            <p className="text-xs text-gray-400 uppercase">Revenue Per Hour</p>
                            <p className="text-2xl font-bold text-white">{financials.revenuePerHour}</p>
                          </div>
                          <Activity className="w-8 h-8 text-purple-400 opacity-50" />
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Last 6 Months</p>
                          <div className="flex items-end justify-between h-24 gap-1 px-2">
                            {financials.trends.map((t: any, i: number) => (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div className="w-full bg-blue-500/20 rounded-t-sm hover:bg-blue-500/40 transition-colors" style={{ height: `${(t.revenue / 50000) * 100}%` }} />
                                <div className="w-full bg-red-500/20 rounded-t-sm hover:bg-red-500/40 transition-colors -mt-1" style={{ height: `${(t.expenses / 50000) * 100}%` }} />
                                <span className="text-[10px] text-gray-600 uppercase">{t.month}</span>
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 p-2 rounded hidden group-hover:block z-10 whitespace-nowrap">
                                  <p className="text-xs text-green-400">Rev: {t.revenue}</p>
                                  <p className="text-xs text-red-400">Exp: {t.expenses}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="networks" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Network className="w-5 h-5 text-pink-400" /> Create a Network</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Network name" value={networkName} onChange={(e) => setNetworkName(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-network-name" />
                <Textarea placeholder="Description" value={networkDesc} onChange={(e) => setNetworkDesc(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-network-desc" />
                <Button onClick={() => createNetwork.mutate()} disabled={createNetwork.isPending || !networkName} data-testid="button-create-network">
                  <Network className="w-4 h-4 mr-1" /> Create Network
                </Button>
              </CardContent>
            </Card>
            {(networks as any[]).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(networks as any[]).map((n: any) => (
                  <Card key={n.id} className="bg-gray-900/60 border-gray-700/30" data-testid={`card-network-${n.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center">
                          <Network className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{n.name}</p>
                          <p className="text-xs text-gray-400">{n.memberCount} members</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-300">{n.description}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{n.category}</Badge>
                        {n.crossPromotionEnabled && <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">Cross-Promo Active</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Network className="w-12 h-12 text-pink-400 mx-auto mb-3 opacity-60" />
                <p className="text-gray-300 font-medium">No Creator Networks Yet</p>
                <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Create your first creator network to start collaborating and cross-promoting with other creators in your niche.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="achievements">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-achievements">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> Achievement System</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { icon: Star, title: "First Upload", desc: "Upload your first piece of content", unlocked: true, color: "from-yellow-600 to-amber-600" },
                    { icon: Users, title: "Community Builder", desc: "Reach 100 subscribers", unlocked: false, color: "from-blue-600 to-indigo-600" },
                    { icon: Trophy, title: "Viral Hit", desc: "Get 10K views on a single video", unlocked: false, color: "from-purple-600 to-pink-600" },
                    { icon: Heart, title: "Fan Favorite", desc: "Reach 90%+ positive sentiment", unlocked: false, color: "from-red-600 to-rose-600" },
                    { icon: Target, title: "Consistency King", desc: "Post 30 days in a row", unlocked: false, color: "from-green-600 to-emerald-600" },
                    { icon: Gift, title: "Monetized", desc: "Earn your first dollar", unlocked: false, color: "from-cyan-600 to-teal-600" },
                    { icon: Megaphone, title: "Multi-Platform", desc: "Active on 3+ platforms", unlocked: false, color: "from-orange-600 to-red-600" },
                    { icon: PartyPopper, title: "1K Club", desc: "Reach 1,000 subscribers", unlocked: false, color: "from-pink-600 to-purple-600" },
                  ].map((achievement, i) => (
                    <div key={i} className={`relative p-4 rounded-xl border text-center ${achievement.unlocked ? "bg-gray-800/60 border-yellow-500/30" : "bg-gray-900/40 border-gray-700/20 opacity-50"}`} data-testid={`achievement-${i}`}>
                      <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center bg-gradient-to-br ${achievement.color}`}>
                        <achievement.icon className="w-6 h-6 text-white" />
                      </div>
                      <p className="text-sm font-medium text-white">{achievement.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{achievement.desc}</p>
                      {achievement.unlocked && <Badge className="absolute top-2 right-2 bg-yellow-600 text-xs">Unlocked</Badge>}
                    </div>
                  ))}
                </div>
                {(achievements as any[]).length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-sm font-medium text-white">Recent Celebrations</h3>
                    {(achievements as any[]).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/40">
                        <PartyPopper className="w-5 h-5 text-yellow-400" />
                        <div>
                          <p className="text-sm text-white">{a.title}</p>
                          <p className="text-xs text-gray-400">{a.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clone">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-ai-clone">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-violet-400" /> AI Creator Clone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">Your AI clone engages fans when you're away — responding in your style, answering questions, and keeping the community active.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <MessageCircle className="w-8 h-8 text-violet-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white" data-testid="text-clone-name">{(cloneConfig as any)?.cloneName || "AI Assistant"}</p>
                    <Badge variant="outline" className={`mt-1 text-xs ${(cloneConfig as any)?.isActive ? "border-green-500/30 text-green-400" : "border-gray-500/30 text-gray-400"}`} data-testid="badge-clone-status">{(cloneConfig as any)?.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <Users className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white" data-testid="text-clone-interactions">{(cloneConfig as any)?.totalInteractions || 0}</p>
                    <p className="text-xs text-gray-400">Total Interactions</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <Heart className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white" data-testid="text-clone-satisfaction">{((cloneConfig as any)?.satisfactionScore || 0).toFixed(0)}%</p>
                    <p className="text-xs text-gray-400">Satisfaction Rate</p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-violet-900/20 border border-violet-500/20">
                  <p className="text-sm text-violet-300">Personality: <span className="text-white capitalize">{(cloneConfig as any)?.personality || "friendly"}</span></p>
                  <p className="text-sm text-violet-300 mt-1">Style: <span className="text-white capitalize">{(cloneConfig as any)?.communicationStyle || "casual"}</span></p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marketplace">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Gift className="w-5 h-5 text-emerald-400" /> Creator Marketplace</CardTitle>
              </CardHeader>
              <CardContent>
                {(marketplace as any[]).length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(marketplace as any[]).map((listing: any) => (
                      <div key={listing.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-white">{listing.title}</p>
                          <span className="text-lg font-bold text-green-400">${listing.price}</span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">{listing.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{listing.category}</Badge>
                          <span className="text-xs text-gray-400">{listing.deliveryDays} day delivery</span>
                          {listing.rating > 0 && <span className="text-xs text-yellow-400">★ {listing.rating.toFixed(1)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Gift className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">Marketplace is Empty</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">The creator marketplace connects you with services like editing, thumbnails, and collabs. Listings will appear as the community grows.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collab">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><UserPlus className="w-5 h-5 text-cyan-400" /> Collaboration Radar</CardTitle>
              </CardHeader>
              <CardContent>
                {(overlaps as any[]).length ? (
                  <div className="space-y-3">
                    {(overlaps as any[]).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold">{o.creatorName?.charAt(0)}</div>
                          <div>
                            <p className="text-sm font-medium text-white">{o.creatorName}</p>
                            <p className="text-xs text-gray-400">{o.creatorPlatform} • {o.sharedViewers} shared viewers</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-cyan-400">{(o.collabPotential * 100).toFixed(0)}%</p>
                          <p className="text-xs text-gray-400">Collab Match</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <UserPlus className="w-12 h-12 text-cyan-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Collaboration Matches Yet</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">AI is scanning for perfect collaboration matches based on your audience and content style. Potential partners will appear here with compatibility scores.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wellness">
            <Card className="bg-gray-900/60 border-gray-700/30" data-testid="card-wellness">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Heart className="w-5 h-5 text-red-400" /> Creator Wellness</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20" data-testid="stat-balance-score">
                    <div className="text-4xl font-bold text-white mb-1" data-testid="text-balance-score">{(balanceScore as any)?.balanceScore || 50}</div>
                    <p className="text-sm text-gray-400">Life-Content Balance</p>
                    <div className="w-full h-2 bg-gray-700 rounded-full mt-3">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${(balanceScore as any)?.balanceScore || 50}%` }} />
                    </div>
                  </div>
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20" data-testid="stat-work-hours">
                    <div className="text-4xl font-bold text-white mb-1" data-testid="text-work-hours">{(balanceScore as any)?.workHoursWeekly || 0}h</div>
                    <p className="text-sm text-gray-400">Weekly Work Hours</p>
                  </div>
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20" data-testid="stat-stress-level">
                    <div className="text-4xl font-bold text-white mb-1 capitalize" data-testid="text-stress-level">{(balanceScore as any)?.stressLevel || "normal"}</div>
                    <p className="text-sm text-gray-400">Stress Level</p>
                    {(balanceScore as any)?.breakSuggested && <Badge className="mt-2 bg-amber-600 text-xs">Break Suggested</Badge>}
                  </div>
                </div>
                {(balanceScore as any)?.recommendation && (
                  <div className="p-4 mt-4 rounded-lg bg-blue-900/20 border border-blue-500/20">
                    <p className="text-sm text-blue-300">{(balanceScore as any).recommendation}</p>
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
