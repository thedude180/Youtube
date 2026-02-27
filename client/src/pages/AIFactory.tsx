import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Sparkles, 
  Zap, 
  Target, 
  BarChart3, 
  Share2, 
  Settings2, 
  TrendingUp, 
  Dna, 
  Search, 
  Video, 
  MessageSquare, 
  ShieldAlert, 
  Users, 
  Mail, 
  FileSearch, 
  MonitorPlay,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from "lucide-react";

export default function AIFactory() {
  const { user } = useAuth();
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Content copied to clipboard.",
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-background">
      <header className="card-empire rounded-xl p-6 relative overflow-hidden">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/15 rounded-xl border border-purple-500/20 shadow-lg shadow-purple-500/10">
              <Sparkles className="w-8 h-8 text-purple-400" style={{ filter: "drop-shadow(0 0 8px hsl(265 80% 60% / 0.6))" }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold holographic-text tracking-tight">
                AI Content Factory
              </h1>
              <p className="text-muted-foreground text-sm">
                20 AI-powered tools to dominate every platform
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 sm:ml-auto">
            {[
              { label: "AI Tools", value: "20", color: "text-primary", bg: "bg-primary/10" },
              { label: "Platforms", value: "10+", color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "Status", value: "READY", color: "text-emerald-400", bg: "bg-emerald-500/10" },
            ].map(stat => (
              <div key={stat.label} className={`px-3 py-2 rounded-lg border border-white/5 ${stat.bg} flex flex-col items-center min-w-[64px]`}>
                <span className={`text-base font-bold metric-display ${stat.color}`}>{stat.value}</span>
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-emerald-400 font-mono">All AI models online and operational</span>
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">OpenAI GPT-4o · Last sync: just now</span>
        </div>
      </header>

      <Tabs defaultValue="title-hooks" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/50 border">
          <TabsTrigger value="title-hooks" className="py-2.5">Title & Hooks</TabsTrigger>
          <TabsTrigger value="strategy" className="py-2.5">Content Strategy</TabsTrigger>
          <TabsTrigger value="viral" className="py-2.5">Viral & Analytics</TabsTrigger>
          <TabsTrigger value="distribution" className="py-2.5">Distribution</TabsTrigger>
          <TabsTrigger value="advanced" className="py-2.5">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="title-hooks" className="mt-6 space-y-6">
          <TitleSwarm />
          <HookGenerator />
          <DescriptionOptimizer />
        </TabsContent>

        <TabsContent value="strategy" className="mt-6 space-y-6">
          <TrendInterceptor />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CompetitorDNA />
            <ContentDNA />
          </div>
          <NicheAnalyzer />
        </TabsContent>

        <TabsContent value="viral" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ViralPredictor />
            <RetentionAnalyzer />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ThumbnailAB />
            <UploadTimeOptimizer />
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6 space-y-6">
          <HashtagStrategy />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CaptionGenerator />
            <CommunityPostGenerator />
          </div>
          <ShortsStrategy />
        </TabsContent>

        <TabsContent value="advanced" className="mt-6 space-y-6">
          <DemonetizationRisk />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AudiencePsychographics />
            <CollabPitchWriter />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ContentAudit />
            <EndScreenOptimizer />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Tab 1: Title & Hooks ---

function TitleSwarm() {
  const [results, setResults] = useState<any[]>([]);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/title-optimizer", data);
      return res.json();
    },
    onSuccess: (data) => setResults(data.optimizedTitles || []),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Title Swarm
        </CardTitle>
        <CardDescription>Optimize your titles for maximum CTR and engagement</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Current Title</Label>
            <Input id="title" name="title" placeholder="Enter your working title..." required data-testid="input-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="niche">Niche</Label>
            <Input id="niche" name="niche" placeholder="Gaming, Tech, etc." required data-testid="input-niche" />
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="button-swarm">
            {mutation.isPending ? "Optimizing..." : "Swarm Titles"}
          </Button>
        </form>

        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((item, i) => (
              <Card key={i} className="bg-muted/30 border-purple-500/10">
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <p className="font-semibold text-lg">{item.title}</p>
                    <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">
                      {item.ctrScore}% CTR
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Emotional Impact</span>
                        <span>{item.emotionalScore}%</span>
                      </div>
                      <Progress value={item.emotionalScore} className="h-1" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Curiosity Gap</span>
                        <span>{item.curiosityScore}%</span>
                      </div>
                      <Progress value={item.curiosityScore} className="h-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HookGenerator() {
  const [results, setResults] = useState<any[]>([]);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/hook-generator", data);
      return res.json();
    },
    onSuccess: (data) => setResults(data.hooks || []),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-red-400" />
          Hook Generator
        </CardTitle>
        <CardDescription>Stop the scroll with high-retention video openers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="videoTitle">Video Topic</Label>
            <Input id="videoTitle" name="title" placeholder="How to..." required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetEmotion">Target Emotion</Label>
            <Select name="targetEmotion" defaultValue="curiosity">
              <SelectTrigger>
                <SelectValue placeholder="Select emotion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="curiosity">Curiosity</SelectItem>
                <SelectItem value="fear">Fear of Missing Out</SelectItem>
                <SelectItem value="excitement">Excitement</SelectItem>
                <SelectItem value="controversy">Controversy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="videoLength">Video Type</Label>
            <Select name="videoLength" defaultValue="short">
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short/TikTok (&lt; 60s)</SelectItem>
                <SelectItem value="long">Long Form (&gt; 5m)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            Generate Hooks
          </Button>
        </form>

        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {results.map((hook, i) => (
              <Card key={i} className="bg-muted/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <Badge variant="outline">{hook.style}</Badge>
                    <span className="text-xs text-green-400">+{hook.retentionBoost}% Retention</span>
                  </div>
                  <p className="text-sm italic">"{hook.text}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DescriptionOptimizer() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/description-optimizer", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-blue-400" />
          Description Optimizer
        </CardTitle>
        <CardDescription>SEO-ready descriptions that convert viewers into subscribers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input name="title" placeholder="Video Title" required />
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select name="platform" defaultValue="youtube">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Current Description / Draft</Label>
            <Textarea name="description" placeholder="Paste your draft or key points here..." className="min-h-[100px]" required />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Optimize Description
          </Button>
        </form>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Optimized Result</h4>
              <Badge variant="secondary">SEO Score: {result.seoScore}/100</Badge>
            </div>
            <div className="relative group">
              <Textarea value={result.optimizedDescription} readOnly className="min-h-[200px] bg-muted/20" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => navigator.clipboard.writeText(result.optimizedDescription)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.hashtags?.map((tag: string, i: number) => (
                <Badge key={i} variant="outline" className="text-blue-400 border-blue-400/30">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Tab 2: Content Strategy ---

function TrendInterceptor() {
  const [trends, setTrends] = useState<any[]>([]);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/trend-detector", data);
      return res.json();
    },
    onSuccess: (data) => setTrends(data.trends || []),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Trend Interceptor
        </CardTitle>
        <CardDescription>Predict viral waves before they hit the mainstream</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <Label>Niche</Label>
            <Input name="niche" placeholder="AI, Finance, etc." required />
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select name="platform" defaultValue="youtube">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="twitter">X (Twitter)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Region</Label>
            <Select name="region" defaultValue="global">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="us">USA</SelectItem>
                <SelectItem value="uk">UK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Analyzing..." : "Find Trends"}
          </Button>
        </form>

        {trends.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trends.map((trend, i) => (
              <Card key={i} className="bg-muted/30 border-green-500/10 overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <h5 className="font-bold">{trend.topic}</h5>
                    <Badge className="bg-green-500/20 text-green-300">Score: {trend.score}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    Growth: {trend.growth}% | Competition: {trend.competition}
                  </div>
                  <p className="text-sm text-muted-foreground">{trend.ideas?.[0]}</p>
                  <div className="pt-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Peak Window</span>
                    <div className="text-xs">{trend.peakWindow}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorDNA() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/competitor-deep-dive", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dna className="w-5 h-5 text-indigo-400" />
          Competitor DNA
        </CardTitle>
        <CardDescription>Deconstruct rival strategies and find their blind spots</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Competitor Name/Channel</Label>
            <Input name="competitorName" placeholder="Enter competitor name" required />
          </div>
          <div className="space-y-2">
            <Label>Niche</Label>
            <Input name="niche" placeholder="Tech, Lifestyle, etc." required />
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            Analyze DNA
          </Button>
        </form>

        {result && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <span className="text-[10px] font-bold uppercase text-green-400">Strengths</span>
              <ul className="text-xs mt-1 space-y-1">
                {result.swot.strengths.slice(0, 2).map((s: string, i: number) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <span className="text-[10px] font-bold uppercase text-red-400">Weaknesses</span>
              <ul className="text-xs mt-1 space-y-1">
                {result.swot.weaknesses.slice(0, 2).map((s: string, i: number) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <span className="text-[10px] font-bold uppercase text-blue-400">Opportunities</span>
              <ul className="text-xs mt-1 space-y-1">
                {result.swot.opportunities.slice(0, 2).map((s: string, i: number) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <span className="text-[10px] font-bold uppercase text-orange-400">Threats</span>
              <ul className="text-xs mt-1 space-y-1">
                {result.swot.threats.slice(0, 2).map((s: string, i: number) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContentDNA() {
  const [profile, setProfile] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/content-dna", {});
      return res.json();
    },
    onSuccess: (data) => setProfile(data.profile),
  });

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-purple-400" />
          Content DNA
        </CardTitle>
        <CardDescription>Your unique creative blueprint and growth leverage</CardDescription>
      </CardHeader>
      <CardContent>
        {!profile ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="p-4 bg-purple-500/10 rounded-full animate-pulse">
              <Dna className="w-12 h-12 text-purple-400" />
            </div>
            <p className="text-muted-foreground text-sm max-w-[200px]">Unlock your channel's hidden growth potential</p>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="secondary">
              {mutation.isPending ? "Sequencing..." : "Analyze My DNA"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <h5 className="font-bold text-purple-300">Unique Angle</h5>
              <p className="text-sm italic mt-1">"{profile.uniqueAngle}"</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Top Strength</span>
                <p className="text-sm font-semibold">{profile.strengths?.[0]}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Growth Lever</span>
                <p className="text-sm font-semibold text-green-400">{profile.growthOpportunities?.[0]}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NicheAnalyzer() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/niche-analyzer", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-amber-400" />
          Niche Analyzer
        </CardTitle>
        <CardDescription>Evaluate market saturation and monetization potential</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-4 mb-6">
          <Input name="niche" placeholder="Enter a niche (e.g., Solar Power, Mechanical Keyboards)" required />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Analyzing..." : "Analyze"}
          </Button>
        </form>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold">{result.saturation}%</div>
              <div className="text-[10px] uppercase text-muted-foreground">Saturation</div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold">{result.monetizationScore}/100</div>
              <div className="text-[10px] uppercase text-muted-foreground">Monetization</div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold">{result.growthTrend}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Trend</div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold">${result.avgCpm}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Est. CPM</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Tab 3: Viral & Analytics ---

function ViralPredictor() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/viral-predictor", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-pink-400" />
          Viral Predictor
        </CardTitle>
        <CardDescription>Predict virality before you hit upload</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input name="title" placeholder="Video Title" required />
            <Input name="niche" placeholder="Niche" required />
          </div>
          <Textarea name="description" placeholder="Description..." required />
          <Input name="thumbnailDescription" placeholder="Thumbnail visual description..." required />
          <Button type="submit" disabled={mutation.isPending} className="w-full bg-pink-600 hover:bg-pink-700">
            {mutation.isPending ? "Calculating Virality..." : "Predict Virality"}
          </Button>
        </form>

        {result && (
          <div className="space-y-6">
            <div className="flex flex-col items-center py-4 bg-muted/20 rounded-xl border border-pink-500/20">
              <div className="text-5xl font-black text-pink-400">{result.viralScore}%</div>
              <div className="text-sm font-bold uppercase tracking-widest mt-2">Viral Probability</div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Shareability</Label>
                <Progress value={result.shareabilityScore} className="h-2 bg-pink-900/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Emotional Intensity</Label>
                <Progress value={result.emotionalIntensity} className="h-2 bg-pink-900/20" />
              </div>
            </div>

            <div className="p-4 bg-pink-500/5 rounded-lg border border-pink-500/10">
              <h5 className="font-bold flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" />
                Viral Formula
              </h5>
              <p className="text-sm italic">{result.viralFormula}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionAnalyzer() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/retention-analyzer", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          Retention Analyzer
        </CardTitle>
        <CardDescription>Fix audience drop-off and maximize watch time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label>Video Title</Label>
            <Input name="title" required />
          </div>
          <div className="space-y-2">
            <Label>Video Length (s)</Label>
            <Input name="videoLength" type="number" defaultValue={600} required />
          </div>
          <div className="space-y-2">
            <Label>Current Retention (%)</Label>
            <Input name="currentRetention" type="number" defaultValue={40} required />
          </div>
          <Button type="submit" disabled={mutation.isPending}>Analyze Retention</Button>
        </form>

        {result && (
          <div className="space-y-6">
            <div className="h-24 w-full bg-muted/10 rounded border flex items-end p-2 relative overflow-hidden">
               {/* Simple mock curve SVG */}
               <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                  <path 
                    d="M 0 10 Q 50 10, 100 60 T 200 80 T 300 90 T 400 95" 
                    fill="none" 
                    stroke="rgba(34, 211, 238, 0.5)" 
                    strokeWidth="4"
                    vectorEffect="non-scaling-stroke"
                  />
               </svg>
               <span className="text-[10px] text-muted-foreground relative z-10">Projected Curve</span>
            </div>
            
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase text-muted-foreground">Critical Drop-off Points</h5>
              {result.dropoffPoints?.map((p: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2 bg-red-500/5 rounded border border-red-500/10">
                  <div className="text-red-400 font-bold text-xs pt-0.5">{p.time}</div>
                  <div>
                    <p className="text-xs font-semibold">{p.reason}</p>
                    <p className="text-[10px] text-muted-foreground">Fix: {p.fix}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThumbnailAB() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/thumbnail-ab-test", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-green-400" />
          Thumbnail A/B Engine
        </CardTitle>
        <CardDescription>Visual psychological analysis of your thumbnails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Thumbnail A Concept</Label>
              <Input name="thumbnailA" placeholder="Big red arrow, face shocked" required />
            </div>
            <div className="space-y-2">
              <Label>Thumbnail B Concept</Label>
              <Input name="thumbnailB" placeholder="Minimalist, close-up product" required />
            </div>
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            Run Prediction
          </Button>
        </form>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Badge className="bg-green-500/20 text-green-300">Winner: Thumbnail {result.winner}</Badge>
              <span className="text-xs text-muted-foreground">{result.confidence}% Confidence</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/20 rounded-lg text-xs">
                <div className="font-bold mb-1">CTR A</div>
                <div className="text-lg">{result.predictedCTR_A}%</div>
              </div>
              <div className="p-3 bg-muted/20 rounded-lg text-xs">
                <div className="font-bold mb-1">CTR B</div>
                <div className="text-lg">{result.predictedCTR_B}%</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UploadTimeOptimizer() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/upload-time-optimizer", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-400" />
          Upload Time Optimizer
        </CardTitle>
        <CardDescription>Reach your audience when they are most active</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <Input name="niche" placeholder="Niche" required />
          <Button type="submit" disabled={mutation.isPending}>Find Peak</Button>
        </form>

        {result && (
          <div className="grid grid-cols-1 gap-2">
            <h5 className="text-xs font-bold uppercase text-muted-foreground mt-2">Recommended Times</h5>
            {result.bestTimes?.map((t: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                <span className="text-sm font-semibold">{t.day}</span>
                <Badge variant="secondary" className="bg-orange-500/20 text-orange-300">{t.time}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Tab 4: Distribution ---

function HashtagStrategy() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/hashtag-strategy", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-blue-400" />
          Hashtag Strategy
        </CardTitle>
        <CardDescription>Platform-specific hashtag bundles for maximum reach</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Input name="title" placeholder="Video Title" required />
          <Input name="niche" placeholder="Niche" required />
          <Button type="submit" disabled={mutation.isPending}>Generate Tags</Button>
        </form>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(result.platformTags || {}).map(([platform, tags]: any) => (
              <Card key={platform} className="bg-muted/30 border-blue-500/10">
                <CardHeader className="p-4 pb-0">
                  <CardTitle className="text-sm capitalize">{platform}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px] h-5">{tag}</Badge>
                    ))}
                  </div>
                  <Button variant="secondary" size="sm" className="w-full h-8" onClick={() => navigator.clipboard.writeText(tags.join(" "))}>
                    <Copy className="w-3 h-3 mr-2" /> Copy All
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CaptionGenerator() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/caption-generator", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          Caption Gen
        </CardTitle>
        <CardDescription>Engagement-focused captions for social posts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="title" placeholder="Topic/Title" required />
          <div className="grid grid-cols-2 gap-4">
            <Select name="platform" defaultValue="instagram">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="twitter">X/Twitter</SelectItem>
              </SelectContent>
            </Select>
            <Select name="tone" defaultValue="witty">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="witty">Witty</SelectItem>
                <SelectItem value="educational">Educational</SelectItem>
                <SelectItem value="hype">Hype</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full">Generate</Button>
        </form>

        {result && (
          <div className="relative group">
            <Textarea value={result.caption} readOnly className="min-h-[100px] bg-muted/20 text-sm" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => navigator.clipboard.writeText(result.caption)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommunityPostGenerator() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/community-post-generator", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" />
          Community Post Gen
        </CardTitle>
        <CardDescription>Keep your audience engaged between uploads</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="topic" placeholder="Post Topic" required />
          <Select name="type" defaultValue="poll">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="poll">Poll Idea</SelectItem>
              <SelectItem value="behind_the_scenes">Behind the Scenes</SelectItem>
              <SelectItem value="teaser">Teaser</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={mutation.isPending} className="w-full">Generate Post</Button>
        </form>

        {result && (
          <div className="p-3 bg-muted/20 rounded-lg border border-indigo-500/10 space-y-2">
            <p className="text-sm italic">"{result.post?.content}"</p>
            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Best Time: {result.post?.bestTime}</span>
              <span className="text-green-400">Est. Engagement: {result.post?.engagement}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShortsStrategy() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/shorts-strategy", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-red-500" />
          Shorts Strategy
        </CardTitle>
        <CardDescription>Convert long-form content into viral vertical clips</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="niche" placeholder="Niche" required />
          <Textarea name="mainContent" placeholder="Paste your main video script or key points..." />
          <Button type="submit" disabled={mutation.isPending}>Generate Shorts Plan</Button>
        </form>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.shorts?.map((short: any, i: number) => (
              <Card key={i} className="bg-muted/30 border-red-500/10">
                <CardContent className="p-4 space-y-2">
                  <h6 className="font-bold text-sm">{short.hook}</h6>
                  <p className="text-xs text-muted-foreground">{short.description}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px]">Viral Score: {short.viralScore}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Tab 5: Advanced ---

function DemonetizationRisk() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/content/demonetization-risk", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          Demonetization Risk Scanner
        </CardTitle>
        <CardDescription>Scan your metadata for advertiser-unsafe content</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
             <Input name="title" placeholder="Title" required />
             <Input name="tags" placeholder="Tags (comma separated)" />
          </div>
          <Textarea name="description" placeholder="Full description text..." className="min-h-[100px]" required />
          <Button type="submit" disabled={mutation.isPending} variant="destructive">
            {mutation.isPending ? "Scanning..." : "Scan Content"}
          </Button>
        </form>

        {result && (
          <div className="space-y-6">
            <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${result.riskLevel === 'high' ? 'bg-red-500/10 border-red-500/50' : 'bg-green-500/10 border-green-500/50'}`}>
              <div>
                <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Risk Score</div>
                <div className="text-4xl font-black">{result.riskScore}%</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Status</div>
                <div className={`text-xl font-bold ${result.riskLevel === 'high' ? 'text-red-400' : 'text-green-400'}`}>{result.riskLevel.toUpperCase()}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h5 className="text-xs font-bold uppercase text-muted-foreground">Flagged Terms</h5>
                <div className="flex flex-wrap gap-2">
                  {result.flaggedTerms?.map((term: string, i: number) => (
                    <Badge key={i} variant="secondary" className="bg-red-500/20 text-red-300 border-red-500/30">
                      {term}
                    </Badge>
                  ))}
                  {(!result.flaggedTerms || result.flaggedTerms.length === 0) && <p className="text-xs text-muted-foreground">No terms flagged.</p>}
                </div>
              </div>
              <div className="space-y-3">
                <h5 className="text-xs font-bold uppercase text-muted-foreground">Safe Alternatives</h5>
                <div className="space-y-2">
                   {result.safeAlternatives?.map((alt: any, i: number) => (
                     <div key={i} className="text-xs flex items-center gap-2">
                        <span className="line-through text-red-400">{alt.original}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-green-400 font-bold">{alt.replacement}</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AudiencePsychographics() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/audience-psychographics", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-400" />
          Audience Psychographics
        </CardTitle>
        <CardDescription>Understand the 'Why' behind your audience's behavior</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="niche" placeholder="Niche" required />
          <Textarea name="channelDescription" placeholder="Channel Description..." required />
          <Button type="submit" disabled={mutation.isPending} className="w-full">Analyze Psychology</Button>
        </form>

        {result && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/20 rounded-lg">
              <h6 className="text-xs font-bold uppercase text-muted-foreground mb-1">Core Motivations</h6>
              <p className="text-sm">{result.profile?.coreMotivations?.[0]}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
               {result.personas?.map((p: any, i: number) => (
                 <div key={i} className="p-2 border rounded text-[10px]">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-muted-foreground">{p.traits?.[0]}</div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CollabPitchWriter() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/collab-pitch-writer", data);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate(Object.fromEntries(formData));
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-400" />
          Collab Pitch Writer
        </CardTitle>
        <CardDescription>Write high-converting collaboration requests</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="collabTarget" placeholder="Target Creator/Brand Name" required />
          <Input name="niche" placeholder="The Common Niche" required />
          <Button type="submit" disabled={mutation.isPending} className="w-full">Generate Pitch</Button>
        </form>

        {result && (
          <div className="relative group">
            <Textarea value={result.pitch} readOnly className="min-h-[150px] bg-muted/20 text-xs" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => navigator.clipboard.writeText(result.pitch)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContentAudit() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/content-audit", {});
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-amber-500" />
          Channel Content Audit
        </CardTitle>
        <CardDescription>AI-driven analysis of your entire content library</CardDescription>
      </CardHeader>
      <CardContent>
        {!result ? (
          <div className="flex flex-col items-center py-6 gap-4">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Auditing Library..." : "Run Channel Audit"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
             <div className="flex justify-between items-center text-sm">
                <span>Health Score</span>
                <span className="font-bold text-green-400">{result.overallScore}/100</span>
             </div>
             <div className="text-xs text-muted-foreground italic">"{result.findings?.[0]}"</div>
             <div className="flex flex-wrap gap-2">
                {result.quickWins?.map((win: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{win}</Badge>
                ))}
             </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EndScreenOptimizer() {
  const [result, setResult] = useState<any>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/end-screen-optimizer", {});
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-zinc-400" />
          End Screen Optimizer
        </CardTitle>
        <CardDescription>Maximize binge-watching with smart end-screens</CardDescription>
      </CardHeader>
      <CardContent>
        {!result ? (
          <div className="flex flex-col items-center py-6 gap-4">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Optimizing Layouts..." : "Optimize End Screens"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
             <div className="p-3 bg-muted/20 rounded border border-dashed text-center text-xs">
                Recommended Layout: <span className="font-bold">{result.recommendedLayout}</span>
             </div>
             <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Predicted Binge Rate Boost</span>
                <div className="text-lg font-bold text-green-400">+{result.predictedBingeBoost}%</div>
             </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
