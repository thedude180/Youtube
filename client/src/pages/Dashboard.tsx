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
  const { isAdvanced: advancedMode } = useAdvancedMode();
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

  const [showEventsAI, setShowEventsAI] = useState(false);
  const [aiNewsletter, setAiNewsletter] = useState<any>(null);
  const [aiNewsletterLoading, setAiNewsletterLoading] = useState(false);
  const [aiEmailSeq, setAiEmailSeq] = useState<any>(null);
  const [aiEmailSeqLoading, setAiEmailSeqLoading] = useState(false);
  const [aiLeadMagnet, setAiLeadMagnet] = useState<any>(null);
  const [aiLeadMagnetLoading, setAiLeadMagnetLoading] = useState(false);
  const [aiEmailList, setAiEmailList] = useState<any>(null);
  const [aiEmailListLoading, setAiEmailListLoading] = useState(false);
  const [aiEmailAnalytics, setAiEmailAnalytics] = useState<any>(null);
  const [aiEmailAnalyticsLoading, setAiEmailAnalyticsLoading] = useState(false);
  const [aiWebinar, setAiWebinar] = useState<any>(null);
  const [aiWebinarLoading, setAiWebinarLoading] = useState(false);
  const [aiVirtEvent, setAiVirtEvent] = useState<any>(null);
  const [aiVirtEventLoading, setAiVirtEventLoading] = useState(false);
  const [aiMeetup, setAiMeetup] = useState<any>(null);
  const [aiMeetupLoading, setAiMeetupLoading] = useState(false);
  const [aiConfPrep, setAiConfPrep] = useState<any>(null);
  const [aiConfPrepLoading, setAiConfPrepLoading] = useState(false);
  const [aiAwardSub, setAiAwardSub] = useState<any>(null);
  const [aiAwardSubLoading, setAiAwardSubLoading] = useState(false);
  const [aiPanelPrep, setAiPanelPrep] = useState<any>(null);
  const [aiPanelPrepLoading, setAiPanelPrepLoading] = useState(false);
  const [aiRetreat, setAiRetreat] = useState<any>(null);
  const [aiRetreatLoading, setAiRetreatLoading] = useState(false);
  const [aiWorkshop, setAiWorkshop] = useState<any>(null);
  const [aiWorkshopLoading, setAiWorkshopLoading] = useState(false);
  const [aiCourseLaunch, setAiCourseLaunch] = useState<any>(null);
  const [aiCourseLaunchLoading, setAiCourseLaunchLoading] = useState(false);
  const [aiMasterclass, setAiMasterclass] = useState<any>(null);
  const [aiMasterclassLoading, setAiMasterclassLoading] = useState(false);
  const [aiMediaApp, setAiMediaApp] = useState<any>(null);
  const [aiMediaAppLoading, setAiMediaAppLoading] = useState(false);
  const [aiGuestPost, setAiGuestPost] = useState<any>(null);
  const [aiGuestPostLoading, setAiGuestPostLoading] = useState(false);
  const [aiInfluencerEvent, setAiInfluencerEvent] = useState<any>(null);
  const [aiInfluencerEventLoading, setAiInfluencerEventLoading] = useState(false);
  const [aiProductLaunch, setAiProductLaunch] = useState<any>(null);
  const [aiProductLaunchLoading, setAiProductLaunchLoading] = useState(false);
  const [aiCharityEvent, setAiCharityEvent] = useState<any>(null);
  const [aiCharityEventLoading, setAiCharityEventLoading] = useState(false);
  const [aiAnniversary, setAiAnniversary] = useState<any>(null);
  const [aiAnniversaryLoading, setAiAnniversaryLoading] = useState(false);
  const [aiSeasonalCampaign, setAiSeasonalCampaign] = useState<any>(null);
  const [aiSeasonalCampaignLoading, setAiSeasonalCampaignLoading] = useState(false);
  const [aiHolidayContent, setAiHolidayContent] = useState<any>(null);
  const [aiHolidayContentLoading, setAiHolidayContentLoading] = useState(false);
  const [aiYearReview, setAiYearReview] = useState<any>(null);
  const [aiYearReviewLoading, setAiYearReviewLoading] = useState(false);

  const [showDataSciAI, setShowDataSciAI] = useState(false);
  const [aiDataClean, setAiDataClean] = useState<any>(null);
  const [aiDataCleanLoading, setAiDataCleanLoading] = useState(false);
  const [aiDataPipe, setAiDataPipe] = useState<any>(null);
  const [aiDataPipeLoading, setAiDataPipeLoading] = useState(false);
  const [aiAnomaly, setAiAnomaly] = useState<any>(null);
  const [aiAnomalyLoading, setAiAnomalyLoading] = useState(false);
  const [aiCohort, setAiCohort] = useState<any>(null);
  const [aiCohortLoading, setAiCohortLoading] = useState(false);
  const [aiAttribution, setAiAttribution] = useState<any>(null);
  const [aiAttributionLoading, setAiAttributionLoading] = useState(false);
  const [aiPredChurn, setAiPredChurn] = useState<any>(null);
  const [aiPredChurnLoading, setAiPredChurnLoading] = useState(false);
  const [aiLTV, setAiLTV] = useState<any>(null);
  const [aiLTVLoading, setAiLTVLoading] = useState(false);

  const [showAdsAI, setShowAdsAI] = useState(false);
  const [aiYTAds, setAiYTAds] = useState<any>(null);
  const [aiYTAdsLoading, setAiYTAdsLoading] = useState(false);
  const [aiFBAds, setAiFBAds] = useState<any>(null);
  const [aiFBAdsLoading, setAiFBAdsLoading] = useState(false);
  const [aiGoogleAds, setAiGoogleAds] = useState<any>(null);
  const [aiGoogleAdsLoading, setAiGoogleAdsLoading] = useState(false);
  const [aiTTAds, setAiTTAds] = useState<any>(null);
  const [aiTTAdsLoading, setAiTTAdsLoading] = useState(false);
  const [aiInflAds, setAiInflAds] = useState<any>(null);
  const [aiInflAdsLoading, setAiInflAdsLoading] = useState(false);
  const [aiRetarget, setAiRetarget] = useState<any>(null);
  const [aiRetargetLoading, setAiRetargetLoading] = useState(false);
  const [aiAdCopy, setAiAdCopy] = useState<any>(null);
  const [aiAdCopyLoading, setAiAdCopyLoading] = useState(false);
  const [aiAdBudget, setAiAdBudget] = useState<any>(null);
  const [aiAdBudgetLoading, setAiAdBudgetLoading] = useState(false);
  const [aiLandingPg, setAiLandingPg] = useState<any>(null);
  const [aiLandingPgLoading, setAiLandingPgLoading] = useState(false);
  const [aiConvRate, setAiConvRate] = useState<any>(null);
  const [aiConvRateLoading, setAiConvRateLoading] = useState(false);

  const [showGamifyAI, setShowGamifyAI] = useState(false);
  const [aiAchievements, setAiAchievements] = useState<any>(null);
  const [aiAchievementsLoading, setAiAchievementsLoading] = useState(false);
  const [aiLeaderboard, setAiLeaderboard] = useState<any>(null);
  const [aiLeaderboardLoading, setAiLeaderboardLoading] = useState(false);
  const [aiPointsEcon, setAiPointsEcon] = useState<any>(null);
  const [aiPointsEconLoading, setAiPointsEconLoading] = useState(false);
  const [aiBadgeSys, setAiBadgeSys] = useState<any>(null);
  const [aiBadgeSysLoading, setAiBadgeSysLoading] = useState(false);
  const [aiStreakSys, setAiStreakSys] = useState<any>(null);
  const [aiStreakSysLoading, setAiStreakSysLoading] = useState(false);
  const [aiProgressViz, setAiProgressViz] = useState<any>(null);
  const [aiProgressVizLoading, setAiProgressVizLoading] = useState(false);
  const [aiChallengeSys, setAiChallengeSys] = useState<any>(null);
  const [aiChallengeSysLoading, setAiChallengeSysLoading] = useState(false);

  const [showReportingAI, setShowReportingAI] = useState(false);
  const [aiMonthReport, setAiMonthReport] = useState<any>(null);
  const [aiMonthReportLoading, setAiMonthReportLoading] = useState(false);
  const [aiWeekDigest, setAiWeekDigest] = useState<any>(null);
  const [aiWeekDigestLoading, setAiWeekDigestLoading] = useState(false);
  const [aiQtrReview, setAiQtrReview] = useState<any>(null);
  const [aiQtrReviewLoading, setAiQtrReviewLoading] = useState(false);
  const [aiAnnualStrat, setAiAnnualStrat] = useState<any>(null);
  const [aiAnnualStratLoading, setAiAnnualStratLoading] = useState(false);
  const [aiCompReport, setAiCompReport] = useState<any>(null);
  const [aiCompReportLoading, setAiCompReportLoading] = useState(false);
  const [aiAudReport, setAiAudReport] = useState<any>(null);
  const [aiAudReportLoading, setAiAudReportLoading] = useState(false);
  const [aiContentReport, setAiContentReport] = useState<any>(null);
  const [aiContentReportLoading, setAiContentReportLoading] = useState(false);
  const [aiROIReport, setAiROIReport] = useState<any>(null);
  const [aiROIReportLoading, setAiROIReportLoading] = useState(false);

  const [showSubGrowthAI, setShowSubGrowthAI] = useState(false);
  const [aiSubMilestone, setAiSubMilestone] = useState<any>(null);
  const [aiSubMilestoneLoading, setAiSubMilestoneLoading] = useState(false);
  const [aiSubRetention, setAiSubRetention] = useState<any>(null);
  const [aiSubRetentionLoading, setAiSubRetentionLoading] = useState(false);
  const [aiBellOpt, setAiBellOpt] = useState<any>(null);
  const [aiBellOptLoading, setAiBellOptLoading] = useState(false);
  const [aiFirstVid, setAiFirstVid] = useState<any>(null);
  const [aiFirstVidLoading, setAiFirstVidLoading] = useState(false);
  const [aiMemberPerks, setAiMemberPerks] = useState<any>(null);
  const [aiMemberPerksLoading, setAiMemberPerksLoading] = useState(false);
  const [aiSubCountdown, setAiSubCountdown] = useState<any>(null);
  const [aiSubCountdownLoading, setAiSubCountdownLoading] = useState(false);
  const [aiUnsubAnalysis, setAiUnsubAnalysis] = useState<any>(null);
  const [aiUnsubAnalysisLoading, setAiUnsubAnalysisLoading] = useState(false);
  const [aiSubQuality, setAiSubQuality] = useState<any>(null);
  const [aiSubQualityLoading, setAiSubQualityLoading] = useState(false);
  const [aiGrowthPlay, setAiGrowthPlay] = useState<any>(null);
  const [aiGrowthPlayLoading, setAiGrowthPlayLoading] = useState(false);
  const [aiViralEngine, setAiViralEngine] = useState<any>(null);
  const [aiViralEngineLoading, setAiViralEngineLoading] = useState(false);
  const [aiCrossPromo, setAiCrossPromo] = useState<any>(null);
  const [aiCrossPromoLoading, setAiCrossPromoLoading] = useState(false);

  const [showAccountabilityAI, setShowAccountabilityAI] = useState(false);
  const [aiAccountability, setAiAccountability] = useState<any>(null);
  const [aiAccountabilityLoading, setAiAccountabilityLoading] = useState(false);
  const [aiSabbatical, setAiSabbatical] = useState<any>(null);
  const [aiSabbaticalLoading, setAiSabbaticalLoading] = useState(false);

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
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_newsletter");
    if (cached) { try { setAiNewsletter(JSON.parse(cached)); return; } catch {} }
    setAiNewsletterLoading(true);
    apiRequest("POST", "/api/ai/newsletter", {}).then(r => r.json()).then(d => { setAiNewsletter(d); sessionStorage.setItem("ai_newsletter", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNewsletterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_seq");
    if (cached) { try { setAiEmailSeq(JSON.parse(cached)); return; } catch {} }
    setAiEmailSeqLoading(true);
    apiRequest("POST", "/api/ai/email-sequence", {}).then(r => r.json()).then(d => { setAiEmailSeq(d); sessionStorage.setItem("ai_email_seq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEmailSeqLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lead_magnet");
    if (cached) { try { setAiLeadMagnet(JSON.parse(cached)); return; } catch {} }
    setAiLeadMagnetLoading(true);
    apiRequest("POST", "/api/ai/lead-magnet", {}).then(r => r.json()).then(d => { setAiLeadMagnet(d); sessionStorage.setItem("ai_lead_magnet", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLeadMagnetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_list");
    if (cached) { try { setAiEmailList(JSON.parse(cached)); return; } catch {} }
    setAiEmailListLoading(true);
    apiRequest("POST", "/api/ai/email-list", {}).then(r => r.json()).then(d => { setAiEmailList(d); sessionStorage.setItem("ai_email_list", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEmailListLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_analytics");
    if (cached) { try { setAiEmailAnalytics(JSON.parse(cached)); return; } catch {} }
    setAiEmailAnalyticsLoading(true);
    apiRequest("POST", "/api/ai/email-analytics", {}).then(r => r.json()).then(d => { setAiEmailAnalytics(d); sessionStorage.setItem("ai_email_analytics", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEmailAnalyticsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_webinar");
    if (cached) { try { setAiWebinar(JSON.parse(cached)); return; } catch {} }
    setAiWebinarLoading(true);
    apiRequest("POST", "/api/ai/webinar", {}).then(r => r.json()).then(d => { setAiWebinar(d); sessionStorage.setItem("ai_webinar", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWebinarLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_virt_event");
    if (cached) { try { setAiVirtEvent(JSON.parse(cached)); return; } catch {} }
    setAiVirtEventLoading(true);
    apiRequest("POST", "/api/ai/virtual-event", {}).then(r => r.json()).then(d => { setAiVirtEvent(d); sessionStorage.setItem("ai_virt_event", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVirtEventLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meetup");
    if (cached) { try { setAiMeetup(JSON.parse(cached)); return; } catch {} }
    setAiMeetupLoading(true);
    apiRequest("POST", "/api/ai/meetup", {}).then(r => r.json()).then(d => { setAiMeetup(d); sessionStorage.setItem("ai_meetup", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMeetupLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_conf_prep");
    if (cached) { try { setAiConfPrep(JSON.parse(cached)); return; } catch {} }
    setAiConfPrepLoading(true);
    apiRequest("POST", "/api/ai/conference-prep", {}).then(r => r.json()).then(d => { setAiConfPrep(d); sessionStorage.setItem("ai_conf_prep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiConfPrepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_award_sub");
    if (cached) { try { setAiAwardSub(JSON.parse(cached)); return; } catch {} }
    setAiAwardSubLoading(true);
    apiRequest("POST", "/api/ai/award-submission", {}).then(r => r.json()).then(d => { setAiAwardSub(d); sessionStorage.setItem("ai_award_sub", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAwardSubLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_panel_prep");
    if (cached) { try { setAiPanelPrep(JSON.parse(cached)); return; } catch {} }
    setAiPanelPrepLoading(true);
    apiRequest("POST", "/api/ai/panel-prep", {}).then(r => r.json()).then(d => { setAiPanelPrep(d); sessionStorage.setItem("ai_panel_prep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPanelPrepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_retreat");
    if (cached) { try { setAiRetreat(JSON.parse(cached)); return; } catch {} }
    setAiRetreatLoading(true);
    apiRequest("POST", "/api/ai/creator-retreat", {}).then(r => r.json()).then(d => { setAiRetreat(d); sessionStorage.setItem("ai_retreat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRetreatLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_workshop");
    if (cached) { try { setAiWorkshop(JSON.parse(cached)); return; } catch {} }
    setAiWorkshopLoading(true);
    apiRequest("POST", "/api/ai/live-workshop", {}).then(r => r.json()).then(d => { setAiWorkshop(d); sessionStorage.setItem("ai_workshop", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorkshopLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_course_launch");
    if (cached) { try { setAiCourseLaunch(JSON.parse(cached)); return; } catch {} }
    setAiCourseLaunchLoading(true);
    apiRequest("POST", "/api/ai/course-launch", {}).then(r => r.json()).then(d => { setAiCourseLaunch(d); sessionStorage.setItem("ai_course_launch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCourseLaunchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_masterclass");
    if (cached) { try { setAiMasterclass(JSON.parse(cached)); return; } catch {} }
    setAiMasterclassLoading(true);
    apiRequest("POST", "/api/ai/masterclass", {}).then(r => r.json()).then(d => { setAiMasterclass(d); sessionStorage.setItem("ai_masterclass", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMasterclassLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_media_app");
    if (cached) { try { setAiMediaApp(JSON.parse(cached)); return; } catch {} }
    setAiMediaAppLoading(true);
    apiRequest("POST", "/api/ai/media-appearance", {}).then(r => r.json()).then(d => { setAiMediaApp(d); sessionStorage.setItem("ai_media_app", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMediaAppLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_guest_post");
    if (cached) { try { setAiGuestPost(JSON.parse(cached)); return; } catch {} }
    setAiGuestPostLoading(true);
    apiRequest("POST", "/api/ai/guest-post", {}).then(r => r.json()).then(d => { setAiGuestPost(d); sessionStorage.setItem("ai_guest_post", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGuestPostLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_influencer_event");
    if (cached) { try { setAiInfluencerEvent(JSON.parse(cached)); return; } catch {} }
    setAiInfluencerEventLoading(true);
    apiRequest("POST", "/api/ai/influencer-event", {}).then(r => r.json()).then(d => { setAiInfluencerEvent(d); sessionStorage.setItem("ai_influencer_event", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInfluencerEventLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_product_launch");
    if (cached) { try { setAiProductLaunch(JSON.parse(cached)); return; } catch {} }
    setAiProductLaunchLoading(true);
    apiRequest("POST", "/api/ai/product-launch", {}).then(r => r.json()).then(d => { setAiProductLaunch(d); sessionStorage.setItem("ai_product_launch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProductLaunchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_charity_event");
    if (cached) { try { setAiCharityEvent(JSON.parse(cached)); return; } catch {} }
    setAiCharityEventLoading(true);
    apiRequest("POST", "/api/ai/charity-event", {}).then(r => r.json()).then(d => { setAiCharityEvent(d); sessionStorage.setItem("ai_charity_event", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCharityEventLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_anniversary");
    if (cached) { try { setAiAnniversary(JSON.parse(cached)); return; } catch {} }
    setAiAnniversaryLoading(true);
    apiRequest("POST", "/api/ai/anniversary", {}).then(r => r.json()).then(d => { setAiAnniversary(d); sessionStorage.setItem("ai_anniversary", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAnniversaryLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_seasonal_campaign");
    if (cached) { try { setAiSeasonalCampaign(JSON.parse(cached)); return; } catch {} }
    setAiSeasonalCampaignLoading(true);
    apiRequest("POST", "/api/ai/seasonal-campaign", {}).then(r => r.json()).then(d => { setAiSeasonalCampaign(d); sessionStorage.setItem("ai_seasonal_campaign", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSeasonalCampaignLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_holiday_content");
    if (cached) { try { setAiHolidayContent(JSON.parse(cached)); return; } catch {} }
    setAiHolidayContentLoading(true);
    apiRequest("POST", "/api/ai/holiday-content", {}).then(r => r.json()).then(d => { setAiHolidayContent(d); sessionStorage.setItem("ai_holiday_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHolidayContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_year_review");
    if (cached) { try { setAiYearReview(JSON.parse(cached)); return; } catch {} }
    setAiYearReviewLoading(true);
    apiRequest("POST", "/api/ai/year-review", {}).then(r => r.json()).then(d => { setAiYearReview(d); sessionStorage.setItem("ai_year_review", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiYearReviewLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_clean");
    if (cached) { try { setAiDataClean(JSON.parse(cached)); return; } catch {} }
    setAiDataCleanLoading(true);
    apiRequest("POST", "/api/ai/data-cleaning", {}).then(r => r.json()).then(d => { setAiDataClean(d); sessionStorage.setItem("ai_data_clean", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataCleanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_pipe");
    if (cached) { try { setAiDataPipe(JSON.parse(cached)); return; } catch {} }
    setAiDataPipeLoading(true);
    apiRequest("POST", "/api/ai/data-pipeline", {}).then(r => r.json()).then(d => { setAiDataPipe(d); sessionStorage.setItem("ai_data_pipe", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataPipeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_anomaly");
    if (cached) { try { setAiAnomaly(JSON.parse(cached)); return; } catch {} }
    setAiAnomalyLoading(true);
    apiRequest("POST", "/api/ai/anomaly-detector", {}).then(r => r.json()).then(d => { setAiAnomaly(d); sessionStorage.setItem("ai_anomaly", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAnomalyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cohort");
    if (cached) { try { setAiCohort(JSON.parse(cached)); return; } catch {} }
    setAiCohortLoading(true);
    apiRequest("POST", "/api/ai/cohort-analysis", {}).then(r => r.json()).then(d => { setAiCohort(d); sessionStorage.setItem("ai_cohort", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCohortLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_attribution");
    if (cached) { try { setAiAttribution(JSON.parse(cached)); return; } catch {} }
    setAiAttributionLoading(true);
    apiRequest("POST", "/api/ai/attribution-model", {}).then(r => r.json()).then(d => { setAiAttribution(d); sessionStorage.setItem("ai_attribution", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAttributionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pred_churn");
    if (cached) { try { setAiPredChurn(JSON.parse(cached)); return; } catch {} }
    setAiPredChurnLoading(true);
    apiRequest("POST", "/api/ai/predictive-churn", {}).then(r => r.json()).then(d => { setAiPredChurn(d); sessionStorage.setItem("ai_pred_churn", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPredChurnLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ltv");
    if (cached) { try { setAiLTV(JSON.parse(cached)); return; } catch {} }
    setAiLTVLoading(true);
    apiRequest("POST", "/api/ai/ltv-calculator", {}).then(r => r.json()).then(d => { setAiLTV(d); sessionStorage.setItem("ai_ltv", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLTVLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_yt_ads");
    if (cached) { try { setAiYTAds(JSON.parse(cached)); return; } catch {} }
    setAiYTAdsLoading(true);
    apiRequest("POST", "/api/ai/youtube-ads", {}).then(r => r.json()).then(d => { setAiYTAds(d); sessionStorage.setItem("ai_yt_ads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiYTAdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fb_ads");
    if (cached) { try { setAiFBAds(JSON.parse(cached)); return; } catch {} }
    setAiFBAdsLoading(true);
    apiRequest("POST", "/api/ai/facebook-ads", {}).then(r => r.json()).then(d => { setAiFBAds(d); sessionStorage.setItem("ai_fb_ads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFBAdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_google_ads");
    if (cached) { try { setAiGoogleAds(JSON.parse(cached)); return; } catch {} }
    setAiGoogleAdsLoading(true);
    apiRequest("POST", "/api/ai/google-ads", {}).then(r => r.json()).then(d => { setAiGoogleAds(d); sessionStorage.setItem("ai_google_ads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGoogleAdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_ads");
    if (cached) { try { setAiTTAds(JSON.parse(cached)); return; } catch {} }
    setAiTTAdsLoading(true);
    apiRequest("POST", "/api/ai/tiktok-ads", {}).then(r => r.json()).then(d => { setAiTTAds(d); sessionStorage.setItem("ai_tt_ads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTAdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infl_ads");
    if (cached) { try { setAiInflAds(JSON.parse(cached)); return; } catch {} }
    setAiInflAdsLoading(true);
    apiRequest("POST", "/api/ai/influencer-ads", {}).then(r => r.json()).then(d => { setAiInflAds(d); sessionStorage.setItem("ai_infl_ads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInflAdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_retarget");
    if (cached) { try { setAiRetarget(JSON.parse(cached)); return; } catch {} }
    setAiRetargetLoading(true);
    apiRequest("POST", "/api/ai/retargeting", {}).then(r => r.json()).then(d => { setAiRetarget(d); sessionStorage.setItem("ai_retarget", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRetargetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ad_copy");
    if (cached) { try { setAiAdCopy(JSON.parse(cached)); return; } catch {} }
    setAiAdCopyLoading(true);
    apiRequest("POST", "/api/ai/ad-copy", {}).then(r => r.json()).then(d => { setAiAdCopy(d); sessionStorage.setItem("ai_ad_copy", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAdCopyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ad_budget");
    if (cached) { try { setAiAdBudget(JSON.parse(cached)); return; } catch {} }
    setAiAdBudgetLoading(true);
    apiRequest("POST", "/api/ai/ad-budget", {}).then(r => r.json()).then(d => { setAiAdBudget(d); sessionStorage.setItem("ai_ad_budget", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAdBudgetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_landing_pg");
    if (cached) { try { setAiLandingPg(JSON.parse(cached)); return; } catch {} }
    setAiLandingPgLoading(true);
    apiRequest("POST", "/api/ai/landing-page", {}).then(r => r.json()).then(d => { setAiLandingPg(d); sessionStorage.setItem("ai_landing_pg", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLandingPgLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_conv_rate");
    if (cached) { try { setAiConvRate(JSON.parse(cached)); return; } catch {} }
    setAiConvRateLoading(true);
    apiRequest("POST", "/api/ai/conversion-rate", {}).then(r => r.json()).then(d => { setAiConvRate(d); sessionStorage.setItem("ai_conv_rate", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiConvRateLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_achievements");
    if (cached) { try { setAiAchievements(JSON.parse(cached)); return; } catch {} }
    setAiAchievementsLoading(true);
    apiRequest("POST", "/api/ai/achievements", {}).then(r => r.json()).then(d => { setAiAchievements(d); sessionStorage.setItem("ai_achievements", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAchievementsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_leaderboard");
    if (cached) { try { setAiLeaderboard(JSON.parse(cached)); return; } catch {} }
    setAiLeaderboardLoading(true);
    apiRequest("POST", "/api/ai/leaderboard", {}).then(r => r.json()).then(d => { setAiLeaderboard(d); sessionStorage.setItem("ai_leaderboard", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLeaderboardLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_points_econ");
    if (cached) { try { setAiPointsEcon(JSON.parse(cached)); return; } catch {} }
    setAiPointsEconLoading(true);
    apiRequest("POST", "/api/ai/points-economy", {}).then(r => r.json()).then(d => { setAiPointsEcon(d); sessionStorage.setItem("ai_points_econ", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPointsEconLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_badge_sys");
    if (cached) { try { setAiBadgeSys(JSON.parse(cached)); return; } catch {} }
    setAiBadgeSysLoading(true);
    apiRequest("POST", "/api/ai/badge-system", {}).then(r => r.json()).then(d => { setAiBadgeSys(d); sessionStorage.setItem("ai_badge_sys", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBadgeSysLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_streak_sys");
    if (cached) { try { setAiStreakSys(JSON.parse(cached)); return; } catch {} }
    setAiStreakSysLoading(true);
    apiRequest("POST", "/api/ai/streak-system", {}).then(r => r.json()).then(d => { setAiStreakSys(d); sessionStorage.setItem("ai_streak_sys", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreakSysLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_progress_viz");
    if (cached) { try { setAiProgressViz(JSON.parse(cached)); return; } catch {} }
    setAiProgressVizLoading(true);
    apiRequest("POST", "/api/ai/progress-viz", {}).then(r => r.json()).then(d => { setAiProgressViz(d); sessionStorage.setItem("ai_progress_viz", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProgressVizLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_challenge_sys");
    if (cached) { try { setAiChallengeSys(JSON.parse(cached)); return; } catch {} }
    setAiChallengeSysLoading(true);
    apiRequest("POST", "/api/ai/challenge-system", {}).then(r => r.json()).then(d => { setAiChallengeSys(d); sessionStorage.setItem("ai_challenge_sys", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChallengeSysLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_month_report");
    if (cached) { try { setAiMonthReport(JSON.parse(cached)); return; } catch {} }
    setAiMonthReportLoading(true);
    apiRequest("POST", "/api/ai/monthly-report", {}).then(r => r.json()).then(d => { setAiMonthReport(d); sessionStorage.setItem("ai_month_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMonthReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_week_digest");
    if (cached) { try { setAiWeekDigest(JSON.parse(cached)); return; } catch {} }
    setAiWeekDigestLoading(true);
    apiRequest("POST", "/api/ai/weekly-digest", {}).then(r => r.json()).then(d => { setAiWeekDigest(d); sessionStorage.setItem("ai_week_digest", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWeekDigestLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_qtr_review");
    if (cached) { try { setAiQtrReview(JSON.parse(cached)); return; } catch {} }
    setAiQtrReviewLoading(true);
    apiRequest("POST", "/api/ai/quarterly-review", {}).then(r => r.json()).then(d => { setAiQtrReview(d); sessionStorage.setItem("ai_qtr_review", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiQtrReviewLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_annual_strat");
    if (cached) { try { setAiAnnualStrat(JSON.parse(cached)); return; } catch {} }
    setAiAnnualStratLoading(true);
    apiRequest("POST", "/api/ai/annual-strategy", {}).then(r => r.json()).then(d => { setAiAnnualStrat(d); sessionStorage.setItem("ai_annual_strat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAnnualStratLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_report");
    if (cached) { try { setAiCompReport(JSON.parse(cached)); return; } catch {} }
    setAiCompReportLoading(true);
    apiRequest("POST", "/api/ai/competitor-report", {}).then(r => r.json()).then(d => { setAiCompReport(d); sessionStorage.setItem("ai_comp_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_aud_report");
    if (cached) { try { setAiAudReport(JSON.parse(cached)); return; } catch {} }
    setAiAudReportLoading(true);
    apiRequest("POST", "/api/ai/audience-report", {}).then(r => r.json()).then(d => { setAiAudReport(d); sessionStorage.setItem("ai_aud_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAudReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_report");
    if (cached) { try { setAiContentReport(JSON.parse(cached)); return; } catch {} }
    setAiContentReportLoading(true);
    apiRequest("POST", "/api/ai/content-report", {}).then(r => r.json()).then(d => { setAiContentReport(d); sessionStorage.setItem("ai_content_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_roi_report");
    if (cached) { try { setAiROIReport(JSON.parse(cached)); return; } catch {} }
    setAiROIReportLoading(true);
    apiRequest("POST", "/api/ai/roi-report", {}).then(r => r.json()).then(d => { setAiROIReport(d); sessionStorage.setItem("ai_roi_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiROIReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_milestone");
    if (cached) { try { setAiSubMilestone(JSON.parse(cached)); return; } catch {} }
    setAiSubMilestoneLoading(true);
    apiRequest("POST", "/api/ai/sub-milestone", {}).then(r => r.json()).then(d => { setAiSubMilestone(d); sessionStorage.setItem("ai_sub_milestone", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubMilestoneLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_retention");
    if (cached) { try { setAiSubRetention(JSON.parse(cached)); return; } catch {} }
    setAiSubRetentionLoading(true);
    apiRequest("POST", "/api/ai/sub-retention", {}).then(r => r.json()).then(d => { setAiSubRetention(d); sessionStorage.setItem("ai_sub_retention", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubRetentionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_bell_opt");
    if (cached) { try { setAiBellOpt(JSON.parse(cached)); return; } catch {} }
    setAiBellOptLoading(true);
    apiRequest("POST", "/api/ai/bell-optimizer", {}).then(r => r.json()).then(d => { setAiBellOpt(d); sessionStorage.setItem("ai_bell_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBellOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_first_vid");
    if (cached) { try { setAiFirstVid(JSON.parse(cached)); return; } catch {} }
    setAiFirstVidLoading(true);
    apiRequest("POST", "/api/ai/first-video", {}).then(r => r.json()).then(d => { setAiFirstVid(d); sessionStorage.setItem("ai_first_vid", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFirstVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_member_perks");
    if (cached) { try { setAiMemberPerks(JSON.parse(cached)); return; } catch {} }
    setAiMemberPerksLoading(true);
    apiRequest("POST", "/api/ai/membership-perks", {}).then(r => r.json()).then(d => { setAiMemberPerks(d); sessionStorage.setItem("ai_member_perks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMemberPerksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_countdown");
    if (cached) { try { setAiSubCountdown(JSON.parse(cached)); return; } catch {} }
    setAiSubCountdownLoading(true);
    apiRequest("POST", "/api/ai/sub-countdown", {}).then(r => r.json()).then(d => { setAiSubCountdown(d); sessionStorage.setItem("ai_sub_countdown", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubCountdownLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_unsub_analysis");
    if (cached) { try { setAiUnsubAnalysis(JSON.parse(cached)); return; } catch {} }
    setAiUnsubAnalysisLoading(true);
    apiRequest("POST", "/api/ai/unsub-analyzer", {}).then(r => r.json()).then(d => { setAiUnsubAnalysis(d); sessionStorage.setItem("ai_unsub_analysis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiUnsubAnalysisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_quality");
    if (cached) { try { setAiSubQuality(JSON.parse(cached)); return; } catch {} }
    setAiSubQualityLoading(true);
    apiRequest("POST", "/api/ai/sub-quality", {}).then(r => r.json()).then(d => { setAiSubQuality(d); sessionStorage.setItem("ai_sub_quality", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubQualityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_growth_play");
    if (cached) { try { setAiGrowthPlay(JSON.parse(cached)); return; } catch {} }
    setAiGrowthPlayLoading(true);
    apiRequest("POST", "/api/ai/growth-playbook", {}).then(r => r.json()).then(d => { setAiGrowthPlay(d); sessionStorage.setItem("ai_growth_play", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGrowthPlayLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_viral_engine");
    if (cached) { try { setAiViralEngine(JSON.parse(cached)); return; } catch {} }
    setAiViralEngineLoading(true);
    apiRequest("POST", "/api/ai/viral-engine", {}).then(r => r.json()).then(d => { setAiViralEngine(d); sessionStorage.setItem("ai_viral_engine", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiViralEngineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cross_promo");
    if (cached) { try { setAiCrossPromo(JSON.parse(cached)); return; } catch {} }
    setAiCrossPromoLoading(true);
    apiRequest("POST", "/api/ai/cross-promo", {}).then(r => r.json()).then(d => { setAiCrossPromo(d); sessionStorage.setItem("ai_cross_promo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrossPromoLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_accountability");
    if (cached) { try { setAiAccountability(JSON.parse(cached)); return; } catch {} }
    setAiAccountabilityLoading(true);
    apiRequest("POST", "/api/ai/accountability", {}).then(r => r.json()).then(d => { setAiAccountability(d); sessionStorage.setItem("ai_accountability", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAccountabilityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sabbatical");
    if (cached) { try { setAiSabbatical(JSON.parse(cached)); return; } catch {} }
    setAiSabbaticalLoading(true);
    apiRequest("POST", "/api/ai/sabbatical", {}).then(r => r.json()).then(d => { setAiSabbatical(d); sessionStorage.setItem("ai_sabbatical", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSabbaticalLoading(false));
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


      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowEventsAI(!showEventsAI)}
          data-testid="button-toggle-events-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Events & Marketing Suite</span>
          <Badge variant="outline" className="text-[10px]">24 tools</Badge>
          {showEventsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showEventsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiNewsletterLoading || aiNewsletter) && (
              <Card data-testid="card-ai-newsletter">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Newsletter</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNewsletterLoading ? <Skeleton className="h-24 w-full" /> : aiNewsletter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNewsletter.newsletters || aiNewsletter.content || aiNewsletter.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmailSeqLoading || aiEmailSeq) && (
              <Card data-testid="card-ai-email-seq">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Email Sequence</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmailSeqLoading ? <Skeleton className="h-24 w-full" /> : aiEmailSeq && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEmailSeq.sequences || aiEmailSeq.emails || aiEmailSeq.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLeadMagnetLoading || aiLeadMagnet) && (
              <Card data-testid="card-ai-lead-magnet">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Lead Magnet</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLeadMagnetLoading ? <Skeleton className="h-24 w-full" /> : aiLeadMagnet && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLeadMagnet.magnets || aiLeadMagnet.ideas || aiLeadMagnet.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmailListLoading || aiEmailList) && (
              <Card data-testid="card-ai-email-list">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Email List</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmailListLoading ? <Skeleton className="h-24 w-full" /> : aiEmailList && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEmailList.strategies || aiEmailList.growth || aiEmailList.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmailAnalyticsLoading || aiEmailAnalytics) && (
              <Card data-testid="card-ai-email-analytics">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Email Analytics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmailAnalyticsLoading ? <Skeleton className="h-24 w-full" /> : aiEmailAnalytics && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEmailAnalytics.metrics || aiEmailAnalytics.insights || aiEmailAnalytics.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWebinarLoading || aiWebinar) && (
              <Card data-testid="card-ai-webinar">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Webinar</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWebinarLoading ? <Skeleton className="h-24 w-full" /> : aiWebinar && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWebinar.webinars || aiWebinar.topics || aiWebinar.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVirtEventLoading || aiVirtEvent) && (
              <Card data-testid="card-ai-virt-event">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Virtual Event</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVirtEventLoading ? <Skeleton className="h-24 w-full" /> : aiVirtEvent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVirtEvent.events || aiVirtEvent.plans || aiVirtEvent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMeetupLoading || aiMeetup) && (
              <Card data-testid="card-ai-meetup">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Meetup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMeetupLoading ? <Skeleton className="h-24 w-full" /> : aiMeetup && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMeetup.meetups || aiMeetup.events || aiMeetup.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiConfPrepLoading || aiConfPrep) && (
              <Card data-testid="card-ai-conf-prep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Conference Prep</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiConfPrepLoading ? <Skeleton className="h-24 w-full" /> : aiConfPrep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiConfPrep.preparations || aiConfPrep.tips || aiConfPrep.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAwardSubLoading || aiAwardSub) && (
              <Card data-testid="card-ai-award-sub">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Award Submission</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAwardSubLoading ? <Skeleton className="h-24 w-full" /> : aiAwardSub && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAwardSub.submissions || aiAwardSub.awards || aiAwardSub.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPanelPrepLoading || aiPanelPrep) && (
              <Card data-testid="card-ai-panel-prep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Panel Prep</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPanelPrepLoading ? <Skeleton className="h-24 w-full" /> : aiPanelPrep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPanelPrep.panels || aiPanelPrep.topics || aiPanelPrep.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRetreatLoading || aiRetreat) && (
              <Card data-testid="card-ai-retreat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Creator Retreat</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRetreatLoading ? <Skeleton className="h-24 w-full" /> : aiRetreat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRetreat.retreats || aiRetreat.plans || aiRetreat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkshopLoading || aiWorkshop) && (
              <Card data-testid="card-ai-workshop">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Live Workshop</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkshopLoading ? <Skeleton className="h-24 w-full" /> : aiWorkshop && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkshop.workshops || aiWorkshop.plans || aiWorkshop.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCourseLaunchLoading || aiCourseLaunch) && (
              <Card data-testid="card-ai-course-launch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Course Launch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCourseLaunchLoading ? <Skeleton className="h-24 w-full" /> : aiCourseLaunch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCourseLaunch.courses || aiCourseLaunch.strategies || aiCourseLaunch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMasterclassLoading || aiMasterclass) && (
              <Card data-testid="card-ai-masterclass">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Masterclass</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMasterclassLoading ? <Skeleton className="h-24 w-full" /> : aiMasterclass && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMasterclass.classes || aiMasterclass.recommendations || aiMasterclass.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediaAppLoading || aiMediaApp) && (
              <Card data-testid="card-ai-media-app">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Media Appearance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediaAppLoading ? <Skeleton className="h-24 w-full" /> : aiMediaApp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMediaApp.appearances || aiMediaApp.strategies || aiMediaApp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGuestPostLoading || aiGuestPost) && (
              <Card data-testid="card-ai-guest-post">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Guest Post</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGuestPostLoading ? <Skeleton className="h-24 w-full" /> : aiGuestPost && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGuestPost.posts || aiGuestPost.opportunities || aiGuestPost.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInfluencerEventLoading || aiInfluencerEvent) && (
              <Card data-testid="card-ai-influencer-event">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Influencer Event</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInfluencerEventLoading ? <Skeleton className="h-24 w-full" /> : aiInfluencerEvent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInfluencerEvent.events || aiInfluencerEvent.strategies || aiInfluencerEvent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProductLaunchLoading || aiProductLaunch) && (
              <Card data-testid="card-ai-product-launch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Product Launch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProductLaunchLoading ? <Skeleton className="h-24 w-full" /> : aiProductLaunch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiProductLaunch.launches || aiProductLaunch.strategies || aiProductLaunch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCharityEventLoading || aiCharityEvent) && (
              <Card data-testid="card-ai-charity-event">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Charity Event</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCharityEventLoading ? <Skeleton className="h-24 w-full" /> : aiCharityEvent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCharityEvent.events || aiCharityEvent.causes || aiCharityEvent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAnniversaryLoading || aiAnniversary) && (
              <Card data-testid="card-ai-anniversary">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Anniversary</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAnniversaryLoading ? <Skeleton className="h-24 w-full" /> : aiAnniversary && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAnniversary.milestones || aiAnniversary.celebrations || aiAnniversary.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSeasonalCampaignLoading || aiSeasonalCampaign) && (
              <Card data-testid="card-ai-seasonal-campaign">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Seasonal Campaign</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSeasonalCampaignLoading ? <Skeleton className="h-24 w-full" /> : aiSeasonalCampaign && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSeasonalCampaign.campaigns || aiSeasonalCampaign.strategies || aiSeasonalCampaign.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHolidayContentLoading || aiHolidayContent) && (
              <Card data-testid="card-ai-holiday-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Holiday Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHolidayContentLoading ? <Skeleton className="h-24 w-full" /> : aiHolidayContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHolidayContent.content || aiHolidayContent.ideas || aiHolidayContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYearReviewLoading || aiYearReview) && (
              <Card data-testid="card-ai-year-review">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Year Review</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYearReviewLoading ? <Skeleton className="h-24 w-full" /> : aiYearReview && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYearReview.highlights || aiYearReview.achievements || aiYearReview.recommendations)}
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
          onClick={() => setShowDataSciAI(!showDataSciAI)}
          data-testid="button-toggle-datasci-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Data Science Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showDataSciAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showDataSciAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiDataCleanLoading || aiDataClean) && (
              <Card data-testid="card-ai-data-clean">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Cleaning</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDataCleanLoading ? <Skeleton className="h-24 w-full" /> : aiDataClean && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDataClean.datasets || aiDataClean.cleanups || aiDataClean.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDataPipeLoading || aiDataPipe) && (
              <Card data-testid="card-ai-data-pipe">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Pipeline</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDataPipeLoading ? <Skeleton className="h-24 w-full" /> : aiDataPipe && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDataPipe.pipelines || aiDataPipe.flows || aiDataPipe.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAnomalyLoading || aiAnomaly) && (
              <Card data-testid="card-ai-anomaly">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Anomaly Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAnomalyLoading ? <Skeleton className="h-24 w-full" /> : aiAnomaly && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAnomaly.anomalies || aiAnomaly.detections || aiAnomaly.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCohortLoading || aiCohort) && (
              <Card data-testid="card-ai-cohort">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cohort Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCohortLoading ? <Skeleton className="h-24 w-full" /> : aiCohort && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCohort.cohorts || aiCohort.segments || aiCohort.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAttributionLoading || aiAttribution) && (
              <Card data-testid="card-ai-attribution">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Attribution Model</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAttributionLoading ? <Skeleton className="h-24 w-full" /> : aiAttribution && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAttribution.models || aiAttribution.attributions || aiAttribution.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPredChurnLoading || aiPredChurn) && (
              <Card data-testid="card-ai-pred-churn">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Predictive Churn</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPredChurnLoading ? <Skeleton className="h-24 w-full" /> : aiPredChurn && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPredChurn.predictions || aiPredChurn.risks || aiPredChurn.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLTVLoading || aiLTV) && (
              <Card data-testid="card-ai-l-t-v">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI LTV Calculator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLTVLoading ? <Skeleton className="h-24 w-full" /> : aiLTV && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLTV.calculations || aiLTV.projections || aiLTV.recommendations)}
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
          onClick={() => setShowAdsAI(!showAdsAI)}
          data-testid="button-toggle-ads-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Ads & Conversion Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showAdsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAdsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiYTAdsLoading || aiYTAds) && (
              <Card data-testid="card-ai-yt-ads">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YouTube Ads</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTAdsLoading ? <Skeleton className="h-24 w-full" /> : aiYTAds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTAds.ads || aiYTAds.campaigns || aiYTAds.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFBAdsLoading || aiFBAds) && (
              <Card data-testid="card-ai-fb-ads">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Facebook Ads</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFBAdsLoading ? <Skeleton className="h-24 w-full" /> : aiFBAds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFBAds.ads || aiFBAds.campaigns || aiFBAds.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGoogleAdsLoading || aiGoogleAds) && (
              <Card data-testid="card-ai-google-ads">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Google Ads</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGoogleAdsLoading ? <Skeleton className="h-24 w-full" /> : aiGoogleAds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGoogleAds.ads || aiGoogleAds.campaigns || aiGoogleAds.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTTAdsLoading || aiTTAds) && (
              <Card data-testid="card-ai-tt-ads">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI TikTok Ads</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTTAdsLoading ? <Skeleton className="h-24 w-full" /> : aiTTAds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTTAds.ads || aiTTAds.campaigns || aiTTAds.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInflAdsLoading || aiInflAds) && (
              <Card data-testid="card-ai-infl-ads">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Influencer Ads</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInflAdsLoading ? <Skeleton className="h-24 w-full" /> : aiInflAds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInflAds.ads || aiInflAds.partnerships || aiInflAds.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRetargetLoading || aiRetarget) && (
              <Card data-testid="card-ai-retarget">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Retargeting</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRetargetLoading ? <Skeleton className="h-24 w-full" /> : aiRetarget && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRetarget.strategies || aiRetarget.audiences || aiRetarget.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAdCopyLoading || aiAdCopy) && (
              <Card data-testid="card-ai-ad-copy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Ad Copy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdCopyLoading ? <Skeleton className="h-24 w-full" /> : aiAdCopy && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAdCopy.copies || aiAdCopy.variations || aiAdCopy.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAdBudgetLoading || aiAdBudget) && (
              <Card data-testid="card-ai-ad-budget">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Ad Budget</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdBudgetLoading ? <Skeleton className="h-24 w-full" /> : aiAdBudget && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAdBudget.allocations || aiAdBudget.budgets || aiAdBudget.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLandingPgLoading || aiLandingPg) && (
              <Card data-testid="card-ai-landing-pg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Landing Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLandingPgLoading ? <Skeleton className="h-24 w-full" /> : aiLandingPg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLandingPg.pages || aiLandingPg.elements || aiLandingPg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiConvRateLoading || aiConvRate) && (
              <Card data-testid="card-ai-conv-rate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Conversion Rate</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiConvRateLoading ? <Skeleton className="h-24 w-full" /> : aiConvRate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiConvRate.optimizations || aiConvRate.tests || aiConvRate.recommendations)}
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
          onClick={() => setShowGamifyAI(!showGamifyAI)}
          data-testid="button-toggle-gamify-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Gamification Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showGamifyAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showGamifyAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiAchievementsLoading || aiAchievements) && (
              <Card data-testid="card-ai-achievements">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Achievements</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAchievementsLoading ? <Skeleton className="h-24 w-full" /> : aiAchievements && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAchievements.achievements || aiAchievements.badges || aiAchievements.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLeaderboardLoading || aiLeaderboard) && (
              <Card data-testid="card-ai-leaderboard">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Leaderboard</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLeaderboardLoading ? <Skeleton className="h-24 w-full" /> : aiLeaderboard && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLeaderboard.rankings || aiLeaderboard.leaderboard || aiLeaderboard.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPointsEconLoading || aiPointsEcon) && (
              <Card data-testid="card-ai-points-econ">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Points Economy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPointsEconLoading ? <Skeleton className="h-24 w-full" /> : aiPointsEcon && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPointsEcon.economy || aiPointsEcon.points || aiPointsEcon.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBadgeSysLoading || aiBadgeSys) && (
              <Card data-testid="card-ai-badge-sys">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Badge System</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBadgeSysLoading ? <Skeleton className="h-24 w-full" /> : aiBadgeSys && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBadgeSys.badges || aiBadgeSys.system || aiBadgeSys.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreakSysLoading || aiStreakSys) && (
              <Card data-testid="card-ai-streak-sys">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Streak System</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreakSysLoading ? <Skeleton className="h-24 w-full" /> : aiStreakSys && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreakSys.streaks || aiStreakSys.system || aiStreakSys.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProgressVizLoading || aiProgressViz) && (
              <Card data-testid="card-ai-progress-viz">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Progress Viz</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProgressVizLoading ? <Skeleton className="h-24 w-full" /> : aiProgressViz && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiProgressViz.visualizations || aiProgressViz.charts || aiProgressViz.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiChallengeSysLoading || aiChallengeSys) && (
              <Card data-testid="card-ai-challenge-sys">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Challenge System</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiChallengeSysLoading ? <Skeleton className="h-24 w-full" /> : aiChallengeSys && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiChallengeSys.challenges || aiChallengeSys.system || aiChallengeSys.recommendations)}
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
          onClick={() => setShowReportingAI(!showReportingAI)}
          data-testid="button-toggle-reporting-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Reporting Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showReportingAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showReportingAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiMonthReportLoading || aiMonthReport) && (
              <Card data-testid="card-ai-month-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Monthly Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMonthReportLoading ? <Skeleton className="h-24 w-full" /> : aiMonthReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMonthReport.highlights || aiMonthReport.metrics || aiMonthReport.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWeekDigestLoading || aiWeekDigest) && (
              <Card data-testid="card-ai-week-digest">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Weekly Digest</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWeekDigestLoading ? <Skeleton className="h-24 w-full" /> : aiWeekDigest && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWeekDigest.digest || aiWeekDigest.highlights || aiWeekDigest.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQtrReviewLoading || aiQtrReview) && (
              <Card data-testid="card-ai-qtr-review">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Quarterly Review</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQtrReviewLoading ? <Skeleton className="h-24 w-full" /> : aiQtrReview && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiQtrReview.review || aiQtrReview.metrics || aiQtrReview.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAnnualStratLoading || aiAnnualStrat) && (
              <Card data-testid="card-ai-annual-strat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Annual Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAnnualStratLoading ? <Skeleton className="h-24 w-full" /> : aiAnnualStrat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAnnualStrat.strategy || aiAnnualStrat.goals || aiAnnualStrat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompReportLoading || aiCompReport) && (
              <Card data-testid="card-ai-comp-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompReportLoading ? <Skeleton className="h-24 w-full" /> : aiCompReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCompReport.competitors || aiCompReport.analysis || aiCompReport.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAudReportLoading || aiAudReport) && (
              <Card data-testid="card-ai-aud-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audience Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAudReportLoading ? <Skeleton className="h-24 w-full" /> : aiAudReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAudReport.audience || aiAudReport.segments || aiAudReport.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentReportLoading || aiContentReport) && (
              <Card data-testid="card-ai-content-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentReportLoading ? <Skeleton className="h-24 w-full" /> : aiContentReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentReport.content || aiContentReport.performance || aiContentReport.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiROIReportLoading || aiROIReport) && (
              <Card data-testid="card-ai-roi-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI ROI Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiROIReportLoading ? <Skeleton className="h-24 w-full" /> : aiROIReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiROIReport.roi || aiROIReport.returns || aiROIReport.recommendations)}
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
          onClick={() => setShowSubGrowthAI(!showSubGrowthAI)}
          data-testid="button-toggle-sub-growth-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Subscriber Growth Suite</span>
          <Badge variant="outline" className="text-[10px]">11 tools</Badge>
          {showSubGrowthAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showSubGrowthAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiSubMilestoneLoading || aiSubMilestone) && (
              <Card data-testid="card-ai-sub-milestone">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sub Milestone</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubMilestoneLoading ? <Skeleton className="h-24 w-full" /> : aiSubMilestone && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubMilestone.milestones || aiSubMilestone.goals || aiSubMilestone.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubRetentionLoading || aiSubRetention) && (
              <Card data-testid="card-ai-sub-retention">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sub Retention</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubRetentionLoading ? <Skeleton className="h-24 w-full" /> : aiSubRetention && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubRetention.strategies || aiSubRetention.retention || aiSubRetention.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBellOptLoading || aiBellOpt) && (
              <Card data-testid="card-ai-bell-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Bell Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBellOptLoading ? <Skeleton className="h-24 w-full" /> : aiBellOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBellOpt.tips || aiBellOpt.optimization || aiBellOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFirstVidLoading || aiFirstVid) && (
              <Card data-testid="card-ai-first-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI First Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFirstVidLoading ? <Skeleton className="h-24 w-full" /> : aiFirstVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFirstVid.tips || aiFirstVid.checklist || aiFirstVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberPerksLoading || aiMemberPerks) && (
              <Card data-testid="card-ai-member-perks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Membership Perks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberPerksLoading ? <Skeleton className="h-24 w-full" /> : aiMemberPerks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMemberPerks.perks || aiMemberPerks.tiers || aiMemberPerks.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubCountdownLoading || aiSubCountdown) && (
              <Card data-testid="card-ai-sub-countdown">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sub Countdown</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubCountdownLoading ? <Skeleton className="h-24 w-full" /> : aiSubCountdown && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubCountdown.countdown || aiSubCountdown.milestones || aiSubCountdown.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiUnsubAnalysisLoading || aiUnsubAnalysis) && (
              <Card data-testid="card-ai-unsub-analysis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Unsub Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiUnsubAnalysisLoading ? <Skeleton className="h-24 w-full" /> : aiUnsubAnalysis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiUnsubAnalysis.reasons || aiUnsubAnalysis.analysis || aiUnsubAnalysis.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubQualityLoading || aiSubQuality) && (
              <Card data-testid="card-ai-sub-quality">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sub Quality</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubQualityLoading ? <Skeleton className="h-24 w-full" /> : aiSubQuality && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubQuality.quality || aiSubQuality.metrics || aiSubQuality.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGrowthPlayLoading || aiGrowthPlay) && (
              <Card data-testid="card-ai-growth-play">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Growth Playbook</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGrowthPlayLoading ? <Skeleton className="h-24 w-full" /> : aiGrowthPlay && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGrowthPlay.playbook || aiGrowthPlay.strategies || aiGrowthPlay.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiViralEngineLoading || aiViralEngine) && (
              <Card data-testid="card-ai-viral-engine">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Viral Engine</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiViralEngineLoading ? <Skeleton className="h-24 w-full" /> : aiViralEngine && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiViralEngine.hooks || aiViralEngine.strategies || aiViralEngine.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrossPromoLoading || aiCrossPromo) && (
              <Card data-testid="card-ai-cross-promo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cross Promo</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrossPromoLoading ? <Skeleton className="h-24 w-full" /> : aiCrossPromo && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrossPromo.promos || aiCrossPromo.strategies || aiCrossPromo.recommendations)}
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

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowAccountabilityAI(!showAccountabilityAI)}
          data-testid="button-toggle-accountability-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Accountability Suite</span>
          <Badge variant="outline" className="text-[10px]">2 tools</Badge>
          {showAccountabilityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAccountabilityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiAccountabilityLoading || aiAccountability) && (
              <Card data-testid="card-ai-accountability">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Accountability</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAccountabilityLoading ? <Skeleton className="h-24 w-full" /> : aiAccountability && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAccountability.strategies || aiAccountability.tips || aiAccountability.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSabbaticalLoading || aiSabbatical) && (
              <Card data-testid="card-ai-sabbatical">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sabbatical</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSabbaticalLoading ? <Skeleton className="h-24 w-full" /> : aiSabbatical && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSabbatical.strategies || aiSabbatical.tips || aiSabbatical.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
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
