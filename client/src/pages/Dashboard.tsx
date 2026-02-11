import { useState, useEffect } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import {
  Film,
  ArrowRight,
  DollarSign,
  Bot,
  CheckCircle2,
  Zap,
  Briefcase,
  Heart,
  Shield,
  TrendingUp,
  Sparkles,
  Activity,
  Scissors,
  BarChart3,
  Lightbulb,
  Trophy,
  Star,
  Rocket,
  Flame,
  Crown,
  Newspaper,
  MessageSquare,
  Globe,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";

const healthAreas = [
  { key: "content", label: "Content", icon: Film, link: "/content" },
  { key: "revenue", label: "Revenue", icon: DollarSign, link: "/money" },
  { key: "brand", label: "Brand", icon: Briefcase, link: "/settings/brand" },
  { key: "wellness", label: "Wellness", icon: Heart, link: "/settings/wellness" },
  { key: "legal", label: "Legal", icon: Shield, link: "/settings/legal" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { advancedMode } = useAdvancedMode();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: agentStatus } = useQuery<any[]>({ queryKey: ['/api/agents/status'] });
  const { data: agentActivities } = useQuery<any[]>({ queryKey: ['/api/agents/activities'] });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });
  const { data: channels } = useQuery<any[]>({ queryKey: ['/api/channels'] });
  const { data: goals } = useQuery<any[]>({ queryKey: ['/api/goals'] });
  const { data: wellness } = useQuery<any[]>({ queryKey: ['/api/wellness'] });
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: briefing } = useQuery<any>({ queryKey: ['/api/learning/briefing'] });
  const { data: optHealth } = useQuery<any>({ queryKey: ['/api/optimization/health-score'] });
  const { data: shortsStatus } = useQuery<any>({ queryKey: ['/api/shorts/status'] });
  const { data: trendingTopics } = useQuery<any[]>({ queryKey: ['/api/optimization/trending-topics'] });

  const [aiActions, setAiActions] = useState<any>(null);
  const [aiActionsLoading, setAiActionsLoading] = useState(false);

  const [aiNewsFeed, setAiNewsFeed] = useState<any>(null);
  const [aiNewsFeedLoading, setAiNewsFeedLoading] = useState(false);

  const [aiMilestones, setAiMilestones] = useState<any>(null);
  const [aiMilestonesLoading, setAiMilestonesLoading] = useState(false);

  const [aiCrossplatform, setAiCrossplatform] = useState<any>(null);
  const [aiCrossplatformLoading, setAiCrossplatformLoading] = useState(false);

  const [aiCommentManager, setAiCommentManager] = useState<any>(null);
  const [aiCommentManagerLoading, setAiCommentManagerLoading] = useState(false);

  const [showAnalyticsAI, setShowAnalyticsAI] = useState(false);
  const [aiRetention, setAiRetention] = useState<any>(null);
  const [aiRetentionLoading, setAiRetentionLoading] = useState(false);
  const [aiDemographics, setAiDemographics] = useState<any>(null);
  const [aiDemographicsLoading, setAiDemographicsLoading] = useState(false);
  const [aiWatchTime, setAiWatchTime] = useState<any>(null);
  const [aiWatchTimeLoading, setAiWatchTimeLoading] = useState(false);
  const [aiEngagement, setAiEngagement] = useState<any>(null);
  const [aiEngagementLoading, setAiEngagementLoading] = useState(false);
  const [aiSubGrowth, setAiSubGrowth] = useState<any>(null);
  const [aiSubGrowthLoading, setAiSubGrowthLoading] = useState(false);
  const [aiRevForecast, setAiRevForecast] = useState<any>(null);
  const [aiRevForecastLoading, setAiRevForecastLoading] = useState(false);
  const [aiABTest, setAiABTest] = useState<any>(null);
  const [aiABTestLoading, setAiABTestLoading] = useState(false);
  const [aiRetHeatmap, setAiRetHeatmap] = useState<any>(null);
  const [aiRetHeatmapLoading, setAiRetHeatmapLoading] = useState(false);
  const [aiTrafficSrc, setAiTrafficSrc] = useState<any>(null);
  const [aiTrafficSrcLoading, setAiTrafficSrcLoading] = useState(false);
  const [aiDevices, setAiDevices] = useState<any>(null);
  const [aiDevicesLoading, setAiDevicesLoading] = useState(false);
  const [aiPlayback, setAiPlayback] = useState<any>(null);
  const [aiPlaybackLoading, setAiPlaybackLoading] = useState(false);
  const [aiEndScreen, setAiEndScreen] = useState<any>(null);
  const [aiEndScreenLoading, setAiEndScreenLoading] = useState(false);
  const [aiCardPerf, setAiCardPerf] = useState<any>(null);
  const [aiCardPerfLoading, setAiCardPerfLoading] = useState(false);
  const [aiImpFunnel, setAiImpFunnel] = useState<any>(null);
  const [aiImpFunnelLoading, setAiImpFunnelLoading] = useState(false);
  const [aiCompBench, setAiCompBench] = useState<any>(null);
  const [aiCompBenchLoading, setAiCompBenchLoading] = useState(false);
  const [aiGrowthPred, setAiGrowthPred] = useState<any>(null);
  const [aiGrowthPredLoading, setAiGrowthPredLoading] = useState(false);
  const [aiChurn, setAiChurn] = useState<any>(null);
  const [aiChurnLoading, setAiChurnLoading] = useState(false);
  const [aiViralCoeff, setAiViralCoeff] = useState<any>(null);
  const [aiViralCoeffLoading, setAiViralCoeffLoading] = useState(false);
  const [aiSentiment, setAiSentiment] = useState<any>(null);
  const [aiSentimentLoading, setAiSentimentLoading] = useState(false);
  const [aiPeakTimes, setAiPeakTimes] = useState<any>(null);
  const [aiPeakTimesLoading, setAiPeakTimesLoading] = useState(false);
  const [aiLifecycle, setAiLifecycle] = useState<any>(null);
  const [aiLifecycleLoading, setAiLifecycleLoading] = useState(false);
  const [aiRPM, setAiRPM] = useState<any>(null);
  const [aiRPMLoading, setAiRPMLoading] = useState(false);
  const [aiOverlap, setAiOverlap] = useState<any>(null);
  const [aiOverlapLoading, setAiOverlapLoading] = useState(false);
  const [aiPerfRanker, setAiPerfRanker] = useState<any>(null);
  const [aiPerfRankerLoading, setAiPerfRankerLoading] = useState(false);
  const [aiFunnelLeak, setAiFunnelLeak] = useState<any>(null);
  const [aiFunnelLeakLoading, setAiFunnelLeakLoading] = useState(false);
  const [aiPredictive, setAiPredictive] = useState<any>(null);
  const [aiPredictiveLoading, setAiPredictiveLoading] = useState(false);
  const [aiCustomReport, setAiCustomReport] = useState<any>(null);
  const [aiCustomReportLoading, setAiCustomReportLoading] = useState(false);

  const [showCommunityAI, setShowCommunityAI] = useState(false);
  const [aiCommentResp, setAiCommentResp] = useState<any>(null);
  const [aiCommentRespLoading, setAiCommentRespLoading] = useState(false);
  const [aiSuperfan, setAiSuperfan] = useState<any>(null);
  const [aiSuperfanLoading, setAiSuperfanLoading] = useState(false);
  const [aiDiscord, setAiDiscord] = useState<any>(null);
  const [aiDiscordLoading, setAiDiscordLoading] = useState(false);
  const [aiCommEvents, setAiCommEvents] = useState<any>(null);
  const [aiCommEventsLoading, setAiCommEventsLoading] = useState(false);
  const [aiPolls, setAiPolls] = useState<any>(null);
  const [aiPollsLoading, setAiPollsLoading] = useState(false);
  const [aiContests, setAiContests] = useState<any>(null);
  const [aiContestsLoading, setAiContestsLoading] = useState(false);
  const [aiCommGuidelines, setAiCommGuidelines] = useState<any>(null);
  const [aiCommGuidelinesLoading, setAiCommGuidelinesLoading] = useState(false);
  const [aiModTrainer, setAiModTrainer] = useState<any>(null);
  const [aiModTrainerLoading, setAiModTrainerLoading] = useState(false);
  const [aiAMA, setAiAMA] = useState<any>(null);
  const [aiAMALoading, setAiAMALoading] = useState(false);
  const [aiLoyalty, setAiLoyalty] = useState<any>(null);
  const [aiLoyaltyLoading, setAiLoyaltyLoading] = useState(false);
  const [aiUGC, setAiUGC] = useState<any>(null);
  const [aiUGCLoading, setAiUGCLoading] = useState(false);
  const [aiCommHealth, setAiCommHealth] = useState<any>(null);
  const [aiCommHealthLoading, setAiCommHealthLoading] = useState(false);
  const [aiFanArt, setAiFanArt] = useState<any>(null);
  const [aiFanArtLoading, setAiFanArtLoading] = useState(false);
  const [aiMilestoneEvent, setAiMilestoneEvent] = useState<any>(null);
  const [aiMilestoneEventLoading, setAiMilestoneEventLoading] = useState(false);
  const [aiDMTemplates, setAiDMTemplates] = useState<any>(null);
  const [aiDMTemplatesLoading, setAiDMTemplatesLoading] = useState(false);
  const [aiHashtagComm, setAiHashtagComm] = useState<any>(null);
  const [aiHashtagCommLoading, setAiHashtagCommLoading] = useState(false);
  const [aiLiveQA, setAiLiveQA] = useState<any>(null);
  const [aiLiveQALoading, setAiLiveQALoading] = useState(false);
  const [aiReferral, setAiReferral] = useState<any>(null);
  const [aiReferralLoading, setAiReferralLoading] = useState(false);
  const [aiAmbassador, setAiAmbassador] = useState<any>(null);
  const [aiAmbassadorLoading, setAiAmbassadorLoading] = useState(false);
  const [aiEngBoost, setAiEngBoost] = useState<any>(null);
  const [aiEngBoostLoading, setAiEngBoostLoading] = useState(false);

  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiDashboardActions");
    if (cached) {
      try { setAiActions(JSON.parse(cached)); } catch {}
    } else if (!aiActionsLoading && !aiActions) {
      setAiActionsLoading(true);
      apiRequest("POST", "/api/ai/dashboard-actions", {})
        .then(r => r.json())
        .then(data => {
          setAiActions(data);
          sessionStorage.setItem("aiDashboardActions", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiActionsLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiNewsFeed");
    if (cached) {
      try { setAiNewsFeed(JSON.parse(cached)); } catch {}
    } else if (!aiNewsFeedLoading && !aiNewsFeed) {
      setAiNewsFeedLoading(true);
      apiRequest("POST", "/api/ai/news-feed", {})
        .then(r => r.json())
        .then(data => {
          setAiNewsFeed(data);
          sessionStorage.setItem("aiNewsFeed", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiNewsFeedLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiMilestones");
    if (cached) {
      try { setAiMilestones(JSON.parse(cached)); } catch {}
    } else if (!aiMilestonesLoading && !aiMilestones) {
      setAiMilestonesLoading(true);
      apiRequest("POST", "/api/ai/milestones", {})
        .then(r => r.json())
        .then(data => {
          setAiMilestones(data);
          sessionStorage.setItem("aiMilestones", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiMilestonesLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCrossplatform");
    if (cached) {
      try { setAiCrossplatform(JSON.parse(cached)); } catch {}
    } else if (!aiCrossplatformLoading && !aiCrossplatform) {
      setAiCrossplatformLoading(true);
      apiRequest("POST", "/api/ai/crossplatform-analytics", {})
        .then(r => r.json())
        .then(data => {
          setAiCrossplatform(data);
          sessionStorage.setItem("aiCrossplatform", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiCrossplatformLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCommentManager");
    if (cached) {
      try { setAiCommentManager(JSON.parse(cached)); } catch {}
    } else if (!aiCommentManagerLoading && !aiCommentManager) {
      setAiCommentManagerLoading(true);
      apiRequest("POST", "/api/ai/comment-manager", { comments: [] })
        .then(r => r.json())
        .then(data => {
          setAiCommentManager(data);
          sessionStorage.setItem("aiCommentManager", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiCommentManagerLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_retention");
    if (cached) { try { setAiRetention(JSON.parse(cached)); return; } catch {} }
    setAiRetentionLoading(true);
    apiRequest("POST", "/api/ai/retention-analyzer", {}).then(r => r.json()).then(d => { setAiRetention(d); sessionStorage.setItem("ai_retention", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRetentionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_demographics");
    if (cached) { try { setAiDemographics(JSON.parse(cached)); return; } catch {} }
    setAiDemographicsLoading(true);
    apiRequest("POST", "/api/ai/audience-demographics", {}).then(r => r.json()).then(d => { setAiDemographics(d); sessionStorage.setItem("ai_demographics", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDemographicsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_watch_time");
    if (cached) { try { setAiWatchTime(JSON.parse(cached)); return; } catch {} }
    setAiWatchTimeLoading(true);
    apiRequest("POST", "/api/ai/watch-time", {}).then(r => r.json()).then(d => { setAiWatchTime(d); sessionStorage.setItem("ai_watch_time", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWatchTimeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_engagement");
    if (cached) { try { setAiEngagement(JSON.parse(cached)); return; } catch {} }
    setAiEngagementLoading(true);
    apiRequest("POST", "/api/ai/engagement-rate", {}).then(r => r.json()).then(d => { setAiEngagement(d); sessionStorage.setItem("ai_engagement", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEngagementLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_growth");
    if (cached) { try { setAiSubGrowth(JSON.parse(cached)); return; } catch {} }
    setAiSubGrowthLoading(true);
    apiRequest("POST", "/api/ai/subscriber-growth", {}).then(r => r.json()).then(d => { setAiSubGrowth(d); sessionStorage.setItem("ai_sub_growth", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_forecast");
    if (cached) { try { setAiRevForecast(JSON.parse(cached)); return; } catch {} }
    setAiRevForecastLoading(true);
    apiRequest("POST", "/api/ai/revenue-forecast", {}).then(r => r.json()).then(d => { setAiRevForecast(d); sessionStorage.setItem("ai_rev_forecast", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRevForecastLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ab_test");
    if (cached) { try { setAiABTest(JSON.parse(cached)); return; } catch {} }
    setAiABTestLoading(true);
    apiRequest("POST", "/api/ai/ab-test", {}).then(r => r.json()).then(d => { setAiABTest(d); sessionStorage.setItem("ai_ab_test", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiABTestLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ret_heatmap");
    if (cached) { try { setAiRetHeatmap(JSON.parse(cached)); return; } catch {} }
    setAiRetHeatmapLoading(true);
    apiRequest("POST", "/api/ai/retention-heatmap", {}).then(r => r.json()).then(d => { setAiRetHeatmap(d); sessionStorage.setItem("ai_ret_heatmap", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRetHeatmapLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_traffic_src");
    if (cached) { try { setAiTrafficSrc(JSON.parse(cached)); return; } catch {} }
    setAiTrafficSrcLoading(true);
    apiRequest("POST", "/api/ai/traffic-sources", {}).then(r => r.json()).then(d => { setAiTrafficSrc(d); sessionStorage.setItem("ai_traffic_src", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTrafficSrcLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_devices");
    if (cached) { try { setAiDevices(JSON.parse(cached)); return; } catch {} }
    setAiDevicesLoading(true);
    apiRequest("POST", "/api/ai/device-analyzer", {}).then(r => r.json()).then(d => { setAiDevices(d); sessionStorage.setItem("ai_devices", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDevicesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_playback");
    if (cached) { try { setAiPlayback(JSON.parse(cached)); return; } catch {} }
    setAiPlaybackLoading(true);
    apiRequest("POST", "/api/ai/playback-location", {}).then(r => r.json()).then(d => { setAiPlayback(d); sessionStorage.setItem("ai_playback", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPlaybackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_end_screen");
    if (cached) { try { setAiEndScreen(JSON.parse(cached)); return; } catch {} }
    setAiEndScreenLoading(true);
    apiRequest("POST", "/api/ai/end-screen-analyzer", {}).then(r => r.json()).then(d => { setAiEndScreen(d); sessionStorage.setItem("ai_end_screen", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEndScreenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_card_perf");
    if (cached) { try { setAiCardPerf(JSON.parse(cached)); return; } catch {} }
    setAiCardPerfLoading(true);
    apiRequest("POST", "/api/ai/card-performance", {}).then(r => r.json()).then(d => { setAiCardPerf(d); sessionStorage.setItem("ai_card_perf", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCardPerfLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_imp_funnel");
    if (cached) { try { setAiImpFunnel(JSON.parse(cached)); return; } catch {} }
    setAiImpFunnelLoading(true);
    apiRequest("POST", "/api/ai/impression-funnel", {}).then(r => r.json()).then(d => { setAiImpFunnel(d); sessionStorage.setItem("ai_imp_funnel", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiImpFunnelLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_bench");
    if (cached) { try { setAiCompBench(JSON.parse(cached)); return; } catch {} }
    setAiCompBenchLoading(true);
    apiRequest("POST", "/api/ai/competitor-benchmark", {}).then(r => r.json()).then(d => { setAiCompBench(d); sessionStorage.setItem("ai_comp_bench", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompBenchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_growth_pred");
    if (cached) { try { setAiGrowthPred(JSON.parse(cached)); return; } catch {} }
    setAiGrowthPredLoading(true);
    apiRequest("POST", "/api/ai/growth-prediction", {}).then(r => r.json()).then(d => { setAiGrowthPred(d); sessionStorage.setItem("ai_growth_pred", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGrowthPredLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_churn");
    if (cached) { try { setAiChurn(JSON.parse(cached)); return; } catch {} }
    setAiChurnLoading(true);
    apiRequest("POST", "/api/ai/churn-predictor", {}).then(r => r.json()).then(d => { setAiChurn(d); sessionStorage.setItem("ai_churn", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChurnLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_viral_coeff");
    if (cached) { try { setAiViralCoeff(JSON.parse(cached)); return; } catch {} }
    setAiViralCoeffLoading(true);
    apiRequest("POST", "/api/ai/viral-coefficient", {}).then(r => r.json()).then(d => { setAiViralCoeff(d); sessionStorage.setItem("ai_viral_coeff", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiViralCoeffLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sentiment");
    if (cached) { try { setAiSentiment(JSON.parse(cached)); return; } catch {} }
    setAiSentimentLoading(true);
    apiRequest("POST", "/api/ai/sentiment", {}).then(r => r.json()).then(d => { setAiSentiment(d); sessionStorage.setItem("ai_sentiment", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSentimentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_peak_times");
    if (cached) { try { setAiPeakTimes(JSON.parse(cached)); return; } catch {} }
    setAiPeakTimesLoading(true);
    apiRequest("POST", "/api/ai/peak-times", {}).then(r => r.json()).then(d => { setAiPeakTimes(d); sessionStorage.setItem("ai_peak_times", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPeakTimesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lifecycle");
    if (cached) { try { setAiLifecycle(JSON.parse(cached)); return; } catch {} }
    setAiLifecycleLoading(true);
    apiRequest("POST", "/api/ai/video-lifecycle", {}).then(r => r.json()).then(d => { setAiLifecycle(d); sessionStorage.setItem("ai_lifecycle", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLifecycleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rpm");
    if (cached) { try { setAiRPM(JSON.parse(cached)); return; } catch {} }
    setAiRPMLoading(true);
    apiRequest("POST", "/api/ai/rpm-optimizer", {}).then(r => r.json()).then(d => { setAiRPM(d); sessionStorage.setItem("ai_rpm", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRPMLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_overlap");
    if (cached) { try { setAiOverlap(JSON.parse(cached)); return; } catch {} }
    setAiOverlapLoading(true);
    apiRequest("POST", "/api/ai/audience-overlap", {}).then(r => r.json()).then(d => { setAiOverlap(d); sessionStorage.setItem("ai_overlap", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOverlapLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_perf_ranker");
    if (cached) { try { setAiPerfRanker(JSON.parse(cached)); return; } catch {} }
    setAiPerfRankerLoading(true);
    apiRequest("POST", "/api/ai/performance-ranker", {}).then(r => r.json()).then(d => { setAiPerfRanker(d); sessionStorage.setItem("ai_perf_ranker", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPerfRankerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_funnel_leak");
    if (cached) { try { setAiFunnelLeak(JSON.parse(cached)); return; } catch {} }
    setAiFunnelLeakLoading(true);
    apiRequest("POST", "/api/ai/funnel-leaks", {}).then(r => r.json()).then(d => { setAiFunnelLeak(d); sessionStorage.setItem("ai_funnel_leak", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFunnelLeakLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_predictive");
    if (cached) { try { setAiPredictive(JSON.parse(cached)); return; } catch {} }
    setAiPredictiveLoading(true);
    apiRequest("POST", "/api/ai/predictive-analytics", {}).then(r => r.json()).then(d => { setAiPredictive(d); sessionStorage.setItem("ai_predictive", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPredictiveLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_custom_report");
    if (cached) { try { setAiCustomReport(JSON.parse(cached)); return; } catch {} }
    setAiCustomReportLoading(true);
    apiRequest("POST", "/api/ai/custom-reports", {}).then(r => r.json()).then(d => { setAiCustomReport(d); sessionStorage.setItem("ai_custom_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCustomReportLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comment_resp");
    if (cached) { try { setAiCommentResp(JSON.parse(cached)); return; } catch {} }
    setAiCommentRespLoading(true);
    apiRequest("POST", "/api/ai/comment-response", {}).then(r => r.json()).then(d => { setAiCommentResp(d); sessionStorage.setItem("ai_comment_resp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommentRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_superfan");
    if (cached) { try { setAiSuperfan(JSON.parse(cached)); return; } catch {} }
    setAiSuperfanLoading(true);
    apiRequest("POST", "/api/ai/superfan-id", {}).then(r => r.json()).then(d => { setAiSuperfan(d); sessionStorage.setItem("ai_superfan", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSuperfanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_discord");
    if (cached) { try { setAiDiscord(JSON.parse(cached)); return; } catch {} }
    setAiDiscordLoading(true);
    apiRequest("POST", "/api/ai/discord-planner", {}).then(r => r.json()).then(d => { setAiDiscord(d); sessionStorage.setItem("ai_discord", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDiscordLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comm_events");
    if (cached) { try { setAiCommEvents(JSON.parse(cached)); return; } catch {} }
    setAiCommEventsLoading(true);
    apiRequest("POST", "/api/ai/community-events", {}).then(r => r.json()).then(d => { setAiCommEvents(d); sessionStorage.setItem("ai_comm_events", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommEventsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_polls");
    if (cached) { try { setAiPolls(JSON.parse(cached)); return; } catch {} }
    setAiPollsLoading(true);
    apiRequest("POST", "/api/ai/poll-creator", {}).then(r => r.json()).then(d => { setAiPolls(d); sessionStorage.setItem("ai_polls", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPollsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contests");
    if (cached) { try { setAiContests(JSON.parse(cached)); return; } catch {} }
    setAiContestsLoading(true);
    apiRequest("POST", "/api/ai/contest-runner", {}).then(r => r.json()).then(d => { setAiContests(d); sessionStorage.setItem("ai_contests", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContestsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comm_guidelines");
    if (cached) { try { setAiCommGuidelines(JSON.parse(cached)); return; } catch {} }
    setAiCommGuidelinesLoading(true);
    apiRequest("POST", "/api/ai/community-guidelines", {}).then(r => r.json()).then(d => { setAiCommGuidelines(d); sessionStorage.setItem("ai_comm_guidelines", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommGuidelinesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mod_trainer");
    if (cached) { try { setAiModTrainer(JSON.parse(cached)); return; } catch {} }
    setAiModTrainerLoading(true);
    apiRequest("POST", "/api/ai/moderator-trainer", {}).then(r => r.json()).then(d => { setAiModTrainer(d); sessionStorage.setItem("ai_mod_trainer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiModTrainerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ama");
    if (cached) { try { setAiAMA(JSON.parse(cached)); return; } catch {} }
    setAiAMALoading(true);
    apiRequest("POST", "/api/ai/ama-planner", {}).then(r => r.json()).then(d => { setAiAMA(d); sessionStorage.setItem("ai_ama", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAMALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_loyalty");
    if (cached) { try { setAiLoyalty(JSON.parse(cached)); return; } catch {} }
    setAiLoyaltyLoading(true);
    apiRequest("POST", "/api/ai/loyalty-program", {}).then(r => r.json()).then(d => { setAiLoyalty(d); sessionStorage.setItem("ai_loyalty", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLoyaltyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ugc");
    if (cached) { try { setAiUGC(JSON.parse(cached)); return; } catch {} }
    setAiUGCLoading(true);
    apiRequest("POST", "/api/ai/ugc-strategy", {}).then(r => r.json()).then(d => { setAiUGC(d); sessionStorage.setItem("ai_ugc", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiUGCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comm_health");
    if (cached) { try { setAiCommHealth(JSON.parse(cached)); return; } catch {} }
    setAiCommHealthLoading(true);
    apiRequest("POST", "/api/ai/community-health", {}).then(r => r.json()).then(d => { setAiCommHealth(d); sessionStorage.setItem("ai_comm_health", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommHealthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fan_art");
    if (cached) { try { setAiFanArt(JSON.parse(cached)); return; } catch {} }
    setAiFanArtLoading(true);
    apiRequest("POST", "/api/ai/fan-art", {}).then(r => r.json()).then(d => { setAiFanArt(d); sessionStorage.setItem("ai_fan_art", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFanArtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_milestone_event");
    if (cached) { try { setAiMilestoneEvent(JSON.parse(cached)); return; } catch {} }
    setAiMilestoneEventLoading(true);
    apiRequest("POST", "/api/ai/milestone-events", {}).then(r => r.json()).then(d => { setAiMilestoneEvent(d); sessionStorage.setItem("ai_milestone_event", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMilestoneEventLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dm_templates");
    if (cached) { try { setAiDMTemplates(JSON.parse(cached)); return; } catch {} }
    setAiDMTemplatesLoading(true);
    apiRequest("POST", "/api/ai/dm-templates", {}).then(r => r.json()).then(d => { setAiDMTemplates(d); sessionStorage.setItem("ai_dm_templates", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDMTemplatesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hashtag_comm");
    if (cached) { try { setAiHashtagComm(JSON.parse(cached)); return; } catch {} }
    setAiHashtagCommLoading(true);
    apiRequest("POST", "/api/ai/hashtag-community", {}).then(r => r.json()).then(d => { setAiHashtagComm(d); sessionStorage.setItem("ai_hashtag_comm", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHashtagCommLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_live_qa");
    if (cached) { try { setAiLiveQA(JSON.parse(cached)); return; } catch {} }
    setAiLiveQALoading(true);
    apiRequest("POST", "/api/ai/live-qa", {}).then(r => r.json()).then(d => { setAiLiveQA(d); sessionStorage.setItem("ai_live_qa", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLiveQALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_referral");
    if (cached) { try { setAiReferral(JSON.parse(cached)); return; } catch {} }
    setAiReferralLoading(true);
    apiRequest("POST", "/api/ai/referral-program", {}).then(r => r.json()).then(d => { setAiReferral(d); sessionStorage.setItem("ai_referral", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiReferralLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ambassador");
    if (cached) { try { setAiAmbassador(JSON.parse(cached)); return; } catch {} }
    setAiAmbassadorLoading(true);
    apiRequest("POST", "/api/ai/ambassador-program", {}).then(r => r.json()).then(d => { setAiAmbassador(d); sessionStorage.setItem("ai_ambassador", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAmbassadorLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_eng_boost");
    if (cached) { try { setAiEngBoost(JSON.parse(cached)); return; } catch {} }
    setAiEngBoostLoading(true);
    apiRequest("POST", "/api/ai/engagement-boost", {}).then(r => r.json()).then(d => { setAiEngBoost(d); sessionStorage.setItem("ai_eng_boost", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEngBoostLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const milestoneIconMap: Record<string, any> = {
    trophy: Trophy,
    star: Star,
    rocket: Rocket,
    flame: Flame,
    crown: Crown,
  };

  const activeAgents = agentStatus?.filter((a: any) => a.status === 'active')?.length || 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tasksToday = agentActivities?.filter((a: any) => {
    const created = new Date(a.createdAt);
    return created >= todayStart;
  })?.length || 0;

  const recentNotifications = notifications?.slice(0, 5) || [];
  const platformCount = channels?.length || 0;
  const recentActivities = agentActivities?.slice(0, 5) || [];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  const getHealthStatus = (area: string): { status: "good" | "warning" | "action"; label: string } => {
    switch (area) {
      case "content":
        return (stats?.totalVideos || 0) > 0
          ? { status: "good", label: "Active" }
          : { status: "action", label: "Get Started" };
      case "revenue":
        return (stats?.totalRevenue || 0) > 0
          ? { status: "good", label: "Earning" }
          : { status: "warning", label: "No Revenue" };
      case "brand":
        return { status: "good", label: "Managed" };
      case "wellness": {
        const lastCheck = wellness?.[0];
        if (!lastCheck) return { status: "action", label: "Check In" };
        const daysSince = Math.floor((Date.now() - new Date(lastCheck.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince < 1
          ? { status: "good", label: "Checked In" }
          : { status: "warning", label: `${daysSince}d ago` };
      }
      case "legal": {
        const steps = localStorage.getItem("legalFormationSteps");
        const completed = steps ? JSON.parse(steps).length : 0;
        return completed >= 6
          ? { status: "good", label: "Complete" }
          : completed > 0
          ? { status: "warning", label: `${completed}/6 Steps` }
          : { status: "action", label: "Not Started" };
      }
      default:
        return { status: "good", label: "OK" };
    }
  };

  const statusDot = (status: string) => {
    if (status === "good") return "bg-emerald-400";
    if (status === "warning") return "bg-amber-400";
    return "bg-red-400";
  };

  if (statsLoading) return <DashboardSkeleton />;

  const metrics = [
    { label: "Videos", value: stats?.totalVideos || 0, icon: Film },
    { label: "Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign },
    { label: "AI Agents", value: `${activeAgents}/11`, icon: Bot },
    { label: "AI Tasks Today", value: tasksToday, icon: Zap },
  ];

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-400";
      case "warning": return "bg-amber-400";
      case "success": return "bg-emerald-400";
      default: return "bg-blue-400";
    }
  };

  const activeGoals = goals?.filter((g: any) => g.status === "active") || [];
  const activeVentures = ventures?.filter((v: any) => v.status === "active") || [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
          {greeting()}, {userName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your command center overview.</p>
      </div>

      <Card
        data-testid="card-autonomy-banner"
        className={humanReviewMode
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
        }
      >
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                data-testid="status-ai-pulse"
                className="relative flex h-3 w-3 shrink-0"
              >
                {!humanReviewMode && activeAgents > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex h-3 w-3 rounded-full ${
                  humanReviewMode ? "bg-amber-400" : "bg-emerald-400"
                }`} />
              </span>
              <div>
                <p data-testid="text-ai-status" className="text-sm font-medium">
                  {humanReviewMode ? "Human review required before publishing" : "AI is running everything"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tasksToday} task{tasksToday !== 1 ? "s" : ""} completed today
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="human-review-toggle" className="text-xs text-muted-foreground cursor-pointer">
                Human Review Mode
              </label>
              <Switch
                id="human-review-toggle"
                data-testid="toggle-human-review"
                checked={humanReviewMode}
                onCheckedChange={setHumanReviewMode}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold font-display">{m.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-business-health">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Business Health</CardTitle>
            <Badge variant="secondary" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              {healthAreas.filter(a => getHealthStatus(a.key).status === "good").length}/{healthAreas.length} healthy
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {healthAreas.map((area) => {
              const health = getHealthStatus(area.key);
              const Icon = area.icon;
              return (
                <Link key={area.key} href={area.link}>
                  <div className="flex flex-col items-center gap-2 p-3 rounded-md hover-elevate cursor-pointer" data-testid={`health-${area.key}`}>
                    <div className="relative">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${statusDot(health.status)}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium">{area.label}</p>
                      <p className={`text-xs ${health.status === "good" ? "text-emerald-400" : health.status === "warning" ? "text-amber-400" : "text-red-400"}`}>
                        {health.label}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {(aiMilestones || aiMilestonesLoading) && (
        <Card data-testid="card-ai-milestones">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Milestones
              </CardTitle>
              <Badge variant="secondary" className="text-xs">Tracking</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiMilestonesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiMilestones?.recentMilestones?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Recent Milestones</p>
                    {aiMilestones.recentMilestones.slice(0, 3).map((m: any, i: number) => {
                      const MIcon = milestoneIconMap[m.icon?.toLowerCase()] || Trophy;
                      return (
                        <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`milestone-recent-${i}`}>
                          <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <MIcon className="h-3 w-3 text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{m.title}</p>
                            <p className="text-xs text-muted-foreground">{m.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {aiMilestones?.upcomingMilestones?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Upcoming</p>
                    {aiMilestones.upcomingMilestones.slice(0, 3).map((m: any, i: number) => {
                      const pct = Math.min(Math.round((m.progress || 0)), 100);
                      return (
                        <div key={i} className="space-y-1 p-2 rounded-md bg-muted/30" data-testid={`milestone-upcoming-${i}`}>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium">{m.title}</span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between items-center text-xs text-muted-foreground flex-wrap gap-1">
                            <span>{m.current || 0} / {m.target || 0}</span>
                            {m.estimatedDate && <span>Est. {m.estimatedDate}</span>}
                          </div>
                          {m.tips && <p className="text-xs text-muted-foreground">{m.tips}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {aiMilestones?.streaks?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Streaks</p>
                    <div className="flex flex-wrap gap-3">
                      {aiMilestones.streaks.slice(0, 4).map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`milestone-streak-${i}`}>
                          <Flame className="h-3 w-3 text-orange-400 shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.current || 0} day{(s.current || 0) !== 1 ? "s" : ""} (best: {s.best || 0})</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(aiCrossplatform || aiCrossplatformLoading) && (
        <Card data-testid="card-ai-crossplatform">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Cross-Platform Analytics
              </CardTitle>
              <Badge variant="secondary" className="text-xs">Multi-Platform</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCrossplatformLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-20 rounded-md" />
                  <Skeleton className="h-20 rounded-md" />
                </div>
              </div>
            ) : (
              <>
                {aiCrossplatform?.platformScores?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Platform Scores</p>
                    <div className="grid grid-cols-2 gap-3">
                      {aiCrossplatform.platformScores.slice(0, 4).map((p: any, i: number) => (
                        <div key={i} className="p-3 rounded-md bg-muted/30 space-y-1" data-testid={`crossplatform-score-${i}`}>
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <p className="text-sm font-medium">{p.platform}</p>
                            <Badge variant="secondary" className="text-xs">{p.score}/100</Badge>
                          </div>
                          {p.strengths && <p className="text-xs text-muted-foreground">{Array.isArray(p.strengths) ? p.strengths.join(", ") : p.strengths}</p>}
                          {p.growthPotential && <p className="text-xs text-emerald-400">{p.growthPotential}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(aiCrossplatform?.bestPerforming || aiCrossplatform?.underutilized) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {aiCrossplatform.bestPerforming && (
                      <div className="p-3 rounded-md bg-emerald-500/5 space-y-1" data-testid="crossplatform-best">
                        <p className="text-xs font-medium text-emerald-400">Best Performing</p>
                        <p className="text-sm font-medium">{aiCrossplatform.bestPerforming}</p>
                      </div>
                    )}
                    {aiCrossplatform.underutilized && (
                      <div className="p-3 rounded-md bg-amber-500/5 space-y-1" data-testid="crossplatform-underutilized">
                        <p className="text-xs font-medium text-amber-400">Underutilized</p>
                        <p className="text-sm font-medium">{aiCrossplatform.underutilized}</p>
                      </div>
                    )}
                  </div>
                )}
                {aiCrossplatform?.synergies?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Cross-Promotion Synergies</p>
                    {aiCrossplatform.synergies.slice(0, 3).map((s: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`crossplatform-synergy-${i}`}>
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof s === "string" ? s : s.description || s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(aiActions || aiActionsLoading) && (
        <Card data-testid="card-ai-actions">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Action Center
              </CardTitle>
              <Badge variant="secondary" className="text-xs">Auto-running</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiActionsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiActions?.todaySummary && (
                  <p data-testid="text-ai-today-summary" className="text-sm text-muted-foreground">{aiActions.todaySummary}</p>
                )}
                {aiActions?.actionItems?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">What AI is handling</p>
                    {aiActions.actionItems.slice(0, 4).map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`ai-action-${i}`}>
                        <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                          item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{item.title}</p>
                            <Badge variant="secondary" className="text-xs capitalize">{item.category}</Badge>
                            {item.status === "auto_handled" && (
                              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">
                                <CheckCircle2 className="w-3 h-3 mr-1" />Done
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {aiActions?.opportunities?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Opportunities detected</p>
                    {aiActions.opportunities.slice(0, 3).map((opp: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-purple-500/5" data-testid={`ai-opportunity-${i}`}>
                        <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{opp.title}</p>
                          <p className="text-xs text-muted-foreground">{opp.description}</p>
                          {opp.potentialImpact && (
                            <p className="text-xs text-purple-400 mt-0.5">{opp.potentialImpact}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs capitalize shrink-0">{opp.urgency?.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(aiNewsFeed || aiNewsFeedLoading) && (
        <Card data-testid="card-ai-news-feed">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI News Feed
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                <Newspaper className="w-3 h-3 mr-1" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiNewsFeedLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiNewsFeed?.creatorEconomyPulse && (
                  <p data-testid="text-news-pulse" className="text-sm text-muted-foreground">{aiNewsFeed.creatorEconomyPulse}</p>
                )}
                {aiNewsFeed?.headlines?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Headlines</p>
                    {aiNewsFeed.headlines.slice(0, 4).map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`news-headline-${i}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{h.title}</p>
                            {h.platform && <Badge variant="secondary" className="text-xs">{h.platform}</Badge>}
                            {h.urgency && (
                              <Badge variant="outline" className="text-xs capitalize">{h.urgency}</Badge>
                            )}
                          </div>
                          {h.summary && <p className="text-xs text-muted-foreground mt-0.5">{h.summary}</p>}
                          {h.impact && <p className="text-xs text-blue-400 mt-0.5">{h.impact}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {aiNewsFeed?.algorithmUpdates?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Algorithm Updates</p>
                    {aiNewsFeed.algorithmUpdates.slice(0, 3).map((u: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-blue-500/5" data-testid={`news-algorithm-${i}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{u.platform}</p>
                          </div>
                          {u.change && <p className="text-xs text-muted-foreground mt-0.5">{u.change}</p>}
                          {u.recommendation && <p className="text-xs text-emerald-400 mt-0.5">{u.recommendation}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {aiNewsFeed?.opportunities?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Opportunities</p>
                    {aiNewsFeed.opportunities.slice(0, 3).map((o: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-purple-500/5" data-testid={`news-opportunity-${i}`}>
                        <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.title}</p>
                          {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                          {o.deadline && <p className="text-xs text-amber-400 mt-0.5">Deadline: {o.deadline}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {briefing && (
        <Card data-testid="card-daily-briefing">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Daily Briefing
              </CardTitle>
              {briefing.date && (
                <span className="text-xs text-muted-foreground">{new Date(briefing.date).toLocaleDateString()}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {briefing.summary && <p data-testid="text-briefing-summary" className="text-sm text-muted-foreground">{briefing.summary}</p>}
            {briefing.actionItems && briefing.actionItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Action Items</p>
                {briefing.actionItems.slice(0, 4).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm" data-testid={`briefing-action-${i}`}>
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span className="text-muted-foreground">{item.title || item.description || item}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {advancedMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-optimization-health">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${(optHealth?.score || 0) >= 70 ? "bg-emerald-500/10" : (optHealth?.score || 0) >= 40 ? "bg-amber-500/10" : "bg-red-500/10"}`}>
                  <BarChart3 className={`h-5 w-5 ${(optHealth?.score || 0) >= 70 ? "text-emerald-400" : (optHealth?.score || 0) >= 40 ? "text-amber-400" : "text-red-400"}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{optHealth?.score || 0}</p>
                  <p className="text-xs text-muted-foreground">Optimization Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-shorts-pipeline">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${shortsStatus?.status === "running" ? "bg-blue-500/10" : "bg-muted"}`}>
                  <Scissors className={`h-5 w-5 ${shortsStatus?.status === "running" ? "text-blue-400" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">{shortsStatus?.status === "running" ? "Processing" : shortsStatus?.status || "Idle"}</p>
                  <p className="text-xs text-muted-foreground">Shorts Pipeline{shortsStatus?.totalClips ? ` (${shortsStatus.totalClips} clips)` : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-trending">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Trending</p>
                  <p className="text-xs text-muted-foreground truncate">{trendingTopics?.[0]?.topic || trendingTopics?.[0]?.name || "Scanning trends..."}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {advancedMode && (activeGoals.length > 0 || activeVentures.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeGoals.length > 0 && (
            <Card data-testid="card-active-goals">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Goals</CardTitle>
                  <Link href="/money/goals">
                    <Button variant="ghost" size="sm" data-testid="link-all-goals"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeGoals.slice(0, 3).map((goal: any) => {
                  const pct = Math.min(Math.round(((goal.currentValue || 0) / (goal.targetValue || 1)) * 100), 100);
                  return (
                    <div key={goal.id} className="space-y-1" data-testid={`dashboard-goal-${goal.id}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium truncate">{goal.title}</span>
                        <span className="text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {activeVentures.length > 0 && (
            <Card data-testid="card-active-ventures">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Ventures</CardTitle>
                  <Link href="/money/ventures">
                    <Button variant="ghost" size="sm" data-testid="link-all-ventures"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeVentures.slice(0, 3).map((v: any) => {
                  const pnl = (v.revenue || 0) - (v.expenses || 0);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`dashboard-venture-${v.id}`}>
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{v.name}</span>
                      </div>
                      <span className={`text-xs font-medium ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(aiCommentManager || aiCommentManagerLoading) && (
        <Card data-testid="card-ai-comments">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Comment Manager
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                <MessageSquare className="w-3 h-3 mr-1" />
                Analysis
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCommentManagerLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiCommentManager?.sentimentOverview && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Sentiment Overview</p>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden" data-testid="comment-sentiment-bars">
                      {(aiCommentManager.sentimentOverview.positive || 0) > 0 && (
                        <div
                          className="bg-emerald-400 rounded-l-full"
                          style={{ width: `${aiCommentManager.sentimentOverview.positive}%` }}
                          title={`Positive: ${aiCommentManager.sentimentOverview.positive}%`}
                        />
                      )}
                      {(aiCommentManager.sentimentOverview.neutral || 0) > 0 && (
                        <div
                          className="bg-blue-400"
                          style={{ width: `${aiCommentManager.sentimentOverview.neutral}%` }}
                          title={`Neutral: ${aiCommentManager.sentimentOverview.neutral}%`}
                        />
                      )}
                      {(aiCommentManager.sentimentOverview.negative || 0) > 0 && (
                        <div
                          className="bg-red-400 rounded-r-full"
                          style={{ width: `${aiCommentManager.sentimentOverview.negative}%` }}
                          title={`Negative: ${aiCommentManager.sentimentOverview.negative}%`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-2">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Positive {aiCommentManager.sentimentOverview.positive || 0}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        Neutral {aiCommentManager.sentimentOverview.neutral || 0}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        Negative {aiCommentManager.sentimentOverview.negative || 0}%
                      </span>
                    </div>
                  </div>
                )}
                {aiCommentManager?.contentIdeas?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Content Ideas from Comments</p>
                    {aiCommentManager.contentIdeas.slice(0, 3).map((idea: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`comment-idea-${i}`}>
                        <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof idea === "string" ? idea : idea.title || idea.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {aiCommentManager?.commonQuestions?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Common Questions</p>
                    {aiCommentManager.commonQuestions.slice(0, 3).map((q: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`comment-question-${i}`}>
                        <MessageSquare className="h-3 w-3 text-blue-400 shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof q === "string" ? q : q.question || q.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowAnalyticsAI(!showAnalyticsAI)}
          data-testid="button-toggle-analytics-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Deep Analytics Suite</span>
          <Badge variant="outline" className="text-[10px]">27 tools</Badge>
          {showAnalyticsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAnalyticsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiRetentionLoading || aiRetention) && (
              <Card data-testid="card-ai-retention">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Retention Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRetentionLoading ? <Skeleton className="h-24 w-full" /> : aiRetention && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRetention.insights || aiRetention.dropoffs || aiRetention.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDemographicsLoading || aiDemographics) && (
              <Card data-testid="card-ai-demographics">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audience Demographics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDemographicsLoading ? <Skeleton className="h-24 w-full" /> : aiDemographics && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDemographics.segments || aiDemographics.demographics || aiDemographics.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWatchTimeLoading || aiWatchTime) && (
              <Card data-testid="card-ai-watch-time">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Watch Time</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWatchTimeLoading ? <Skeleton className="h-24 w-full" /> : aiWatchTime && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWatchTime.metrics || aiWatchTime.insights || aiWatchTime.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEngagementLoading || aiEngagement) && (
              <Card data-testid="card-ai-engagement">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Engagement Rate</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEngagementLoading ? <Skeleton className="h-24 w-full" /> : aiEngagement && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEngagement.metrics || aiEngagement.insights || aiEngagement.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubGrowthLoading || aiSubGrowth) && (
              <Card data-testid="card-ai-sub-growth">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Subscriber Growth</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiSubGrowth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubGrowth.trends || aiSubGrowth.projections || aiSubGrowth.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevForecastLoading || aiRevForecast) && (
              <Card data-testid="card-ai-rev-forecast">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Revenue Forecast</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevForecastLoading ? <Skeleton className="h-24 w-full" /> : aiRevForecast && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRevForecast.forecasts || aiRevForecast.projections || aiRevForecast.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiABTestLoading || aiABTest) && (
              <Card data-testid="card-ai-ab-test">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI A/B Test</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiABTestLoading ? <Skeleton className="h-24 w-full" /> : aiABTest && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiABTest.tests || aiABTest.results || aiABTest.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRetHeatmapLoading || aiRetHeatmap) && (
              <Card data-testid="card-ai-ret-heatmap">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Retention Heatmap</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRetHeatmapLoading ? <Skeleton className="h-24 w-full" /> : aiRetHeatmap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRetHeatmap.hotspots || aiRetHeatmap.zones || aiRetHeatmap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrafficSrcLoading || aiTrafficSrc) && (
              <Card data-testid="card-ai-traffic-src">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Traffic Sources</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrafficSrcLoading ? <Skeleton className="h-24 w-full" /> : aiTrafficSrc && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrafficSrc.sources || aiTrafficSrc.channels || aiTrafficSrc.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDevicesLoading || aiDevices) && (
              <Card data-testid="card-ai-devices">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Device Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDevicesLoading ? <Skeleton className="h-24 w-full" /> : aiDevices && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDevices.devices || aiDevices.breakdown || aiDevices.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPlaybackLoading || aiPlayback) && (
              <Card data-testid="card-ai-playback">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Playback Location</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPlaybackLoading ? <Skeleton className="h-24 w-full" /> : aiPlayback && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPlayback.locations || aiPlayback.regions || aiPlayback.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEndScreenLoading || aiEndScreen) && (
              <Card data-testid="card-ai-end-screen">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI End Screen Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEndScreenLoading ? <Skeleton className="h-24 w-full" /> : aiEndScreen && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEndScreen.elements || aiEndScreen.performance || aiEndScreen.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCardPerfLoading || aiCardPerf) && (
              <Card data-testid="card-ai-card-perf">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Card Performance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCardPerfLoading ? <Skeleton className="h-24 w-full" /> : aiCardPerf && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCardPerf.cards || aiCardPerf.metrics || aiCardPerf.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiImpFunnelLoading || aiImpFunnel) && (
              <Card data-testid="card-ai-imp-funnel">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Impression Funnel</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiImpFunnelLoading ? <Skeleton className="h-24 w-full" /> : aiImpFunnel && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiImpFunnel.stages || aiImpFunnel.funnel || aiImpFunnel.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompBenchLoading || aiCompBench) && (
              <Card data-testid="card-ai-comp-bench">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Benchmark</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompBenchLoading ? <Skeleton className="h-24 w-full" /> : aiCompBench && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCompBench.competitors || aiCompBench.benchmarks || aiCompBench.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGrowthPredLoading || aiGrowthPred) && (
              <Card data-testid="card-ai-growth-pred">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Growth Prediction</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGrowthPredLoading ? <Skeleton className="h-24 w-full" /> : aiGrowthPred && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGrowthPred.predictions || aiGrowthPred.milestones || aiGrowthPred.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiChurnLoading || aiChurn) && (
              <Card data-testid="card-ai-churn">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Churn Predictor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiChurnLoading ? <Skeleton className="h-24 w-full" /> : aiChurn && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiChurn.risks || aiChurn.segments || aiChurn.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiViralCoeffLoading || aiViralCoeff) && (
              <Card data-testid="card-ai-viral-coeff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Viral Coefficient</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiViralCoeffLoading ? <Skeleton className="h-24 w-full" /> : aiViralCoeff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiViralCoeff.factors || aiViralCoeff.metrics || aiViralCoeff.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSentimentLoading || aiSentiment) && (
              <Card data-testid="card-ai-sentiment">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sentiment</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSentimentLoading ? <Skeleton className="h-24 w-full" /> : aiSentiment && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSentiment.analysis || aiSentiment.trends || aiSentiment.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPeakTimesLoading || aiPeakTimes) && (
              <Card data-testid="card-ai-peak-times">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Peak Times</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPeakTimesLoading ? <Skeleton className="h-24 w-full" /> : aiPeakTimes && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPeakTimes.times || aiPeakTimes.schedule || aiPeakTimes.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLifecycleLoading || aiLifecycle) && (
              <Card data-testid="card-ai-lifecycle">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video Lifecycle</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLifecycleLoading ? <Skeleton className="h-24 w-full" /> : aiLifecycle && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLifecycle.phases || aiLifecycle.stages || aiLifecycle.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRPMLoading || aiRPM) && (
              <Card data-testid="card-ai-rpm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI RPM Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRPMLoading ? <Skeleton className="h-24 w-full" /> : aiRPM && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRPM.optimizations || aiRPM.strategies || aiRPM.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiOverlapLoading || aiOverlap) && (
              <Card data-testid="card-ai-overlap">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audience Overlap</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOverlapLoading ? <Skeleton className="h-24 w-full" /> : aiOverlap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOverlap.overlaps || aiOverlap.segments || aiOverlap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPerfRankerLoading || aiPerfRanker) && (
              <Card data-testid="card-ai-perf-ranker">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Performance Ranker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPerfRankerLoading ? <Skeleton className="h-24 w-full" /> : aiPerfRanker && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPerfRanker.rankings || aiPerfRanker.videos || aiPerfRanker.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFunnelLeakLoading || aiFunnelLeak) && (
              <Card data-testid="card-ai-funnel-leak">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Funnel Leaks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFunnelLeakLoading ? <Skeleton className="h-24 w-full" /> : aiFunnelLeak && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFunnelLeak.leaks || aiFunnelLeak.issues || aiFunnelLeak.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPredictiveLoading || aiPredictive) && (
              <Card data-testid="card-ai-predictive">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Predictive Analytics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPredictiveLoading ? <Skeleton className="h-24 w-full" /> : aiPredictive && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPredictive.predictions || aiPredictive.forecasts || aiPredictive.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCustomReportLoading || aiCustomReport) && (
              <Card data-testid="card-ai-custom-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Custom Reports</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCustomReportLoading ? <Skeleton className="h-24 w-full" /> : aiCustomReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCustomReport.reports || aiCustomReport.templates || aiCustomReport.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCommunityAI(!showCommunityAI)}
          data-testid="button-toggle-community-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Community & Engagement Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showCommunityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCommunityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCommentRespLoading || aiCommentResp) && (
              <Card data-testid="card-ai-comment-resp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Comment Response</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommentRespLoading ? <Skeleton className="h-24 w-full" /> : aiCommentResp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommentResp.responses || aiCommentResp.templates || aiCommentResp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSuperfanLoading || aiSuperfan) && (
              <Card data-testid="card-ai-superfan">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Superfan Identifier</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSuperfanLoading ? <Skeleton className="h-24 w-full" /> : aiSuperfan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSuperfan.fans || aiSuperfan.superfans || aiSuperfan.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDiscordLoading || aiDiscord) && (
              <Card data-testid="card-ai-discord">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Discord Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDiscordLoading ? <Skeleton className="h-24 w-full" /> : aiDiscord && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDiscord.channels || aiDiscord.plan || aiDiscord.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCommEventsLoading || aiCommEvents) && (
              <Card data-testid="card-ai-comm-events">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Community Events</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommEventsLoading ? <Skeleton className="h-24 w-full" /> : aiCommEvents && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommEvents.events || aiCommEvents.ideas || aiCommEvents.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPollsLoading || aiPolls) && (
              <Card data-testid="card-ai-polls">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Poll Creator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPollsLoading ? <Skeleton className="h-24 w-full" /> : aiPolls && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPolls.polls || aiPolls.questions || aiPolls.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContestsLoading || aiContests) && (
              <Card data-testid="card-ai-contests">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Contest Runner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContestsLoading ? <Skeleton className="h-24 w-full" /> : aiContests && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContests.contests || aiContests.ideas || aiContests.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCommGuidelinesLoading || aiCommGuidelines) && (
              <Card data-testid="card-ai-comm-guidelines">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Community Guidelines</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommGuidelinesLoading ? <Skeleton className="h-24 w-full" /> : aiCommGuidelines && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommGuidelines.guidelines || aiCommGuidelines.rules || aiCommGuidelines.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiModTrainerLoading || aiModTrainer) && (
              <Card data-testid="card-ai-mod-trainer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Moderator Trainer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiModTrainerLoading ? <Skeleton className="h-24 w-full" /> : aiModTrainer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiModTrainer.modules || aiModTrainer.training || aiModTrainer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAMALoading || aiAMA) && (
              <Card data-testid="card-ai-ama">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI AMA Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAMALoading ? <Skeleton className="h-24 w-full" /> : aiAMA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAMA.topics || aiAMA.questions || aiAMA.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLoyaltyLoading || aiLoyalty) && (
              <Card data-testid="card-ai-loyalty">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Loyalty Program</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLoyaltyLoading ? <Skeleton className="h-24 w-full" /> : aiLoyalty && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLoyalty.tiers || aiLoyalty.rewards || aiLoyalty.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiUGCLoading || aiUGC) && (
              <Card data-testid="card-ai-ugc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI UGC Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiUGCLoading ? <Skeleton className="h-24 w-full" /> : aiUGC && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiUGC.strategies || aiUGC.campaigns || aiUGC.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCommHealthLoading || aiCommHealth) && (
              <Card data-testid="card-ai-comm-health">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Community Health</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommHealthLoading ? <Skeleton className="h-24 w-full" /> : aiCommHealth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommHealth.metrics || aiCommHealth.scores || aiCommHealth.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFanArtLoading || aiFanArt) && (
              <Card data-testid="card-ai-fan-art">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Fan Art</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFanArtLoading ? <Skeleton className="h-24 w-full" /> : aiFanArt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFanArt.prompts || aiFanArt.ideas || aiFanArt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMilestoneEventLoading || aiMilestoneEvent) && (
              <Card data-testid="card-ai-milestone-event">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Milestone Events</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMilestoneEventLoading ? <Skeleton className="h-24 w-full" /> : aiMilestoneEvent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMilestoneEvent.events || aiMilestoneEvent.milestones || aiMilestoneEvent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDMTemplatesLoading || aiDMTemplates) && (
              <Card data-testid="card-ai-dm-templates">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI DM Templates</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDMTemplatesLoading ? <Skeleton className="h-24 w-full" /> : aiDMTemplates && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDMTemplates.templates || aiDMTemplates.messages || aiDMTemplates.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHashtagCommLoading || aiHashtagComm) && (
              <Card data-testid="card-ai-hashtag-comm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Hashtag Community</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHashtagCommLoading ? <Skeleton className="h-24 w-full" /> : aiHashtagComm && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHashtagComm.hashtags || aiHashtagComm.communities || aiHashtagComm.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLiveQALoading || aiLiveQA) && (
              <Card data-testid="card-ai-live-qa">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Live Q&A</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLiveQALoading ? <Skeleton className="h-24 w-full" /> : aiLiveQA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLiveQA.questions || aiLiveQA.topics || aiLiveQA.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReferralLoading || aiReferral) && (
              <Card data-testid="card-ai-referral">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Referral Program</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReferralLoading ? <Skeleton className="h-24 w-full" /> : aiReferral && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiReferral.programs || aiReferral.incentives || aiReferral.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAmbassadorLoading || aiAmbassador) && (
              <Card data-testid="card-ai-ambassador">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Ambassador Program</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAmbassadorLoading ? <Skeleton className="h-24 w-full" /> : aiAmbassador && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAmbassador.ambassadors || aiAmbassador.tiers || aiAmbassador.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEngBoostLoading || aiEngBoost) && (
              <Card data-testid="card-ai-eng-boost">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Engagement Boost</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEngBoostLoading ? <Skeleton className="h-24 w-full" /> : aiEngBoost && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEngBoost.strategies || aiEngBoost.tactics || aiEngBoost.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <Card data-testid="card-activity-feed">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Activity Feed
            </CardTitle>
            <Link href="/notifications">
              <Button variant="ghost" size="sm" data-testid="link-view-all-notifications">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentNotifications.length === 0 && recentActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
              <p data-testid="text-all-caught-up" className="text-sm text-muted-foreground">All caught up - AI is handling everything</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity: any) => (
                <div key={`ai-${activity.id}`} data-testid={`row-activity-${activity.id}`} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{activity.agentName || "AI Agent"}</p>
                    <p className="text-xs text-muted-foreground truncate">{activity.action || activity.description || "Completed task"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {activity.createdAt
                      ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                      : ""}
                  </span>
                </div>
              ))}
              {recentNotifications.map((n) => (
                <div key={`notif-${n.id}`} data-testid={`row-notification-${n.id}`} className="flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${severityColor(n.severity)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {n.createdAt
                      ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
