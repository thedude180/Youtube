import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PLATFORMS, PLATFORM_INFO, type Platform, type LinkedChannel } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { useTranslation } from "react-i18next";
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
  KeyRound,
  Shield,
  CheckCircle2,
  Bot,
  RefreshCw,
  Scissors,
  UploadCloud,
} from "lucide-react";
import {
  SiYoutube,
  SiGoogle,
  SiMeta,
} from "react-icons/si";
import type { IconType } from "react-icons";

const PLATFORM_ICONS: Record<string, IconType> = {
  youtube: SiYoutube,
};

const GROUP_ICONS: Record<string, IconType> = {
  google: SiGoogle,
  meta: SiMeta,
};

const LOGIN_GROUPS: { id: string; label: string; color: string; provider: string; platforms: Platform[]; description: string }[] = [
  {
    id: "google",
    label: "Google Account",
    color: "#4285F4",
    provider: "google",
    platforms: ["youtube"],
    description: "YouTube + Shorts — one Google login connects everything",
  },
];

const GROUPED_PLATFORMS = new Set(LOGIN_GROUPS.flatMap(g => g.platforms));

// YouTube-only mode: only show YouTube in onboarding platform selection
const CATEGORIES: { key: string; label: string; platforms: Platform[] }[] = [
  {
    key: "priority",
    label: "YouTube",
    platforms: ["youtube"],
  },
];

// YouTube-only mode: each niche only recommends YouTube
const NICHE_PLATFORMS: Record<string, { platforms: Platform[]; reasons: Record<string, string> }> = {
  gaming:    { platforms: ["youtube"], reasons: { youtube: "Upload gameplay, reviews, walkthroughs + Shorts for highlights" } },
  tech:      { platforms: ["youtube"], reasons: { youtube: "In-depth reviews, tutorials, unboxings + Shorts for quick tips" } },
  cooking:   { platforms: ["youtube"], reasons: { youtube: "Full recipe videos, cooking shows + Shorts for quick hacks" } },
  vlogging:  { platforms: ["youtube"], reasons: { youtube: "Long-form vlogs, day-in-the-life + Shorts for quick updates" } },
  education: { platforms: ["youtube"], reasons: { youtube: "In-depth tutorials, courses, explainers + Shorts for quick tips" } },
  fitness:   { platforms: ["youtube"], reasons: { youtube: "Full workout videos, fitness programs + Shorts for exercise demos" } },
  music:     { platforms: ["youtube"], reasons: { youtube: "Music videos, covers, performances + Shorts for song previews" } },
  business:  { platforms: ["youtube"], reasons: { youtube: "Business advice, case studies, interviews + Shorts for quick tips" } },
  beauty:    { platforms: ["youtube"], reasons: { youtube: "Tutorials, hauls, product reviews + Shorts for quick tips" } },
  comedy:    { platforms: ["youtube"], reasons: { youtube: "Sketches, commentary, long-form comedy + Shorts for skits" } },
  art:       { platforms: ["youtube"], reasons: { youtube: "Time-lapses, tutorials, process videos + Shorts for quick clips" } },
  other:     { platforms: ["youtube"], reasons: { youtube: "Long-form content + Shorts for fast audience growth" } },
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

  const isYouTube = platform === "youtube";
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
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !isYouTube) {
        window.location.href = `/api/oauth/${platform}/bounce`;
        return;
      }
      const endpoint = isYouTube ? "/api/youtube/auth" : `/api/oauth/${platform}/auth`;
      const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const { url } = await res.json();
      window.location.href = url;
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
            {PLATFORM_ICONS[platform] ? (() => { const Icon = PLATFORM_ICONS[platform]; return <Icon className="w-4 h-4" />; })() : info.label.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{isYouTube ? "YouTube + Shorts" : info.label}</span>
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
          <div className="mt-3 space-y-2">
            <Button
              data-testid={`button-oauth-${platform}`}
              onClick={handleOAuthLogin}
              disabled={oauthLoading}
              className="w-full"
              style={{ backgroundColor: info.color === "#000000" ? "#333" : info.color, borderColor: info.color, color: "#fff" }}
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : PLATFORM_ICONS[platform] ? (() => { const PIcon = PLATFORM_ICONS[platform]; return <PIcon className="h-4 w-4 mr-2" />; })() : <LogIn className="h-4 w-4 mr-2" />}
              {oauthLoading ? "Redirecting..." : `Connect ${info.label}`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => window.open(info.signupUrl, "_blank")}
              data-testid={`button-signup-quick-${platform}`}
            >
              {isYouTube ? "Need a YouTube channel? Create one" : "No account yet? Sign up free"}
              <ExternalLink className="h-3 w-3 ml-1.5" />
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
                {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : PLATFORM_ICONS[platform] ? (() => { const PIcon = PLATFORM_ICONS[platform]; return <PIcon className="h-4 w-4 mr-2" />; })() : <LogIn className="h-4 w-4 mr-2" />}
                {oauthLoading ? "Redirecting..." : `Connect ${info.label}`}
              </Button>
            )}

            {!canOAuth && platformOAuth?.hasOAuth && (
              <div className="rounded-md bg-muted p-2 text-center">
                <p className="text-xs text-muted-foreground">OAuth available - add credentials to enable</p>
              </div>
            )}

            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {isYouTube ? "Need a YouTube channel?" : `Don't have a ${info.label} account?`}
              </p>
              <Button
                data-testid={`button-signup-${platform}`}
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(info.signupUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                {isYouTube ? "Create YouTube Channel" : `Sign Up for ${info.label}`}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {isYouTube
                  ? "Opens YouTube — create your channel, then come back and connect"
                  : "Opens in a new tab — sign up, then come back and connect"}
              </p>
            </div>

            {!isYouTube && (
              <>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or connect manually</span></div>
                </div>
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
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupedPlatformCard({
  group,
  connectedPlatforms,
  onConnect,
  isPending,
  oauthStatus,
}: {
  group: typeof LOGIN_GROUPS[number];
  connectedPlatforms: Set<string>;
  onConnect: (platform: Platform, value: string, skipGrouping?: boolean) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
}) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const { toast } = useToast();

  const allConnected = group.platforms.every(p => connectedPlatforms.has(p));
  const someConnected = group.platforms.some(p => connectedPlatforms.has(p));
  const connectedCount = group.platforms.filter(p => connectedPlatforms.has(p)).length;

  const handleGroupLogin = async () => {
    setOauthLoading(true);
    try {
      if (group.id === "google") {
        const res = await fetch("/api/youtube/auth", { credentials: "include", headers: { "Accept": "application/json" } });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        const { url } = await res.json();
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          const w = window.open(url, "_blank", "noopener,noreferrer");
          if (!w) window.location.href = url;
        } else {
          window.location.href = url;
        }
      } else {
        const unconnected = group.platforms.filter(p => !connectedPlatforms.has(p));
        for (const platform of unconnected) {
          onConnect(platform, group.label, true);
        }
        setOauthLoading(false);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setOauthLoading(false);
    }
  };

  return (
    <Card
      data-testid={`card-group-${group.id}`}
      className={allConnected ? "border-emerald-500/30" : someConnected ? "border-primary/20" : ""}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center shrink-0 text-white font-bold text-sm"
            style={{ backgroundColor: group.color }}
          >
            {GROUP_ICONS[group.id] ? (() => { const Icon = GROUP_ICONS[group.id]; return <Icon className="w-4 h-4" />; })() : group.label.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{group.label}</span>
              {allConnected && (
                <Badge variant="secondary" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  All Connected
                </Badge>
              )}
              {someConnected && !allConnected && (
                <Badge variant="secondary" className="text-xs">
                  {connectedCount}/{group.platforms.length} Connected
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{group.description}</p>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {group.platforms.map(p => {
                const info = PLATFORM_INFO[p];
                const connected = connectedPlatforms.has(p);
                return (
                  <Badge
                    key={p}
                    variant={connected ? "default" : "outline"}
                    className="text-xs"
                    data-testid={`badge-group-platform-${p}`}
                  >
                    {connected ? <Check className="w-3 h-3 mr-1" /> : PLATFORM_ICONS[p] ? (() => { const PIcon = PLATFORM_ICONS[p]; return <PIcon className="w-3 h-3 mr-1" />; })() : null}
                    {info.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {!allConnected && (
          <div className="mt-3 space-y-2">
            <Button
              data-testid={`button-group-login-${group.id}`}
              onClick={handleGroupLogin}
              disabled={oauthLoading || isPending}
              className="w-full"
              style={{ backgroundColor: group.color, borderColor: group.color, color: "#fff" }}
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : GROUP_ICONS[group.id] ? (() => { const GIcon = GROUP_ICONS[group.id]; return <GIcon className="h-4 w-4 mr-2" />; })() : <LogIn className="h-4 w-4 mr-2" />}
              {oauthLoading
                ? "Connecting..."
                : someConnected
                ? `Connect Remaining with ${group.label}`
                : `Connect with ${group.label}`
              }
            </Button>
            {group.id === "google" && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => window.open("https://www.youtube.com/create_channel", "_blank")}
                data-testid="button-signup-quick-youtube-group"
              >
                Need a YouTube channel? Create one
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Button>
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
  onConnect: (platform: Platform, value: string, skipGrouping?: boolean) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const nicheData = NICHE_PLATFORMS[niche] || NICHE_PLATFORMS["other"];
  const recommendedList = nicheData.platforms;
  const allPlatformsList = PLATFORMS as readonly Platform[];
  const relevantGroups = LOGIN_GROUPS.filter(g =>
    g.platforms.some(p => recommendedList.includes(p))
  );
  const individualRecommended = recommendedList.filter(p => !GROUPED_PLATFORMS.has(p));

  const allGroups = LOGIN_GROUPS;
  const allIndividual = allPlatformsList.filter(p => !GROUPED_PLATFORMS.has(p) && !recommendedList.includes(p) && (p as string) !== "youtubeshorts");

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
          <p className="text-sm text-muted-foreground">Connect accounts that share a login together — one tap connects all</p>
        </div>
      </div>

      {relevantGroups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shared Login Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relevantGroups.map(group => (
              <GroupedPlatformCard
                key={group.id}
                group={group}
                connectedPlatforms={connectedPlatforms}
                onConnect={onConnect}
                isPending={isPending}
                oauthStatus={oauthStatus}
              />
            ))}
          </div>
        </div>
      )}

      {individualRecommended.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Individual Platforms</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {individualRecommended.map((platform) => {
              const info = PLATFORM_INFO[platform];
              const reason = nicheData.reasons[platform];
              return (
                <PlatformCard
                  key={platform}
                  platform={platform}
                  info={info}
                  isConnected={connectedPlatforms.has(platform)}
                  onConnect={({ value }) => onConnect(platform, value)}
                  isPending={isPending}
                  oauthStatus={oauthStatus}
                  reason={reason}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button
          data-testid="button-toggle-show-all"
          variant="ghost"
          size="sm"
          onClick={onToggleShowAll}
        >
          {showAll ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showAll ? "Hide Other Platforms" : `Show All ${PLATFORMS.filter(p => (p as string) !== "youtubeshorts").length} Platforms`}
        </Button>
      </div>

      {showAll && (
        <div className="space-y-4">
          {allGroups.filter(g => !relevantGroups.some(rg => rg.id === g.id)).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Other Shared Login Accounts</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allGroups.filter(g => !relevantGroups.some(rg => rg.id === g.id)).map(group => (
                  <GroupedPlatformCard
                    key={group.id}
                    group={group}
                    connectedPlatforms={connectedPlatforms}
                    onConnect={onConnect}
                    isPending={isPending}
                    oauthStatus={oauthStatus}
                  />
                ))}
              </div>
            </div>
          )}
          {allIndividual.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Other Platforms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allIndividual.map((platform) => {
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
      )}
    </div>
  );
}

const EMPIRE_STEPS = [
  { key: "niche", label: "Analyzing Niche & Brand Identity" },
  { key: "pillars", label: "Building Content Pillars & Strategy" },
  { key: "plan", label: "Creating 30-Day Launch Plan" },
  { key: "growth", label: "Mapping Growth & Monetization" },
  { key: "formulas", label: "Building Content Formulas" },
  { key: "complete", label: "Empire Blueprint Ready" },
  { key: "auto-video", label: "Auto-Creating Human-Authentic Videos & VOD Pipelines" },
];

function EmpireProgressTracker({ steps }: { steps: { key: string; status: string; message: string }[] }) {
  return (
    <div className="space-y-2" data-testid="empire-progress-tracker">
      {EMPIRE_STEPS.map((step) => {
        const liveStep = steps.find(s => s.key === step.key);
        const status = liveStep?.status || "pending";
        const message = liveStep?.message || step.label;
        return (
          <div key={step.key} className="flex items-center gap-3" data-testid={`empire-step-${step.key}`}>
            <div className="shrink-0">
              {status === "completed" ? (
                <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                </div>
              ) : status === "started" ? (
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                </div>
              ) : status === "error" ? (
                <div className="h-6 w-6 rounded-full bg-destructive/20 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-destructive" />
                </div>
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                </div>
              )}
            </div>
            <span className={`text-sm ${status === "started" ? "text-foreground font-medium" : status === "completed" ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
              {message}
            </span>
          </div>
        );
      })}
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
  onConnect: (platform: Platform, value: string, skipGrouping?: boolean) => void;
  isPending: boolean;
  oauthStatus?: Record<string, { hasOAuth: boolean; configured: boolean }>;
}) {
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [customIdea, setCustomIdea] = useState("");
  const [empireResult, setEmpireResult] = useState<any>(null);
  const [empireBuilding, setEmpireBuilding] = useState(false);
  const [empireSteps, setEmpireSteps] = useState<{ key: string; status: string; message: string }[]>([]);
  const [videosLaunched, setVideosLaunched] = useState<number | null>(null);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const startEmpireBuild = async () => {
    if (!selectedNiche) return;
    const idea = selectedNiche === "other" ? customIdea || "general content creation" : selectedNiche;

    setEmpireBuilding(true);
    setEmpireSteps([]);

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.addEventListener("empire-progress", (e) => {
      try {
        const data = JSON.parse(e.data);
        setEmpireSteps(prev => {
          const existing = prev.findIndex(s => s.key === data.step);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = { key: data.step, status: data.status, message: data.message };
            return next;
          }
          return [...prev, { key: data.step, status: data.status, message: data.message }];
        });
        if (data.step === "auto-video" && data.status === "completed") {
          const match = data.message?.match(/(\d+)/);
          if (match) setVideosLaunched(parseInt(match[1]));
        }
      } catch {}
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };

    try {
      const res = await apiRequest("POST", "/api/empire/build", { idea });
      const blueprint = await res.json();
      setEmpireResult(blueprint);
      if (selectedNiche) onNicheSelected(selectedNiche);
    } catch (err: any) {
      toast({
        title: "Empire Builder",
        description: "Something went wrong. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setEmpireBuilding(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  if (empireBuilding) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Rocket className="h-5 w-5 text-primary-foreground animate-pulse" />
          </div>
          <div>
            <h2 data-testid="text-empire-building-heading" className="text-lg font-display font-bold">Building Your Content Empire</h2>
            <p className="text-sm text-muted-foreground">AI is creating your complete blueprint with human-authentic videos and launch plan...</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <EmpireProgressTracker steps={empireSteps} />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">This takes a minute or two — we're building your entire content operation from scratch.</p>
      </div>
    );
  }

  if (empireResult && showPlatforms && selectedNiche) {
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
            data-testid="button-back-to-empire"
            variant="ghost"
            size="sm"
            onClick={() => setShowPlatforms(false)}
          >
            <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
            Back to Empire Blueprint
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

  if (empireResult) {
    const niche = empireResult.niche;
    const brand = empireResult.brandIdentity;
    const pillars = empireResult.contentPillars;
    const planItems = empireResult.first30DaysPlan;
    const growth = empireResult.growthRoadmap;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-emerald-500 flex items-center justify-center shrink-0">
            <Check className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 data-testid="text-empire-ready-heading" className="text-lg font-display font-bold">Your Content Empire is Ready</h2>
            <p className="text-sm text-muted-foreground">Complete blueprint built — videos auto-created and pipelines launched</p>
          </div>
        </div>

        {(niche || brand) && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4" />
                Your Niche & Brand
              </h3>
              {niche?.primary && (
                <p data-testid="text-empire-niche" className="text-base font-medium text-primary">{niche.primary}</p>
              )}
              {brand?.channelName && (
                <div>
                  <span className="text-xs text-muted-foreground">Channel Name</span>
                  <p data-testid="text-empire-channel" className="text-sm font-medium">{brand.channelName}</p>
                </div>
              )}
              {brand?.tagline && (
                <div>
                  <span className="text-xs text-muted-foreground">Tagline</span>
                  <p data-testid="text-empire-tagline" className="text-sm">{brand.tagline}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {pillars?.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Content Pillars
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {pillars.map((p: any, i: number) => (
                  <Badge key={i} variant="secondary" data-testid={`badge-pillar-${i}`}>
                    {typeof p === "string" ? p : p.name || p.title || `Pillar ${i + 1}`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {planItems?.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                30-Day Launch Plan
              </h3>
              <p className="text-xs text-muted-foreground">{planItems.length} content pieces planned for your first month</p>
              <ol className="space-y-1.5 mt-2 max-h-48 overflow-y-auto">
                {planItems.slice(0, 10).map((item: any, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2" data-testid={`text-plan-item-${i}`}>
                    <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
                    <span>{typeof item === "string" ? item : item.title || item.topic || JSON.stringify(item)}</span>
                  </li>
                ))}
                {planItems.length > 10 && (
                  <li className="text-xs text-muted-foreground">+ {planItems.length - 10} more in your dashboard</li>
                )}
              </ol>
            </CardContent>
          </Card>
        )}

        {growth && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Growth & Monetization
              </h3>
              {growth.milestones?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {growth.milestones.slice(0, 4).map((m: any, i: number) => (
                    <Badge key={i} variant="outline" data-testid={`badge-milestone-${i}`}>
                      {typeof m === "string" ? m : m.name || m.title || `Milestone ${i + 1}`}
                    </Badge>
                  ))}
                </div>
              )}
              {growth.monetizationTimeline && (
                <p className="text-sm text-muted-foreground mt-2">{typeof growth.monetizationTimeline === "string" ? growth.monetizationTimeline : "Monetization plan included in your dashboard"}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              Auto-Launched Content
            </h3>
            <p className="text-sm text-muted-foreground">
              {videosLaunched
                ? `${videosLaunched} videos have been auto-created with human-authentic scripts, production guides, and SEO packages. VOD pipelines (56 steps each) are processing them with realistic scheduling.`
                : "Videos are being auto-created with human-authentic scripts and production guides. VOD pipelines will process them through all 56 steps with realistic timing."}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary" data-testid="badge-videos-created">{videosLaunched ?? "..."} Videos Created</Badge>
              <Badge variant="secondary" data-testid="badge-pipelines-active">{videosLaunched ?? "..."} VOD Pipelines Active</Badge>
              <Badge variant="outline" data-testid="badge-human-behavior">Human Behavior Engine</Badge>
              <Badge variant="outline" data-testid="badge-anti-ai">Anti-AI Detection</Badge>
            </div>
            <div className="mt-2 p-2 rounded-md bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3 shrink-0" />
                Every script, title, description and tag is written to pass AI detection. 70+ banned AI phrases are scrubbed. Natural imperfections, self-corrections, and personality are injected throughout.
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3 shrink-0" />
                Creator Intelligence adapts content to your voice. Platform-specific writing styles ensure each post sounds native. Publishing uses gaussian timing with peak-hour targeting.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 data-testid="text-setup-platforms-heading" className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Set Up Your Platforms
            </h3>
            <p data-testid="text-setup-platforms-description" className="text-xs text-muted-foreground">
              Sign up for any platforms you don't have yet, then connect them to activate full automation.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(NICHE_PLATFORMS[selectedNiche || "other"]?.platforms || NICHE_PLATFORMS["other"].platforms).map((p) => {
                const pInfo = PLATFORM_INFO[p as Platform];
                return (
                  <Button
                    key={p}
                    data-testid={`button-signup-platform-${p}`}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => window.open(pInfo.signupUrl, "_blank")}
                  >
                    {PLATFORM_ICONS[p] ? (() => { const PIcon = PLATFORM_ICONS[p]; return <PIcon className="h-3.5 w-3.5 shrink-0" />; })() : null}
                    <span className="truncate">{p === "youtube" ? "Create YouTube" : `Sign Up ${pInfo.label}`}</span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            data-testid="button-connect-platforms"
            onClick={() => setShowPlatforms(true)}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Connect Your Platforms
          </Button>
          <Button
            data-testid="button-continue-without-channel"
            variant="ghost"
            onClick={onFinish}
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign up for platforms first, then connect them — or go straight to the dashboard and connect later.
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
          <p className="text-sm text-muted-foreground">Pick your niche and we'll build your entire content empire — brand, strategy, videos, and launch plan.</p>
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
          data-testid="button-build-empire"
          onClick={startEmpireBuild}
          disabled={!selectedNiche || (selectedNiche === "other" && !customIdea.trim())}
        >
          <Rocket className="h-4 w-4 mr-2" />
          Build My Content Empire
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

type OnboardingStep = "contact-info" | "choice" | "new-creator" | "existing-creator" | "redeem-code" | "activating";

const ACTIVATION_STAGES = [
  { icon: RefreshCw, label: "Syncing your channel", detail: "Connecting to your YouTube account" },
  { icon: Bot, label: "Initializing AI team", detail: "14 specialized agents assigned to your channel" },
  { icon: Scissors, label: "Building clip pipeline", detail: "YouTube & Shorts queues ready" },
  { icon: Sparkles, label: "AI SEO + Thumbnail engine", detail: "Learning your content style for optimization" },
  { icon: UploadCloud, label: "Auto-publisher is armed", detail: "Optimal schedule mapped — zero clicks needed" },
];

function PipelineActivationScreen({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  const [activeStage, setActiveStage] = useState(0);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    ACTIVATION_STAGES.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setActiveStage(i + 1);
        if (i === ACTIVATION_STAGES.length - 1) {
          setTimeout(() => setAllDone(true), 600);
        }
      }, 600 + i * 850));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const progress = (activeStage / ACTIVATION_STAGES.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-auto py-8"
      data-testid="screen-pipeline-activation"
      style={{ background: "linear-gradient(145deg, hsl(232 30% 4%) 0%, hsl(265 30% 8%) 100%)" }}>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/30">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="font-display font-bold text-lg text-white tracking-tight">
            Creator<span className="text-primary/80">OS</span>
          </span>
        </div>

        {!allDone ? (
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2">
              Activating your pipeline...
            </h1>
            <p className="text-sm text-white/45 mb-8">
              Your AI team is initializing. This takes just a moment.
            </p>

            <div className="h-1.5 bg-white/10 rounded-full mb-8 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary via-purple-500 to-blue-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }} />
            </div>

            <div className="space-y-2.5 text-left">
              {ACTIVATION_STAGES.map((stage, i) => {
                const StageIcon = stage.icon;
                const done = i < activeStage;
                const active = i === activeStage;
                return (
                  <div key={stage.label}
                    className={`flex items-start gap-3 p-3.5 rounded-xl transition-all duration-500 ${
                      done ? "bg-white/[0.05]" : active ? "bg-primary/10 border border-primary/20" : "opacity-25"
                    }`}>
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-500 ${
                      done ? "bg-emerald-500/20" : active ? "bg-primary/20" : "bg-white/10"
                    }`}>
                      {done
                        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                        : active
                        ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                        : <StageIcon className="h-3.5 w-3.5 text-white/20" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold transition-colors ${
                        done ? "text-white/70" : active ? "text-white" : "text-white/25"
                      }`}>{stage.label}</p>
                      <p className={`text-xs transition-colors ${
                        done ? "text-white/35" : active ? "text-white/55" : "text-white/15"
                      }`}>{stage.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center" style={{ animation: "fadeSlideUp 0.6s ease-out" }}>
            <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-3">
              You're live!
            </h1>
            <p className="text-sm text-white/55 mb-6 max-w-xs mx-auto leading-relaxed">
              Your autonomous pipeline is active. Every video you publish now flows automatically through your full AI stack.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              {[
                { label: "Vault sync", color: "text-emerald-400" },
                { label: "Clip exhauster", color: "text-emerald-400" },
                { label: "AI SEO", color: "text-emerald-400" },
                { label: "Auto-publish", color: "text-emerald-400" },
              ].map(({ label, color }) => (
                <span key={label} className={`flex items-center gap-1 text-xs ${color}`}>
                  <CheckCircle2 className="h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>

            <Button
              size="lg"
              className="h-12 px-8 font-semibold shadow-lg shadow-primary/30 group"
              onClick={onEnterDashboard}
              data-testid="button-enter-dashboard"
            >
              Enter My Dashboard
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
            </Button>

            <p className="text-xs text-white/25 mt-4">Your AI team works 24/7 — no further setup needed</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RedeemCodeScreen({ onBack, onRedeemed }: { onBack: () => void; onRedeemed: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const redeemMutation = useMutation({
    mutationFn: async (c: string) => {
      const res = await apiRequest("POST", "/api/redeem-code", { code: c });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Code Redeemed!", description: `You now have ${data.tier} access.` });
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
        setTimeout(() => onRedeemed(), 1000);
      } else {
        toast({ title: "Invalid Code", description: data.error || "This code is not valid.", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex items-center gap-2 mb-8 self-start">
        <Button size="sm" variant="ghost" onClick={onBack} data-testid="button-back-from-redeem">
          <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
          Back
        </Button>
      </div>

      <div className="h-14 w-14 rounded-md bg-primary flex items-center justify-center mb-6">
        <KeyRound className="h-7 w-7 text-primary-foreground" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-display font-bold text-center" data-testid="text-redeem-heading">
        Enter Your Access Code
      </h1>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
        Paste the code you received to unlock your account.
      </p>

      <div className="mt-8 w-full max-w-sm space-y-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. A1B2C3-D4E5"
          className="text-center font-mono text-lg tracking-widest"
          data-testid="input-onboarding-access-code"
        />
        <Button
          size="lg"
          className="w-full"
          onClick={() => redeemMutation.mutate(code)}
          disabled={!code.trim() || redeemMutation.isPending}
          data-testid="button-onboarding-redeem-code"
        >
          {redeemMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4 mr-2" />
          )}
          {redeemMutation.isPending ? "Redeeming..." : "Redeem Code"}
        </Button>
      </div>
    </div>
  );
}

function ContactInfoScreen({
  onComplete,
  user,
}: {
  onComplete: () => void;
  user: any;
}) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast({ title: "Valid email is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/user/profile", {
        phone: phone.trim() || undefined,
        notifyEmail: true,
        notifyPhone: !!phone.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      onComplete();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-14 w-14 rounded-md bg-primary flex items-center justify-center mb-6">
        <Shield className="h-7 w-7 text-primary-foreground" />
      </div>
      <h1
        data-testid="text-contact-heading"
        className="text-2xl sm:text-3xl font-display font-bold text-center"
      >
        Almost there
      </h1>
      <p
        data-testid="text-contact-subtitle"
        className="mt-2 text-sm text-muted-foreground text-center max-w-md"
      >
        We'll only contact you when something needs your attention — everything else runs on autopilot.
      </p>

      <div className="w-full max-w-sm mt-10 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">First Name</label>
            <Input
              data-testid="input-first-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={!!user?.firstName}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Last Name</label>
            <Input
              data-testid="input-last-name"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={!!user?.lastName}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input
            data-testid="input-email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!user?.email}
          />
          <p className="text-xs text-muted-foreground">Problem alerts sent here</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Phone (optional)</label>
          <Input
            data-testid="input-phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Get text alerts for urgent issues</p>
        </div>

        <Button
          data-testid="button-contact-continue"
          className="w-full mt-6"
          onClick={handleSubmit}
          disabled={saving || !firstName.trim() || !email.includes("@")}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Continue
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function ChoiceScreen({ onChoose }: { onChoose: (choice: OnboardingStep) => void }) {
  return (
    <div className="flex flex-col items-center py-12 px-4">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">Welcome to CreatorOS</span>
      </div>

      <h1
        data-testid="text-onboarding-heading"
        className="text-3xl sm:text-4xl font-display font-bold text-center mb-3 tracking-tight"
      >
        Let's build your AI team
      </h1>
      <p
        data-testid="text-onboarding-subtitle"
        className="text-sm text-muted-foreground text-center max-w-sm mb-10 leading-relaxed"
      >
        A few quick questions and your autonomous pipeline will be live in minutes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl mb-4">
        <Card
          data-testid="card-choice-new"
          className="cursor-pointer border-border/60 hover:border-primary/40 hover:bg-card/80 transition-all duration-200 group"
          onClick={() => onChoose("new-creator")}
        >
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 border border-primary/20 flex items-center justify-center group-hover:from-primary/30 transition-all">
              <Rocket className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-display font-bold mb-1">New Creator</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Just starting out — I want help picking a niche, naming my channel, and creating my first content strategy.
              </p>
            </div>
            <div className="flex items-center gap-1 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Get started <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>

        <Card
          data-testid="card-choice-existing"
          className="cursor-pointer border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/8 transition-all duration-200 group relative"
          onClick={() => onChoose("existing-creator")}
        >
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
            <span className="text-[10px] bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide">Recommended</span>
          </div>
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/30 flex items-center justify-center group-hover:from-primary/40 transition-all">
              <TrendingUp className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-display font-bold mb-1">Existing Creator</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                I already have channels — connect them and activate the full autonomous pipeline immediately.
              </p>
            </div>
            <div className="flex items-center gap-1 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Connect platforms <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      </div>

      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mt-2"
        onClick={() => onChoose("redeem-code")}
        data-testid="button-choice-access-code"
      >
        <KeyRound className="h-3.5 w-3.5" />
        I have an access code
      </button>
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
  const { t } = useTranslation();
  usePageTitle(t("onboarding.title"));
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>(
    user?.phone || user?.email ? "choice" : "contact-info"
  );
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  const { data: linkedChannels = [], isLoading } = useQuery<LinkedChannel[]>({
    queryKey: ["/api/linked-channels"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
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

  const handleConnect = (platform: Platform, value: string, skipGrouping?: boolean) => {
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

    if (!skipGrouping) {
      const group = LOGIN_GROUPS.find(g => g.platforms.includes(platform));
      if (group) {
        group.platforms.forEach(siblingPlatform => {
          if (siblingPlatform !== platform && !connectedPlatforms.has(siblingPlatform)) {
            connectMutation.mutate({
              platform: siblingPlatform,
              username: value || group.label,
              connectionType: "manual",
            });
          }
        });
      }
    }
  };

  const completeOnboarding = async () => {
    try {
      const stepPromises = [
        apiRequest("POST", "/api/kernel/onboarding/step", {
          step: 1,
          data: { channelName: user?.firstName ? `${user.firstName}'s Channel` : "My Channel" },
        }),
        apiRequest("POST", "/api/kernel/onboarding/step", {
          step: 2,
          data: { contentPillar: selectedNiche || "general" },
        }),
        apiRequest("POST", "/api/kernel/onboarding/step", {
          step: 3,
          data: { connectedPlatforms: Array.from(connectedPlatforms), youtubeConnected: connectedPlatforms.has("youtube") },
        }),
        apiRequest("POST", "/api/kernel/onboarding/step", {
          step: 4,
          data: { monetizationPath: "adsense" },
        }),
        apiRequest("POST", "/api/kernel/onboarding/step", {
          step: 5,
          data: { completed: true },
        }),
      ];
      await Promise.allSettled([
        apiRequest("PATCH", "/api/user/profile", {
          contentNiche: selectedNiche || undefined,
          onboardingCompleted: true,
        }),
        ...stepPromises,
      ]);
    } catch (e) {
      console.error("Failed to save onboarding:", e);
    }
    if (onComplete) {
      onComplete();
    } else {
      navigate("/");
    }
  };

  const finishOnboarding = () => {
    if (user?.id) {
      localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
    }
    setStep("activating");
  };

  if (step === "activating") {
    return <PipelineActivationScreen onEnterDashboard={completeOnboarding} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 h-14 px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-md shadow-primary/20">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span data-testid="text-onboarding-logo" className="font-display font-bold text-sm tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          {step !== "choice" && step !== "contact-info" && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-progress" className="text-xs">
                {connectedCount > 0 ? `${connectedCount} platform${connectedCount > 1 ? "s" : ""} connected` : "No platforms yet"}
              </Badge>
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-10">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : step === "contact-info" ? (
            <ContactInfoScreen
              user={user}
              onComplete={() => setStep("choice")}
            />
          ) : step === "choice" ? (
            <ChoiceScreen onChoose={setStep} />
          ) : step === "redeem-code" ? (
            <RedeemCodeScreen
              onBack={() => setStep("choice")}
              onRedeemed={finishOnboarding}
            />
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
                  Pick your niche and we'll build your complete content empire — brand identity, content strategy, videos, and launch plan, all automated.
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
                  {connectedCount} of {PLATFORMS.filter(p => (p as string) !== "youtubeshorts").length} platforms connected
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
