import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Inbox, KanbanSquare, FolderOpen, FileBarChart, Mail, Bot, ShoppingBag,
  DollarSign, MessageSquare, Plus, Star, Upload, Download
} from "lucide-react";
import { useState } from "react";

export default function Workspace() {
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("intro");

  const { data: inboxMessages = [], isLoading } = useQuery({ queryKey: ["/api/nexus/team-inbox"] });
  const { data: assets = [] } = useQuery({ queryKey: ["/api/nexus/asset-library"] });
  const { data: reports = [] } = useQuery({ queryKey: ["/api/nexus/reports"] });
  const { data: emailLists = [] } = useQuery({ queryKey: ["/api/nexus/email-lists"] });
  const { data: botConfig } = useQuery({ queryKey: ["/api/nexus/discord-bot"] });
  const { data: merchItems = [] } = useQuery({ queryKey: ["/api/nexus/merch"] });
  const { data: tips = [] } = useQuery({ queryKey: ["/api/nexus/tips"] });

  const addAsset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/asset-library", { name: assetName, assetType, category: "general", tags: [] }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/asset-library"] }); setAssetName(""); },
  });

  const unreadCount = (inboxMessages as any[]).filter((m: any) => !m.isRead).length;
  const totalTips = (tips as any[]).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-950/20 to-gray-950 p-6" data-testid="page-workspace">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center">
            <KanbanSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Workspace</h1>
            <p className="text-sm text-slate-300" data-testid="text-page-subtitle">Productivity tools — inbox, assets, reports, email & integrations</p>
          </div>
        </div>

        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1 flex-wrap">
            <TabsTrigger value="inbox" data-testid="tab-inbox" className="relative">
              Team Inbox {unreadCount > 0 && <span className="ml-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">{unreadCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="assets" data-testid="tab-assets">Asset Library</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">Email Lists</TabsTrigger>
            <TabsTrigger value="discord" data-testid="tab-discord">Discord Bot</TabsTrigger>
            <TabsTrigger value="merch" data-testid="tab-merch">Merch Store</TabsTrigger>
            <TabsTrigger value="tips" data-testid="tab-tips">Tips & Donations</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Inbox className="w-5 h-5 text-blue-400" /> Team Inbox</CardTitle>
              </CardHeader>
              <CardContent>
                {(inboxMessages as any[]).length ? (
                  <div className="space-y-2">
                    {(inboxMessages as any[]).map((msg: any) => (
                      <div key={msg.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!msg.isRead ? "bg-blue-900/10 border-blue-500/20" : "bg-gray-800/40 border-gray-700/20"}`} data-testid={`inbox-message-${msg.id}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{msg.senderName?.charAt(0) || "?"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{msg.senderName}</span>
                            <Badge variant="outline" className="text-xs capitalize">{msg.platform}</Badge>
                            <Badge variant="outline" className="text-xs capitalize">{msg.messageType}</Badge>
                          </div>
                          <p className="text-sm text-gray-300 truncate">{msg.content}</p>
                        </div>
                        {msg.aiSuggestedReply && (
                          <Button size="sm" variant="outline" className="text-xs border-green-500/30 text-green-400">
                            <MessageSquare className="w-3 h-3 mr-1" /> AI Reply
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">Your unified inbox collects DMs, comments, and mentions from all platforms with AI-suggested replies.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><FolderOpen className="w-5 h-5 text-amber-400" /> Asset Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Input placeholder="Asset name" value={assetName} onChange={(e) => setAssetName(e.target.value)} className="bg-gray-800/60 border-gray-700/30 text-white" data-testid="input-asset-name" />
                  <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="bg-gray-800/60 border border-gray-700/30 rounded-md px-3 text-white text-sm" data-testid="select-asset-type">
                    <option value="intro">Intro</option>
                    <option value="outro">Outro</option>
                    <option value="overlay">Overlay</option>
                    <option value="music">Music</option>
                    <option value="sound_effect">Sound Effect</option>
                    <option value="thumbnail_template">Thumbnail Template</option>
                    <option value="brand_kit">Brand Kit</option>
                  </select>
                  <Button onClick={() => addAsset.mutate()} disabled={!assetName} data-testid="button-add-asset">
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
                {(assets as any[]).length ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(assets as any[]).map((asset: any) => (
                      <div key={asset.id} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center" data-testid={`asset-item-${asset.id}`}>
                        <FolderOpen className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-white truncate">{asset.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{asset.assetType?.replace("_", " ")}</p>
                        <p className="text-xs text-gray-500">v{asset.version} • Used {asset.usageCount}x</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FolderOpen className="w-12 h-12 text-amber-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Assets in Library</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Add intros, outros, overlays, music, and brand assets to your centralized library using the form above.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><FileBarChart className="w-5 h-5 text-indigo-400" /> Custom Report Builder</CardTitle>
              </CardHeader>
              <CardContent>
                {(reports as any[]).length ? (
                  <div className="space-y-3">
                    {(reports as any[]).map((report: any) => (
                      <div key={report.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`report-item-${report.id}`}>
                        <div>
                          <p className="text-sm font-medium text-white">{report.name}</p>
                          <p className="text-xs text-gray-400">{report.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">{report.exportFormat?.toUpperCase()}</Badge>
                          <Button size="sm" variant="outline"><Download className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileBarChart className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Custom Report Builder</p>
                    <p className="text-sm text-gray-400 mt-1">Build custom reports with drag-and-drop metrics, export to PDF/CSV, and schedule automated email reports.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Mail className="w-5 h-5 text-cyan-400" /> Email List Builder</CardTitle>
              </CardHeader>
              <CardContent>
                {(emailLists as any[]).length ? (
                  <div className="space-y-3">
                    {(emailLists as any[]).map((list: any) => (
                      <div key={list.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`email-list-${list.id}`}>
                        <div>
                          <p className="text-sm font-medium text-white">{list.name}</p>
                          <p className="text-xs text-gray-400">{list.subscriberCount} subscribers</p>
                        </div>
                        <Badge variant="outline" className={list.status === "active" ? "border-green-500/30 text-green-400" : "border-gray-500/30"}>
                          {list.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Mail className="w-12 h-12 text-cyan-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Email List Builder</p>
                    <p className="text-sm text-gray-400 mt-1">Capture emails from viewers, auto-segment lists, and send AI-crafted newsletters to your audience.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discord">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Bot className="w-5 h-5 text-indigo-400" /> Discord Bot Manager</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <Bot className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">{(botConfig as any)?.botName || "CreatorBot"}</p>
                    <Badge variant="outline" className={`mt-1 text-xs ${(botConfig as any)?.isActive ? "border-green-500/30 text-green-400" : "border-gray-500/30"}`}>{(botConfig as any)?.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <p className="text-sm text-gray-400">Auto-Moderation</p>
                    <p className="text-lg font-bold text-white">{(botConfig as any)?.autoModeration ? "Enabled" : "Disabled"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20 text-center">
                    <p className="text-sm text-gray-400">Command Prefix</p>
                    <p className="text-lg font-bold text-white">{(botConfig as any)?.commandPrefix || "!"}</p>
                  </div>
                </div>
                {(botConfig as any)?.welcomeMessage && (
                  <div className="p-3 mt-4 rounded-lg bg-indigo-900/20 border border-indigo-500/20">
                    <p className="text-xs text-indigo-400 mb-1">Welcome Message</p>
                    <p className="text-sm text-gray-300">{(botConfig as any).welcomeMessage}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="merch">
            <Card className="card-empire border-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-pink-400" /> Merch Store</CardTitle>
              </CardHeader>
              <CardContent>
                {(merchItems as any[]).length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {(merchItems as any[]).map((item: any) => (
                      <div key={item.id} className="p-4 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`merch-item-${item.id}`}>
                        <ShoppingBag className="w-8 h-8 text-pink-400 mb-2" />
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-lg font-bold text-green-400">${item.price}</p>
                        <p className="text-xs text-gray-400">{item.totalSold} sold • ${item.totalRevenue?.toFixed(2)} revenue</p>
                        {item.autoPromote && <Badge className="mt-1 text-xs bg-purple-600">Auto-Promote</Badge>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <ShoppingBag className="w-12 h-12 text-pink-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Merch Store Integration</p>
                    <p className="text-sm text-gray-400 mt-1">Track merch sales, get AI suggestions for new products, and auto-promote during streams.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips">
            <Card className="card-empire border-0">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" /> Tips & Donations</CardTitle>
                  <Badge variant="outline" className="border-green-500/30 text-green-400 text-lg px-3">${totalTips.toFixed(2)} total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {(tips as any[]).length ? (
                  <div className="space-y-2">
                    {(tips as any[]).map((tip: any) => (
                      <div key={tip.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40" data-testid={`tip-item-${tip.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">{tip.donorName?.charAt(0) || "$"}</div>
                          <div>
                            <p className="text-sm text-white">{tip.donorName || "Anonymous"}</p>
                            <p className="text-xs text-gray-400 capitalize">{tip.platform}</p>
                          </div>
                        </div>
                        <span className="text-lg font-bold text-green-400">${tip.amount?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <DollarSign className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Tip & Donation Aggregator</p>
                    <p className="text-sm text-gray-400 mt-1">Unified view of all tips across every platform with top supporter leaderboards.</p>
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
