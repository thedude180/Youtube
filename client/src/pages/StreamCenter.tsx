import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { apiRequest } from "@/lib/queryClient";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";
import { useStreamState } from "@/hooks/use-stream-state";

const StreamUpgradesSection = lazy(() => import("./stream/StreamUpgradesSection"));
const LiveOpsIntelligenceTab = lazy(() => import("./stream/LiveOpsIntelligenceTab"));
const DistributionIntelligenceTab = lazy(() => import("./stream/DistributionIntelligenceTab"));
const LiveCommandCenter = lazy(() => import("./stream/LiveCommandCenter"));
const StreamIdleView = lazy(() => import("./stream/StreamIdleView"));
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Radio, Plus, Trash2, Zap, Sparkles, Loader2, Image, Play, Square, CheckCircle2, XCircle, Clock, ArrowRight, Wifi, WifiOff, Check, ChevronDown, ChevronUp, Activity, Brain, Signal, Shield, Film, AlertTriangle } from "lucide-react";
import { PLATFORM_INFO, type Platform, PLATFORMS } from "@shared/schema";
import type { StreamDestination, Stream, Channel } from "@shared/schema";
import { PlatformIcon, PlatformBadge } from "@/components/PlatformIcon";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { EmptyState } from "@/components/EmptyState";
import { LiveChatPanel } from "@/components/LiveChatPanel";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { safeArray } from '@/lib/safe-data';
import { useTranslation } from "react-i18next";

interface AIToolResponse { [key: string]: any; }
type AIResponse = AIToolResponse | null;

interface YTLiveStatus { isLive?: boolean; viewerCount?: number; videoId?: string; startedAt?: string; connected?: boolean; broadcasts?: any[]; channelName?: string; }
interface StreamAgentStatus { isLive?: boolean; videoId?: string; status?: string; action?: string; lastAction?: string; metadata?: Record<string, any>; enabled?: boolean; platform?: string; streamTitle?: string; viewerCount?: number; chatMessagesHandled?: number; chatSentiment?: string; idleEngagement?: { active?: boolean; category?: string; engagementCount?: number; maxPerStream?: number; lastActivityAgo?: number; recentMessageRate?: number; }; actionsLog?: any[]; postStreamPhase?: string; }
interface MultistreamStatus { relaying: boolean; startedAt?: string; destinations?: Array<{ platform: string; status: string; viewers?: number }>; error?: string; }
interface RelayDestData { destinations: Array<{ platform: string; url: string; label?: string; status?: string }>; }
interface UneditedVod { id: number; title: string; youtubeId?: string; streamedAt?: string; duration?: number; thumbnailUrl?: string; }

export default function StreamCenter() {
  const { t } = useTranslation();
  usePageTitle(t("streaming.title"));
  const { toast } = useToast();
  const qc = useQueryClient();
  const { mode: streamMode } = useStreamState();
  const isActiveMode = streamMode === "prep" || streamMode === "live";
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [showAddDest, setShowAddDest] = useState(false);
  const [platformConnecting, setPlatformConnecting] = useState<string | null>(null);
  const [keyDialogPlatform, setKeyDialogPlatform] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [newDest, setNewDest] = useState({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" });
  const [aiStreamRecs, setAiStreamRecs] = useState<AIResponse>(null);
  const [aiStreamRecsLoading, setAiStreamRecsLoading] = useState(true);
  const [aiChatBot, setAiChatBot] = useState<AIResponse>(null);
  const [aiChatBotLoading, setAiChatBotLoading] = useState(true);
  const [aiChecklist, setAiChecklist] = useState<AIResponse>(null);
  const [aiChecklistLoading, setAiChecklistLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [aiRaid, setAiRaid] = useState<AIResponse>(null);
  const [aiRaidLoading, setAiRaidLoading] = useState(true);
  const [aiPostReport, setAiPostReport] = useState<AIResponse>(null);
  const [aiPostReportLoading, setAiPostReportLoading] = useState(false);
  const [showStreamAI, setShowStreamAI] = useState(false);
  const [aiStreamTitles, setAiStreamTitles] = useState<AIResponse>(null);
  const [aiStreamTitlesLoading, setAiStreamTitlesLoading] = useState(false);
  const [aiStreamSchedule, setAiStreamSchedule] = useState<AIResponse>(null);
  const [aiStreamScheduleLoading, setAiStreamScheduleLoading] = useState(false);
  const [aiStreamOverlays, setAiStreamOverlays] = useState<AIResponse>(null);
  const [aiStreamOverlaysLoading, setAiStreamOverlaysLoading] = useState(false);
  const [aiStreamAlerts, setAiStreamAlerts] = useState<AIResponse>(null);
  const [aiStreamAlertsLoading, setAiStreamAlertsLoading] = useState(false);
  const [aiStreamMod, setAiStreamMod] = useState<AIResponse>(null);
  const [aiStreamModLoading, setAiStreamModLoading] = useState(false);
  const [aiStreamInteract, setAiStreamInteract] = useState<AIResponse>(null);
  const [aiStreamInteractLoading, setAiStreamInteractLoading] = useState(false);
  const [aiStreamRev, setAiStreamRev] = useState<AIResponse>(null);
  const [aiStreamRevLoading, setAiStreamRevLoading] = useState(false);
  const [aiStreamClips, setAiStreamClips] = useState<AIResponse>(null);
  const [aiStreamClipsLoading, setAiStreamClipsLoading] = useState(false);
  const [aiStreamCats, setAiStreamCats] = useState<AIResponse>(null);
  const [aiStreamCatsLoading, setAiStreamCatsLoading] = useState(false);
  const [aiStreamPanels, setAiStreamPanels] = useState<AIResponse>(null);
  const [aiStreamPanelsLoading, setAiStreamPanelsLoading] = useState(false);
  const [aiStreamEmotes, setAiStreamEmotes] = useState<AIResponse>(null);
  const [aiStreamEmotesLoading, setAiStreamEmotesLoading] = useState(false);
  const [aiStreamSubGoals, setAiStreamSubGoals] = useState<AIResponse>(null);
  const [aiStreamSubGoalsLoading, setAiStreamSubGoalsLoading] = useState(false);
  const [aiStreamNetwork, setAiStreamNetwork] = useState<AIResponse>(null);
  const [aiStreamNetworkLoading, setAiStreamNetworkLoading] = useState(false);
  const [aiStreamAnalyticsExp, setAiStreamAnalyticsExp] = useState<AIResponse>(null);
  const [aiStreamAnalyticsExpLoading, setAiStreamAnalyticsExpLoading] = useState(false);
  const [aiMultiStream, setAiMultiStream] = useState<AIResponse>(null);
  const [aiMultiStreamLoading, setAiMultiStreamLoading] = useState(false);
  const [aiStreamBackup, setAiStreamBackup] = useState<AIResponse>(null);
  const [aiStreamBackupLoading, setAiStreamBackupLoading] = useState(false);
  const [aiStreamCommunity, setAiStreamCommunity] = useState<AIResponse>(null);
  const [aiStreamCommunityLoading, setAiStreamCommunityLoading] = useState(false);
  const [aiStreamBranding, setAiStreamBranding] = useState<AIResponse>(null);
  const [aiStreamBrandingLoading, setAiStreamBrandingLoading] = useState(false);
  const [aiStreamCalendar, setAiStreamCalendar] = useState<AIResponse>(null);
  const [aiStreamCalendarLoading, setAiStreamCalendarLoading] = useState(false);
  const [aiStreamGrowth, setAiStreamGrowth] = useState<AIResponse>(null);
  const [aiStreamGrowthLoading, setAiStreamGrowthLoading] = useState(false);

  const [showYouTubeAI, setShowYouTubeAI] = useState(false);
  const [aiYTStudio, setAiYTStudio] = useState<AIResponse>(null);
  const [aiYTStudioLoading, setAiYTStudioLoading] = useState(false);
  const [aiYTShortsAlgo, setAiYTShortsAlgo] = useState<AIResponse>(null);
  const [aiYTShortsAlgoLoading, setAiYTShortsAlgoLoading] = useState(false);
  const [aiYTComments, setAiYTComments] = useState<AIResponse>(null);
  const [aiYTCommentsLoading, setAiYTCommentsLoading] = useState(false);
  const [aiYTPlaylists, setAiYTPlaylists] = useState<AIResponse>(null);
  const [aiYTPlaylistsLoading, setAiYTPlaylistsLoading] = useState(false);
  const [aiYTPremiere, setAiYTPremiere] = useState<AIResponse>(null);
  const [aiYTPremiereLoading, setAiYTPremiereLoading] = useState(false);
  const [aiYTMembership, setAiYTMembership] = useState<AIResponse>(null);
  const [aiYTMembershipLoading, setAiYTMembershipLoading] = useState(false);
  const [aiYTSuperThanks, setAiYTSuperThanks] = useState<AIResponse>(null);
  const [aiYTSuperThanksLoading, setAiYTSuperThanksLoading] = useState(false);
  const [aiYTHandle, setAiYTHandle] = useState<AIResponse>(null);
  const [aiYTHandleLoading, setAiYTHandleLoading] = useState(false);
  const [aiYTChannelPg, setAiYTChannelPg] = useState<AIResponse>(null);
  const [aiYTChannelPgLoading, setAiYTChannelPgLoading] = useState(false);
  const [aiYTHashtags, setAiYTHashtags] = useState<AIResponse>(null);
  const [aiYTHashtagsLoading, setAiYTHashtagsLoading] = useState(false);

  const [showTwitchKickAI, setShowTwitchKickAI] = useState(false);
  const [aiTwEmotes, setAiTwEmotes] = useState<AIResponse>(null);
  const [aiTwEmotesLoading, setAiTwEmotesLoading] = useState(false);
  const [aiTwBits, setAiTwBits] = useState<AIResponse>(null);
  const [aiTwBitsLoading, setAiTwBitsLoading] = useState(false);
  const [aiTwRaids, setAiTwRaids] = useState<AIResponse>(null);
  const [aiTwRaidsLoading, setAiTwRaidsLoading] = useState(false);
  const [aiTwPoints, setAiTwPoints] = useState<AIResponse>(null);
  const [aiTwPointsLoading, setAiTwPointsLoading] = useState(false);
  const [aiTwPredictions, setAiTwPredictions] = useState<AIResponse>(null);
  const [aiTwPredictionsLoading, setAiTwPredictionsLoading] = useState(false);
  const [aiTwHypeTrain, setAiTwHypeTrain] = useState<AIResponse>(null);
  const [aiTwHypeTrainLoading, setAiTwHypeTrainLoading] = useState(false);
  const [aiTwClips, setAiTwClips] = useState<AIResponse>(null);
  const [aiTwClipsLoading, setAiTwClipsLoading] = useState(false);
  const [aiTwVODs, setAiTwVODs] = useState<AIResponse>(null);
  const [aiTwVODsLoading, setAiTwVODsLoading] = useState(false);
  const [aiTwPanels, setAiTwPanels] = useState<AIResponse>(null);
  const [aiTwPanelsLoading, setAiTwPanelsLoading] = useState(false);
  const [aiKickStream, setAiKickStream] = useState<AIResponse>(null);
  const [aiKickStreamLoading, setAiKickStreamLoading] = useState(false);
  const [aiKickMoney, setAiKickMoney] = useState<AIResponse>(null);
  const [aiKickMoneyLoading, setAiKickMoneyLoading] = useState(false);
  const [aiKickComm, setAiKickComm] = useState<AIResponse>(null);
  const [aiKickCommLoading, setAiKickCommLoading] = useState(false);
  const [aiKickDiff, setAiKickDiff] = useState<AIResponse>(null);
  const [aiKickDiffLoading, setAiKickDiffLoading] = useState(false);
  const [aiKickDisc, setAiKickDisc] = useState<AIResponse>(null);
  const [aiKickDiscLoading, setAiKickDiscLoading] = useState(false);
  const [aiStreamRouter, setAiStreamRouter] = useState<AIResponse>(null);
  const [aiStreamRouterLoading, setAiStreamRouterLoading] = useState(false);

  const [showStreamToolsAI, setShowStreamToolsAI] = useState(false);
  const [aiStreamDeck, setAiStreamDeck] = useState<AIResponse>(null);
  const [aiStreamDeckLoading, setAiStreamDeckLoading] = useState(false);
  const [aiOBSOpt, setAiOBSOpt] = useState<AIResponse>(null);
  const [aiOBSOptLoading, setAiOBSOptLoading] = useState(false);
  const [aiStreamLabs, setAiStreamLabs] = useState<AIResponse>(null);
  const [aiStreamLabsLoading, setAiStreamLabsLoading] = useState(false);
  const [aiStreamElem, setAiStreamElem] = useState<AIResponse>(null);
  const [aiStreamElemLoading, setAiStreamElemLoading] = useState(false);

  const [showLiveAdvancedAI, setShowLiveAdvancedAI] = useState(false);
  const [aiOverlayDesigner, setAiOverlayDesigner] = useState<AIResponse>(null);
  const [aiOverlayDesignerLoading, setAiOverlayDesignerLoading] = useState(false);
  const [aiRaidOptimizer, setAiRaidOptimizer] = useState<AIResponse>(null);
  const [aiRaidOptimizerLoading, setAiRaidOptimizerLoading] = useState(false);
  const [aiHighlightClipper, setAiHighlightClipper] = useState<AIResponse>(null);
  const [aiHighlightClipperLoading, setAiHighlightClipperLoading] = useState(false);
  const [aiDonationGoal, setAiDonationGoal] = useState<AIResponse>(null);
  const [aiDonationGoalLoading, setAiDonationGoalLoading] = useState(false);
  const [aiChatUnifier, setAiChatUnifier] = useState<AIResponse>(null);
  const [aiChatUnifierLoading, setAiChatUnifierLoading] = useState(false);

  useEffect(() => {
    if (!isActiveMode) { setAiStreamRecsLoading(false); return; }
    const cached = sessionStorage.getItem("aiStreamRecs");
    if (cached) {
      try {
        const e = JSON.parse(cached);
        if (e.ts && Date.now() - e.ts < 1800000) {
          setAiStreamRecs(e.data);
          setAiStreamRecsLoading(false);
          return;
        } else { sessionStorage.removeItem("aiStreamRecs"); }
      } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/stream-recommendations");
        const data = await res.json();
        setAiStreamRecs(data);
        sessionStorage.setItem("aiStreamRecs", JSON.stringify({ data, ts: Date.now() }));
      } catch {
        setAiStreamRecs(null);
        
      } finally {
        setAiStreamRecsLoading(false);
      }
    })();
  }, [isActiveMode]);

  useEffect(() => {
    if (!isActiveMode) { setAiChatBotLoading(false); return; }
    const cached = sessionStorage.getItem("aiChatBotConfig");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiChatBot(e.data); setAiChatBotLoading(false); return; } else { sessionStorage.removeItem("aiChatBotConfig"); } } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/chatbot-config", {});
        const data = await res.json();
        setAiChatBot(data);
        sessionStorage.setItem("aiChatBotConfig", JSON.stringify({ data, ts: Date.now() }));
      } catch { setAiChatBot(null);  } finally { setAiChatBotLoading(false); }
    })();
  }, [isActiveMode]);

  useEffect(() => {
    if (!isActiveMode) { setAiChecklistLoading(false); return; }
    const cached = sessionStorage.getItem("aiStreamChecklist");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiChecklist(e.data); setAiChecklistLoading(false); return; } else { sessionStorage.removeItem("aiStreamChecklist"); } } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/stream-checklist", {});
        const data = await res.json();
        setAiChecklist(data);
        sessionStorage.setItem("aiStreamChecklist", JSON.stringify({ data, ts: Date.now() }));
      } catch { setAiChecklist(null);  } finally { setAiChecklistLoading(false); }
    })();
  }, [isActiveMode]);

  useEffect(() => {
    if (!isActiveMode) { setAiRaidLoading(false); return; }
    const cached = sessionStorage.getItem("aiRaidStrategy");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRaid(e.data); setAiRaidLoading(false); return; } else { sessionStorage.removeItem("aiRaidStrategy"); } } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/raid-strategy", {});
        const data = await res.json();
        setAiRaid(data);
        sessionStorage.setItem("aiRaidStrategy", JSON.stringify({ data, ts: Date.now() }));
      } catch { setAiRaid(null);  } finally { setAiRaidLoading(false); }
    })();
  }, [isActiveMode]);

  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_titles");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamTitles(e.data); return; } else { sessionStorage.removeItem("ai_stream_titles"); } } catch {} }
    setAiStreamTitlesLoading(true);
    apiRequest("POST", "/api/ai/stream-titles", {}).then(r => r.json()).then(d => { setAiStreamTitles(d); sessionStorage.setItem("ai_stream_titles", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamTitlesLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_schedule");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamSchedule(e.data); return; } else { sessionStorage.removeItem("ai_stream_schedule"); } } catch {} }
    setAiStreamScheduleLoading(true);
    apiRequest("POST", "/api/ai/stream-schedule", {}).then(r => r.json()).then(d => { setAiStreamSchedule(d); sessionStorage.setItem("ai_stream_schedule", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamScheduleLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_overlays");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamOverlays(e.data); return; } else { sessionStorage.removeItem("ai_stream_overlays"); } } catch {} }
    setAiStreamOverlaysLoading(true);
    apiRequest("POST", "/api/ai/stream-overlays", {}).then(r => r.json()).then(d => { setAiStreamOverlays(d); sessionStorage.setItem("ai_stream_overlays", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamOverlaysLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_alerts");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamAlerts(e.data); return; } else { sessionStorage.removeItem("ai_stream_alerts"); } } catch {} }
    setAiStreamAlertsLoading(true);
    apiRequest("POST", "/api/ai/stream-alerts", {}).then(r => r.json()).then(d => { setAiStreamAlerts(d); sessionStorage.setItem("ai_stream_alerts", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamAlertsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_mod");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamMod(e.data); return; } else { sessionStorage.removeItem("ai_stream_mod"); } } catch {} }
    setAiStreamModLoading(true);
    apiRequest("POST", "/api/ai/stream-moderation", {}).then(r => r.json()).then(d => { setAiStreamMod(d); sessionStorage.setItem("ai_stream_mod", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamModLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_interact");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamInteract(e.data); return; } else { sessionStorage.removeItem("ai_stream_interact"); } } catch {} }
    setAiStreamInteractLoading(true);
    apiRequest("POST", "/api/ai/stream-interactions", {}).then(r => r.json()).then(d => { setAiStreamInteract(d); sessionStorage.setItem("ai_stream_interact", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamInteractLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_rev");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamRev(e.data); return; } else { sessionStorage.removeItem("ai_stream_rev"); } } catch {} }
    setAiStreamRevLoading(true);
    apiRequest("POST", "/api/ai/stream-revenue", {}).then(r => r.json()).then(d => { setAiStreamRev(d); sessionStorage.setItem("ai_stream_rev", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamRevLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_clips");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamClips(e.data); return; } else { sessionStorage.removeItem("ai_stream_clips"); } } catch {} }
    setAiStreamClipsLoading(true);
    apiRequest("POST", "/api/ai/stream-clips", {}).then(r => r.json()).then(d => { setAiStreamClips(d); sessionStorage.setItem("ai_stream_clips", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamClipsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_cats");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamCats(e.data); return; } else { sessionStorage.removeItem("ai_stream_cats"); } } catch {} }
    setAiStreamCatsLoading(true);
    apiRequest("POST", "/api/ai/stream-categories", {}).then(r => r.json()).then(d => { setAiStreamCats(d); sessionStorage.setItem("ai_stream_cats", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamCatsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_panels");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamPanels(e.data); return; } else { sessionStorage.removeItem("ai_stream_panels"); } } catch {} }
    setAiStreamPanelsLoading(true);
    apiRequest("POST", "/api/ai/stream-panels", {}).then(r => r.json()).then(d => { setAiStreamPanels(d); sessionStorage.setItem("ai_stream_panels", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamPanelsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_emotes");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamEmotes(e.data); return; } else { sessionStorage.removeItem("ai_stream_emotes"); } } catch {} }
    setAiStreamEmotesLoading(true);
    apiRequest("POST", "/api/ai/stream-emotes", {}).then(r => r.json()).then(d => { setAiStreamEmotes(d); sessionStorage.setItem("ai_stream_emotes", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamEmotesLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_sub_goals");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamSubGoals(e.data); return; } else { sessionStorage.removeItem("ai_stream_sub_goals"); } } catch {} }
    setAiStreamSubGoalsLoading(true);
    apiRequest("POST", "/api/ai/stream-sub-goals", {}).then(r => r.json()).then(d => { setAiStreamSubGoals(d); sessionStorage.setItem("ai_stream_sub_goals", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamSubGoalsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_network");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamNetwork(e.data); return; } else { sessionStorage.removeItem("ai_stream_network"); } } catch {} }
    setAiStreamNetworkLoading(true);
    apiRequest("POST", "/api/ai/stream-networking", {}).then(r => r.json()).then(d => { setAiStreamNetwork(d); sessionStorage.setItem("ai_stream_network", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamNetworkLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_analytics_exp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamAnalyticsExp(e.data); return; } else { sessionStorage.removeItem("ai_stream_analytics_exp"); } } catch {} }
    setAiStreamAnalyticsExpLoading(true);
    apiRequest("POST", "/api/ai/stream-analytics-explainer", {}).then(r => r.json()).then(d => { setAiStreamAnalyticsExp(d); sessionStorage.setItem("ai_stream_analytics_exp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamAnalyticsExpLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_multi_stream");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMultiStream(e.data); return; } else { sessionStorage.removeItem("ai_multi_stream"); } } catch {} }
    setAiMultiStreamLoading(true);
    apiRequest("POST", "/api/ai/multi-stream", {}).then(r => r.json()).then(d => { setAiMultiStream(d); sessionStorage.setItem("ai_multi_stream", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMultiStreamLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_backup");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamBackup(e.data); return; } else { sessionStorage.removeItem("ai_stream_backup"); } } catch {} }
    setAiStreamBackupLoading(true);
    apiRequest("POST", "/api/ai/stream-backup", {}).then(r => r.json()).then(d => { setAiStreamBackup(d); sessionStorage.setItem("ai_stream_backup", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamBackupLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_community");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamCommunity(e.data); return; } else { sessionStorage.removeItem("ai_stream_community"); } } catch {} }
    setAiStreamCommunityLoading(true);
    apiRequest("POST", "/api/ai/stream-community", {}).then(r => r.json()).then(d => { setAiStreamCommunity(d); sessionStorage.setItem("ai_stream_community", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamCommunityLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_branding");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamBranding(e.data); return; } else { sessionStorage.removeItem("ai_stream_branding"); } } catch {} }
    setAiStreamBrandingLoading(true);
    apiRequest("POST", "/api/ai/stream-branding", {}).then(r => r.json()).then(d => { setAiStreamBranding(d); sessionStorage.setItem("ai_stream_branding", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamBrandingLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_calendar");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamCalendar(e.data); return; } else { sessionStorage.removeItem("ai_stream_calendar"); } } catch {} }
    setAiStreamCalendarLoading(true);
    apiRequest("POST", "/api/ai/stream-content-calendar", {}).then(r => r.json()).then(d => { setAiStreamCalendar(d); sessionStorage.setItem("ai_stream_calendar", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamCalendarLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_growth");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamGrowth(e.data); return; } else { sessionStorage.removeItem("ai_stream_growth"); } } catch {} }
    setAiStreamGrowthLoading(true);
    apiRequest("POST", "/api/ai/stream-growth", {}).then(r => r.json()).then(d => { setAiStreamGrowth(d); sessionStorage.setItem("ai_stream_growth", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamGrowthLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_studio");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTStudio(e.data); return; } else { sessionStorage.removeItem("ai_yt_studio"); } } catch {} }
    setAiYTStudioLoading(true);
    apiRequest("POST", "/api/ai/yt-studio", {}).then(r => r.json()).then(d => { setAiYTStudio(d); sessionStorage.setItem("ai_yt_studio", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTStudioLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_shorts_algo");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTShortsAlgo(e.data); return; } else { sessionStorage.removeItem("ai_yt_shorts_algo"); } } catch {} }
    setAiYTShortsAlgoLoading(true);
    apiRequest("POST", "/api/ai/yt-shorts-algo", {}).then(r => r.json()).then(d => { setAiYTShortsAlgo(d); sessionStorage.setItem("ai_yt_shorts_algo", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTShortsAlgoLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_comments");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTComments(e.data); return; } else { sessionStorage.removeItem("ai_yt_comments"); } } catch {} }
    setAiYTCommentsLoading(true);
    apiRequest("POST", "/api/ai/yt-comments", {}).then(r => r.json()).then(d => { setAiYTComments(d); sessionStorage.setItem("ai_yt_comments", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTCommentsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_playlists");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTPlaylists(e.data); return; } else { sessionStorage.removeItem("ai_yt_playlists"); } } catch {} }
    setAiYTPlaylistsLoading(true);
    apiRequest("POST", "/api/ai/yt-playlists", {}).then(r => r.json()).then(d => { setAiYTPlaylists(d); sessionStorage.setItem("ai_yt_playlists", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTPlaylistsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_premiere");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTPremiere(e.data); return; } else { sessionStorage.removeItem("ai_yt_premiere"); } } catch {} }
    setAiYTPremiereLoading(true);
    apiRequest("POST", "/api/ai/yt-premiere", {}).then(r => r.json()).then(d => { setAiYTPremiere(d); sessionStorage.setItem("ai_yt_premiere", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTPremiereLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_membership");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTMembership(e.data); return; } else { sessionStorage.removeItem("ai_yt_membership"); } } catch {} }
    setAiYTMembershipLoading(true);
    apiRequest("POST", "/api/ai/yt-membership", {}).then(r => r.json()).then(d => { setAiYTMembership(d); sessionStorage.setItem("ai_yt_membership", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTMembershipLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_super_thanks");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTSuperThanks(e.data); return; } else { sessionStorage.removeItem("ai_yt_super_thanks"); } } catch {} }
    setAiYTSuperThanksLoading(true);
    apiRequest("POST", "/api/ai/yt-super-thanks", {}).then(r => r.json()).then(d => { setAiYTSuperThanks(d); sessionStorage.setItem("ai_yt_super_thanks", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTSuperThanksLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_handle");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTHandle(e.data); return; } else { sessionStorage.removeItem("ai_yt_handle"); } } catch {} }
    setAiYTHandleLoading(true);
    apiRequest("POST", "/api/ai/yt-handle", {}).then(r => r.json()).then(d => { setAiYTHandle(d); sessionStorage.setItem("ai_yt_handle", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTHandleLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_channel_pg");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTChannelPg(e.data); return; } else { sessionStorage.removeItem("ai_yt_channel_pg"); } } catch {} }
    setAiYTChannelPgLoading(true);
    apiRequest("POST", "/api/ai/yt-channel-page", {}).then(r => r.json()).then(d => { setAiYTChannelPg(d); sessionStorage.setItem("ai_yt_channel_pg", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTChannelPgLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_yt_hashtags");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTHashtags(e.data); return; } else { sessionStorage.removeItem("ai_yt_hashtags"); } } catch {} }
    setAiYTHashtagsLoading(true);
    apiRequest("POST", "/api/ai/yt-hashtags", {}).then(r => r.json()).then(d => { setAiYTHashtags(d); sessionStorage.setItem("ai_yt_hashtags", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiYTHashtagsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_emotes");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwEmotes(e.data); return; } else { sessionStorage.removeItem("ai_tw_emotes"); } } catch {} }
    setAiTwEmotesLoading(true);
    apiRequest("POST", "/api/ai/twitch-emotes", {}).then(r => r.json()).then(d => { setAiTwEmotes(d); sessionStorage.setItem("ai_tw_emotes", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwEmotesLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_bits");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwBits(e.data); return; } else { sessionStorage.removeItem("ai_tw_bits"); } } catch {} }
    setAiTwBitsLoading(true);
    apiRequest("POST", "/api/ai/twitch-bits", {}).then(r => r.json()).then(d => { setAiTwBits(d); sessionStorage.setItem("ai_tw_bits", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwBitsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_raids");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwRaids(e.data); return; } else { sessionStorage.removeItem("ai_tw_raids"); } } catch {} }
    setAiTwRaidsLoading(true);
    apiRequest("POST", "/api/ai/twitch-raids", {}).then(r => r.json()).then(d => { setAiTwRaids(d); sessionStorage.setItem("ai_tw_raids", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwRaidsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_points");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwPoints(e.data); return; } else { sessionStorage.removeItem("ai_tw_points"); } } catch {} }
    setAiTwPointsLoading(true);
    apiRequest("POST", "/api/ai/twitch-points", {}).then(r => r.json()).then(d => { setAiTwPoints(d); sessionStorage.setItem("ai_tw_points", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwPointsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_predictions");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwPredictions(e.data); return; } else { sessionStorage.removeItem("ai_tw_predictions"); } } catch {} }
    setAiTwPredictionsLoading(true);
    apiRequest("POST", "/api/ai/twitch-predictions", {}).then(r => r.json()).then(d => { setAiTwPredictions(d); sessionStorage.setItem("ai_tw_predictions", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwPredictionsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_hype_train");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwHypeTrain(e.data); return; } else { sessionStorage.removeItem("ai_tw_hype_train"); } } catch {} }
    setAiTwHypeTrainLoading(true);
    apiRequest("POST", "/api/ai/twitch-hype-train", {}).then(r => r.json()).then(d => { setAiTwHypeTrain(d); sessionStorage.setItem("ai_tw_hype_train", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwHypeTrainLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_clips");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwClips(e.data); return; } else { sessionStorage.removeItem("ai_tw_clips"); } } catch {} }
    setAiTwClipsLoading(true);
    apiRequest("POST", "/api/ai/twitch-clips", {}).then(r => r.json()).then(d => { setAiTwClips(d); sessionStorage.setItem("ai_tw_clips", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwClipsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_vods");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwVODs(e.data); return; } else { sessionStorage.removeItem("ai_tw_vods"); } } catch {} }
    setAiTwVODsLoading(true);
    apiRequest("POST", "/api/ai/twitch-vods", {}).then(r => r.json()).then(d => { setAiTwVODs(d); sessionStorage.setItem("ai_tw_vods", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwVODsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_tw_panels");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwPanels(e.data); return; } else { sessionStorage.removeItem("ai_tw_panels"); } } catch {} }
    setAiTwPanelsLoading(true);
    apiRequest("POST", "/api/ai/twitch-panels", {}).then(r => r.json()).then(d => { setAiTwPanels(d); sessionStorage.setItem("ai_tw_panels", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTwPanelsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_kick_stream");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiKickStream(e.data); return; } else { sessionStorage.removeItem("ai_kick_stream"); } } catch {} }
    setAiKickStreamLoading(true);
    apiRequest("POST", "/api/ai/kick-stream", {}).then(r => r.json()).then(d => { setAiKickStream(d); sessionStorage.setItem("ai_kick_stream", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiKickStreamLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_kick_money");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiKickMoney(e.data); return; } else { sessionStorage.removeItem("ai_kick_money"); } } catch {} }
    setAiKickMoneyLoading(true);
    apiRequest("POST", "/api/ai/kick-monetization", {}).then(r => r.json()).then(d => { setAiKickMoney(d); sessionStorage.setItem("ai_kick_money", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiKickMoneyLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_kick_comm");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiKickComm(e.data); return; } else { sessionStorage.removeItem("ai_kick_comm"); } } catch {} }
    setAiKickCommLoading(true);
    apiRequest("POST", "/api/ai/kick-community", {}).then(r => r.json()).then(d => { setAiKickComm(d); sessionStorage.setItem("ai_kick_comm", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiKickCommLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_kick_diff");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiKickDiff(e.data); return; } else { sessionStorage.removeItem("ai_kick_diff"); } } catch {} }
    setAiKickDiffLoading(true);
    apiRequest("POST", "/api/ai/kick-differentiator", {}).then(r => r.json()).then(d => { setAiKickDiff(d); sessionStorage.setItem("ai_kick_diff", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiKickDiffLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_kick_disc");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiKickDisc(e.data); return; } else { sessionStorage.removeItem("ai_kick_disc"); } } catch {} }
    setAiKickDiscLoading(true);
    apiRequest("POST", "/api/ai/kick-discovery", {}).then(r => r.json()).then(d => { setAiKickDisc(d); sessionStorage.setItem("ai_kick_disc", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiKickDiscLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_router");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamRouter(e.data); return; } else { sessionStorage.removeItem("ai_stream_router"); } } catch {} }
    setAiStreamRouterLoading(true);
    apiRequest("POST", "/api/ai/stream-router", {}).then(r => r.json()).then(d => { setAiStreamRouter(d); sessionStorage.setItem("ai_stream_router", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamRouterLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_deck");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamDeck(e.data); return; } else { sessionStorage.removeItem("ai_stream_deck"); } } catch {} }
    setAiStreamDeckLoading(true);
    apiRequest("POST", "/api/ai/stream-deck", {}).then(r => r.json()).then(d => { setAiStreamDeck(d); sessionStorage.setItem("ai_stream_deck", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamDeckLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_obs_opt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiOBSOpt(e.data); return; } else { sessionStorage.removeItem("ai_obs_opt"); } } catch {} }
    setAiOBSOptLoading(true);
    apiRequest("POST", "/api/ai/obs-optimizer", {}).then(r => r.json()).then(d => { setAiOBSOpt(d); sessionStorage.setItem("ai_obs_opt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiOBSOptLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_labs");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamLabs(e.data); return; } else { sessionStorage.removeItem("ai_stream_labs"); } } catch {} }
    setAiStreamLabsLoading(true);
    apiRequest("POST", "/api/ai/streamlabs", {}).then(r => r.json()).then(d => { setAiStreamLabs(d); sessionStorage.setItem("ai_stream_labs", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamLabsLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_stream_elem");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStreamElem(e.data); return; } else { sessionStorage.removeItem("ai_stream_elem"); } } catch {} }
    setAiStreamElemLoading(true);
    apiRequest("POST", "/api/ai/stream-elements", {}).then(r => r.json()).then(d => { setAiStreamElem(d); sessionStorage.setItem("ai_stream_elem", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiStreamElemLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_overlay_designer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiOverlayDesigner(e.data); return; } else { sessionStorage.removeItem("ai_overlay_designer"); } } catch {} }
    setAiOverlayDesignerLoading(true);
    apiRequest("POST", "/api/ai/stream-overlay-designer", {}).then(r => r.json()).then(d => { setAiOverlayDesigner(d); sessionStorage.setItem("ai_overlay_designer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiOverlayDesignerLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_raid_optimizer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRaidOptimizer(e.data); return; } else { sessionStorage.removeItem("ai_raid_optimizer"); } } catch {} }
    setAiRaidOptimizerLoading(true);
    apiRequest("POST", "/api/ai/raid-target-optimizer", {}).then(r => r.json()).then(d => { setAiRaidOptimizer(d); sessionStorage.setItem("ai_raid_optimizer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRaidOptimizerLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_highlight_clipper");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiHighlightClipper(e.data); return; } else { sessionStorage.removeItem("ai_highlight_clipper"); } } catch {} }
    setAiHighlightClipperLoading(true);
    apiRequest("POST", "/api/ai/stream-highlight-clipper", {}).then(r => r.json()).then(d => { setAiHighlightClipper(d); sessionStorage.setItem("ai_highlight_clipper", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiHighlightClipperLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_donation_goal");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDonationGoal(e.data); return; } else { sessionStorage.removeItem("ai_donation_goal"); } } catch {} }
    setAiDonationGoalLoading(true);
    apiRequest("POST", "/api/ai/donation-goal-strategist", {}).then(r => r.json()).then(d => { setAiDonationGoal(d); sessionStorage.setItem("ai_donation_goal", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDonationGoalLoading(false));
  }, [aiToolsOpen, isActiveMode]);
  useEffect(() => {
    if (!aiToolsOpen || !isActiveMode) return;
    const cached = sessionStorage.getItem("ai_chat_unifier");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiChatUnifier(e.data); return; } else { sessionStorage.removeItem("ai_chat_unifier"); } } catch {} }
    setAiChatUnifierLoading(true);
    apiRequest("POST", "/api/ai/multi-stream-chat-unifier", {}).then(r => r.json()).then(d => { setAiChatUnifier(d); sessionStorage.setItem("ai_chat_unifier", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiChatUnifierLoading(false));
  }, [aiToolsOpen, isActiveMode]);

  const { data: destinations = [], error: destError } = useQuery<StreamDestination[]>({ queryKey: ["/api/stream-destinations"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const { data: streamList = [], isLoading: streamsLoading, error: streamsError } = useQuery<Stream[]>({ queryKey: ["/api/streams"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const { data: connectedChannels = [], error: channelsError } = useQuery<Channel[]>({ queryKey: ["/api/channels"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const ytLivePoll = useAdaptiveInterval(120_000);
  const { data: ytLiveStatus } = useQuery<YTLiveStatus>({
    queryKey: ["/api/youtube/live-status"],
    refetchInterval: ytLivePoll,
  });

  const { data: streamAgent, refetch: refetchAgent } = useQuery<StreamAgentStatus>({
    queryKey: ["/api/stream-agent/status"],
    refetchInterval: 60_000,
  });

  const { data: multistreamStatus, refetch: refetchMultistream } = useQuery<MultistreamStatus>({
    queryKey: ["/api/multistream/status"],
    refetchInterval: 60_000,
    enabled: isActiveMode,
  });

  const { data: relayDestData } = useQuery<RelayDestData>({
    queryKey: ["/api/multistream/destinations"],
    refetchInterval: 3 * 60_000,
    enabled: isActiveMode,
  });
  const relayDests = relayDestData?.destinations ?? [];

  const { data: uneditedVods = [], refetch: refetchUnedited } = useQuery<UneditedVod[]>({
    queryKey: ["/api/stream/unedited-vods"],
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    enabled: isActiveMode,
  });

  const markUploadedMutation = useMutation({
    mutationFn: async ({ id, source }: { id: number; source: string }) => {
      const res = await apiRequest("PATCH", `/api/stream/unedited-vods/${id}/mark-uploaded?source=${source}`, {});
      return res.json();
    },
    onSuccess: () => { refetchUnedited(); toast({ title: "Marked as uploaded" }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const startPipelineMutation = useMutation({
    mutationFn: async ({ id, source }: { id: number; source: string }) => {
      const res = await apiRequest("POST", `/api/stream/unedited-vods/${id}/start-pipeline?source=${source}`, {});
      return res.json();
    },
    onSuccess: () => { refetchUnedited(); toast({ title: "Edit pipeline started", description: "Kenji and Jamie are on it — editing + repurposing this VOD" }); },
    onError: () => toast({ title: "Failed to start pipeline", variant: "destructive" }),
  });

  const startRelayMutation = useMutation({
    mutationFn: async (videoId: string) => { const res = await apiRequest("POST", "/api/multistream/start", { videoId }); return res.json(); },
    onSuccess: () => { refetchMultistream(); toast({ title: "Multi-stream relay started", description: "FFmpeg is relaying your stream to all configured platforms" }); },
    onError: () => toast({ title: "Relay failed", description: "Check that your stream is live and public on YouTube", variant: "destructive" }),
  });

  const stopRelayMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/multistream/stop", {}); return res.json(); },
    onSuccess: () => { refetchMultistream(); toast({ title: "Relay stopped" }); },
  });

  const startAgentMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/stream-agent/start", {}); return res.json(); },
    onSuccess: () => { refetchAgent(); },
  });

  const stopAgentMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/stream-agent/stop", {}); return res.json(); },
    onSuccess: () => { refetchAgent(); },
  });

  const detectLive = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/youtube/detect-live", {}); return res.json(); },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      qc.invalidateQueries({ queryKey: ["/api/youtube/live-status"] });
      if (data.detected && data.activeStream) {
        toast({ title: "YouTube LIVE Active", description: `"${data.activeStream.title}" — server auto-detection managing all automations` });
      } else if (!data.detected && !data.activeStream) {
        toast({ title: "No live stream detected", description: "Server checks every 2 minutes automatically" });
      }
    },
  });

  const liveStream = streamList.find(s => s.status === 'live');
  const plannedStreams = streamList.filter(s => s.status === 'planned');
  const pastStreams = streamList.filter(s => s.status === 'ended' || s.status === 'processed');

  const createDest = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/stream-destinations", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); setShowAddDest(false); setNewDest({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" }); toast({ title: "Destination added" }); },
  });

  const deleteDest = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/stream-destinations/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); toast({ title: "Removed" }); },
  });

  const toggleDest = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => { const res = await apiRequest("PUT", `/api/stream-destinations/${id}`, { enabled }); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); },
  });

  const goLive = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/go-live`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "You're LIVE!", description: "Content Pipeline running — AI is optimizing your stream in real-time" }); },
  });

  const endStream = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/end`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "Stream ended", description: "REPLAY pipeline started — AI is creating VOD promotion content for all 6 platforms" }); },
  });

  const optimizeSeo = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/optimize`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "SEO optimized" }); },
  });

  const postProcess = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/post-process`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "Post-processed" }); },
  });

  const generateThumbnail = useMutation({
    mutationFn: async (data: { streamId: number; title: string; description?: string }) => { const res = await apiRequest("POST", "/api/thumbnails/generate", data); return res.json(); },
    onSuccess: () => { toast({ title: "Thumbnail generated" }); },
  });

  const toggleCheckItem = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const generatePostReport = async (stream: Stream) => {
    setAiPostReportLoading(true);
    try {
      const duration = stream.startedAt && stream.endedAt
        ? `${Math.round((new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000)} minutes`
        : "unknown";
      const res = await apiRequest("POST", "/api/ai/post-stream-report", { streamTitle: stream.title, duration });
      const data = await res.json();
      setAiPostReport(data);
    } catch {
      setAiPostReport(null);
      toast({ title: "Failed to generate report", variant: "destructive" });
    } finally {
      setAiPostReportLoading(false);
    }
  };

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  if (destError) return <div className="p-3 lg:p-4 max-w-5xl mx-auto"><QueryErrorReset error={destError} queryKey={["/api/stream-destinations"]} label="Failed to load stream destinations" /></div>;
  if (streamsError) return <div className="p-3 lg:p-4 max-w-5xl mx-auto"><QueryErrorReset error={streamsError} queryKey={["/api/streams"]} label="Failed to load streams" /></div>;
  if (channelsError) return <div className="p-3 lg:p-4 max-w-5xl mx-auto"><QueryErrorReset error={channelsError} queryKey={["/api/channels"]} label="Failed to load channels" /></div>;

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto page-enter">
      {/* ─── Stream Agent ─── */}
      <div className="card-empire rounded-2xl overflow-hidden" data-testid="stream-agent-card">
        {streamAgent?.enabled ? (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-4 w-4">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${streamAgent?.isLive ? 'bg-red-400' : 'bg-emerald-400'}`} />
                  <span className={`relative inline-flex rounded-full h-4 w-4 ${streamAgent?.isLive ? 'bg-red-400' : 'bg-emerald-400'}`} />
                </span>
                <div>
                  <p className="text-base font-bold text-foreground" data-testid="text-agent-status">
                    {streamAgent?.isLive ? `LIVE on ${(streamAgent?.platform || 'stream')?.toUpperCase()}` : 'Stream Agent Ready'}
                  </p>
                  {streamAgent?.isLive && streamAgent?.streamTitle && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs" data-testid="text-stream-title">{streamAgent.streamTitle}</p>
                  )}
                  {!streamAgent?.isLive && (
                    <p className="text-xs text-muted-foreground">Watching for your stream to start</p>
                  )}
                </div>
              </div>
              <button
                className="text-xs px-3 py-1.5 rounded-lg border border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                onClick={() => stopAgentMutation.mutate()}
                disabled={stopAgentMutation.isPending}
                data-testid="button-stop-agent">
                Pause Agent
              </button>
            </div>

            {streamAgent?.isLive && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-muted/20 border border-border/20 p-3 text-center">
                  <p className="text-lg font-bold text-foreground" data-testid="text-viewer-count">{streamAgent?.viewerCount ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Viewers</p>
                </div>
                <div className="rounded-xl bg-muted/20 border border-border/20 p-3 text-center">
                  <p className="text-lg font-bold text-primary" data-testid="text-chat-handled">{streamAgent?.chatMessagesHandled ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Chat handled</p>
                </div>
                <div className="rounded-xl bg-muted/20 border border-border/20 p-3 text-center">
                  <p className={`text-lg font-bold ${streamAgent?.chatSentiment === 'positive' ? 'text-emerald-400' : streamAgent?.chatSentiment === 'negative' ? 'text-red-400' : 'text-foreground'}`}
                    data-testid="text-chat-sentiment">
                    {streamAgent?.chatSentiment === 'positive' ? 'Hype' : streamAgent?.chatSentiment === 'negative' ? 'Rough' : 'Chill'}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vibe</p>
                </div>
              </div>
            )}

            {streamAgent?.isLive && streamAgent?.idleEngagement?.active && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mb-4" data-testid="section-idle-engagement">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Idle Engagement</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted/30 rounded-full px-2 py-0.5" data-testid="text-idle-category">
                    {streamAgent.idleEngagement.category?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground" data-testid="text-idle-engagement-count">
                      {streamAgent.idleEngagement.engagementCount}/{streamAgent.idleEngagement.maxPerStream}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Engagements</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground" data-testid="text-idle-last-activity">
                      {streamAgent.idleEngagement.lastActivityAgo != null
                        ? streamAgent.idleEngagement.lastActivityAgo < 60
                          ? `${streamAgent.idleEngagement.lastActivityAgo}s`
                          : `${Math.round(streamAgent.idleEngagement.lastActivityAgo / 60)}m`
                        : '--'}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Last activity</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground" data-testid="text-idle-chat-rate">
                      {streamAgent.idleEngagement.recentMessageRate ?? 0}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Chat/2min</p>
                  </div>
                </div>
              </div>
            )}

            {((streamAgent?.actionsLog as any[]) || []).length > 0 && (
              <div className="rounded-xl bg-muted/10 border border-border/20 p-3" data-testid="section-action-log">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">Agent Activity</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {((streamAgent?.actionsLog as any[]) || []).map((entry: any, i: number) => (
                    <div key={i} className="flex items-start gap-2" data-testid={`action-log-${i}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-medium">{entry.action}</p>
                        {entry.detail && <p className="text-[10px] text-muted-foreground truncate">{entry.detail}</p>}
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 shrink-0">
                        {entry.time ? new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {streamAgent?.postStreamPhase && (
              <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 p-3" data-testid="section-post-stream">
                <p className="text-sm text-primary font-medium">
                  {streamAgent.postStreamPhase === 'complete'
                    ? 'Stream processed — clips scheduled across all platforms'
                    : 'Processing your stream...'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <span className="text-2xl">🎮</span>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Stream Agent</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-5">
              Activate once — then just play your game. The agent responds to chat in your voice, boosts viewer engagement, moderates automatically, and clips every highlight the moment your stream ends.
            </p>
            <button
              className="w-full max-w-xs py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-60"
              style={{ boxShadow: '0 0 24px hsl(265 80% 60% / 0.35)' }}
              onClick={() => startAgentMutation.mutate()}
              disabled={startAgentMutation.isPending}
              data-testid="button-start-agent">
              {startAgentMutation.isPending ? 'Starting...' : 'Activate Stream Agent'}
            </button>
          </div>
        )}
      </div>

      {streamMode === "idle" && (
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
          <StreamIdleView
            streamAgent={streamAgent}
            connectedChannels={connectedChannels}
            destinations={destinations}
            lastStreamTitle={pastStreams[0]?.title}
            lastStreamDate={pastStreams[0]?.endedAt ? new Date(pastStreams[0].endedAt).toLocaleDateString() : undefined}
          />
        </Suspense>
      )}

      <UpgradeTabGate requiredTier="youtube" featureName="Stream Center" description="Go live across multiple platforms simultaneously with AI-powered stream optimization, chat management, and post-stream analytics.">
      {/* Stream Center Hero - shown in prep and live modes */}
      {isActiveMode && <div className="card-empire rounded-2xl p-5 relative overflow-hidden empire-glow">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Radio className="w-7 h-7 text-primary" style={{ filter: "drop-shadow(0 0 8px hsl(265 80% 60% / 0.6))" }} />
              </div>
              {(ytLiveStatus?.broadcasts?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-background animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 data-testid="text-page-title" className="text-xl font-display font-extrabold holographic-text">Stream Center</h1>
                {streamMode === "live" ? (
                  <Badge className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold animate-pulse" data-testid="badge-stream-mode">● LIVE</Badge>
                ) : streamMode === "prep" ? (
                  <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold" data-testid="badge-stream-mode">● PREP</Badge>
                ) : (
                  <Badge className="bg-muted/50 text-muted-foreground border-border/50 text-[10px]" data-testid="badge-stream-mode">● STANDBY</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">AI managing {destinations?.length || 0} destinations · Multi-platform autopilot active</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Brain, label: "AI Advisor", value: "Active", color: "hsl(265 80% 60%)" },
              { icon: Shield, label: "Copyright", value: "Clear", color: "hsl(142 70% 50%)" },
              { icon: Signal, label: "Destinations", value: `${destinations?.length || 0}`, color: "hsl(200 80% 55%)" },
              { icon: Activity, label: "Stream Health", value: ytLiveStatus?.connected ? "Online" : "Idle", color: ytLiveStatus?.connected ? "hsl(142 70% 50%)" : "hsl(45 90% 55%)" }
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex flex-col items-center px-3 py-2 rounded-xl bg-muted/20 border border-border/30 min-w-[64px]">
                <Icon className="w-3.5 h-3.5 mb-1" style={{ color }} />
                <span className="text-[11px] font-bold metric-display" style={{ color }}>{value}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* ─── Unedited Streams ─── */}
      {streamMode === "live" && uneditedVods.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" data-testid="section-unedited-vods">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide font-mono">
              Streams Waiting for Upload
            </h3>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold" data-testid="badge-unedited-count">
              {uneditedVods.length}
            </span>
          </div>
          <div className="space-y-2">
            {uneditedVods.map((vod: any) => {
              const isMarkingUploaded = markUploadedMutation.isPending && (markUploadedMutation.variables as any)?.id === vod.id;
              const isStartingPipeline = startPipelineMutation.isPending && (startPipelineMutation.variables as any)?.id === vod.id;
              const durationMin = vod.durationMs ? Math.round(vod.durationMs / 60000) : null;
              const streamedDate = vod.streamedAt ? new Date(vod.streamedAt) : null;
              const relativeDate = streamedDate ? (() => {
                const diffDays = Math.floor((Date.now() - streamedDate.getTime()) / 86400000);
                if (diffDays === 0) return "Today";
                if (diffDays === 1) return "Yesterday";
                return `${diffDays} days ago`;
              })() : null;

              return (
                <div key={`${vod.source}-${vod.id}`} className="flex items-center gap-3 rounded-xl bg-background/40 border border-border/20 p-3" data-testid={`row-unedited-vod-${vod.id}`}>
                  <div className="w-14 h-10 rounded-lg bg-muted/30 border border-border/20 flex items-center justify-center shrink-0 overflow-hidden">
                    {vod.thumbnailUrl
                      ? <img src={vod.thumbnailUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      : <Film className="w-5 h-5 text-muted-foreground/40" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate" data-testid={`text-unedited-title-${vod.id}`}>{vod.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {relativeDate && <span className="text-[10px] text-muted-foreground">{relativeDate}</span>}
                      {durationMin && <span className="text-[10px] text-muted-foreground">· {durationMin}min</span>}
                      {vod.youtubeId && (
                        <a href={vod.youtubeUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-primary/70 hover:text-primary underline" data-testid={`link-yt-vod-${vod.id}`}>
                          View on YouTube
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startPipelineMutation.mutate({ id: vod.id, source: vod.source })}
                      disabled={isStartingPipeline || isMarkingUploaded}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                      data-testid={`button-start-pipeline-${vod.id}`}>
                      {isStartingPipeline ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Start Edit Pipeline
                    </button>
                    <button
                      onClick={() => markUploadedMutation.mutate({ id: vod.id, source: vod.source })}
                      disabled={isMarkingUploaded || isStartingPipeline}
                      className="text-[11px] px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                      data-testid={`button-mark-uploaded-${vod.id}`}>
                      {isMarkingUploaded ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Mark as Uploaded
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Multi-Stream Relay Engine (live mode only) ─── */}
      {streamMode === "live" && <div className="card-empire rounded-2xl p-5 relative overflow-hidden" data-testid="multistream-relay-card">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${multistreamStatus?.relaying ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${multistreamStatus?.relaying ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
              </span>
              <div>
                <h3 className="text-sm font-bold font-mono text-foreground uppercase tracking-wide">Multi-Stream Relay</h3>
                <p className="text-[11px] text-muted-foreground">FFmpeg fans your YouTube stream to Kick, Rumble, Twitch simultaneously</p>
              </div>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border" style={{
              background: multistreamStatus?.relaying ? 'hsl(265 80% 60% / 0.2)' : 'hsl(265 20% 30% / 0.3)',
              borderColor: multistreamStatus?.relaying ? 'hsl(265 80% 60% / 0.4)' : 'hsl(265 20% 50% / 0.3)',
              color: multistreamStatus?.relaying ? 'hsl(265 80% 70%)' : 'hsl(265 40% 60%)',
            }} data-testid="badge-relay-status">
              {multistreamStatus?.relaying ? 'RELAYING' : 'STANDBY'}
            </span>
          </div>

          {/* Destination grid — shows configured platforms always, live status when relaying */}
          {(() => {
            const activeDests: any[] = multistreamStatus?.relaying ? (multistreamStatus.destinations ?? []) : [];
            const displayDests = activeDests.length > 0 ? activeDests : relayDests;
            const isLiveState = multistreamStatus?.relaying;
            if (displayDests.length === 0) {
              return (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 mb-4 text-xs text-amber-400 font-mono" data-testid="text-relay-no-dests">
                  No relay destinations configured — add Kick, Rumble, or Twitch stream keys in the destinations panel below
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" data-testid="section-relay-destinations">
                {displayDests.map((dest: any, i: number) => {
                  const isActive = isLiveState && dest.active;
                  const hasError = isLiveState && dest.error;
                  const isConfigured = dest.configured !== false;
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/20 border border-border/20 px-3 py-2" data-testid={`dest-relay-${dest.platform}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : hasError ? 'bg-red-400' : isConfigured ? 'bg-primary/60' : 'bg-muted-foreground/30'}`} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono font-bold text-foreground truncate">{dest.label}</p>
                        {hasError && <p className="text-[9px] text-red-400 truncate">{dest.error}</p>}
                        {!hasError && isLiveState && <p className="text-[9px] text-emerald-400">{isActive ? 'Streaming' : 'Connecting...'}</p>}
                        {!isLiveState && <p className="text-[9px] text-muted-foreground">{isConfigured ? 'Ready' : 'Not configured'}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {multistreamStatus?.error && (
            <p className="text-[11px] text-red-400 font-mono mb-3 truncate" data-testid="text-relay-error">Error: {multistreamStatus.error}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {multistreamStatus?.relaying ? (
              <button
                className="px-4 py-2 text-xs font-mono rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                onClick={() => stopRelayMutation.mutate()}
                disabled={stopRelayMutation.isPending}
                data-testid="button-stop-relay">
                {stopRelayMutation.isPending ? 'Stopping...' : 'Stop Relay'}
              </button>
            ) : (
              <button
                className="px-4 py-2 text-xs font-mono rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                style={{ boxShadow: '0 0 10px hsl(265 80% 60% / 0.2)' }}
                onClick={() => {
                  const videoId = streamAgent?.videoId || ytLiveStatus?.videoId;
                  if (!videoId) {
                    toast({ title: "No live stream detected", description: "Start streaming on YouTube first — the relay auto-starts, or click once you're live", variant: "destructive" });
                    return;
                  }
                  startRelayMutation.mutate(videoId);
                }}
                disabled={startRelayMutation.isPending}
                data-testid="button-start-relay">
                {startRelayMutation.isPending ? 'Starting relay...' : streamAgent?.isLive ? 'Start Relay Now' : 'Start Relay'}
              </button>
            )}
            {multistreamStatus?.startedAt && (
              <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-relay-started-at">
                {multistreamStatus.relaying ? 'Since ' : 'Stopped at '}{new Date(multistreamStatus.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto" data-testid="text-relay-auto-note">
              {streamAgent?.videoId ? `Detected: ${streamAgent.videoId}` : 'Watching for live stream...'}
            </span>
          </div>
        </div>
      </div>}

      {/* ─── Streaming Platform Connection Hub (prep/live only) ─── */}
      {isActiveMode && <div className="card-empire rounded-2xl p-5 relative overflow-hidden" data-testid="platform-connection-hub">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-primary" style={{ filter: "drop-shadow(0 0 6px hsl(265 80% 60% / 0.6))" }} />
              <div>
                <h3 className="text-sm font-bold font-mono text-foreground uppercase tracking-wide">Streaming Channels</h3>
                <p className="text-[11px] text-muted-foreground">Connect all your platforms to enable simultaneous multistream relay</p>
              </div>
            </div>
            {(() => {
              const liveStreamPlatforms = ["youtube", "twitch", "kick", "rumble"] as const;
              const connectedCount = liveStreamPlatforms.filter(p => {
                if (p === "youtube") return connectedChannels.some((c: Channel) => c.platform === "youtube");
                return destinations.some((d: any) => d.platform === p && d.streamKey);
              }).length;
              return (
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary" data-testid="badge-hub-status">
                  {connectedCount}/{liveStreamPlatforms.length} CONNECTED
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="section-platform-hub-grid">
            {(["youtube", "twitch", "kick", "rumble"] as const).map(platform => {
              const info = PLATFORM_INFO[platform];
              const isYoutube = platform === "youtube";
              const isConnectedYT = isYoutube && connectedChannels.some((c: Channel) => c.platform === "youtube");
              const hasStreamKey = !isYoutube && destinations.some((d: any) => d.platform === platform && d.streamKey);
              const isConnected = isYoutube ? isConnectedYT : hasStreamKey;
              const isLoading = platformConnecting === platform;

              return (
                <div
                  key={platform}
                  className="relative rounded-xl border p-3 flex flex-col gap-2 transition-colors"
                  style={{
                    background: isConnected ? `${info.color}12` : "hsl(265 20% 10% / 0.4)",
                    borderColor: isConnected ? `${info.color}40` : "hsl(265 20% 30% / 0.4)",
                  }}
                  data-testid={`card-hub-${platform}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={platform} className="h-4 w-4" />
                      <span className="text-[11px] font-bold font-mono text-foreground">{info.label}</span>
                    </div>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                      style={{
                        background: isConnected ? "#22c55e22" : "#94a3b822",
                        color: isConnected ? "#22c55e" : "#94a3b8",
                      }}
                      data-testid={`badge-hub-status-${platform}`}
                    >
                      {isConnected ? "READY" : "SETUP"}
                    </span>
                  </div>

                  <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">
                    {isYoutube
                      ? isConnected ? "OAuth connected — stream detection active" : "Sign in with Google to enable stream detection & relay source"
                      : isConnected ? `Stream key saved — ready for relay` : info.setupSteps[0]}
                  </p>

                  {isYoutube ? (
                    <button
                      className="mt-auto text-[10px] font-mono px-2 py-1.5 rounded-lg border transition-colors w-full disabled:opacity-50"
                      style={isConnected
                        ? { background: "#22c55e15", borderColor: "#22c55e40", color: "#22c55e" }
                        : { background: `${info.color}15`, borderColor: `${info.color}40`, color: info.color }
                      }
                      disabled={isLoading || isConnected}
                      onClick={async () => {
                        setPlatformConnecting(platform);
                        try {
                          const res = await fetch("/api/youtube/auth", { credentials: "include", headers: { "Accept": "application/json" } });
                          if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
                          const { url } = await res.json();
                          window.location.href = url;
                        } catch (err: any) {
                          toast({ title: "Connect failed", description: err.message, variant: "destructive" });
                          setPlatformConnecting(null);
                        }
                      }}
                      data-testid={`button-hub-connect-${platform}`}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : isConnected ? <span className="flex items-center justify-center gap-1"><Check className="h-3 w-3" />Connected</span> : "Connect YouTube"}
                    </button>
                  ) : (
                    <button
                      className="mt-auto text-[10px] font-mono px-2 py-1.5 rounded-lg border transition-colors w-full"
                      style={isConnected
                        ? { background: "#22c55e15", borderColor: "#22c55e40", color: "#22c55e" }
                        : { background: `${info.color}15`, borderColor: `${info.color}40`, color: info.color }
                      }
                      onClick={() => { setKeyDialogPlatform(platform); setKeyInput(""); }}
                      data-testid={`button-hub-key-${platform}`}
                    >
                      {isConnected ? <span className="flex items-center justify-center gap-1"><Check className="h-3 w-3" />Update Key</span> : `Set Stream Key`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Stream Key Entry Dialog */}
          <Dialog open={keyDialogPlatform !== null} onOpenChange={(open) => { if (!open) setKeyDialogPlatform(null); }}>
            <DialogContent data-testid="dialog-stream-key">
              {keyDialogPlatform && (() => {
                const info = PLATFORM_INFO[keyDialogPlatform as Platform];
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <PlatformIcon platform={keyDialogPlatform as Platform} className="h-5 w-5" />
                        Connect {info.label}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="rounded-lg bg-muted/30 border border-border/30 p-3 space-y-1">
                        {info.setupSteps.map((step: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground flex gap-2">
                            <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                            {step}
                          </p>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Stream Key</label>
                        <Input
                          data-testid="input-hub-stream-key"
                          type="password"
                          placeholder={`Your ${info.label} stream key`}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground">Your stream key is stored securely and never exposed.</p>
                      </div>
                      <Button
                        data-testid="button-hub-save-key"
                        className="w-full"
                        disabled={!keyInput.trim()}
                        onClick={() => {
                          if (!keyDialogPlatform || !keyInput.trim()) return;
                          const platform = keyDialogPlatform;
                          const info = PLATFORM_INFO[platform as Platform];
                          const existing = destinations.find((d: any) => d.platform === platform);
                          const payload = {
                            platform,
                            label: info.label,
                            rtmpUrl: info.rtmpUrlTemplate,
                            streamKey: keyInput.trim(),
                            enabled: true,
                          };
                          if (existing) {
                            apiRequest("PUT", `/api/stream-destinations/${existing.id}`, payload)
                              .then(() => {
                                qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
                                qc.invalidateQueries({ queryKey: ["/api/multistream/destinations"] });
                                toast({ title: `${info.label} updated`, description: "Stream key saved — ready for relay" });
                                setKeyDialogPlatform(null);
                              })
                              .catch((err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }));
                          } else {
                            apiRequest("POST", "/api/stream-destinations", payload)
                              .then(() => {
                                qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
                                qc.invalidateQueries({ queryKey: ["/api/multistream/destinations"] });
                                toast({ title: `${info.label} connected`, description: "Stream key saved — ready for multistream relay" });
                                setKeyDialogPlatform(null);
                              })
                              .catch((err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }));
                          }
                        }}
                      >
                        Save & Connect
                      </Button>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </div>
      </div>}

      {isActiveMode && <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Dialog open={showAddDest} onOpenChange={setShowAddDest}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-destination" variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Destination</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Destination</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-sm font-medium">Platform</label>
                  <Select value={newDest.platform} onValueChange={(val) => setNewDest(prev => ({ ...prev, platform: val, rtmpUrl: PLATFORM_INFO[val as Platform]?.rtmpUrlTemplate || "" }))}>
                    <SelectTrigger data-testid="select-dest-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.filter(p => PLATFORM_INFO[p].rtmpUrlTemplate !== "").map(p => (
                        <SelectItem key={p} value={p}>{PLATFORM_INFO[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">Label</label><Input data-testid="input-dest-label" placeholder="e.g., Main YouTube" value={newDest.label} onChange={(e) => setNewDest(prev => ({ ...prev, label: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">RTMP URL</label><Input data-testid="input-dest-rtmp" placeholder="rtmp://..." value={newDest.rtmpUrl} onChange={(e) => setNewDest(prev => ({ ...prev, rtmpUrl: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Stream Key</label><Input data-testid="input-dest-key" type="password" placeholder="Your stream key" value={newDest.streamKey} onChange={(e) => setNewDest(prev => ({ ...prev, streamKey: e.target.value }))} /></div>
                <Button data-testid="button-save-destination" className="w-full" onClick={() => createDest.mutate(newDest)} disabled={!newDest.label || !newDest.rtmpUrl || createDest.isPending}>
                  {createDest.isPending ? "Saving..." : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {ytLiveStatus?.connected ? (
            <Badge variant={(ytLiveStatus?.broadcasts?.length ?? 0) > 0 ? "destructive" : "secondary"} data-testid="badge-yt-detection-status">
              <Radio className={`h-3 w-3 mr-1 ${(ytLiveStatus?.broadcasts?.length ?? 0) > 0 ? "animate-pulse" : ""}`} />
              {(ytLiveStatus?.broadcasts?.length ?? 0) > 0 ? "LIVE Detected" : "Monitoring YouTube"}
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="badge-yt-not-connected">
              <WifiOff className="h-3 w-3 mr-1" />
              YouTube Not Connected
            </Badge>
          )}
        </div>
      </div>}

      {isActiveMode && <CollapsibleToolbox title="AI Advisor & Reports" toolCount={5}>
      <Card data-testid="card-ai-stream-recs" className="card-empire border-0 relative overflow-hidden">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 relative">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-400" style={{ filter: "drop-shadow(0 0 6px hsl(45 90% 55% / 0.6))" }} />
            <CardTitle className="text-sm font-bold holographic-text">AI Stream Advisor</CardTitle>
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Auto-running
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <Activity className="w-3 h-3 text-primary" /> AI ANALYZING
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiStreamRecsLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-stream-recs">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : aiStreamRecs ? (
            <div className="space-y-5">
              {aiStreamRecs.optimalTimes?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-best-times-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Best Times to Stream</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiStreamRecs?.optimalTimes).map((t: any, i: number) => (
                      <div key={i} data-testid={`text-optimal-time-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span><span className="font-medium">{t.day}</span> at <span className="font-medium">{t.time}</span> — <span className="text-muted-foreground">{t.reason}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiStreamRecs.trendingTopics?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-trending-topics-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trending Topics</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {safeArray(aiStreamRecs?.trendingTopics).map((topic: any, i: number) => (
                      <div key={i} data-testid={`text-trending-topic-${i}`}>
                        <Badge variant="outline">{typeof topic === 'string' ? topic : topic.topic || topic.title}</Badge>
                        {topic.suggestedTitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-1">{topic.suggestedTitle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiStreamRecs.schedule && (
                <div className="space-y-2">
                  <h3 data-testid="text-schedule-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommended Schedule</h3>
                  <div className="text-sm space-y-1">
                    {aiStreamRecs.schedule.recommendedFrequency && (
                      <p data-testid="text-recommended-frequency">Frequency: <span className="font-medium">{aiStreamRecs.schedule.recommendedFrequency}</span></p>
                    )}
                    {aiStreamRecs.schedule.bestDays?.length > 0 && (
                      <div data-testid="text-best-days" className="flex items-center gap-1.5 flex-wrap">
                        <span>Best days:</span>
                        {safeArray<string>(aiStreamRecs?.schedule?.bestDays).map((day: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{day}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {aiStreamRecs.streamIdeas?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-stream-ideas-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stream Ideas</h3>
                  <div className="space-y-2">
                    {safeArray(aiStreamRecs?.streamIdeas).map((idea: any, i: number) => (
                      <div key={i} data-testid={`card-stream-idea-${i}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <p data-testid={`text-idea-title-${i}`} className="text-sm font-medium">{idea.title}</p>
                          {idea.description && <p data-testid={`text-idea-desc-${i}`} className="text-xs text-muted-foreground mt-0.5">{idea.description}</p>}
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {idea.category && <Badge variant="secondary" className="text-[10px]">{idea.category}</Badge>}
                            {(idea.platforms || []).map((p: string) => (
                              <Badge key={p} variant="outline" className="text-[10px]">{PLATFORM_INFO[p as Platform]?.label || p}</Badge>
                            ))}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          <Sparkles className="h-3 w-3 mr-1" />Suggested
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-ai-recs-empty">Unable to load AI recommendations.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-chatbot">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Chat Bot Builder</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiChatBotLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-chatbot">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiChatBot ? (
            <div className="space-y-5">
              {aiChatBot.commands?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-commands-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commands</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiChatBot?.commands).map((cmd: any, i: number) => (
                      <div key={i} data-testid={`text-chatbot-command-${i}`} className="rounded-md border p-2 text-sm space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-mono">{cmd.trigger}</Badge>
                          {cmd.category && <Badge variant="secondary" className="text-[10px]">{cmd.category}</Badge>}
                          {cmd.cooldown && <span className="text-xs text-muted-foreground">{cmd.cooldown}s cooldown</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{cmd.response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.autoMessages?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-auto-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto Messages</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiChatBot?.autoMessages).map((msg: any, i: number) => (
                      <div key={i} data-testid={`text-chatbot-auto-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{msg.message} <span className="text-xs text-muted-foreground">({msg.interval})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.moderationRules?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-moderation-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Moderation Rules</h3>
                  <div className="space-y-1">
                    {safeArray(aiChatBot?.moderationRules).map((rule: any, i: number) => (
                      <p key={i} data-testid={`text-chatbot-rule-${i}`} className="text-sm text-muted-foreground">{typeof rule === 'string' ? rule : rule.rule || rule.description || JSON.stringify(rule)}</p>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.loyaltySystem && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-loyalty-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loyalty System</h3>
                  <div className="text-sm space-y-1">
                    {aiChatBot.loyaltySystem.pointName && <p data-testid="text-loyalty-point-name">Point name: <span className="font-medium">{aiChatBot.loyaltySystem.pointName}</span></p>}
                    {aiChatBot.loyaltySystem.earnRate && <p data-testid="text-loyalty-earn-rate">Earn rate: <span className="font-medium">{aiChatBot.loyaltySystem.earnRate}</span></p>}
                    {aiChatBot.loyaltySystem.rewards?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {safeArray(aiChatBot?.loyaltySystem?.rewards).map((r: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{typeof r === 'string' ? r : r.name || r.reward || JSON.stringify(r)}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(aiChatBot.welcomeMessage || aiChatBot.raidMessage) && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-messages-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Welcome / Raid Messages</h3>
                  <div className="text-sm space-y-1">
                    {aiChatBot.welcomeMessage && <p data-testid="text-chatbot-welcome"><span className="font-medium">Welcome:</span> <span className="text-muted-foreground">{aiChatBot.welcomeMessage}</span></p>}
                    {aiChatBot.raidMessage && <p data-testid="text-chatbot-raid"><span className="font-medium">Raid:</span> <span className="text-muted-foreground">{aiChatBot.raidMessage}</span></p>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-chatbot-empty">Unable to load chatbot config.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-checklist">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Stream Checklist</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiChecklistLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-checklist">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiChecklist ? (
            <div className="space-y-5">
              {aiChecklist.preStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-pre-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pre-Stream</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiChecklist?.preStream).map((item: any, i: number) => {
                      const key = `pre-${i}`;
                      const label = typeof item === 'string' ? item : item.task || item.item || item.label || JSON.stringify(item);
                      return (
                        <button key={i} data-testid={`checkbox-pre-${i}`} className="flex items-center gap-2 text-sm w-full text-left" onClick={() => toggleCheckItem(key)}>
                          {checkedItems.has(key) ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                          <span className={checkedItems.has(key) ? "line-through text-muted-foreground" : ""}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {aiChecklist.duringStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-during-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">During Stream</h3>
                  <div className="space-y-1">
                    {safeArray(aiChecklist?.duringStream).map((item: any, i: number) => (
                      <div key={i} data-testid={`text-during-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{typeof item === 'string' ? item : item.reminder || item.task || item.item || JSON.stringify(item)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChecklist.postStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-post-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Post-Stream</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiChecklist?.postStream).map((item: any, i: number) => {
                      const key = `post-${i}`;
                      const label = typeof item === 'string' ? item : item.task || item.item || item.label || JSON.stringify(item);
                      return (
                        <button key={i} data-testid={`checkbox-post-${i}`} className="flex items-center gap-2 text-sm w-full text-left" onClick={() => toggleCheckItem(key)}>
                          {checkedItems.has(key) ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                          <span className={checkedItems.has(key) ? "line-through text-muted-foreground" : ""}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {aiChecklist.emergencyPlan && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-emergency-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emergency Plan</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiChecklist.emergencyPlan === 'string' ? (
                      <p data-testid="text-emergency-plan">{aiChecklist.emergencyPlan}</p>
                    ) : Array.isArray(aiChecklist.emergencyPlan) ? (
                      safeArray(aiChecklist?.emergencyPlan).map((item: any, i: number) => (
                        <p key={i} data-testid={`text-emergency-${i}`}>{typeof item === 'string' ? item : item.step || item.action || JSON.stringify(item)}</p>
                      ))
                    ) : (
                      <p data-testid="text-emergency-plan">{JSON.stringify(aiChecklist.emergencyPlan)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-checklist-empty">Unable to load checklist.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-raid">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Raid Strategy</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiRaidLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-raid">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiRaid ? (
            <div className="space-y-5">
              {aiRaid.raidTargets?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-targets-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raid Targets</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiRaid?.raidTargets).map((target: any, i: number) => (
                      <div key={i} data-testid={`card-raid-target-${i}`} className="rounded-md border p-2 text-sm space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{target.channel || target.name}</span>
                          {target.audienceOverlap && <Badge variant="secondary" className="text-[10px]">{target.audienceOverlap}</Badge>}
                        </div>
                        {target.reason && <p className="text-xs text-muted-foreground">{target.reason}</p>}
                        {target.bestTiming && <p className="text-xs text-muted-foreground">Best timing: {target.bestTiming}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiRaid.etiquetteTips?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-etiquette-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raid Etiquette</h3>
                  <div className="space-y-1">
                    {safeArray(aiRaid?.etiquetteTips).map((tip: any, i: number) => (
                      <p key={i} data-testid={`text-etiquette-${i}`} className="text-sm text-muted-foreground">{typeof tip === 'string' ? tip : tip.tip || JSON.stringify(tip)}</p>
                    ))}
                  </div>
                </div>
              )}
              {aiRaid.networkingStrategy && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-networking-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Networking Strategy</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiRaid.networkingStrategy === 'string' ? (
                      <p data-testid="text-networking-strategy">{aiRaid.networkingStrategy}</p>
                    ) : Array.isArray(aiRaid.networkingStrategy) ? (
                      safeArray(aiRaid?.networkingStrategy).map((s: any, i: number) => (
                        <p key={i} data-testid={`text-networking-${i}`}>{typeof s === 'string' ? s : s.strategy || JSON.stringify(s)}</p>
                      ))
                    ) : (
                      <p data-testid="text-networking-strategy">{JSON.stringify(aiRaid.networkingStrategy)}</p>
                    )}
                  </div>
                </div>
              )}
              {aiRaid.incomingRaidPlan && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-incoming-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Incoming Raid Plan</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiRaid.incomingRaidPlan === 'string' ? (
                      <p data-testid="text-incoming-raid">{aiRaid.incomingRaidPlan}</p>
                    ) : Array.isArray(aiRaid.incomingRaidPlan) ? (
                      safeArray(aiRaid?.incomingRaidPlan).map((item: any, i: number) => (
                        <p key={i} data-testid={`text-incoming-raid-${i}`}>{typeof item === 'string' ? item : item.step || item.action || JSON.stringify(item)}</p>
                      ))
                    ) : (
                      <p data-testid="text-incoming-raid">{JSON.stringify(aiRaid.incomingRaidPlan)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-raid-empty">Unable to load raid strategy.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-post-stream">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Post-Stream Report</CardTitle>
          </div>
          {pastStreams.length > 0 && !aiPostReport && (
            <Button data-testid="button-generate-report" size="sm" variant="outline" onClick={() => generatePostReport(pastStreams[0])} disabled={aiPostReportLoading}>
              {aiPostReportLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Generate Report
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {aiPostReportLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-post-report">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : aiPostReport ? (
            <div className="space-y-5">
              {aiPostReport.grade && (
                <div className="flex items-center gap-3" data-testid="text-report-grade">
                  <span className={`text-3xl font-bold ${aiPostReport.grade === 'A' || aiPostReport.grade === 'A+' ? 'text-emerald-500' : aiPostReport.grade === 'B' || aiPostReport.grade === 'B+' ? 'text-blue-500' : aiPostReport.grade === 'C' || aiPostReport.grade === 'C+' ? 'text-amber-500' : 'text-red-500'}`}>
                    {aiPostReport.grade}
                  </span>
                  <span className="text-sm text-muted-foreground">Stream Grade</span>
                </div>
              )}
              {aiPostReport.summary && (
                <div className="space-y-1">
                  <h3 data-testid="text-report-summary-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</h3>
                  <p data-testid="text-report-summary" className="text-sm">{aiPostReport.summary}</p>
                </div>
              )}
              {aiPostReport.highlights?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-highlights-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Highlights</h3>
                  <div className="space-y-1">
                    {safeArray(aiPostReport?.highlights).map((h: any, i: number) => (
                      <div key={i} data-testid={`text-highlight-${i}`} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        <span>{typeof h === 'string' ? h : h.highlight || h.description || JSON.stringify(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.improvements?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-improvements-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Improvements</h3>
                  <div className="space-y-1">
                    {safeArray(aiPostReport?.improvements).map((imp: any, i: number) => (
                      <div key={i} data-testid={`text-improvement-${i}`} className="flex items-start gap-2 text-sm">
                        <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{typeof imp === 'string' ? imp : imp.improvement || imp.description || JSON.stringify(imp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.recommendations?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-recs-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiPostReport?.recommendations).map((rec: any, i: number) => (
                      <div key={i} data-testid={`text-recommendation-${i}`} className="flex items-start gap-2 text-sm">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        <div>
                          <span>{typeof rec === 'string' ? rec : rec.recommendation || rec.description || rec.title || JSON.stringify(rec)}</span>
                          {rec.impact && <Badge variant="secondary" className="ml-1.5 text-[10px]">{rec.impact}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.clipSuggestions?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-clips-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip Suggestions</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiPostReport?.clipSuggestions).map((clip: any, i: number) => (
                      <div key={i} data-testid={`text-clip-${i}`} className="rounded-md border p-2 text-sm">
                        <p className="font-medium">{typeof clip === 'string' ? clip : clip.title || clip.description || JSON.stringify(clip)}</p>
                        {clip.timestamp && <p className="text-xs text-muted-foreground mt-0.5">{clip.timestamp}</p>}
                        {clip.reason && <p className="text-xs text-muted-foreground">{clip.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.socialRecaps?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-social-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Social Recaps</h3>
                  <div className="space-y-1.5">
                    {safeArray(aiPostReport?.socialRecaps).map((recap: any, i: number) => (
                      <div key={i} data-testid={`text-social-recap-${i}`} className="rounded-md border p-2 text-sm">
                        {recap.platform && <PlatformBadge platform={recap.platform} variant="outline" className="text-[10px] mb-1" />}
                        <p className="text-muted-foreground">{typeof recap === 'string' ? recap : recap.text || recap.content || recap.message || JSON.stringify(recap)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : pastStreams.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-post-report-empty">No past streams available for reporting.</p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-post-report-prompt">Click "Generate Report" to analyze your most recent stream: <span className="font-medium">{pastStreams[0]?.title}</span></p>
          )}
        </CardContent>
      </Card>
      </CollapsibleToolbox>}

      {streamMode === "live" && <CollapsibleToolbox title="Live Command Center" toolCount={9}>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <LiveCommandCenter />
        </Suspense>
      </CollapsibleToolbox>}

      {streamMode === "live" && <CollapsibleToolbox title="Live Ops Intelligence" toolCount={4}>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <LiveOpsIntelligenceTab />
        </Suspense>
      </CollapsibleToolbox>}

      {isActiveMode && <CollapsibleToolbox title="Distribution Intelligence" toolCount={9}>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <DistributionIntelligenceTab />
        </Suspense>
      </CollapsibleToolbox>}

      {isActiveMode && <CollapsibleToolbox title="Stream Upgrades" toolCount={5}>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <StreamUpgradesSection />
        </Suspense>
      </CollapsibleToolbox>}

      {isActiveMode && <CollapsibleToolbox title="AI Stream Tools" toolCount={100} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      <div className="space-y-3">

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowStreamAI(!showStreamAI)}
          data-testid="button-toggle-stream-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Stream Mastery Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showStreamAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showStreamAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiStreamTitlesLoading || aiStreamTitles) && (
              <Card data-testid="card-ai-stream-titles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Titles</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamTitlesLoading ? <Skeleton className="h-24 w-full" /> : aiStreamTitles && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamTitles.titles || aiStreamTitles.suggestions || aiStreamTitles.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamScheduleLoading || aiStreamSchedule) && (
              <Card data-testid="card-ai-stream-schedule">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Schedule</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamScheduleLoading ? <Skeleton className="h-24 w-full" /> : aiStreamSchedule && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamSchedule.schedule || aiStreamSchedule.slots || aiStreamSchedule.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamOverlaysLoading || aiStreamOverlays) && (
              <Card data-testid="card-ai-stream-overlays">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Overlays</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamOverlaysLoading ? <Skeleton className="h-24 w-full" /> : aiStreamOverlays && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamOverlays.overlays || aiStreamOverlays.designs || aiStreamOverlays.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamAlertsLoading || aiStreamAlerts) && (
              <Card data-testid="card-ai-stream-alerts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Alerts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamAlertsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamAlerts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamAlerts.alerts || aiStreamAlerts.designs || aiStreamAlerts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamModLoading || aiStreamMod) && (
              <Card data-testid="card-ai-stream-mod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Moderation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamModLoading ? <Skeleton className="h-24 w-full" /> : aiStreamMod && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamMod.rules || aiStreamMod.policies || aiStreamMod.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamInteractLoading || aiStreamInteract) && (
              <Card data-testid="card-ai-stream-interact">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Interactions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamInteractLoading ? <Skeleton className="h-24 w-full" /> : aiStreamInteract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamInteract.interactions || aiStreamInteract.activities || aiStreamInteract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamRevLoading || aiStreamRev) && (
              <Card data-testid="card-ai-stream-rev">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamRevLoading ? <Skeleton className="h-24 w-full" /> : aiStreamRev && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamRev.strategies || aiStreamRev.tips || aiStreamRev.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamClipsLoading || aiStreamClips) && (
              <Card data-testid="card-ai-stream-clips">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Clips</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamClipsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamClips && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamClips.clips || aiStreamClips.highlights || aiStreamClips.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCatsLoading || aiStreamCats) && (
              <Card data-testid="card-ai-stream-cats">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Categories</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCatsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCats && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCats.categories || aiStreamCats.suggestions || aiStreamCats.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamPanelsLoading || aiStreamPanels) && (
              <Card data-testid="card-ai-stream-panels">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Panels</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamPanelsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamPanels && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamPanels.panels || aiStreamPanels.designs || aiStreamPanels.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamEmotesLoading || aiStreamEmotes) && (
              <Card data-testid="card-ai-stream-emotes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Emotes</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamEmotesLoading ? <Skeleton className="h-24 w-full" /> : aiStreamEmotes && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamEmotes.emotes || aiStreamEmotes.concepts || aiStreamEmotes.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamSubGoalsLoading || aiStreamSubGoals) && (
              <Card data-testid="card-ai-stream-sub-goals">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sub Goals</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamSubGoalsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamSubGoals && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamSubGoals.goals || aiStreamSubGoals.milestones || aiStreamSubGoals.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamNetworkLoading || aiStreamNetwork) && (
              <Card data-testid="card-ai-stream-network">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Networking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamNetworkLoading ? <Skeleton className="h-24 w-full" /> : aiStreamNetwork && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamNetwork.connections || aiStreamNetwork.tips || aiStreamNetwork.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamAnalyticsExpLoading || aiStreamAnalyticsExp) && (
              <Card data-testid="card-ai-stream-analytics-exp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Analytics Explainer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamAnalyticsExpLoading ? <Skeleton className="h-24 w-full" /> : aiStreamAnalyticsExp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamAnalyticsExp.explanations || aiStreamAnalyticsExp.insights || aiStreamAnalyticsExp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiStreamLoading || aiMultiStream) && (
              <Card data-testid="card-ai-multi-stream">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Multi-Stream</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiStreamLoading ? <Skeleton className="h-24 w-full" /> : aiMultiStream && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiStream.setup || aiMultiStream.platforms || aiMultiStream.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamBackupLoading || aiStreamBackup) && (
              <Card data-testid="card-ai-stream-backup">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Backup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamBackupLoading ? <Skeleton className="h-24 w-full" /> : aiStreamBackup && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamBackup.plans || aiStreamBackup.steps || aiStreamBackup.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCommunityLoading || aiStreamCommunity) && (
              <Card data-testid="card-ai-stream-community">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Community Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCommunityLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCommunity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCommunity.strategies || aiStreamCommunity.tips || aiStreamCommunity.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamBrandingLoading || aiStreamBranding) && (
              <Card data-testid="card-ai-stream-branding">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Branding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamBrandingLoading ? <Skeleton className="h-24 w-full" /> : aiStreamBranding && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamBranding.kit || aiStreamBranding.elements || aiStreamBranding.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCalendarLoading || aiStreamCalendar) && (
              <Card data-testid="card-ai-stream-calendar">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Content Calendar</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCalendarLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCalendar && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCalendar.calendar || aiStreamCalendar.schedule || aiStreamCalendar.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamGrowthLoading || aiStreamGrowth) && (
              <Card data-testid="card-ai-stream-growth">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Growth</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiStreamGrowth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamGrowth.hacks || aiStreamGrowth.strategies || aiStreamGrowth.recommendations)}
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
          onClick={() => setShowYouTubeAI(!showYouTubeAI)}
          data-testid="button-toggle-youtube-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI YouTube Features Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showYouTubeAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showYouTubeAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiYTStudioLoading || aiYTStudio) && (
              <Card data-testid="card-ai-yt-studio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Studio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTStudioLoading ? <Skeleton className="h-24 w-full" /> : aiYTStudio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTStudio.tips || aiYTStudio.settings || aiYTStudio.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTShortsAlgoLoading || aiYTShortsAlgo) && (
              <Card data-testid="card-ai-yt-shorts-algo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Shorts Algo</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTShortsAlgoLoading ? <Skeleton className="h-24 w-full" /> : aiYTShortsAlgo && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTShortsAlgo.tips || aiYTShortsAlgo.algorithm || aiYTShortsAlgo.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTCommentsLoading || aiYTComments) && (
              <Card data-testid="card-ai-yt-comments">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Comments</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTCommentsLoading ? <Skeleton className="h-24 w-full" /> : aiYTComments && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTComments.replies || aiYTComments.strategies || aiYTComments.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTPlaylistsLoading || aiYTPlaylists) && (
              <Card data-testid="card-ai-yt-playlists">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Playlists</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTPlaylistsLoading ? <Skeleton className="h-24 w-full" /> : aiYTPlaylists && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTPlaylists.playlists || aiYTPlaylists.structure || aiYTPlaylists.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTPremiereLoading || aiYTPremiere) && (
              <Card data-testid="card-ai-yt-premiere">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Premiere</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTPremiereLoading ? <Skeleton className="h-24 w-full" /> : aiYTPremiere && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTPremiere.tips || aiYTPremiere.strategy || aiYTPremiere.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTMembershipLoading || aiYTMembership) && (
              <Card data-testid="card-ai-yt-membership">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Membership</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTMembershipLoading ? <Skeleton className="h-24 w-full" /> : aiYTMembership && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTMembership.tiers || aiYTMembership.perks || aiYTMembership.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTSuperThanksLoading || aiYTSuperThanks) && (
              <Card data-testid="card-ai-yt-super-thanks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Super Thanks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTSuperThanksLoading ? <Skeleton className="h-24 w-full" /> : aiYTSuperThanks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTSuperThanks.tips || aiYTSuperThanks.monetization || aiYTSuperThanks.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTHandleLoading || aiYTHandle) && (
              <Card data-testid="card-ai-yt-handle">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Handle</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTHandleLoading ? <Skeleton className="h-24 w-full" /> : aiYTHandle && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTHandle.suggestions || aiYTHandle.branding || aiYTHandle.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTChannelPgLoading || aiYTChannelPg) && (
              <Card data-testid="card-ai-yt-channel-pg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Channel Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTChannelPgLoading ? <Skeleton className="h-24 w-full" /> : aiYTChannelPg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTChannelPg.layout || aiYTChannelPg.optimization || aiYTChannelPg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiYTHashtagsLoading || aiYTHashtags) && (
              <Card data-testid="card-ai-yt-hashtags">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YT Hashtags</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTHashtagsLoading ? <Skeleton className="h-24 w-full" /> : aiYTHashtags && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTHashtags.hashtags || aiYTHashtags.trending || aiYTHashtags.recommendations)}
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
          onClick={() => setShowTwitchKickAI(!showTwitchKickAI)}
          data-testid="button-toggle-twitch-kick-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Twitch & Kick Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showTwitchKickAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showTwitchKickAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiTwEmotesLoading || aiTwEmotes) && (
              <Card data-testid="card-ai-tw-emotes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Emotes</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwEmotesLoading ? <Skeleton className="h-24 w-full" /> : aiTwEmotes && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwEmotes.emotes || aiTwEmotes.concepts || aiTwEmotes.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwBitsLoading || aiTwBits) && (
              <Card data-testid="card-ai-tw-bits">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Bits</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwBitsLoading ? <Skeleton className="h-24 w-full" /> : aiTwBits && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwBits.strategies || aiTwBits.incentives || aiTwBits.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwRaidsLoading || aiTwRaids) && (
              <Card data-testid="card-ai-tw-raids">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Raids</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwRaidsLoading ? <Skeleton className="h-24 w-full" /> : aiTwRaids && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwRaids.targets || aiTwRaids.strategies || aiTwRaids.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwPointsLoading || aiTwPoints) && (
              <Card data-testid="card-ai-tw-points">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Points</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwPointsLoading ? <Skeleton className="h-24 w-full" /> : aiTwPoints && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwPoints.rewards || aiTwPoints.economy || aiTwPoints.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwPredictionsLoading || aiTwPredictions) && (
              <Card data-testid="card-ai-tw-predictions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Predictions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwPredictionsLoading ? <Skeleton className="h-24 w-full" /> : aiTwPredictions && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwPredictions.ideas || aiTwPredictions.topics || aiTwPredictions.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwHypeTrainLoading || aiTwHypeTrain) && (
              <Card data-testid="card-ai-tw-hype-train">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Hype Train</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwHypeTrainLoading ? <Skeleton className="h-24 w-full" /> : aiTwHypeTrain && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwHypeTrain.triggers || aiTwHypeTrain.strategies || aiTwHypeTrain.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwClipsLoading || aiTwClips) && (
              <Card data-testid="card-ai-tw-clips">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Clips</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwClipsLoading ? <Skeleton className="h-24 w-full" /> : aiTwClips && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwClips.clips || aiTwClips.highlights || aiTwClips.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwVODsLoading || aiTwVODs) && (
              <Card data-testid="card-ai-tw-vods">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch VODs</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwVODsLoading ? <Skeleton className="h-24 w-full" /> : aiTwVODs && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwVODs.vods || aiTwVODs.highlights || aiTwVODs.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwPanelsLoading || aiTwPanels) && (
              <Card data-testid="card-ai-tw-panels">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Panels</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwPanelsLoading ? <Skeleton className="h-24 w-full" /> : aiTwPanels && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwPanels.panels || aiTwPanels.layout || aiTwPanels.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKickStreamLoading || aiKickStream) && (
              <Card data-testid="card-ai-kick-stream">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Kick Stream</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKickStreamLoading ? <Skeleton className="h-24 w-full" /> : aiKickStream && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKickStream.tips || aiKickStream.setup || aiKickStream.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKickMoneyLoading || aiKickMoney) && (
              <Card data-testid="card-ai-kick-money">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Kick Monetization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKickMoneyLoading ? <Skeleton className="h-24 w-full" /> : aiKickMoney && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKickMoney.strategies || aiKickMoney.revenue || aiKickMoney.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKickCommLoading || aiKickComm) && (
              <Card data-testid="card-ai-kick-comm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Kick Community</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKickCommLoading ? <Skeleton className="h-24 w-full" /> : aiKickComm && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKickComm.community || aiKickComm.engagement || aiKickComm.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKickDiffLoading || aiKickDiff) && (
              <Card data-testid="card-ai-kick-diff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Kick Differentiator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKickDiffLoading ? <Skeleton className="h-24 w-full" /> : aiKickDiff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKickDiff.features || aiKickDiff.advantages || aiKickDiff.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKickDiscLoading || aiKickDisc) && (
              <Card data-testid="card-ai-kick-disc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Kick Discovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKickDiscLoading ? <Skeleton className="h-24 w-full" /> : aiKickDisc && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKickDisc.discovery || aiKickDisc.growth || aiKickDisc.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamRouterLoading || aiStreamRouter) && (
              <Card data-testid="card-ai-stream-router">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Stream Router</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamRouterLoading ? <Skeleton className="h-24 w-full" /> : aiStreamRouter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamRouter.routing || aiStreamRouter.platforms || aiStreamRouter.recommendations)}
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
          onClick={() => setShowStreamToolsAI(!showStreamToolsAI)}
          data-testid="button-toggle-stream-tools-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Stream Tools Suite</span>
          <Badge variant="outline" className="text-[10px]">4 tools</Badge>
          {showStreamToolsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showStreamToolsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiStreamDeckLoading || aiStreamDeck) && (
              <Card data-testid="card-ai-stream-deck">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Stream Deck</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamDeckLoading ? <Skeleton className="h-24 w-full" /> : aiStreamDeck && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamDeck.setup || aiStreamDeck.buttons || aiStreamDeck.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiOBSOptLoading || aiOBSOpt) && (
              <Card data-testid="card-ai-obs-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI OBS Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOBSOptLoading ? <Skeleton className="h-24 w-full" /> : aiOBSOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOBSOpt.settings || aiOBSOpt.optimization || aiOBSOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamLabsLoading || aiStreamLabs) && (
              <Card data-testid="card-ai-stream-labs">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Streamlabs</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamLabsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamLabs && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamLabs.setup || aiStreamLabs.widgets || aiStreamLabs.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamElemLoading || aiStreamElem) && (
              <Card data-testid="card-ai-stream-elem">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Stream Elements</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamElemLoading ? <Skeleton className="h-24 w-full" /> : aiStreamElem && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamElem.setup || aiStreamElem.overlays || aiStreamElem.recommendations)}
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
          onClick={() => setShowLiveAdvancedAI(!showLiveAdvancedAI)}
          data-testid="button-toggle-live-advanced-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Live Streaming Advanced Suite</span>
          <Badge variant="outline" className="text-[10px]">5 tools</Badge>
          {showLiveAdvancedAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showLiveAdvancedAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiOverlayDesignerLoading || aiOverlayDesigner) && (
              <Card data-testid="card-ai-overlay-designer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Overlay Designer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOverlayDesignerLoading ? <Skeleton className="h-24 w-full" /> : aiOverlayDesigner && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOverlayDesigner.overlays || aiOverlayDesigner.designs || aiOverlayDesigner.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRaidOptimizerLoading || aiRaidOptimizer) && (
              <Card data-testid="card-ai-raid-optimizer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Raid Target Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRaidOptimizerLoading ? <Skeleton className="h-24 w-full" /> : aiRaidOptimizer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRaidOptimizer.targets || aiRaidOptimizer.channels || aiRaidOptimizer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHighlightClipperLoading || aiHighlightClipper) && (
              <Card data-testid="card-ai-highlight-clipper">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Highlight Clipper</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHighlightClipperLoading ? <Skeleton className="h-24 w-full" /> : aiHighlightClipper && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHighlightClipper.highlights || aiHighlightClipper.clips || aiHighlightClipper.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDonationGoalLoading || aiDonationGoal) && (
              <Card data-testid="card-ai-donation-goal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Donation Goal Strategist</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDonationGoalLoading ? <Skeleton className="h-24 w-full" /> : aiDonationGoal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDonationGoal.goals || aiDonationGoal.strategies || aiDonationGoal.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiChatUnifierLoading || aiChatUnifier) && (
              <Card data-testid="card-ai-chat-unifier">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Multi-Stream Chat Unifier</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiChatUnifierLoading ? <Skeleton className="h-24 w-full" /> : aiChatUnifier && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiChatUnifier.unified || aiChatUnifier.platforms || aiChatUnifier.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      </div>
      </CollapsibleToolbox>}

      {streamMode === "live" && liveStream && <LiveBanner stream={liveStream} onEnd={() => endStream.mutate(liveStream.id)} isEnding={endStream.isPending} />}

      {streamMode === "live" && liveStream && <LiveChatPanel streamId={liveStream.id} />}

      {isActiveMode && <MultiPlatformStatus channels={connectedChannels} destinations={destinations} />}

      {isActiveMode && <Card data-testid="card-youtube-detection">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Wifi className={`h-5 w-5 ${ytLiveStatus?.connected ? "text-green-500" : "text-muted-foreground"}`} />
              <h2 className="font-semibold text-sm">YouTube Auto-Detect</h2>
              {ytLiveStatus?.connected && (
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {ytLiveStatus?.channelName || "Connected"}
                </Badge>
              )}
            </div>
            {ytLiveStatus?.connected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => detectLive.mutate()}
                disabled={detectLive.isPending}
                data-testid="button-check-live"
              >
                {detectLive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Check Now</span>
              </Button>
            )}
          </div>

          {!ytLiveStatus?.connected ? (
            <div className="text-center py-4">
              <WifiOff className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Connect your YouTube account in Settings to enable auto-detection</p>
              <p className="text-xs text-muted-foreground mt-1">When you go live on YouTube, CreatorOS will automatically detect it and fire all automations across all 6 platforms</p>
            </div>
          ) : liveStream ? (
            <div className="flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
              <Radio className="h-5 w-5 text-red-500 animate-pulse shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-500">LIVE NOW</p>
                <p className="text-sm font-medium truncate">{liveStream.title}</p>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {PLATFORMS.map(p => (
                    <Badge key={p} variant="outline" className="text-[10px]">
                      <PlatformIcon platform={p} className="h-3 w-3 mr-1" />{PLATFORM_INFO[p].label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shrink-0" />
              <div>
                <p className="text-sm font-medium">Watching for your next YouTube livestream</p>
                <p className="text-xs text-muted-foreground">Start streaming on YouTube and CreatorOS will detect it within 30 seconds — then automatically run LIVE pipeline, post announcements, generate thumbnails, and optimize SEO across all 6 platforms</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>}

      {isActiveMode && <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Destinations ({destinations.filter(d => d.enabled).length} active)</h2>
        {destinations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Radio className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No destinations configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border/50">
              {destinations.map((dest) => (
                <div key={dest.id} data-testid={`card-destination-${dest.id}`} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div style={{ color: PLATFORM_INFO[dest.platform as Platform]?.color || "#888" }}>
                      <PlatformIcon platform={dest.platform} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p data-testid={`text-dest-label-${dest.id}`} className="text-sm font-medium truncate">{dest.label}</p>
                      <p className="text-xs text-muted-foreground">{dest.streamKey ? 'Key configured' : 'No key'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch data-testid={`switch-dest-${dest.id}`} checked={dest.enabled ?? true} onCheckedChange={(checked) => toggleDest.mutate({ id: dest.id, enabled: checked })} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button data-testid={`button-delete-dest-${dest.id}`} size="icon" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Destination</AlertDialogTitle>
                          <AlertDialogDescription>This will remove "{dest.label}" as a streaming destination. You can add it back later.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction data-testid={`button-confirm-delete-dest-${dest.id}`} onClick={() => deleteDest.mutate(dest.id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>}

      {isActiveMode && pastStreams.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Past Streams</h2>
          {pastStreams.map(stream => (
            <Card key={stream.id} data-testid={`card-stream-${stream.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p data-testid={`text-stream-title-${stream.id}`} className="text-sm font-medium">{stream.title}</p>
                      <Badge variant="secondary" className="text-xs capitalize">{stream.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {((stream.platforms as string[]) || []).map(p => (
                        <Badge key={p} variant="outline" className="text-[10px]">{PLATFORM_INFO[p as Platform]?.label || p}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button data-testid={`button-optimize-stream-${stream.id}`} size="sm" variant="outline" onClick={() => optimizeSeo.mutate(stream.id)} disabled={optimizeSeo.isPending}>
                      <Sparkles className="h-3 w-3 mr-1" />SEO
                    </Button>
                    <Button data-testid={`button-thumbnail-stream-${stream.id}`} size="sm" variant="outline" onClick={() => generateThumbnail.mutate({ streamId: stream.id, title: stream.title, description: stream.description || undefined })} disabled={generateThumbnail.isPending}>
                      <Image className="h-3 w-3 mr-1" />Thumb
                    </Button>
                    {stream.status === 'ended' && (
                      <Button data-testid={`button-postprocess-stream-${stream.id}`} size="sm" onClick={() => postProcess.mutate(stream.id)} disabled={postProcess.isPending}>
                        <ArrowRight className="h-3 w-3 mr-1" />Process
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isActiveMode && !streamsLoading && streamList.length === 0 && (
        <EmptyState
          icon={Radio}
          type="streams"
          title="No Streams Yet"
          description="Your livestream sessions will appear here. Connect a platform to get started."
        />
      )}
      </UpgradeTabGate>
    </div>
  );
}

function MultiPlatformStatus({ channels, destinations }: { channels: Channel[]; destinations: StreamDestination[] }) {
  const platformStatuses = new Map<string, { hasChannel: boolean; hasDestination: boolean; destEnabled: boolean }>();

  channels.forEach((ch) => {
    const existing = platformStatuses.get(ch.platform) || { hasChannel: false, hasDestination: false, destEnabled: false };
    existing.hasChannel = true;
    platformStatuses.set(ch.platform, existing);
  });

  destinations.forEach((dest) => {
    const existing = platformStatuses.get(dest.platform) || { hasChannel: false, hasDestination: false, destEnabled: false };
    existing.hasDestination = true;
    if (dest.enabled) existing.destEnabled = true;
    platformStatuses.set(dest.platform, existing);
  });

  const entries = Array.from(platformStatuses.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Multi-Platform Status</h2>
      <Card>
        <div className="divide-y divide-border/50">
          {entries.map(([platform, status]) => {
            const info = PLATFORM_INFO[platform as Platform];
            const ready = status.hasDestination && status.destEnabled;
            return (
              <div key={platform} data-testid={`platform-status-${platform}`} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div style={{ color: info?.color || "#888" }}>
                    <PlatformIcon platform={platform} className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{info?.label || platform}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status.hasChannel && (
                    <Badge variant="secondary" className="text-xs">Channel</Badge>
                  )}
                  {status.hasDestination && (
                    <Badge variant={status.destEnabled ? "default" : "outline"} className="text-xs">
                      {status.destEnabled ? "RTMP Ready" : "RTMP Disabled"}
                    </Badge>
                  )}
                  {ready ? (
                    <Wifi className="h-4 w-4 text-emerald-500" data-testid={`icon-ready-${platform}`} />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" data-testid={`icon-not-ready-${platform}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function LiveBanner({ stream, onEnd, isEnding }: { stream: Stream; onEnd: () => void; isEnding: boolean }) {
  const [elapsed, setElapsed] = useState("");
  const automationPoll = useAdaptiveInterval(60_000);

  const { data: automationData } = useQuery<{ jobs: any[]; tasks: any[] }>({
    queryKey: ["/api/streams", stream.id, "automation"],
    queryFn: async () => { const res = await fetch(`/api/streams/${stream.id}/automation`, { credentials: 'include' }); if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`); return res.json(); },
    refetchInterval: automationPoll,
  });

  useEffect(() => {
    if (!stream.startedAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(stream.startedAt!).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [stream.startedAt]);

  const tasks = automationData?.tasks || [];

  return (
    <Card className="border-red-500/50" data-testid="card-live-stream">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p data-testid="text-live-stream-title" className="text-sm font-bold">{stream.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                {elapsed && <span className="text-xs text-muted-foreground font-mono">{elapsed}</span>}
              </div>
            </div>
          </div>
          <Button data-testid="button-end-stream" size="sm" variant="destructive" onClick={onEnd} disabled={isEnding}>
            {isEnding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Square className="h-3.5 w-3.5 mr-1.5" />}End
          </Button>
        </div>
        {tasks.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {tasks.map((task: any, i: number) => (
              <div key={i} data-testid={`task-status-${task.name}`} className="flex items-center gap-1.5">
                {task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                 task.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-400" /> :
                 task.status === 'running' ? <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" /> :
                 <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-muted-foreground">{task.name?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
