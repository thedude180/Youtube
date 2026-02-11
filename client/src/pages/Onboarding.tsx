import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PLATFORMS, PLATFORM_INFO, type Platform, type LinkedChannel } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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

function PlatformCard({
  platform,
  info,
  isConnected,
  onConnect,
  isPending,
}: {
  platform: Platform;
  info: (typeof PLATFORM_INFO)[Platform];
  isConnected: boolean;
  onConnect: (data: { value: string }) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const isOAuth = info.connectionType === "oauth";

  const inputLabel = (() => {
    if (info.category === "streaming" && info.rtmpUrlTemplate) return "Stream Key";
    if (info.connectionType === "api_key") return "API Key";
    return "Profile URL or Username";
  })();

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
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {info.strategyDescription}
            </p>
          </div>
          {!isConnected && !isOAuth && (
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

        {isOAuth && !isConnected && (
          <div className="mt-3">
            <Button
              data-testid={`button-connect-youtube`}
              onClick={() => { window.location.href = "/api/youtube/auth"; }}
            >
              Connect YouTube
              <ExternalLink className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {expanded && !isOAuth && !isConnected && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Setup Steps</p>
              <ol className="space-y-1">
                {info.setupSteps.map((step, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-foreground font-medium shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
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
              <Button
                data-testid={`button-skip-${platform}`}
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(false)}
              >
                Skip
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: linkedChannels = [], isLoading } = useQuery<LinkedChannel[]>({
    queryKey: ["/api/linked-channels"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/linked-channels"] });
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
          <Badge variant="secondary" data-testid="badge-progress">
            {connectedCount} of {PLATFORMS.length} connected
          </Badge>
        </div>
      </nav>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="mb-8">
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
              Set up your accounts to unlock full automation. You can always come back to this later.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {CATEGORIES.map((category) => (
                <div key={category.key}>
                  <h2
                    data-testid={`text-category-${category.key}`}
                    className="text-sm font-medium text-muted-foreground mb-3"
                  >
                    {category.label}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.platforms.map((platform) => {
                      const info = PLATFORM_INFO[platform];
                      return (
                        <PlatformCard
                          key={platform}
                          platform={platform}
                          info={info}
                          isConnected={connectedPlatforms.has(platform)}
                          onConnect={({ value }) => handleConnect(platform, value)}
                          isPending={connectMutation.isPending}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 flex items-center justify-between gap-4 flex-wrap border-t border-border pt-6">
            <p className="text-sm text-muted-foreground" data-testid="text-progress-summary">
              {connectedCount} of {PLATFORMS.length} platforms connected
            </p>
            <Button
              data-testid="button-finish-setup"
              onClick={() => {
                if (user?.id) {
                  localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
                }
                navigate("/");
              }}
            >
              Finish Setup
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
