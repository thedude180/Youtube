import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useAdvisor } from "@/hooks/use-advisor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRef, useEffect } from "react";
import {
  Film, Share2, Search, BarChart3, Palette, DollarSign, Scale,
  Users, Briefcase, TrendingUp, Zap, Loader2, Play,
  Bot, User, Send, Sparkles, Save, Calculator, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type AITab = "agents" | "chat";

const AGENT_ICONS: Record<string, any> = {
  editor: Film, social_manager: Share2, seo_director: Search,
  analytics_director: BarChart3, brand_strategist: Palette, ad_buyer: DollarSign,
  legal_advisor: Scale, community_manager: Users, business_manager: Briefcase,
  growth_strategist: TrendingUp, tax_strategist: Calculator,
};

interface AgentStatus {
  id: string; name: string; role: string; icon: string;
  status: "active" | "idle";
  lastActivity: { action: string; target: string | null; time: string } | null;
  todayActions: number; totalActions: number;
}

interface AgentActivity {
  id: number; agentId: string; action: string; target: string | null;
  status: string;
  details: { description?: string; impact?: string; recommendations?: string[] } | null;
  createdAt: string;
}

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Best upload schedule for gaming?",
  "How to optimize Shorts?",
  "Tips for better thumbnails?",
  "How to grow to 1000 subs?",
];

export default function AIPage() {
  const params = useParams<{ tab?: string }>();
  const validTabs: AITab[] = ["agents", "chat"];
  const initialTab = validTabs.includes(params?.tab as AITab) ? (params.tab as AITab) : "agents";
  const [activeTab, setActiveTab] = useState<AITab>(initialTab);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">AI Team</h1>
        <p className="text-sm text-muted-foreground mt-1">Your autonomous AI agents working 24/7</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AITab)}>
        <TabsList data-testid="tabs-ai">
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="h-3.5 w-3.5 mr-1.5" />Agents
          </TabsTrigger>
          <TabsTrigger value="chat" data-testid="tab-chat">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <ChatTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgentsTab() {
  const { toast } = useToast();
  const { isAdvanced } = useAdvancedMode();

  const { data: agents, isLoading } = useQuery<AgentStatus[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 5000,
  });
  const { data: activities } = useQuery<AgentActivity[]>({
    queryKey: ["/api/agents/activities"],
    refetchInterval: 5000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/trigger`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/activities"] });
      toast({ title: "Task completed", description: data.activity?.action || "Done" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeCount = agents?.filter((a) => a.status === "active").length || 0;

  const agentNameMap: Record<string, string> = {};
  if (agents) for (const a of agents) agentNameMap[a.id] = a.name;

  const lastActivityByAgent: Record<string, AgentActivity> = {};
  if (activities) for (const act of activities) {
    if (!lastActivityByAgent[act.agentId]) lastActivityByAgent[act.agentId] = act;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              {activeCount > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div>
              <p className="text-sm font-medium">{activeCount} of {agents?.length || 0} agents active</p>
              <p className="text-xs text-muted-foreground">AI is handling your content operations</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {(agents || []).map((agent) => {
          const Icon = AGENT_ICONS[agent.id] || Zap;
          const isRunning = triggerMutation.isPending && triggerMutation.variables === agent.id;
          const lastAct = lastActivityByAgent[agent.id];
          return (
            <Card key={agent.id} data-testid={`card-agent-${agent.id}`} className="hover-elevate overflow-visible">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2 shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium truncate">{agent.name}</h3>
                      <div className={`h-2 w-2 rounded-full shrink-0 ${agent.status === "active" ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.role}</p>
                  </div>
                </div>

                {isAdvanced && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{agent.todayActions} today</span>
                    <span>{agent.totalActions} total</span>
                  </div>
                )}

                {lastAct ? (
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{lastAct.action}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 min-h-[2rem]">No recent activity</p>
                )}

                {isAdvanced && (
                  <Button
                    variant="outline" size="sm" className="w-full"
                    disabled={isRunning}
                    onClick={() => triggerMutation.mutate(agent.id)}
                    data-testid={`button-trigger-${agent.id}`}
                  >
                    {isRunning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                    {isRunning ? "Working..." : "Run Task"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isAdvanced && (activities || []).length > 0 && (
        <div>
          <h2 className="text-lg font-display font-bold mb-3">Activity Feed</h2>
          <Card>
            <div className="divide-y divide-border/50">
              {(activities || []).slice(0, 10).map((activity) => (
                <div key={activity.id} className="p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-medium">{agentNameMap[activity.agentId] || activity.agentId?.replace(/_/g, " ")}</span>
                      <Badge variant={activity.status === "completed" ? "default" : "secondary"}>{activity.status}</Badge>
                    </div>
                    <p className="text-sm line-clamp-2">{activity.action}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {activity.createdAt ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true }) : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const advisor = useAdvisor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [ideaInput, setIdeaInput] = useState("");
  const [planResponse, setPlanResponse] = useState("");
  const [planIdeaTitle, setPlanIdeaTitle] = useState("");

  const generatePlan = useMutation({
    mutationFn: async (idea: string) => {
      const question = `Create a complete video production plan for this idea: ${idea}. Include: 1) 5 title options with hooks, 2) a brief video script outline, 3) filming tips, 4) thumbnail concept, 5) best posting time prediction, 6) expected performance prediction.`;
      const res = await apiRequest("POST", "/api/advisor/ask", { question });
      return res.json();
    },
  });

  const saveIdea = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      await apiRequest("POST", "/api/content-ideas", { title: data.title, description: data.description, status: "idea", source: "advisor" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-ideas"] });
      toast({ title: "Saved", description: "Content idea saved." });
    },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (question?: string) => {
    const q = question || input.trim();
    if (!q) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    try {
      const result = await advisor.mutateAsync(q);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-col" style={{ height: "min(60vh, 500px)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Ask your AI strategist anything.</p>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-md">
                {suggestions.map((q, i) => (
                  <Button key={i} variant="outline" size="sm" className="text-left justify-start text-xs text-muted-foreground font-normal h-auto py-2" onClick={() => handleSend(q)} data-testid={`button-suggestion-${i}`}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />}
                <div className={`max-w-[80%] rounded-md px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && <User className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />}
              </div>
            ))
          )}
          {advisor.isPending && (
            <div className="flex gap-2">
              <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />
              <div className="bg-secondary rounded-md px-3 py-2 flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <Textarea
              data-testid="input-chat"
              placeholder="Ask about strategy, SEO, growth..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[40px] max-h-[100px] text-sm"
              rows={1}
            />
            <Button size="icon" onClick={() => handleSend()} disabled={!input.trim() || advisor.isPending} data-testid="button-send">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Idea to Video Plan</h3>
          <Textarea
            data-testid="input-idea"
            placeholder="Describe your video idea..."
            value={ideaInput}
            onChange={(e) => setIdeaInput(e.target.value)}
            className="resize-none text-sm"
            rows={2}
          />
          <Button onClick={() => {
            if (!ideaInput.trim()) return;
            setPlanIdeaTitle(ideaInput);
            setPlanResponse("");
            generatePlan.mutateAsync(ideaInput).then(r => setPlanResponse(r.answer)).catch(() => setPlanResponse("Something went wrong."));
          }} disabled={!ideaInput.trim() || generatePlan.isPending} data-testid="button-generate-plan">
            {generatePlan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate Plan
          </Button>
          {planResponse && (
            <div className="space-y-3">
              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-secondary/30 rounded-md p-4" data-testid="text-plan-response">{planResponse}</div>
              <Button variant="outline" onClick={() => saveIdea.mutate({ title: planIdeaTitle.slice(0, 200), description: planResponse })} disabled={saveIdea.isPending} data-testid="button-save-idea">
                {saveIdea.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save as Content Idea
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
