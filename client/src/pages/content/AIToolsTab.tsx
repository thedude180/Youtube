import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Sparkles, FileText, Hash, Zap, TrendingUp, Image, Captions,
  MonitorPlay, ThumbsUp, Layers, ShieldAlert, CalendarClock, Gamepad2,
  DollarSign, BarChart2, Globe, CheckCircle2, Radio, MessageCircle,
  Users, Mail, CreditCard, Network, AlertTriangle, Share2, Eye,
  Repeat2, Target, Activity, Clock, Search, Heart
} from "lucide-react";

type AIResponse = any;

const PLATFORMS = [
  { id: "youtube", label: "YouTube" },
];

function AIToolCard({
  title,
  icon: Icon,
  testId,
  children,
}: {
  title: string;
  icon: any;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ResultDisplay({ data, testId }: { data: AIResponse; testId: string }) {
  if (!data) return null;
  return (
    <div
      className="mt-2 p-2 rounded-md bg-muted/50 text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
      data-testid={testId}
    >
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </div>
  );
}

// ─── YOUTUBE TOOLS ───────────────────────────────────────────

function TitleOptimizer() {
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/title-optimizer", { title, niche })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Title Optimizer" icon={FileText} testId="card-title-optimizer">
      <Input placeholder="Current title..." value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" data-testid="input-title" />
      <Input placeholder="Niche..." value={niche} onChange={(e) => setNiche(e.target.value)} className="text-sm" data-testid="input-niche" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !title.trim()} data-testid="button-title-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-title-optimizer" />
    </AIToolCard>
  );
}

function DescriptionOptimizer() {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/description-optimizer", { description })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Description Optimizer" icon={FileText} testId="card-description-optimizer">
      <Textarea placeholder="Current description..." value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm min-h-[60px] resize-none" data-testid="input-description" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !description.trim()} data-testid="button-description-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-description-optimizer" />
    </AIToolCard>
  );
}

function HashtagStrategy() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/hashtag-strategy", { topic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Hashtag Strategy" icon={Hash} testId="card-hashtag-strategy">
      <Input placeholder="Video topic..." value={topic} onChange={(e) => setTopic(e.target.value)} className="text-sm" data-testid="input-hashtag-topic" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !topic.trim()} data-testid="button-hashtag-strategy">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Hash className="h-3.5 w-3.5 mr-1" />}Generate
      </Button>
      <ResultDisplay data={result} testId="result-hashtag-strategy" />
    </AIToolCard>
  );
}

function HookGenerator() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/hook-generator", { topic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Hook Generator" icon={Zap} testId="card-hook-generator">
      <Input placeholder="Video topic..." value={topic} onChange={(e) => setTopic(e.target.value)} className="text-sm" data-testid="input-hook-topic" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !topic.trim()} data-testid="button-hook-generator">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}Generate
      </Button>
      <ResultDisplay data={result} testId="result-hook-generator" />
    </AIToolCard>
  );
}

function ViralPredictor() {
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/viral-predictor", { title })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Viral Predictor" icon={TrendingUp} testId="card-viral-predictor">
      <Input placeholder="Video title..." value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" data-testid="input-viral-title" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !title.trim()} data-testid="button-viral-predictor">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5 mr-1" />}Predict
      </Button>
      <ResultDisplay data={result} testId="result-viral-predictor" />
    </AIToolCard>
  );
}

function ThumbnailABTest() {
  const [concept, setConcept] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/thumbnail-ab-test", { concept })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Thumbnail A/B Test" icon={Image} testId="card-thumbnail-ab-test">
      <Input placeholder="Video concept..." value={concept} onChange={(e) => setConcept(e.target.value)} className="text-sm" data-testid="input-thumbnail-concept" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !concept.trim()} data-testid="button-thumbnail-ab-test">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Image className="h-3.5 w-3.5 mr-1" />}Test
      </Button>
      <ResultDisplay data={result} testId="result-thumbnail-ab-test" />
    </AIToolCard>
  );
}

function CaptionGenerator() {
  const [videoTopic, setVideoTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/caption-generator", { videoTopic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Caption Generator" icon={Captions} testId="card-caption-generator">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-caption-topic" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTopic.trim()} data-testid="button-caption-generator">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Captions className="h-3.5 w-3.5 mr-1" />}Generate
      </Button>
      <ResultDisplay data={result} testId="result-caption-generator" />
    </AIToolCard>
  );
}

function EndScreenOptimizer() {
  const [videoContent, setVideoContent] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/end-screen-optimizer", { videoContent })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="End Screen Optimizer" icon={MonitorPlay} testId="card-end-screen-optimizer">
      <Input placeholder="Video content summary..." value={videoContent} onChange={(e) => setVideoContent(e.target.value)} className="text-sm" data-testid="input-end-screen" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoContent.trim()} data-testid="button-end-screen-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-end-screen-optimizer" />
    </AIToolCard>
  );
}

function SatisfactionAnalyzer() {
  const [videoTitle, setVideoTitle] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/satisfaction-analyzer", { videoTitle })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Satisfaction Analyzer" icon={ThumbsUp} testId="card-satisfaction-analyzer">
      <Input placeholder="Video title..." value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} className="text-sm" data-testid="input-satisfaction-title" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTitle.trim()} data-testid="button-satisfaction-analyzer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1" />}Analyze
      </Button>
      <ResultDisplay data={result} testId="result-satisfaction-analyzer" />
    </AIToolCard>
  );
}

function SurfaceOptimizer() {
  const [videoTopic, setVideoTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/surface-optimizer", { videoTopic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Surface Target Optimizer" icon={Layers} testId="card-surface-optimizer">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-surface-topic" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTopic.trim()} data-testid="button-surface-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Layers className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-surface-optimizer" />
    </AIToolCard>
  );
}

function TrustSafetyScorer() {
  const [videoTitle, setVideoTitle] = useState("");
  const [videoTopic, setVideoTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/trust-safety-risk", { videoTitle, videoTopic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Trust & Safety Scorer" icon={ShieldAlert} testId="card-trust-safety-scorer">
      <Input placeholder="Video title..." value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} className="text-sm" data-testid="input-trust-title" />
      <Input placeholder="Video topic/content..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-trust-topic" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTitle.trim()} data-testid="button-trust-safety-scorer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 mr-1" />}Score Risk
      </Button>
      <ResultDisplay data={result} testId="result-trust-safety-scorer" />
    </AIToolCard>
  );
}

function DiagnosticProtocol() {
  const [channelMetrics, setChannelMetrics] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/diagnostic-protocol", { channelMetrics })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="14-Day Diagnostic" icon={Activity} testId="card-diagnostic-protocol">
      <Textarea placeholder="Channel metrics (views, CTR, watch time trends)..." value={channelMetrics} onChange={(e) => setChannelMetrics(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-diagnostic-metrics" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-diagnostic-protocol">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1" />}Run Diagnostic
      </Button>
      <ResultDisplay data={result} testId="result-diagnostic-protocol" />
    </AIToolCard>
  );
}

function GamingWindowDetector() {
  const [gameName, setGameName] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/gaming-window-detector", { gameName })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Gaming Window Detector" icon={Gamepad2} testId="card-gaming-window-detector">
      <Input placeholder="Game name..." value={gameName} onChange={(e) => setGameName(e.target.value)} className="text-sm" data-testid="input-gaming-window-game" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !gameName.trim()} data-testid="button-gaming-window-detector">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Gamepad2 className="h-3.5 w-3.5 mr-1" />}Detect Windows
      </Button>
      <ResultDisplay data={result} testId="result-gaming-window-detector" />
    </AIToolCard>
  );
}

function MidRollOptimizer() {
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/midroll-optimizer", { videoTitle, videoDuration })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Mid-Roll Optimizer" icon={DollarSign} testId="card-midroll-optimizer">
      <Input placeholder="Video title..." value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} className="text-sm" data-testid="input-midroll-title" />
      <Input placeholder="Duration (e.g. 14:32)..." value={videoDuration} onChange={(e) => setVideoDuration(e.target.value)} className="text-sm" data-testid="input-midroll-duration" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTitle.trim()} data-testid="button-midroll-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-midroll-optimizer" />
    </AIToolCard>
  );
}

function TrafficSourceDiagnostic() {
  const [trafficSources, setTrafficSources] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/traffic-source-diagnostic", { trafficSources })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Traffic Source Diagnostic" icon={BarChart2} testId="card-traffic-source">
      <Textarea placeholder="Traffic sources breakdown (browse, search, suggested %)..." value={trafficSources} onChange={(e) => setTrafficSources(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-traffic-sources" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-traffic-source">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5 mr-1" />}Diagnose
      </Button>
      <ResultDisplay data={result} testId="result-traffic-source" />
    </AIToolCard>
  );
}

function GeoCPMOptimizer() {
  const [topCountries, setTopCountries] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/geo-cpm-optimizer", { topCountries })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Geo CPM Optimizer" icon={Globe} testId="card-geo-cpm-optimizer">
      <Input placeholder="Top countries (e.g. US 40%, IN 25%, UK 15%)..." value={topCountries} onChange={(e) => setTopCountries(e.target.value)} className="text-sm" data-testid="input-geo-countries" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-geo-cpm-optimizer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Globe className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-geo-cpm-optimizer" />
    </AIToolCard>
  );
}

function CTAEnforcer() {
  const [ctaText, setCtaText] = useState("");
  const [videoTopic, setVideoTopic] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/cta-enforcer", { ctaText, videoTopic })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="CTA Bait Checker" icon={CheckCircle2} testId="card-cta-enforcer">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-cta-topic" />
      <Textarea placeholder='Your CTA text...' value={ctaText} onChange={(e) => setCtaText(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-cta-text" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !ctaText.trim()} data-testid="button-cta-enforcer">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}Check CTA
      </Button>
      <ResultDisplay data={result} testId="result-cta-enforcer" />
    </AIToolCard>
  );
}

// ─── TIKTOK TOOLS ────────────────────────────────────────────

function TikTokWatermarkChecker() {
  const [sourceplatform, setSourcePlatform] = useState("");
  const [contentDescription, setContentDescription] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/tiktok-watermark-checker", { sourceplatform, contentDescription })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Watermark Risk Checker" icon={AlertTriangle} testId="card-tiktok-watermark">
      <Input placeholder="Source platform (e.g. Instagram, YouTube)..." value={sourceplatform} onChange={(e) => setSourcePlatform(e.target.value)} className="text-sm" data-testid="input-tiktok-source" />
      <Input placeholder="Content description..." value={contentDescription} onChange={(e) => setContentDescription(e.target.value)} className="text-sm" data-testid="input-tiktok-desc" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-tiktok-watermark">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1" />}Check Risk
      </Button>
      <ResultDisplay data={result} testId="result-tiktok-watermark" />
    </AIToolCard>
  );
}

function TikTokCompletionAdvisor() {
  const [videoTopic, setVideoTopic] = useState("");
  const [currentHookStyle, setCurrentHookStyle] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/tiktok-completion-rate", { videoTopic, currentHookStyle, videoDuration })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="70% Completion Optimizer" icon={Eye} testId="card-tiktok-completion">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-tiktok-topic" />
      <Input placeholder="Current hook style..." value={currentHookStyle} onChange={(e) => setCurrentHookStyle(e.target.value)} className="text-sm" data-testid="input-tiktok-hook" />
      <Input placeholder="Duration (e.g. 45s)..." value={videoDuration} onChange={(e) => setVideoDuration(e.target.value)} className="text-sm" data-testid="input-tiktok-duration" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTopic.trim()} data-testid="button-tiktok-completion">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1" />}Optimize
      </Button>
      <ResultDisplay data={result} testId="result-tiktok-completion" />
    </AIToolCard>
  );
}

function TikTokSEOOptimizer() {
  const [videoTopic, setVideoTopic] = useState("");
  const [currentHashtags, setCurrentHashtags] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/tiktok-seo-optimizer", { videoTopic, currentHashtags })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="TikTok SEO Optimizer" icon={Search} testId="card-tiktok-seo">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-tiktok-seo-topic" />
      <Input placeholder="Current hashtags..." value={currentHashtags} onChange={(e) => setCurrentHashtags(e.target.value)} className="text-sm" data-testid="input-tiktok-hashtags" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTopic.trim()} data-testid="button-tiktok-seo">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}Optimize SEO
      </Button>
      <ResultDisplay data={result} testId="result-tiktok-seo" />
    </AIToolCard>
  );
}

// ─── INSTAGRAM TOOLS ─────────────────────────────────────────

function InstagramReelsReadiness() {
  const [contentDescription, setContentDescription] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/instagram-reels-readiness", { contentDescription, sourcePlatform })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Reels Eligibility Checker" icon={CheckCircle2} testId="card-instagram-reels">
      <Input placeholder="Content description..." value={contentDescription} onChange={(e) => setContentDescription(e.target.value)} className="text-sm" data-testid="input-instagram-content" />
      <Input placeholder="Source platform (if cross-posting)..." value={sourcePlatform} onChange={(e) => setSourcePlatform(e.target.value)} className="text-sm" data-testid="input-instagram-source" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-instagram-reels">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}Check Gates
      </Button>
      <ResultDisplay data={result} testId="result-instagram-reels" />
    </AIToolCard>
  );
}

function InstagramDMShareOptimizer() {
  const [contentDescription, setContentDescription] = useState("");
  const [contentType, setContentType] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/instagram-dm-share-optimizer", { contentDescription, contentType })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="DM Share Optimizer" icon={Share2} testId="card-instagram-dm-share">
      <Input placeholder="Content description..." value={contentDescription} onChange={(e) => setContentDescription(e.target.value)} className="text-sm" data-testid="input-instagram-dm-content" />
      <Input placeholder="Content type (Reel, Carousel, etc.)..." value={contentType} onChange={(e) => setContentType(e.target.value)} className="text-sm" data-testid="input-instagram-dm-type" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !contentDescription.trim()} data-testid="button-instagram-dm-share">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1" />}Optimize DM Shares
      </Button>
      <ResultDisplay data={result} testId="result-instagram-dm-share" />
    </AIToolCard>
  );
}

function InstagramTrialReelAdvisor() {
  const [contentAngle, setContentAngle] = useState("");
  const [audienceRisk, setAudienceRisk] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/instagram-trial-reel-advisor", { contentAngle, audienceRisk })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Trial Reel Advisor" icon={Target} testId="card-instagram-trial-reel">
      <Input placeholder="Content angle / new format..." value={contentAngle} onChange={(e) => setContentAngle(e.target.value)} className="text-sm" data-testid="input-instagram-angle" />
      <Input placeholder="Audience risk level..." value={audienceRisk} onChange={(e) => setAudienceRisk(e.target.value)} className="text-sm" data-testid="input-instagram-risk" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-instagram-trial-reel">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Target className="h-3.5 w-3.5 mr-1" />}Advise
      </Button>
      <ResultDisplay data={result} testId="result-instagram-trial-reel" />
    </AIToolCard>
  );
}

// ─── THREADS TOOLS ───────────────────────────────────────────

function ThreadsVelocityPlanner() {
  const [postContent, setPostContent] = useState("");
  const [targetPostingTime, setTargetPostingTime] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/threads-velocity-planner", { postContent, targetPostingTime })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Engagement Velocity Planner" icon={Clock} testId="card-threads-velocity">
      <Textarea placeholder="Post content..." value={postContent} onChange={(e) => setPostContent(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-threads-content" />
      <Input placeholder="Target posting time..." value={targetPostingTime} onChange={(e) => setTargetPostingTime(e.target.value)} className="text-sm" data-testid="input-threads-time" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-threads-velocity">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Clock className="h-3.5 w-3.5 mr-1" />}Plan Velocity
      </Button>
      <ResultDisplay data={result} testId="result-threads-velocity" />
    </AIToolCard>
  );
}

function ThreadsCommunityAdvisor() {
  const [postTopic, setPostTopic] = useState("");
  const [contentType, setContentType] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/threads-community-advisor", { postTopic, contentType })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Community Topics Advisor" icon={MessageCircle} testId="card-threads-community">
      <Input placeholder="Post topic..." value={postTopic} onChange={(e) => setPostTopic(e.target.value)} className="text-sm" data-testid="input-threads-topic" />
      <Input placeholder="Content type (text, image, video)..." value={contentType} onChange={(e) => setContentType(e.target.value)} className="text-sm" data-testid="input-threads-type" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !postTopic.trim()} data-testid="button-threads-community">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 mr-1" />}Advise
      </Button>
      <ResultDisplay data={result} testId="result-threads-community" />
    </AIToolCard>
  );
}

// ─── TWITCH TOOLS ────────────────────────────────────────────

function TwitchCategoryOptimizer() {
  const [gameName, setGameName] = useState("");
  const [currentViewerCount, setCurrentViewerCount] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/twitch-category-optimizer", { gameName, currentViewerCount })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Category Sweet Spot" icon={Target} testId="card-twitch-category">
      <Input placeholder="Game / category name..." value={gameName} onChange={(e) => setGameName(e.target.value)} className="text-sm" data-testid="input-twitch-game" />
      <Input placeholder="Your avg viewers..." value={currentViewerCount} onChange={(e) => setCurrentViewerCount(e.target.value)} className="text-sm" data-testid="input-twitch-viewers" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !gameName.trim()} data-testid="button-twitch-category">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Target className="h-3.5 w-3.5 mr-1" />}Find Sweet Spot
      </Button>
      <ResultDisplay data={result} testId="result-twitch-category" />
    </AIToolCard>
  );
}

function TwitchStreamHealthDiagnostic() {
  const [avgCCV, setAvgCCV] = useState("");
  const [chatVelocity, setChatVelocity] = useState("");
  const [avgWatchTime, setAvgWatchTime] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/twitch-stream-health", { avgCCV, chatVelocity, avgWatchTime })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Stream Health Diagnostic" icon={Activity} testId="card-twitch-health">
      <Input placeholder="Avg CCV..." value={avgCCV} onChange={(e) => setAvgCCV(e.target.value)} className="text-sm" data-testid="input-twitch-ccv" />
      <Input placeholder="Chat velocity (msgs/min)..." value={chatVelocity} onChange={(e) => setChatVelocity(e.target.value)} className="text-sm" data-testid="input-twitch-chat" />
      <Input placeholder="Avg watch time per viewer..." value={avgWatchTime} onChange={(e) => setAvgWatchTime(e.target.value)} className="text-sm" data-testid="input-twitch-watchtime" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-twitch-health">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1" />}Diagnose
      </Button>
      <ResultDisplay data={result} testId="result-twitch-health" />
    </AIToolCard>
  );
}

function TwitchRaidNetworkAdvisor() {
  const [channelName, setChannelName] = useState("");
  const [avgViewers, setAvgViewers] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/twitch-raid-network", { channelName, avgViewers, category })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Raid Network Advisor" icon={Repeat2} testId="card-twitch-raid">
      <Input placeholder="Channel name..." value={channelName} onChange={(e) => setChannelName(e.target.value)} className="text-sm" data-testid="input-twitch-channel" />
      <Input placeholder="Avg viewers..." value={avgViewers} onChange={(e) => setAvgViewers(e.target.value)} className="text-sm" data-testid="input-twitch-avg-viewers" />
      <Input placeholder="Category (game)..." value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm" data-testid="input-twitch-category" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-twitch-raid">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Repeat2 className="h-3.5 w-3.5 mr-1" />}Build Network
      </Button>
      <ResultDisplay data={result} testId="result-twitch-raid" />
    </AIToolCard>
  );
}

// ─── KICK TOOLS ──────────────────────────────────────────────

function KickPartnerTracker() {
  const [currentCCV, setCurrentCCV] = useState("");
  const [monthlyStreamHours, setMonthlyStreamHours] = useState("");
  const [uniqueChatters, setUniqueChatters] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/kick-partner-tracker", { currentCCV, monthlyStreamHours, uniqueChatters })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="KPP Qualification Tracker" icon={Radio} testId="card-kick-partner">
      <Input placeholder="Avg CCV..." value={currentCCV} onChange={(e) => setCurrentCCV(e.target.value)} className="text-sm" data-testid="input-kick-ccv" />
      <Input placeholder="Monthly stream hours..." value={monthlyStreamHours} onChange={(e) => setMonthlyStreamHours(e.target.value)} className="text-sm" data-testid="input-kick-hours" />
      <Input placeholder="Unique chatters/month..." value={uniqueChatters} onChange={(e) => setUniqueChatters(e.target.value)} className="text-sm" data-testid="input-kick-chatters" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-kick-partner">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Radio className="h-3.5 w-3.5 mr-1" />}Track Progress
      </Button>
      <ResultDisplay data={result} testId="result-kick-partner" />
    </AIToolCard>
  );
}

function KickMultistreamStrategy() {
  const [currentRevenue, setCurrentRevenue] = useState("");
  const [averageViewers, setAverageViewers] = useState("");
  const [streamingDaysPerWeek, setStreamingDaysPerWeek] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/kick-multistream-strategy", { currentRevenue, averageViewers, streamingDaysPerWeek })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Multistream Strategy" icon={Network} testId="card-kick-multistream">
      <Input placeholder="Current monthly revenue..." value={currentRevenue} onChange={(e) => setCurrentRevenue(e.target.value)} className="text-sm" data-testid="input-kick-revenue" />
      <Input placeholder="Average viewers..." value={averageViewers} onChange={(e) => setAverageViewers(e.target.value)} className="text-sm" data-testid="input-kick-viewers" />
      <Input placeholder="Streaming days/week..." value={streamingDaysPerWeek} onChange={(e) => setStreamingDaysPerWeek(e.target.value)} className="text-sm" data-testid="input-kick-days" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-kick-multistream">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Network className="h-3.5 w-3.5 mr-1" />}Model Strategy
      </Button>
      <ResultDisplay data={result} testId="result-kick-multistream" />
    </AIToolCard>
  );
}

// ─── RUMBLE TOOLS ────────────────────────────────────────────

function RumbleLicenseAdvisor() {
  const [contentType, setContentType] = useState("");
  const [viralPotential, setViralPotential] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/rumble-license-advisor", { contentType, viralPotential, isPrimaryOnYouTube: true })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="License Type Advisor" icon={FileText} testId="card-rumble-license">
      <Input placeholder="Content type (gaming, commentary, etc.)..." value={contentType} onChange={(e) => setContentType(e.target.value)} className="text-sm" data-testid="input-rumble-type" />
      <Input placeholder="Viral potential (high/medium/low)..." value={viralPotential} onChange={(e) => setViralPotential(e.target.value)} className="text-sm" data-testid="input-rumble-viral" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !contentType.trim()} data-testid="button-rumble-license">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}Advise License
      </Button>
      <ResultDisplay data={result} testId="result-rumble-license" />
    </AIToolCard>
  );
}

function RumbleAudienceFitAnalyzer() {
  const [contentTopic, setContentTopic] = useState("");
  const [contentStyle, setContentStyle] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/rumble-audience-fit", { contentTopic, contentStyle })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Audience Fit Analyzer" icon={Users} testId="card-rumble-audience">
      <Input placeholder="Content topic..." value={contentTopic} onChange={(e) => setContentTopic(e.target.value)} className="text-sm" data-testid="input-rumble-topic" />
      <Input placeholder="Content style (gameplay, commentary, etc.)..." value={contentStyle} onChange={(e) => setContentStyle(e.target.value)} className="text-sm" data-testid="input-rumble-style" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !contentTopic.trim()} data-testid="button-rumble-audience">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Users className="h-3.5 w-3.5 mr-1" />}Analyze Fit
      </Button>
      <ResultDisplay data={result} testId="result-rumble-audience" />
    </AIToolCard>
  );
}

// ─── REDDIT TOOLS ────────────────────────────────────────────

function RedditDemandSensor() {
  const [subreddit, setSubreddit] = useState("");
  const [topPosts, setTopPosts] = useState("");
  const [contentNiche, setContentNiche] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/reddit-demand-sensor", { subreddit, topPosts, contentNiche })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Demand Sensor" icon={TrendingUp} testId="card-reddit-demand">
      <Input placeholder="Subreddit (e.g. r/battlefield)..." value={subreddit} onChange={(e) => setSubreddit(e.target.value)} className="text-sm" data-testid="input-reddit-subreddit" />
      <Textarea placeholder="Top post titles + scores (paste from Reddit)..." value={topPosts} onChange={(e) => setTopPosts(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-reddit-posts" />
      <Input placeholder="Your content niche..." value={contentNiche} onChange={(e) => setContentNiche(e.target.value)} className="text-sm" data-testid="input-reddit-niche" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-reddit-demand">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5 mr-1" />}Sense Demand
      </Button>
      <ResultDisplay data={result} testId="result-reddit-demand" />
    </AIToolCard>
  );
}

function RedditSubredditTargeter() {
  const [videoTopic, setVideoTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/reddit-subreddit-targeter", { videoTopic, targetAudience })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Subreddit Targeter" icon={Search} testId="card-reddit-targeter">
      <Input placeholder="Video topic..." value={videoTopic} onChange={(e) => setVideoTopic(e.target.value)} className="text-sm" data-testid="input-reddit-video-topic" />
      <Input placeholder="Target audience..." value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className="text-sm" data-testid="input-reddit-audience" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !videoTopic.trim()} data-testid="button-reddit-targeter">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}Find Subreddits
      </Button>
      <ResultDisplay data={result} testId="result-reddit-targeter" />
    </AIToolCard>
  );
}

// ─── DISCORD TOOLS ───────────────────────────────────────────

function DiscordCommunityHealth() {
  const [memberCount, setMemberCount] = useState("");
  const [activeMembersLast7Days, setActiveMembersLast7Days] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/discord-community-health", { memberCount, activeMembersLast7Days })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Community Health Analyzer" icon={Users} testId="card-discord-health">
      <Input placeholder="Total members..." value={memberCount} onChange={(e) => setMemberCount(e.target.value)} className="text-sm" data-testid="input-discord-members" />
      <Input placeholder="Active members (last 7 days)..." value={activeMembersLast7Days} onChange={(e) => setActiveMembersLast7Days(e.target.value)} className="text-sm" data-testid="input-discord-active" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-discord-health">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Users className="h-3.5 w-3.5 mr-1" />}Analyze Health
      </Button>
      <ResultDisplay data={result} testId="result-discord-health" />
    </AIToolCard>
  );
}

function DiscordAlertStrategy() {
  const [platforms, setPlatforms] = useState("");
  const [typicalStreamTime, setTypicalStreamTime] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/discord-alert-strategy", { platforms, typicalStreamTime })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Alert Strategy Advisor" icon={MessageCircle} testId="card-discord-alerts">
      <Input placeholder="Your platforms (YouTube, Twitch, Kick...)..." value={platforms} onChange={(e) => setPlatforms(e.target.value)} className="text-sm" data-testid="input-discord-platforms" />
      <Input placeholder="Typical stream time..." value={typicalStreamTime} onChange={(e) => setTypicalStreamTime(e.target.value)} className="text-sm" data-testid="input-discord-stream-time" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-discord-alerts">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 mr-1" />}Design Alerts
      </Button>
      <ResultDisplay data={result} testId="result-discord-alerts" />
    </AIToolCard>
  );
}

// ─── GMAIL TOOLS ─────────────────────────────────────────────

function GmailSponsorshipTriager() {
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSender, setEmailSender] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/gmail-sponsorship-triage", { emailSubject, emailSender, emailBody })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Sponsorship Email Triager" icon={Mail} testId="card-gmail-triage">
      <Input placeholder="Email subject..." value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="text-sm" data-testid="input-gmail-subject" />
      <Input placeholder="Sender email..." value={emailSender} onChange={(e) => setEmailSender(e.target.value)} className="text-sm" data-testid="input-gmail-sender" />
      <Textarea placeholder="Email body (paste key parts)..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-gmail-body" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !emailSubject.trim()} data-testid="button-gmail-triage">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}Triage Email
      </Button>
      <ResultDisplay data={result} testId="result-gmail-triage" />
    </AIToolCard>
  );
}

function GmailDeliverabilityAdvisor() {
  const [senderDomain, setSenderDomain] = useState("");
  const [emailType, setEmailType] = useState("");
  const [currentSpamRate, setCurrentSpamRate] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/gmail-deliverability", { senderDomain, emailType, currentSpamRate })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Deliverability Advisor" icon={ShieldAlert} testId="card-gmail-deliverability">
      <Input placeholder="Sender domain (e.g. etgaming247.com)..." value={senderDomain} onChange={(e) => setSenderDomain(e.target.value)} className="text-sm" data-testid="input-gmail-domain" />
      <Input placeholder="Email type (sponsorship outreach, newsletter)..." value={emailType} onChange={(e) => setEmailType(e.target.value)} className="text-sm" data-testid="input-gmail-type" />
      <Input placeholder="Current spam rate (%)..." value={currentSpamRate} onChange={(e) => setCurrentSpamRate(e.target.value)} className="text-sm" data-testid="input-gmail-spam" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-gmail-deliverability">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 mr-1" />}Audit Deliverability
      </Button>
      <ResultDisplay data={result} testId="result-gmail-deliverability" />
    </AIToolCard>
  );
}

// ─── STRIPE TOOLS ────────────────────────────────────────────

function StripeRevenueHealth() {
  const [mrr, setMrr] = useState("");
  const [churnRate, setChurnRate] = useState("");
  const [trialToPaidRate, setTrialToPaidRate] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/stripe-revenue-health", { mrr, churnRate, trialToPaidRate })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Revenue Health Analyzer" icon={DollarSign} testId="card-stripe-revenue">
      <Input placeholder="Monthly recurring revenue ($)..." value={mrr} onChange={(e) => setMrr(e.target.value)} className="text-sm" data-testid="input-stripe-mrr" />
      <Input placeholder="Monthly churn rate (%)..." value={churnRate} onChange={(e) => setChurnRate(e.target.value)} className="text-sm" data-testid="input-stripe-churn" />
      <Input placeholder="Trial-to-paid conversion rate (%)..." value={trialToPaidRate} onChange={(e) => setTrialToPaidRate(e.target.value)} className="text-sm" data-testid="input-stripe-trial" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-stripe-revenue">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1" />}Analyze Revenue
      </Button>
      <ResultDisplay data={result} testId="result-stripe-revenue" />
    </AIToolCard>
  );
}

function StripeRecoveryAdvisor() {
  const [failedPaymentCount, setFailedPaymentCount] = useState("");
  const [pastDueRevenue, setPastDueRevenue] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/stripe-recovery-advisor", { failedPaymentCount, pastDueRevenue })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Payment Recovery Advisor" icon={CreditCard} testId="card-stripe-recovery">
      <Input placeholder="Failed payment count..." value={failedPaymentCount} onChange={(e) => setFailedPaymentCount(e.target.value)} className="text-sm" data-testid="input-stripe-failures" />
      <Input placeholder="Past-due revenue at risk ($)..." value={pastDueRevenue} onChange={(e) => setPastDueRevenue(e.target.value)} className="text-sm" data-testid="input-stripe-pastdue" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-stripe-recovery">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CreditCard className="h-3.5 w-3.5 mr-1" />}Recover Revenue
      </Button>
      <ResultDisplay data={result} testId="result-stripe-recovery" />
    </AIToolCard>
  );
}

// ─── CROSS-PLATFORM TOOLS ────────────────────────────────────

function WatermarkIntegrityChecker() {
  const [sourceplatform, setSourcePlatform] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [contentType, setContentType] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/watermark-integrity", { sourceplatform, targetPlatform, contentType })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Watermark Integrity Checker" icon={AlertTriangle} testId="card-watermark-integrity">
      <Input placeholder="Source platform..." value={sourceplatform} onChange={(e) => setSourcePlatform(e.target.value)} className="text-sm" data-testid="input-watermark-source" />
      <Input placeholder="Target platform..." value={targetPlatform} onChange={(e) => setTargetPlatform(e.target.value)} className="text-sm" data-testid="input-watermark-target" />
      <Input placeholder="Content type (Reel, clip, etc.)..." value={contentType} onChange={(e) => setContentType(e.target.value)} className="text-sm" data-testid="input-watermark-type" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !sourceplatform.trim()} data-testid="button-watermark-integrity">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1" />}Check Integrity
      </Button>
      <ResultDisplay data={result} testId="result-watermark-integrity" />
    </AIToolCard>
  );
}

function ConnectionHealthScorer() {
  const [platforms, setPlatforms] = useState("");
  const [recentErrors, setRecentErrors] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/connection-health-scorer", { platforms, recentErrors })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Connection Health Scorer" icon={Network} testId="card-connection-health">
      <Input placeholder="Platforms (YouTube, TikTok, Twitch...)..." value={platforms} onChange={(e) => setPlatforms(e.target.value)} className="text-sm" data-testid="input-health-platforms" />
      <Input placeholder="Recent errors (e.g. YouTube 401, TikTok 429)..." value={recentErrors} onChange={(e) => setRecentErrors(e.target.value)} className="text-sm" data-testid="input-health-errors" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-connection-health">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Network className="h-3.5 w-3.5 mr-1" />}Score Health
      </Button>
      <ResultDisplay data={result} testId="result-connection-health" />
    </AIToolCard>
  );
}

function ContentSyndicationPlanner() {
  const [contentType, setContentType] = useState("");
  const [primaryPlatform, setPrimaryPlatform] = useState("");
  const [targetPlatforms, setTargetPlatforms] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/content-syndication-planner", { contentType, primaryPlatform, targetPlatforms })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Content Syndication Planner" icon={Share2} testId="card-syndication-planner">
      <Input placeholder="Content type (long-form, live, short)..." value={contentType} onChange={(e) => setContentType(e.target.value)} className="text-sm" data-testid="input-syndication-type" />
      <Input placeholder="Primary platform..." value={primaryPlatform} onChange={(e) => setPrimaryPlatform(e.target.value)} className="text-sm" data-testid="input-syndication-primary" />
      <Input placeholder="Target platforms..." value={targetPlatforms} onChange={(e) => setTargetPlatforms(e.target.value)} className="text-sm" data-testid="input-syndication-targets" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !contentType.trim()} data-testid="button-syndication-planner">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1" />}Plan Syndication
      </Button>
      <ResultDisplay data={result} testId="result-syndication-planner" />
    </AIToolCard>
  );
}

function PlatformComplianceAuditor() {
  const [contentDescription, setContentDescription] = useState("");
  const [platforms, setPlatforms] = useState("");
  const [result, setResult] = useState<AIResponse>(null);
  const mutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/ai/platform-compliance-auditor", { contentDescription, platforms })).json(), onSuccess: setResult });
  return (
    <AIToolCard title="Multi-Platform Compliance Auditor" icon={ShieldAlert} testId="card-compliance-auditor">
      <Textarea placeholder="Content description..." value={contentDescription} onChange={(e) => setContentDescription(e.target.value)} className="text-sm min-h-[50px] resize-none" data-testid="input-compliance-content" />
      <Input placeholder="Target platforms (YouTube, TikTok, Twitch...)..." value={platforms} onChange={(e) => setPlatforms(e.target.value)} className="text-sm" data-testid="input-compliance-platforms" />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !contentDescription.trim()} data-testid="button-compliance-auditor">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 mr-1" />}Audit Compliance
      </Button>
      <ResultDisplay data={result} testId="result-compliance-auditor" />
    </AIToolCard>
  );
}

// ─── PLATFORM TOOL MAPS ──────────────────────────────────────

const PLATFORM_TOOLS: Record<string, React.ReactNode[]> = {
  youtube: [
    <TitleOptimizer key="title" />,
    <DescriptionOptimizer key="desc" />,
    <HashtagStrategy key="hash" />,
    <HookGenerator key="hook" />,
    <ViralPredictor key="viral" />,
    <ThumbnailABTest key="thumb" />,
    <CaptionGenerator key="caption" />,
    <EndScreenOptimizer key="endscreen" />,
    <SatisfactionAnalyzer key="satisfaction" />,
    <SurfaceOptimizer key="surface" />,
    <TrustSafetyScorer key="trust" />,
    <DiagnosticProtocol key="diagnostic" />,
    <GamingWindowDetector key="gaming" />,
    <MidRollOptimizer key="midroll" />,
    <TrafficSourceDiagnostic key="traffic" />,
    <GeoCPMOptimizer key="geo" />,
    <CTAEnforcer key="cta" />,
  ],
};

const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  youtube: "Algorithm, monetization & content intelligence",
};

export default function AIToolsTab() {
  const [activePlatform, setActivePlatform] = useState("youtube");
  const tools = PLATFORM_TOOLS[activePlatform] || [];

  return (
    <div className="space-y-3" data-testid="ai-tools-tab">
      <div className="flex flex-wrap gap-1" data-testid="platform-tabs">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlatform(p.id)}
            data-testid={`tab-platform-${p.id}`}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activePlatform === p.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {PLATFORM_DESCRIPTIONS[activePlatform] && (
        <p className="text-xs text-muted-foreground" data-testid="platform-description">
          {PLATFORM_DESCRIPTIONS[activePlatform]}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {tools}
      </div>
    </div>
  );
}
