import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Network, Heart, Trophy, UserPlus, ArrowRightLeft, Megaphone,
  Gift, Star, Target, Sparkles, PartyPopper, MessageCircle, Vote
} from "lucide-react";
import { useState } from "react";

export default function CreatorHub() {
  const [networkName, setNetworkName] = useState("");
  const [networkDesc, setNetworkDesc] = useState("");

  const { data: networks = [] } = useQuery({ queryKey: ["/api/nexus/networks"] });
  const { data: achievements = [] } = useQuery({ queryKey: ["/api/nexus/achievements"] });
  const { data: cloneConfig } = useQuery({ queryKey: ["/api/nexus/creator-clone"] });
  const { data: overlaps = [] } = useQuery({ queryKey: ["/api/nexus/audience-overlaps"] });
  const { data: balanceScore } = useQuery({ queryKey: ["/api/nexus/balance-score"] });
  const { data: marketplace = [] } = useQuery({ queryKey: ["/api/nexus/marketplace"] });

  const createNetwork = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/networks", { name: networkName, description: networkDesc, category: "general" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/networks"] }); setNetworkName(""); setNetworkDesc(""); },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-pink-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-600 to-rose-600 flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Creator Hub</h1>
            <p className="text-sm text-pink-300">Networks, community, achievements & creator ecosystem</p>
          </div>
        </div>

        <Tabs defaultValue="networks" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1 flex-wrap">
            <TabsTrigger value="networks" data-testid="tab-networks">Creator Networks</TabsTrigger>
            <TabsTrigger value="achievements" data-testid="tab-achievements">Achievements</TabsTrigger>
            <TabsTrigger value="clone" data-testid="tab-clone">AI Creator Clone</TabsTrigger>
            <TabsTrigger value="marketplace" data-testid="tab-marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="collab" data-testid="tab-collab">Collaboration Radar</TabsTrigger>
            <TabsTrigger value="wellness" data-testid="tab-wellness">Creator Wellness</TabsTrigger>
          </TabsList>

          <TabsContent value="networks" className="space-y-4">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Network className="w-5 h-5 text-pink-400" /> Create a Network</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Network name" value={networkName} onChange={(e) => setNetworkName(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-network-name" />
                <Textarea placeholder="Description" value={networkDesc} onChange={(e) => setNetworkDesc(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" />
                <Button onClick={() => createNetwork.mutate()} disabled={createNetwork.isPending || !networkName} data-testid="button-create-network">
                  <Network className="w-4 h-4 mr-1" /> Create Network
                </Button>
              </CardContent>
            </Card>
            {(networks as any[]).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(networks as any[]).map((n: any) => (
                  <Card key={n.id} className="bg-gray-900/60 border-gray-700/30">
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
              <div className="text-center py-8 text-gray-400">Create your first creator network to start collaborating and cross-promoting.</div>
            )}
          </TabsContent>

          <TabsContent value="achievements">
            <Card className="bg-gray-900/60 border-gray-700/30">
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
                    <div key={i} className={`relative p-4 rounded-xl border text-center ${achievement.unlocked ? "bg-gray-800/60 border-yellow-500/30" : "bg-gray-900/40 border-gray-700/20 opacity-50"}`}>
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
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-violet-400" /> AI Creator Clone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400">Your AI clone engages fans when you're away — responding in your style, answering questions, and keeping the community active.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <MessageCircle className="w-8 h-8 text-violet-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">{(cloneConfig as any)?.cloneName || "AI Assistant"}</p>
                    <Badge variant="outline" className={`mt-1 text-xs ${(cloneConfig as any)?.isActive ? "border-green-500/30 text-green-400" : "border-gray-500/30 text-gray-400"}`}>{(cloneConfig as any)?.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <Users className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{(cloneConfig as any)?.totalInteractions || 0}</p>
                    <p className="text-xs text-gray-400">Total Interactions</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <Heart className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{((cloneConfig as any)?.satisfactionScore || 0).toFixed(0)}%</p>
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
                  <div className="text-center py-12 text-gray-400">The creator marketplace connects you with services like editing, thumbnails, and collabs. Coming soon!</div>
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
                  <div className="text-center py-12 text-gray-400">AI is scanning for perfect collaboration matches based on your audience and content style.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wellness">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Heart className="w-5 h-5 text-red-400" /> Creator Wellness</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20">
                    <div className="text-4xl font-bold text-white mb-1">{(balanceScore as any)?.balanceScore || 50}</div>
                    <p className="text-sm text-gray-400">Life-Content Balance</p>
                    <div className="w-full h-2 bg-gray-700 rounded-full mt-3">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${(balanceScore as any)?.balanceScore || 50}%` }} />
                    </div>
                  </div>
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20">
                    <div className="text-4xl font-bold text-white mb-1">{(balanceScore as any)?.workHoursWeekly || 0}h</div>
                    <p className="text-sm text-gray-400">Weekly Work Hours</p>
                  </div>
                  <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/20">
                    <div className="text-4xl font-bold text-white mb-1 capitalize">{(balanceScore as any)?.stressLevel || "normal"}</div>
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
