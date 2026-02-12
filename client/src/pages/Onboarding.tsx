import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PLATFORMS, PLATFORM_INFO, type Platform, type LinkedChannel } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowRight,
  Zap,
  Loader2,
  LogIn,
  Lightbulb,
  Sparkles,
  Rocket,
  Video,
  Target,
  Calendar,
  TrendingUp,
  Eye,
  EyeOff,
} from "lucide-react";

const CATEGORIES: { key: string; label: string; platforms: Platform[] }[] = [
  {
    key: "priority",
    label: "Priority",
    platforms: ["youtube", "youtubeshorts"],
  },
  {
    key: "live-streaming",
    label: "Live Streaming",
    platforms: ["twitch", "kick", "facebook", "tiktok", "x", "rumble", "linkedin", "instagram", "dlive", "trovo"],
  },
  {
    key: "social-media",
    label: "Social Media",
    platforms: ["discord", "snapchat", "pinterest", "reddit", "threads", "bluesky", "mastodon"],
  },
  {
    key: "creator-economy",
    label: "Creator Economy",
    platforms: ["patreon", "kofi", "substack"],
  },
  {
    key: "podcasts",
    label: "Podcasts",
    platforms: ["spotify", "applepodcasts"],
  },
  {
    key: "messaging",
    label: "Messaging",
    platforms: ["whatsapp"],
  },
];

const NICHE_PLATFORMS: Record<string, { platforms: Platform[]; reasons: Record<string, string> }> = {
  gaming: {
    platforms: ["youtube", "youtubeshorts", "twitch", "kick", "discord", "tiktok", "x", "reddit", "rumble"],
    reasons: {
      youtube: "Upload gameplay, reviews, and walkthroughs",
      youtubeshorts: "Clip highlights and funny moments",
      twitch: "Live stream your gameplay to a gaming audience",
      kick: "Alternative streaming platform growing fast in gaming",
      discord: "Build a community server for your fans",
      tiktok: "Short gaming clips go viral fast here",
      x: "Share updates and engage with the gaming community",
      reddit: "Post in gaming subreddits to build your audience",
      rumble: "Reach audiences looking for alternative platforms",
    },
  },
  tech: {
    platforms: ["youtube", "youtubeshorts", "x", "reddit", "linkedin", "discord", "tiktok", "mastodon", "substack"],
    reasons: {
      youtube: "In-depth reviews, tutorials, and unboxings",
      youtubeshorts: "Quick tech tips and first impressions",
      x: "Share tech news and engage with the tech community",
      reddit: "Post in tech subreddits for targeted audiences",
      linkedin: "Professional tech content and networking",
      discord: "Build a tech community for discussions",
      tiktok: "Short tech tips and quick reviews",
      mastodon: "Tech-savvy audience loves open platforms",
      substack: "Write detailed tech analysis and newsletters",
    },
  },
  cooking: {
    platforms: ["youtube", "youtubeshorts", "instagram", "tiktok", "pinterest", "facebook", "snapchat"],
    reasons: {
      youtube: "Full recipe videos and cooking shows",
      youtubeshorts: "Quick recipe clips and cooking hacks",
      instagram: "Beautiful food photography and Reels",
      tiktok: "Short recipe videos are hugely popular here",
      pinterest: "Recipe pins drive massive long-term traffic",
      facebook: "Share recipes with cooking groups and communities",
      snapchat: "Behind-the-scenes cooking content",
    },
  },
  vlogging: {
    platforms: ["youtube", "youtubeshorts", "instagram", "tiktok", "snapchat", "threads", "x", "facebook"],
    reasons: {
      youtube: "Long-form vlogs and day-in-the-life content",
      youtubeshorts: "Quick life updates and travel clips",
      instagram: "Photo stories and Reels of your daily life",
      tiktok: "Short lifestyle clips and trends",
      snapchat: "Behind-the-scenes and real-time updates",
      threads: "Share quick thoughts and connect with followers",
      x: "Daily updates and engage with your community",
      facebook: "Reach a broad audience with lifestyle content",
    },
  },
  education: {
    platforms: ["youtube", "youtubeshorts", "linkedin", "tiktok", "reddit", "substack", "x", "threads"],
    reasons: {
      youtube: "In-depth tutorials, courses, and explainers",
      youtubeshorts: "Quick tips and bite-sized lessons",
      linkedin: "Professional development and career content",
      tiktok: "EduTok is a massive category — short lessons",
      reddit: "Share knowledge in topic-specific subreddits",
      substack: "Write detailed educational newsletters",
      x: "Share quick insights and engage learners",
      threads: "Short-form educational posts",
    },
  },
  fitness: {
    platforms: ["youtube", "youtubeshorts", "instagram", "tiktok", "facebook", "threads", "snapchat"],
    reasons: {
      youtube: "Full workout videos and fitness programs",
      youtubeshorts: "Quick exercise demos and tips",
      instagram: "Transformation photos, Reels, and Stories",
      tiktok: "Short workout clips and fitness trends",
      facebook: "Fitness groups and community engagement",
      threads: "Daily fitness motivation and tips",
      snapchat: "Daily workout updates and progress",
    },
  },
  music: {
    platforms: ["youtube", "youtubeshorts", "spotify", "applepodcasts", "instagram", "tiktok", "x", "discord"],
    reasons: {
      youtube: "Music videos, covers, and performances",
      youtubeshorts: "Short clips and song previews",
      spotify: "Distribute your music and grow listeners",
      applepodcasts: "Music commentary and behind-the-scenes",
      instagram: "Share clips and connect with fans",
      tiktok: "Short song clips can go viral and drive streams",
      x: "Announce releases and engage with fans",
      discord: "Build a fan community",
    },
  },
  business: {
    platforms: ["youtube", "youtubeshorts", "linkedin", "x", "substack", "threads", "tiktok", "reddit"],
    reasons: {
      youtube: "Business advice, case studies, and interviews",
      youtubeshorts: "Quick business tips and insights",
      linkedin: "Professional content and thought leadership",
      x: "Business commentary and networking",
      substack: "In-depth business newsletters and analysis",
      threads: "Quick business takes and discussions",
      tiktok: "FinTok and BizTok are growing fast",
      reddit: "Engage in business and finance communities",
    },
  },
  beauty: {
    platforms: ["youtube", "youtubeshorts", "instagram", "tiktok", "pinterest", "snapchat", "threads"],
    reasons: {
      youtube: "Tutorials, hauls, and product reviews",
      youtubeshorts: "Quick makeup tips and transformations",
      instagram: "Product photos, Reels, and Stories",
      tiktok: "GRWM and beauty trends go viral here",
      pinterest: "Beauty inspiration pins drive search traffic",
      snapchat: "Daily beauty routines and behind-the-scenes",
      threads: "Quick beauty tips and product recs",
    },
  },
  comedy: {
    platforms: ["youtube", "youtubeshorts", "tiktok", "instagram", "x", "snapchat", "reddit", "facebook"],
    reasons: {
      youtube: "Sketches, commentary, and long-form comedy",
      youtubeshorts: "Short skits and reaction clips",
      tiktok: "Comedy clips and trends are the core of TikTok",
      instagram: "Reels and funny Stories",
      x: "Comedic commentary and engaging with fans",
      snapchat: "Behind-the-scenes and daily humor",
      reddit: "Share content in comedy and meme subreddits",
      facebook: "Comedy videos reach a wide audience here",
    },
  },
  art: {
    platforms: ["youtube", "youtubeshorts", "instagram", "tiktok", "pinterest", "threads", "discord", "bluesky"],
    reasons: {
      youtube: "Time-lapses, tutorials, and process videos",
      youtubeshorts: "Quick art process clips",
      instagram: "Showcase your portfolio and art Reels",
      tiktok: "Art process videos get huge engagement",
      pinterest: "Art pins drive traffic and commissions",
      threads: "Share works-in-progress and connect with artists",
      discord: "Build an art community and share work",
      bluesky: "Growing art community on this platform",
    },
  },
  other: {
    platforms: ["youtube", "youtubeshorts", "tiktok", "instagram", "x", "discord", "threads", "reddit"],
    reasons: {
      youtube: "Long-form content for any niche",
      youtubeshorts: "Short clips to grow your audience fast",
      tiktok: "Short-form content for maximum reach",
      instagram: "Visual content and community building",
      x: "Engage with your audience and share updates",
      discord: "Build a dedicated community",
      threads: "Quick updates and discussions",
      reddit: "Find and engage your target audience",
    },
  },
};

function PlatformCard({
  platform,
  info,
  isConnected,
  onConnect,
  isPending,
  oauthStatus,
  reason,
}: {
  platform: Platform;
  info: (typeof PLATFORM_INFO)[Platform];
  isConnected: boolean;
  onConnect: (data: { value: string }) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
  reason?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const { toast } = useToast();

  const isYouTube = platform === "youtube" || platform === "youtubeshorts";
  const platformOAuth = oauthStatus?.[platform];
  const hasOAuthConfig = platformOAuth?.configured || false;
  const canOAuth = isYouTube || hasOAuthConfig;

  const inputLabel = (() => {
    if (info.category === "streaming" && info.rtmpUrlTemplate) return "Stream Key";
    if (info.connectionType === "api_key") return "API Key";
    return "Profile URL or Username";
  })();

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    try {
      if (isYouTube) {
        const res = await fetch("/api/youtube/auth", { credentials: "include", headers: { "Accept": "application/json" } });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const res = await fetch(`/api/oauth/${platform}/auth`, { credentials: "include", headers: { "Accept": "application/json" } });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setOauthLoading(false);
    }
  };

  return (
    <Card
      data-testid={`card-platform-${platform}`}
      className={isConnected ? "border-emerald-500/30" : ""}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center shrink-0 text-white font-bold text-sm"
            style={{ backgroundColor: info.color === "#000000" ? "#333" : info.color }}
            data-testid={`icon-platform-${platform}`}
          >
            {info.label.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{info.label}</span>
              <span
                data-testid={`status-platform-${platform}`}
                className={`h-2 w-2 rounded-full shrink-0 ${isConnected ? "bg-emerald-400" : "bg-muted-foreground/30"}`}
              />
              {isConnected && (
                <Badge variant="secondary" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              )}
            </div>
            {reason && (
              <p data-testid={`text-reason-${platform}`} className="text-xs text-primary/80 mt-0.5 font-medium">{reason}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {info.strategyDescription}
            </p>
          </div>
          {!isConnected && (
            <Button
              data-testid={`button-expand-${platform}`}
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {!isConnected && canOAuth && !expanded && (
          <div className="mt-3">
            <Button
              data-testid={`button-oauth-${platform}`}
              onClick={handleOAuthLogin}
              disabled={oauthLoading}
              className="w-full"
              style={{ backgroundColor: info.color === "#000000" ? "#333" : info.color, borderColor: info.color, color: "#fff" }}
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              {oauthLoading ? "Redirecting..." : `Login with ${info.label}`}
            </Button>
          </div>
        )}

        {expanded && !isConnected && (
          <div className="mt-4 space-y-3">
            {canOAuth && (
              <Button
                data-testid={`button-oauth-expanded-${platform}`}
                onClick={handleOAuthLogin}
                disabled={oauthLoading}
                className="w-full"
                style={{ backgroundColor: info.color === "#000000" ? "#333" : info.color, borderColor: info.color, color: "#fff" }}
              >
                {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                {oauthLoading ? "Redirecting..." : `Login with ${info.label}`}
              </Button>
            )}

            {!canOAuth && platformOAuth?.hasOAuth && (
              <div className="rounded-md bg-muted p-2 text-center">
                <p className="text-xs text-muted-foreground">OAuth available - add credentials to enable</p>
              </div>
            )}

            {!isYouTube && (
              <>
                {canOAuth && (
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or manually</span></div>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    data-testid={`input-${platform}`}
                    placeholder={inputLabel}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1 min-w-[180px]"
                  />
                  <Button
                    data-testid={`button-connect-${platform}`}
                    size="sm"
                    disabled={!inputValue.trim() || isPending}
                    onClick={() => onConnect({ value: inputValue.trim() })}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
                  </Button>
                </div>

                <a
                  href={info.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`link-signup-${platform}`}
                >
                  Don't have an account? Sign up
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const NICHE_OPTIONS = [
  { id: "gaming", label: "Gaming", icon: Target, description: "Let's plays, esports, game reviews" },
  { id: "tech", label: "Tech & Reviews", icon: Sparkles, description: "Gadgets, software, tutorials" },
  { id: "cooking", label: "Cooking & Food", icon: Lightbulb, description: "Recipes, restaurant reviews, food science" },
  { id: "vlogging", label: "Vlogging & Lifestyle", icon: Video, description: "Daily life, travel, personal stories" },
  { id: "education", label: "Education & How-to", icon: Rocket, description: "Tutorials, courses, explainers" },
  { id: "fitness", label: "Fitness & Health", icon: TrendingUp, description: "Workouts, nutrition, wellness" },
  { id: "music", label: "Music & Entertainment", icon: Sparkles, description: "Covers, originals, performances" },
  { id: "business", label: "Business & Finance", icon: TrendingUp, description: "Investing, entrepreneurship, money tips" },
  { id: "beauty", label: "Beauty & Fashion", icon: Sparkles, description: "Makeup, style, hauls" },
  { id: "comedy", label: "Comedy & Skits", icon: Lightbulb, description: "Sketches, reactions, commentary" },
  { id: "art", label: "Art & Design", icon: Sparkles, description: "Drawing, digital art, crafts" },
  { id: "other", label: "Something Else", icon: Lightbulb, description: "Tell me your idea" },
];

function RecommendedPlatforms({
  niche,
  connectedPlatforms,
  onConnect,
  isPending,
  oauthStatus,
  showAll,
  onToggleShowAll,
}: {
  niche: string;
  connectedPlatforms: Set<string>;
  onConnect: (platform: Platform, value: string) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const nicheData = NICHE_PLATFORMS[niche] || NICHE_PLATFORMS["other"];
  const recommendedList = nicheData.platforms;
  const allPlatformsList = PLATFORMS as readonly Platform[];
  const remainingPlatforms = allPlatformsList.filter((p) => !recommendedList.includes(p));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Target className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 data-testid="text-recommended-heading" className="text-lg font-display font-bold">
            Recommended for {NICHE_OPTIONS.find((n) => n.id === niche)?.label || "Your Niche"}
          </h2>
          <p className="text-sm text-muted-foreground">These platforms are the best fit for your content type</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendedList.map((platform) => {
          const info = PLATFORM_INFO[platform];
          const reason = nicheData.reasons[platform];
          return (
            <div key={platform} data-testid={`card-recommended-${platform}`}>
              <PlatformCard
                platform={platform}
                info={info}
                isConnected={connectedPlatforms.has(platform)}
                onConnect={({ value }) => onConnect(platform, value)}
                isPending={isPending}
                oauthStatus={oauthStatus}
                reason={reason}
              />
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          data-testid="button-toggle-show-all"
          variant="ghost"
          size="sm"
          onClick={onToggleShowAll}
        >
          {showAll ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showAll ? "Hide Other Platforms" : `Show All ${PLATFORMS.length} Platforms`}
        </Button>
      </div>

      {showAll && remainingPlatforms.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Other Platforms</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {remainingPlatforms.map((platform) => {
              const info = PLATFORM_INFO[platform];
              return (
                <PlatformCard
                  key={platform}
                  platform={platform}
                  info={info}
                  isConnected={connectedPlatforms.has(platform)}
                  onConnect={({ value }) => onConnect(platform, value)}
                  isPending={isPending}
                  oauthStatus={oauthStatus}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NewCreatorFlow({
  onFinish,
  onSkipToPlatforms,
  onNicheSelected,
  connectedPlatforms,
  onConnect,
  isPending,
  oauthStatus,
}: {
  onFinish: () => void;
  onSkipToPlatforms: () => void;
  onNicheSelected: (niche: string) => void;
  connectedPlatforms: Set<string>;
  onConnect: (platform: Platform, value: string) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
}) {
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [customIdea, setCustomIdea] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (niche: string) => {
      const res = await apiRequest("POST", "/api/ai/new-creator-plan", {
        niche,
        customIdea: niche === "other" ? customIdea : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAiResult(data);
      if (selectedNiche) onNicheSelected(selectedNiche);
    },
    onError: () => {
      toast({
        title: "AI is thinking...",
        description: "We'll generate your plan in a moment. Try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedNiche) return;
    generateMutation.mutate(selectedNiche === "other" ? customIdea || "general content creation" : selectedNiche);
  };

  if (aiResult && showPlatforms && selectedNiche) {
    return (
      <div className="space-y-6">
        <RecommendedPlatforms
          niche={selectedNiche}
          connectedPlatforms={connectedPlatforms}
          onConnect={onConnect}
          isPending={isPending}
          oauthStatus={oauthStatus}
          showAll={showAllPlatforms}
          onToggleShowAll={() => setShowAllPlatforms(!showAllPlatforms)}
        />

        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap border-t border-border pt-6">
          <Button
            data-testid="button-back-to-roadmap"
            variant="ghost"
            size="sm"
            onClick={() => setShowPlatforms(false)}
          >
            <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
            Back to Roadmap
          </Button>
          <Button
            data-testid="button-finish-setup"
            onClick={onFinish}
          >
            Continue to Dashboard
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (aiResult) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 data-testid="text-ai-plan-heading" className="text-lg font-display font-bold">Your Creator Roadmap</h2>
            <p className="text-sm text-muted-foreground">AI-generated plan based on your niche</p>
          </div>
        </div>

        {aiResult.channelName && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Suggested Channel Name</h3>
              <p data-testid="text-suggested-name" className="text-base font-medium text-primary">{aiResult.channelName}</p>
              {aiResult.channelDescription && (
                <>
                  <h3 className="text-sm font-semibold mt-3">Channel Description</h3>
                  <p data-testid="text-suggested-description" className="text-sm text-muted-foreground">{aiResult.channelDescription}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {aiResult.videoIdeas?.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Video className="h-4 w-4" />
                Your First 10 Video Ideas
              </h3>
              <ol className="space-y-1.5 mt-2">
                {aiResult.videoIdeas.map((idea: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2" data-testid={`text-video-idea-${i}`}>
                    <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
                    <span>{idea}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {aiResult.schedule && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Recommended Posting Schedule
              </h3>
              <p data-testid="text-schedule" className="text-sm text-muted-foreground">{aiResult.schedule}</p>
            </CardContent>
          </Card>
        )}

        {aiResult.growthStrategy && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Growth Strategy
              </h3>
              <p data-testid="text-growth-strategy" className="text-sm text-muted-foreground">{aiResult.growthStrategy}</p>
            </CardContent>
          </Card>
        )}

        {aiResult.brandingTips && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Branding Suggestions
              </h3>
              <p data-testid="text-branding-tips" className="text-sm text-muted-foreground">{aiResult.brandingTips}</p>
            </CardContent>
          </Card>
        )}

        {aiResult.nicheAnalysis && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4" />
                Niche Analysis
              </h3>
              <p data-testid="text-niche-analysis" className="text-sm text-muted-foreground">{aiResult.nicheAnalysis}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            data-testid="button-connect-platforms"
            onClick={() => setShowPlatforms(true)}
          >
            <Zap className="h-4 w-4 mr-2" />
            Connect Your Platforms
          </Button>
          <Button
            data-testid="button-create-youtube-channel"
            variant="secondary"
            onClick={() => window.open("https://www.youtube.com/create_channel", "_blank")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Create YouTube Channel
          </Button>
          <Button
            data-testid="button-continue-without-channel"
            variant="ghost"
            onClick={onFinish}
          >
            Skip to Dashboard
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Connect platforms best suited for your {NICHE_OPTIONS.find((n) => n.id === selectedNiche)?.label?.toLowerCase() || ""} content, or go straight to the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Rocket className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 data-testid="text-new-creator-heading" className="text-lg font-display font-bold">Start Your Creator Journey</h2>
          <p className="text-sm text-muted-foreground">Pick your niche and we'll build your roadmap and recommend the best platforms.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {NICHE_OPTIONS.map((niche) => (
          <Card
            key={niche.id}
            data-testid={`card-niche-${niche.id}`}
            className={`cursor-pointer transition-colors ${selectedNiche === niche.id ? "border-primary" : ""}`}
            onClick={() => setSelectedNiche(niche.id)}
          >
            <CardContent className="p-3 text-center space-y-1">
              <niche.icon className={`h-5 w-5 mx-auto ${selectedNiche === niche.id ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-semibold">{niche.label}</p>
              <p className="text-xs text-muted-foreground">{niche.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedNiche === "other" && (
        <Input
          data-testid="input-custom-idea"
          placeholder="Describe your content idea..."
          value={customIdea}
          onChange={(e) => setCustomIdea(e.target.value)}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          data-testid="button-generate-plan"
          onClick={handleGenerate}
          disabled={!selectedNiche || generateMutation.isPending || (selectedNiche === "other" && !customIdea.trim())}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              AI is building your roadmap...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate My Creator Roadmap
            </>
          )}
        </Button>
        <Button
          data-testid="button-skip-to-platforms"
          variant="ghost"
          onClick={onSkipToPlatforms}
        >
          Skip - connect platforms instead
        </Button>
      </div>
    </div>
  );
}

type OnboardingStep = "choice" | "new-creator" | "existing-creator";

function ChoiceScreen({ onChoose }: { onChoose: (choice: OnboardingStep) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-14 w-14 rounded-md bg-primary flex items-center justify-center mb-6">
        <Zap className="h-7 w-7 text-primary-foreground" />
      </div>
      <h1
        data-testid="text-onboarding-heading"
        className="text-2xl sm:text-3xl font-display font-bold text-center"
      >
        Welcome to CreatorOS
      </h1>
      <p
        data-testid="text-onboarding-subtitle"
        className="mt-2 text-sm text-muted-foreground text-center max-w-md"
      >
        Let's set things up. Which best describes you?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 w-full max-w-lg">
        <Card
          data-testid="card-choice-new"
          className="cursor-pointer hover-elevate"
          onClick={() => onChoose("new-creator")}
        >
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-base font-display font-bold">I'm a New Creator</h2>
            <p className="text-xs text-muted-foreground">
              I'm just getting started and want help picking a niche, naming my channel, and planning content.
            </p>
          </CardContent>
        </Card>

        <Card
          data-testid="card-choice-existing"
          className="cursor-pointer hover-elevate"
          onClick={() => onChoose("existing-creator")}
        >
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-base font-display font-bold">I'm an Existing Creator</h2>
            <p className="text-xs text-muted-foreground">
              I already have channels and want to connect my platforms and start automating.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExistingCreatorNichePicker({
  onNicheSelected,
}: {
  onNicheSelected: (niche: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Target className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 data-testid="text-niche-picker-heading" className="text-lg font-display font-bold">What type of content do you create?</h2>
          <p className="text-sm text-muted-foreground">We'll show you the best platforms for your content</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {NICHE_OPTIONS.map((niche) => (
          <Card
            key={niche.id}
            data-testid={`card-existing-niche-${niche.id}`}
            className="cursor-pointer hover-elevate"
            onClick={() => onNicheSelected(niche.id)}
          >
            <CardContent className="p-3 text-center space-y-1">
              <niche.icon className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="text-sm font-semibold">{niche.label}</p>
              <p className="text-xs text-muted-foreground">{niche.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  usePageTitle("Get Started");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>("choice");
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  const { data: linkedChannels = [], isLoading } = useQuery<LinkedChannel[]>({
    queryKey: ["/api/linked-channels"],
  });

  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
  });

  const connectMutation = useMutation({
    mutationFn: async (data: {
      platform: string;
      username?: string;
      profileUrl?: string;
      connectionType: string;
      credentials?: { streamKey?: string; apiKey?: string };
    }) => {
      const res = await apiRequest("POST", "/api/linked-channels", {
        ...data,
        isConnected: true,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/linked-channels"] });
      const info = PLATFORM_INFO[variables.platform as Platform];
      toast({
        title: `${info?.label || variables.platform} Connected`,
        description: "Platform linked successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectedPlatforms = new Set(
    linkedChannels.filter((c) => c.isConnected).map((c) => c.platform)
  );
  const connectedCount = connectedPlatforms.size;

  const handleConnect = (platform: Platform, value: string) => {
    const info = PLATFORM_INFO[platform];
    const isStreamKey = info.category === "streaming" && info.rtmpUrlTemplate;
    const isApiKey = info.connectionType === "api_key";

    connectMutation.mutate({
      platform,
      username: !isStreamKey && !isApiKey ? value : undefined,
      profileUrl: !isStreamKey && !isApiKey ? value : undefined,
      connectionType: info.connectionType,
      credentials: isStreamKey
        ? { streamKey: value }
        : isApiKey
        ? { apiKey: value }
        : undefined,
    });
  };

  const finishOnboarding = async () => {
    try {
      await apiRequest("PATCH", "/api/user/profile", {
        contentNiche: selectedNiche || undefined,
        onboardingCompleted: true,
      });
    } catch {}
    if (onComplete) {
      onComplete();
    } else {
      if (user?.id) {
        localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
      }
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span data-testid="text-onboarding-logo" className="font-display font-bold text-sm">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          {step !== "choice" && (
            <Badge variant="secondary" data-testid="badge-progress">
              {connectedCount} of {PLATFORMS.length} connected
            </Badge>
          )}
        </div>
      </nav>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-10">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : step === "choice" ? (
            <ChoiceScreen onChoose={setStep} />
          ) : step === "new-creator" ? (
            <>
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    data-testid="button-back-to-choice"
                    size="sm"
                    variant="ghost"
                    onClick={() => setStep("choice")}
                  >
                    <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                    Back
                  </Button>
                </div>
                <h1
                  data-testid="text-onboarding-heading"
                  className="text-2xl sm:text-3xl font-display font-bold"
                >
                  Start Your Creator Journey
                </h1>
                <p
                  data-testid="text-onboarding-subtitle"
                  className="mt-2 text-sm text-muted-foreground max-w-xl"
                >
                  Let's help you turn your idea into a content empire. Pick your niche and we'll build your roadmap.
                </p>
              </div>
              <NewCreatorFlow
                onFinish={finishOnboarding}
                onSkipToPlatforms={() => setStep("existing-creator")}
                onNicheSelected={setSelectedNiche}
                connectedPlatforms={connectedPlatforms}
                onConnect={handleConnect}
                isPending={connectMutation.isPending}
                oauthStatus={oauthStatus}
              />
            </>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    data-testid="button-back-to-choice"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStep("choice");
                      setSelectedNiche(null);
                      setShowAllPlatforms(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                    Back
                  </Button>
                </div>
                <h1
                  data-testid="text-onboarding-heading"
                  className="text-2xl sm:text-3xl font-display font-bold"
                >
                  Connect Your Platforms
                </h1>
                <p
                  data-testid="text-onboarding-subtitle"
                  className="mt-2 text-sm text-muted-foreground max-w-xl"
                >
                  {selectedNiche
                    ? `Here are the best platforms for your ${NICHE_OPTIONS.find((n) => n.id === selectedNiche)?.label?.toLowerCase() || ""} content. Connect them to unlock full automation.`
                    : "Tell us what kind of content you create so we can recommend the best platforms for you."}
                </p>
              </div>

              {!selectedNiche ? (
                <ExistingCreatorNichePicker onNicheSelected={setSelectedNiche} />
              ) : (
                <RecommendedPlatforms
                  niche={selectedNiche}
                  connectedPlatforms={connectedPlatforms}
                  onConnect={handleConnect}
                  isPending={connectMutation.isPending}
                  oauthStatus={oauthStatus}
                  showAll={showAllPlatforms}
                  onToggleShowAll={() => setShowAllPlatforms(!showAllPlatforms)}
                />
              )}

              <div className="mt-10 flex items-center justify-between gap-4 flex-wrap border-t border-border pt-6">
                {selectedNiche && (
                  <Button
                    data-testid="button-change-niche"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedNiche(null);
                      setShowAllPlatforms(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                    Change Content Type
                  </Button>
                )}
                <p className="text-sm text-muted-foreground" data-testid="text-progress-summary">
                  {connectedCount} of {PLATFORMS.length} platforms connected
                </p>
                <Button
                  data-testid="button-finish-setup"
                  onClick={finishOnboarding}
                >
                  {connectedCount > 0 ? "Finish Setup" : "Continue to Dashboard"}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
