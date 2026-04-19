import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Check, Rocket, Target, Video, Palette, DollarSign,
  ArrowRight, Loader2, Youtube, RefreshCw, Sparkles,
  BookOpen, Trophy, ChevronRight, ExternalLink,
} from "lucide-react";

interface LaunchMission {
  id: number;
  step: number;
  title: string;
  description: string | null;
  status: string;
  stepData: Record<string, any>;
  completedAt: string | null;
}

interface LaunchState {
  id: number;
  state: string;
  channelIdentity: { name?: string; niche?: string; category?: string; description?: string };
  brandBasics: { profileDone?: boolean; bannerDone?: boolean; aboutDone?: boolean; thumbnailStyle?: string };
  launchReadinessScore: number;
  needsInit?: boolean;
}

interface VideoPlan {
  id: number;
  videoNumber: number;
  title: string | null;
  concept: string | null;
  thumbnailIdea: string | null;
  tags: string[] | null;
  status: string;
}

const STEP_ICONS: Record<number, typeof Rocket> = {
  1: Target, 2: BookOpen, 3: Video, 4: Palette, 5: Sparkles,
  6: BookOpen, 7: DollarSign, 8: Youtube, 9: RefreshCw, 10: Rocket,
};

export default function PreChannelLaunch({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(1);
  const [channelName, setChannelName] = useState("");
  const [channelNiche, setChannelNiche] = useState("gaming");
  const [channelCategory, setChannelCategory] = useState("");
  const [channelDescription, setChannelDescription] = useState("");

  const { data: launchState, isLoading: stateLoading } = useQuery<LaunchState>({
    queryKey: ["/api/channel-launch/state"],
  });

  const { data: linkedChannels = [] } = useQuery<Array<{ platform: string; isConnected: boolean }>>({
    queryKey: ["/api/linked-channels"],
  });

  const { data: missions = [], isLoading: missionsLoading } = useQuery<LaunchMission[]>({
    queryKey: ["/api/channel-launch/missions"],
  });

  const { data: videoPlans = [] } = useQuery<VideoPlan[]>({
    queryKey: ["/api/channel-launch/first-video-plan"],
  });

  const initMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/channel-launch/init"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/missions"] });
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: ({ step, data }: { step: number; data: Record<string, any> }) =>
      apiRequest("POST", `/api/channel-launch/step/${step}/complete`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/missions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/milestones"] });
    },
  });

  const identityMutation = useMutation({
    mutationFn: (identity: Record<string, any>) =>
      apiRequest("PATCH", "/api/channel-launch/identity", identity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/state"] });
    },
  });

  const generateVideosMutation = useMutation({
    mutationFn: (data: { niche: string; category: string }) =>
      apiRequest("POST", "/api/channel-launch/first-video-plan", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/first-video-plan"] });
    },
  });

  const generateRoadmapMutation = useMutation({
    mutationFn: (data: { niche: string; category: string }) =>
      apiRequest("POST", "/api/channel-launch/ten-video-roadmap", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/ten-video-roadmap"] });
    },
  });

  const recheckMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/channel-launch/recheck"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.found) {
        toast({ title: "Channel Connected!", description: `${data.channelName} is now linked.` });
        queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/state"] });
        queryClient.invalidateQueries({ queryKey: ["/api/channel-launch/missions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/linked-channels"] });
        setTimeout(onComplete, 1500);
      } else {
        toast({ title: "No Channel Found", description: data.message, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    if (launchState && (launchState as any).needsInit) {
      initMutation.mutate();
    }
  }, [launchState]);

  useEffect(() => {
    if (launchState?.channelIdentity) {
      if (launchState.channelIdentity.name) setChannelName(launchState.channelIdentity.name);
      if (launchState.channelIdentity.niche) setChannelNiche(launchState.channelIdentity.niche);
      if (launchState.channelIdentity.category) setChannelCategory(launchState.channelIdentity.category);
      if (launchState.channelIdentity.description) setChannelDescription(launchState.channelIdentity.description);
    }
  }, [launchState]);

  useEffect(() => {
    if (missions.length > 0) {
      const firstPending = missions.find(m => m.status !== "completed");
      if (firstPending) setActiveStep(firstPending.step);
    }
  }, [missions]);

  useEffect(() => {
    const ytLinked = linkedChannels.some(c => c.platform === "youtube" && c.isConnected);
    if (ytLinked && activeStep === 9) {
      toast({ title: "YouTube Already Connected", description: "Your channel is linked — taking you to the dashboard." });
      setTimeout(onComplete, 1200);
    }
  }, [linkedChannels, activeStep]);

  const completedCount = missions.filter(m => m.status === "completed").length;
  const totalMissions = missions.length || 10;
  const readinessPercent = launchState?.launchReadinessScore ?? Math.round((completedCount / totalMissions) * 100);

  const handleStep1Complete = async () => {
    if (!channelName.trim()) {
      toast({ title: "Enter a channel name", variant: "destructive" });
      return;
    }
    await identityMutation.mutateAsync({ name: channelName, niche: channelNiche, category: channelCategory, description: channelDescription });
    await completeStepMutation.mutateAsync({ step: 1, data: { channelName, niche: channelNiche } });
    setActiveStep(2);
  };

  const handleStep2Complete = async () => {
    if (!channelNiche.trim()) return;
    await identityMutation.mutateAsync({ name: channelName, niche: channelNiche, category: channelCategory, description: channelDescription });
    await completeStepMutation.mutateAsync({ step: 2, data: { niche: channelNiche } });
    setActiveStep(3);
  };

  const handleStep3Complete = async () => {
    if (!channelCategory.trim()) {
      toast({ title: "Choose a game or category", variant: "destructive" });
      return;
    }
    await identityMutation.mutateAsync({ name: channelName, niche: channelNiche, category: channelCategory, description: channelDescription });
    await completeStepMutation.mutateAsync({ step: 3, data: { category: channelCategory } });
    setActiveStep(4);
  };

  const handleStep4Complete = async () => {
    await completeStepMutation.mutateAsync({ step: 4, data: {} });
    setActiveStep(5);
  };

  const handleStep5Complete = async () => {
    await generateVideosMutation.mutateAsync({ niche: channelNiche || "gaming", category: channelCategory || "gaming" });
    await completeStepMutation.mutateAsync({ step: 5, data: { generated: true } });
    setActiveStep(6);
  };

  const handleStep6Complete = async () => {
    await generateRoadmapMutation.mutateAsync({ niche: channelNiche || "gaming", category: channelCategory || "gaming" });
    await completeStepMutation.mutateAsync({ step: 6, data: { generated: true } });
    setActiveStep(7);
  };

  const handleStep7Complete = async () => {
    await completeStepMutation.mutateAsync({ step: 7, data: { viewed: true } });
    setActiveStep(8);
  };

  const handleStep8Complete = async () => {
    await completeStepMutation.mutateAsync({ step: 8, data: { channelCreated: true } });
    setActiveStep(9);
  };

  const handleRecheck = () => {
    recheckMutation.mutate();
  };

  if (stateLoading || missionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="loading-launch">
        <div className="text-center space-y-4">
          <Rocket className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Preparing your launch sequence...</p>
        </div>
      </div>
    );
  }

  const GAMING_CATEGORIES = [
    "Action/Adventure", "RPG", "FPS/Shooter", "Horror", "Sports",
    "Racing", "Strategy", "Simulation", "Fighting", "Open World",
    "Indie", "Retro", "Souls-like", "Platformer", "Battle Royale",
  ];

  const renderStepContent = (step: number) => {
    const mission = missions.find(m => m.step === step);
    const isCompleted = mission?.status === "completed";

    if (step === 1) {
      return (
        <div className="space-y-4" data-testid="step-1-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Channel Name</label>
              <Input
                data-testid="input-channel-name"
                placeholder="e.g. ET Gaming, SilentPS5Pro..."
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                disabled={isCompleted}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Content Niche</label>
              <Input
                data-testid="input-channel-niche"
                placeholder="e.g. No-commentary PS5 gaming"
                value={channelNiche}
                onChange={e => setChannelNiche(e.target.value)}
                disabled={isCompleted}
              />
            </div>
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-1" onClick={handleStep1Complete} disabled={completeStepMutation.isPending}>
              {completeStepMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save & Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-4" data-testid="step-2-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="flex flex-wrap gap-2">
            {["Walkthroughs", "Tips & Tricks", "Reviews", "Let's Play", "Challenges", "Speedruns", "Lore Deep-Dives"].map(pillar => (
              <Badge
                key={pillar}
                data-testid={`badge-pillar-${pillar.toLowerCase().replace(/\s+/g, "-")}`}
                variant={channelNiche.includes(pillar.toLowerCase()) ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-sm"
                onClick={() => {
                  if (!isCompleted) setChannelNiche(pillar.toLowerCase());
                }}
              >
                {pillar}
              </Badge>
            ))}
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-2" onClick={handleStep2Complete} disabled={completeStepMutation.isPending}>
              {completeStepMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="space-y-4" data-testid="step-3-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {GAMING_CATEGORIES.map(cat => (
              <Badge
                key={cat}
                data-testid={`badge-category-${cat.toLowerCase().replace(/[\s\/]+/g, "-")}`}
                variant={channelCategory === cat ? "default" : "outline"}
                className="cursor-pointer px-2 py-1.5 text-xs text-center justify-center"
                onClick={() => { if (!isCompleted) setChannelCategory(cat); }}
              >
                {cat}
              </Badge>
            ))}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Or enter custom</label>
            <Input
              data-testid="input-custom-category"
              placeholder="Type your game/category..."
              value={channelCategory}
              onChange={e => setChannelCategory(e.target.value)}
              disabled={isCompleted}
            />
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-3" onClick={handleStep3Complete} disabled={completeStepMutation.isPending}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="space-y-4" data-testid="step-4-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Short Channel Description</label>
              <Textarea
                data-testid="input-channel-description"
                placeholder="Describe your channel in 2-3 sentences..."
                value={channelDescription}
                onChange={e => setChannelDescription(e.target.value)}
                disabled={isCompleted}
                rows={3}
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Brand Checklist</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>• Profile picture idea (can be simple — initials, logo, or avatar)</p>
                <p>• Banner concept (show your niche + upload schedule)</p>
                <p>• About section (what viewers can expect)</p>
                <p>• Thumbnail style (consistent colors + font)</p>
              </div>
            </div>
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-4" onClick={handleStep4Complete} disabled={completeStepMutation.isPending}>
              I've Got My Brand Basics <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="space-y-4" data-testid="step-5-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          {videoPlans.length > 0 ? (
            <div className="space-y-3">
              {videoPlans.map(plan => (
                <Card key={plan.id} className="bg-muted/30" data-testid={`card-video-plan-${plan.videoNumber}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">#{plan.videoNumber}</Badge>
                      <div>
                        <p className="font-medium text-sm">{plan.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{plan.concept}</p>
                        {plan.thumbnailIdea && (
                          <p className="text-xs text-muted-foreground mt-1 italic">Thumbnail: {plan.thumbnailIdea}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Ready to generate your first 3 video ideas?</p>
            </div>
          )}
          {!isCompleted && (
            <Button data-testid="button-complete-step-5" onClick={handleStep5Complete} disabled={generateVideosMutation.isPending || completeStepMutation.isPending}>
              {generateVideosMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {videoPlans.length > 0 ? "Continue" : "Generate Video Ideas"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 6) {
      return (
        <div className="space-y-4" data-testid="step-6-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm">Your AI team will generate a full 10-video runway including content pillars, estimated durations, and publishing order.</p>
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-6" onClick={handleStep6Complete} disabled={generateRoadmapMutation.isPending || completeStepMutation.isPending}>
              {generateRoadmapMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BookOpen className="h-4 w-4 mr-2" />}
              Generate 10-Video Roadmap
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 7) {
      return (
        <div className="space-y-4" data-testid="step-7-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">YouTube Partner Program Requirements</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Subscribers needed</span><span className="font-mono">1,000</span></div>
              <div className="flex justify-between"><span>Watch hours (12 months)</span><span className="font-mono">4,000</span></div>
              <div className="flex justify-between"><span>Or Shorts views (90 days)</span><span className="font-mono">10M</span></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Don't worry — your AI team will track your progress and tell you when you're getting close.</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm font-medium mb-2">Non-Platform Revenue Paths</p>
            <div className="flex flex-wrap gap-2">
              {["Merchandise", "Sponsorships", "Affiliate Links", "Community Support"].map(path => (
                <Badge key={path} variant="secondary" className="text-xs">{path}</Badge>
              ))}
            </div>
          </div>
          {!isCompleted && (
            <Button data-testid="button-complete-step-7" onClick={handleStep7Complete} disabled={completeStepMutation.isPending}>
              Got It, Let's Build the Channel <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      );
    }

    if (step === 8) {
      return (
        <div className="space-y-4" data-testid="step-8-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">How to Create Your YouTube Channel</p>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Go to <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com</a> and sign in with your Google account</li>
              <li>Click your profile picture → "Create a channel"</li>
              <li>Enter your channel name: <strong className="text-foreground">{channelName || "your chosen name"}</strong></li>
              <li>Add your profile picture and description</li>
              <li>Come back here and click "I Created My Channel"</li>
            </ol>
          </div>
          <div className="flex gap-3">
            <Button data-testid="button-open-youtube" variant="outline" asChild>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer">
                <Youtube className="h-4 w-4 mr-2" />
                Open YouTube
                <ExternalLink className="h-3 w-3 ml-2" />
              </a>
            </Button>
            {!isCompleted && (
              <Button data-testid="button-complete-step-8" onClick={handleStep8Complete} disabled={completeStepMutation.isPending}>
                I Created My Channel <Check className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (step === 9) {
      return (
        <div className="space-y-4" data-testid="step-9-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-sm">Click "Connect YouTube" below to link your new channel to CreatorOS. We'll use your existing Google login to find your channel.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button data-testid="button-connect-youtube" onClick={() => { window.location.href = "/api/youtube/auth"; }}>
              <Youtube className="h-4 w-4 mr-2" />
              Connect YouTube Channel
            </Button>
            <Button data-testid="button-recheck-channel" variant="outline" onClick={handleRecheck} disabled={recheckMutation.isPending}>
              {recheckMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Recheck Connection
            </Button>
          </div>
          <Button
            data-testid="button-skip-connect-youtube"
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full"
            onClick={onComplete}
          >
            Skip — I'll connect YouTube later
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      );
    }

    if (step === 10) {
      return (
        <div className="space-y-4" data-testid="step-10-content">
          <p className="text-sm text-muted-foreground">{mission?.description}</p>
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-6 text-center space-y-3">
            <Rocket className="h-12 w-12 text-primary mx-auto" />
            <p className="text-lg font-semibold">You're Ready to Launch!</p>
            <p className="text-sm text-muted-foreground">Your AI team is standing by. Once you enter the dashboard, they'll start working on your first content.</p>
          </div>
          <Button data-testid="button-launch" className="w-full" size="lg" onClick={onComplete}>
            <Rocket className="h-5 w-5 mr-2" />
            Enter CreatorOS Dashboard
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-background" data-testid="pre-channel-launch">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Rocket className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold" data-testid="text-launch-title">Pre-Channel Launch Mode</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-launch-subtitle">
            Let's build your YouTube channel from scratch — your AI team will guide every step
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" data-testid="text-readiness-label">Launch Readiness</span>
            <span className="text-sm font-mono" data-testid="text-readiness-score">{readinessPercent}%</span>
          </div>
          <Progress value={readinessPercent} className="h-2" data-testid="progress-readiness" />
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-steps-progress">
            {completedCount} of {totalMissions} missions completed
          </p>
        </div>

        <div className="grid gap-3">
          {missions.map(mission => {
            const StepIcon = STEP_ICONS[mission.step] || Target;
            const isActive = activeStep === mission.step;
            const isCompleted = mission.status === "completed";
            const isLocked = mission.step > activeStep && !isCompleted;

            return (
              <Card
                key={mission.id}
                data-testid={`card-mission-${mission.step}`}
                className={`transition-all cursor-pointer ${
                  isActive ? "ring-2 ring-primary shadow-md" :
                  isCompleted ? "bg-muted/30 opacity-80" :
                  isLocked ? "opacity-50" : ""
                }`}
                onClick={() => {
                  if (!isLocked) setActiveStep(mission.step);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted ? "bg-green-500/10 text-green-500" :
                      isActive ? "bg-primary/10 text-primary" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {isCompleted ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">Step {mission.step}</span>
                        {isCompleted && <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">Done</Badge>}
                        {isActive && !isCompleted && <Badge className="text-xs">Current</Badge>}
                      </div>
                      <p className="font-medium text-sm">{mission.title}</p>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
                  </div>

                  {isActive && (
                    <div className="mt-4 pt-4 border-t border-border">
                      {renderStepContent(mission.step)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Button data-testid="button-skip-to-dashboard" variant="ghost" className="text-muted-foreground text-sm" onClick={onComplete}>
            {completedCount >= 7 ? "Skip remaining steps and enter dashboard" : "Skip setup and enter dashboard"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
