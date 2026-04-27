import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, FileText, Hash, Zap, TrendingUp, Image, Captions, MonitorPlay, ThumbsUp, Layers } from "lucide-react";

type AIResponse = any;

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

function TitleOptimizer() {
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/title-optimizer", { title, niche });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Title Optimizer" icon={Sparkles} testId="card-title-optimizer">
      <Input
        placeholder="Video title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm"
        data-testid="input-title-optimizer-title"
      />
      <Input
        placeholder="Niche (e.g. tech, gaming)"
        value={niche}
        onChange={(e) => setNiche(e.target.value)}
        className="text-sm"
        data-testid="input-title-optimizer-niche"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !title.trim()}
        data-testid="button-title-optimizer"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
        Optimize
      </Button>
      <ResultDisplay data={result} testId="result-title-optimizer" />
    </AIToolCard>
  );
}

function DescriptionOptimizer() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/description-optimizer", { title, description });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Description Optimizer" icon={FileText} testId="card-description-optimizer">
      <Input
        placeholder="Video title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm"
        data-testid="input-desc-optimizer-title"
      />
      <Textarea
        placeholder="Video description..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="text-sm min-h-[60px] resize-none"
        data-testid="input-desc-optimizer-description"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !description.trim()}
        data-testid="button-description-optimizer"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
        Optimize
      </Button>
      <ResultDisplay data={result} testId="result-description-optimizer" />
    </AIToolCard>
  );
}

function HashtagStrategy() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/hashtag-strategy", { topic, platform });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Hashtag Strategy" icon={Hash} testId="card-hashtag-strategy">
      <Input
        placeholder="Topic..."
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="text-sm"
        data-testid="input-hashtag-topic"
      />
      <Input
        placeholder="Platform (youtube, tiktok...)"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
        className="text-sm"
        data-testid="input-hashtag-platform"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !topic.trim()}
        data-testid="button-hashtag-strategy"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Hash className="h-3.5 w-3.5 mr-1" />}
        Generate
      </Button>
      <ResultDisplay data={result} testId="result-hashtag-strategy" />
    </AIToolCard>
  );
}

function HookGenerator() {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("engaging");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/hook-generator", { topic, style });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Hook Generator" icon={Zap} testId="card-hook-generator">
      <Input
        placeholder="Topic..."
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="text-sm"
        data-testid="input-hook-topic"
      />
      <Input
        placeholder="Style (engaging, controversial...)"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        className="text-sm"
        data-testid="input-hook-style"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !topic.trim()}
        data-testid="button-hook-generator"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
        Generate
      </Button>
      <ResultDisplay data={result} testId="result-hook-generator" />
    </AIToolCard>
  );
}

function ViralPredictor() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/viral-predictor", { title, description });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Viral Predictor" icon={TrendingUp} testId="card-viral-predictor">
      <Input
        placeholder="Video title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm"
        data-testid="input-viral-title"
      />
      <Input
        placeholder="Description snippet..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="text-sm"
        data-testid="input-viral-description"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !title.trim()}
        data-testid="button-viral-predictor"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5 mr-1" />}
        Predict
      </Button>
      <ResultDisplay data={result} testId="result-viral-predictor" />
    </AIToolCard>
  );
}

function ThumbnailABTest() {
  const [videoTitle, setVideoTitle] = useState("");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/thumbnail-ab-test", { videoTitle });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Thumbnail A/B Test" icon={Image} testId="card-thumbnail-ab-test">
      <Input
        placeholder="Video title..."
        value={videoTitle}
        onChange={(e) => setVideoTitle(e.target.value)}
        className="text-sm"
        data-testid="input-thumbnail-title"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !videoTitle.trim()}
        data-testid="button-thumbnail-ab-test"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Image className="h-3.5 w-3.5 mr-1" />}
        Generate A/B
      </Button>
      <ResultDisplay data={result} testId="result-thumbnail-ab-test" />
    </AIToolCard>
  );
}

function CaptionGenerator() {
  const [videoTitle, setVideoTitle] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/caption-generator", { videoTitle, platform });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Caption Generator" icon={Captions} testId="card-caption-generator">
      <Input
        placeholder="Video title..."
        value={videoTitle}
        onChange={(e) => setVideoTitle(e.target.value)}
        className="text-sm"
        data-testid="input-caption-title"
      />
      <Input
        placeholder="Platform (youtube, tiktok...)"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
        className="text-sm"
        data-testid="input-caption-platform"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !videoTitle.trim()}
        data-testid="button-caption-generator"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Captions className="h-3.5 w-3.5 mr-1" />}
        Generate
      </Button>
      <ResultDisplay data={result} testId="result-caption-generator" />
    </AIToolCard>
  );
}

function EndScreenOptimizer() {
  const [channelName, setChannelName] = useState("");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/end-screen-optimizer", { channelName });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="End Screen Optimizer" icon={MonitorPlay} testId="card-end-screen-optimizer">
      <Input
        placeholder="Channel name..."
        value={channelName}
        onChange={(e) => setChannelName(e.target.value)}
        className="text-sm"
        data-testid="input-end-screen-channel"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !channelName.trim()}
        data-testid="button-end-screen-optimizer"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5 mr-1" />}
        Analyze
      </Button>
      <ResultDisplay data={result} testId="result-end-screen-optimizer" />
    </AIToolCard>
  );
}

function SatisfactionAnalyzer() {
  const [avgRetention, setAvgRetention] = useState("");
  const [viewCount, setViewCount] = useState("");
  const [likeCount, setLikeCount] = useState("");
  const [commentCount, setCommentCount] = useState("");
  const [niche, setNiche] = useState("gaming");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/satisfaction-analyzer", {
        avgRetention: avgRetention ? parseFloat(avgRetention) : undefined,
        viewCount: viewCount ? parseInt(viewCount) : undefined,
        likeCount: likeCount ? parseInt(likeCount) : undefined,
        commentCount: commentCount ? parseInt(commentCount) : undefined,
        niche,
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Satisfaction Analyzer (2026)" icon={ThumbsUp} testId="card-satisfaction-analyzer">
      <Input
        placeholder="Avg retention % (e.g. 55)"
        value={avgRetention}
        onChange={(e) => setAvgRetention(e.target.value)}
        className="text-sm"
        data-testid="input-satisfaction-retention"
      />
      <Input
        placeholder="Views"
        value={viewCount}
        onChange={(e) => setViewCount(e.target.value)}
        className="text-sm"
        data-testid="input-satisfaction-views"
      />
      <Input
        placeholder="Likes"
        value={likeCount}
        onChange={(e) => setLikeCount(e.target.value)}
        className="text-sm"
        data-testid="input-satisfaction-likes"
      />
      <Input
        placeholder="Comments"
        value={commentCount}
        onChange={(e) => setCommentCount(e.target.value)}
        className="text-sm"
        data-testid="input-satisfaction-comments"
      />
      <Input
        placeholder="Niche (gaming, tech...)"
        value={niche}
        onChange={(e) => setNiche(e.target.value)}
        className="text-sm"
        data-testid="input-satisfaction-niche"
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || (!avgRetention && !viewCount)}
        data-testid="button-satisfaction-analyzer"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1" />}
        Analyze
      </Button>
      <ResultDisplay data={result} testId="result-satisfaction-analyzer" />
    </AIToolCard>
  );
}

function SurfaceOptimizer() {
  const [videoTitle, setVideoTitle] = useState("");
  const [gameName, setGameName] = useState("");
  const [targetSurface, setTargetSurface] = useState("home");
  const [result, setResult] = useState<AIResponse>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/surface-optimizer", {
        videoTitle,
        gameName,
        targetSurface,
        videoType: "long-form",
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <AIToolCard title="Surface Optimizer" icon={Layers} testId="card-surface-optimizer">
      <Input
        placeholder="Video title..."
        value={videoTitle}
        onChange={(e) => setVideoTitle(e.target.value)}
        className="text-sm"
        data-testid="input-surface-title"
      />
      <Input
        placeholder="Game name..."
        value={gameName}
        onChange={(e) => setGameName(e.target.value)}
        className="text-sm"
        data-testid="input-surface-game"
      />
      <select
        value={targetSurface}
        onChange={(e) => setTargetSurface(e.target.value)}
        className="w-full text-sm rounded-md border border-input bg-background px-3 py-1.5 h-8"
        data-testid="select-surface-target"
      >
        <option value="home">Home feed</option>
        <option value="suggested">Suggested (Up Next)</option>
        <option value="search">Search</option>
        <option value="subscriptions">Subscriptions</option>
        <option value="shorts">Shorts feed</option>
      </select>
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !videoTitle.trim()}
        data-testid="button-surface-optimizer"
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Layers className="h-3.5 w-3.5 mr-1" />}
        Optimize for Surface
      </Button>
      <ResultDisplay data={result} testId="result-surface-optimizer" />
    </AIToolCard>
  );
}

export default function AIToolsTab() {
  return (
    <div className="space-y-3" data-testid="ai-tools-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <TitleOptimizer />
        <DescriptionOptimizer />
        <HashtagStrategy />
        <HookGenerator />
        <ViralPredictor />
        <ThumbnailABTest />
        <CaptionGenerator />
        <EndScreenOptimizer />
        <SatisfactionAnalyzer />
        <SurfaceOptimizer />
      </div>
    </div>
  );
}
