import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Shield, Zap, AlertTriangle, Save, LogOut, Link2, Bell,
  Plus, Sparkles, CalendarDays, Heart, BookOpen, CheckCircle2,
  Link as LinkIcon, Users, Eye, Palette, Trash2, Target, Handshake, Mail, Briefcase,
  ChevronDown, ChevronUp, Clock, Globe, Play, UserPlus, CheckCircle, DollarSign,
  TrendingUp, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PlatformBadge } from "@/components/PlatformIcon";
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";

const BrandTab = lazy(() => import("./settings/BrandTab"));
const CollabsTab = lazy(() => import("./settings/CollabsTab"));
const CompetitorsTab = lazy(() => import("./settings/CompetitorsTab"));
const LegalTab = lazy(() => import("./settings/LegalTab"));
const WellnessTab = lazy(() => import("./settings/WellnessTab"));
const LearningTab = lazy(() => import("./settings/LearningTab"));
const AutomationTab = lazy(() => import("./settings/AutomationTab"));
const SubscriptionTab = lazy(() => import("./settings/AdminTabs"));
const AdminCodesTab = lazy(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminCodesTab })));
const AdminUsersTab = lazy(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminUsersTab })));

const TabFallback = () => <Skeleton className="h-96 w-full rounded-lg" />;

type AIResponse = Record<string, unknown> | null;

type TabKey = "general" | "brand" | "collabs" | "competitors" | "legal" | "wellness" | "learning" | "automation" | "admin-codes" | "admin-users" | "subscription";

const VALID_TABS: TabKey[] = ["general", "brand", "collabs", "competitors", "legal", "wellness", "learning", "automation", "admin-codes", "admin-users", "subscription"];

const baseTabs: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "general", label: "General" },
  { key: "brand", label: "Brand" },
  { key: "collabs", label: "Collabs" },
  { key: "competitors", label: "Competitors" },
  { key: "legal", label: "Legal" },
  { key: "wellness", label: "Wellness" },
  { key: "learning", label: "Learning" },
  { key: "automation", label: "Automation Hub" },
  { key: "subscription", label: "Subscription" },
  { key: "admin-codes", label: "Access Codes", adminOnly: true },
  { key: "admin-users", label: "Users", adminOnly: true },
];

interface NotificationPrefs {
  complianceWarnings: boolean;
  milestoneAlerts: boolean;
  platformIssues: boolean;
  revenueUpdates: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
  complianceWarnings: true,
  milestoneAlerts: true,
  platformIssues: true,
  revenueUpdates: false,
};

function GeneralTab() {
  const { user, logout, isLoggingOut } = useAuth();
  const { data: channels } = useChannels();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");
  const [aiTeam, setAiTeam] = useState<AIResponse>(null);
  const [aiTeamLoading, setAiTeamLoading] = useState(true);
  const [aiAutomations, setAiAutomations] = useState<AIResponse>(null);
  const [aiAutomationsLoading, setAiAutomationsLoading] = useState(true);

  const [showTeamAI, setShowTeamAI] = useState(false);
  const [aiHiring, setAiHiring] = useState<AIResponse>(null);
  const [aiHiringLoading, setAiHiringLoading] = useState(false);
  const [aiFreelance, setAiFreelance] = useState<AIResponse>(null);
  const [aiFreelanceLoading, setAiFreelanceLoading] = useState(false);
  const [aiSOP, setAiSOP] = useState<AIResponse>(null);
  const [aiSOPLoading, setAiSOPLoading] = useState(false);
  const [aiTimeline, setAiTimeline] = useState<AIResponse>(null);
  const [aiTimelineLoading, setAiTimelineLoading] = useState(false);
  const [aiApproval, setAiApproval] = useState<AIResponse>(null);
  const [aiApprovalLoading, setAiApprovalLoading] = useState(false);
  const [aiEditChecklist, setAiEditChecklist] = useState<AIResponse>(null);
  const [aiEditChecklistLoading, setAiEditChecklistLoading] = useState(false);
  const [aiProdBudget, setAiProdBudget] = useState<AIResponse>(null);
  const [aiProdBudgetLoading, setAiProdBudgetLoading] = useState(false);
  const [aiEquip, setAiEquip] = useState<AIResponse>(null);
  const [aiEquipLoading, setAiEquipLoading] = useState(false);
  const [aiStudio, setAiStudio] = useState<AIResponse>(null);
  const [aiStudioLoading, setAiStudioLoading] = useState(false);
  const [aiWorkflow, setAiWorkflow] = useState<AIResponse>(null);
  const [aiWorkflowLoading, setAiWorkflowLoading] = useState(false);
  const [aiBatchRec, setAiBatchRec] = useState<AIResponse>(null);
  const [aiBatchRecLoading, setAiBatchRecLoading] = useState(false);
  const [aiOutsource, setAiOutsource] = useState<AIResponse>(null);
  const [aiOutsourceLoading, setAiOutsourceLoading] = useState(false);
  const [aiToolStack, setAiToolStack] = useState<AIResponse>(null);
  const [aiToolStackLoading, setAiToolStackLoading] = useState(false);
  const [aiDelegation, setAiDelegation] = useState<any>(null);
  const [aiDelegationLoading, setAiDelegationLoading] = useState(false);
  const [aiTimeMgmt, setAiTimeMgmt] = useState<any>(null);
  const [aiTimeMgmtLoading, setAiTimeMgmtLoading] = useState(false);
  const [aiMastermind, setAiMastermind] = useState<any>(null);
  const [aiMastermindLoading, setAiMastermindLoading] = useState(false);
  const [aiProductivity, setAiProductivity] = useState<any>(null);
  const [aiProductivityLoading, setAiProductivityLoading] = useState(false);

  const [showCrisisAI, setShowCrisisAI] = useState(false);
  const [aiCrisisResp, setAiCrisisResp] = useState<any>(null);
  const [aiCrisisRespLoading, setAiCrisisRespLoading] = useState(false);
  const [aiApology, setAiApology] = useState<any>(null);
  const [aiApologyLoading, setAiApologyLoading] = useState(false);
  const [aiControversy, setAiControversy] = useState<any>(null);
  const [aiControversyLoading, setAiControversyLoading] = useState(false);
  const [aiCancelCulture, setAiCancelCulture] = useState<any>(null);
  const [aiCancelCultureLoading, setAiCancelCultureLoading] = useState(false);
  const [aiCrisisDetect, setAiCrisisDetect] = useState<any>(null);
  const [aiCrisisDetectLoading, setAiCrisisDetectLoading] = useState(false);
  const [aiDamageCtrl, setAiDamageCtrl] = useState<any>(null);
  const [aiDamageCtrlLoading, setAiDamageCtrlLoading] = useState(false);
  const [aiPRStmt, setAiPRStmt] = useState<any>(null);
  const [aiPRStmtLoading, setAiPRStmtLoading] = useState(false);
  const [aiStakeholder, setAiStakeholder] = useState<any>(null);
  const [aiStakeholderLoading, setAiStakeholderLoading] = useState(false);
  const [aiRecovStrat, setAiRecovStrat] = useState<any>(null);
  const [aiRecovStratLoading, setAiRecovStratLoading] = useState(false);
  const [aiMediaResp, setAiMediaResp] = useState<any>(null);
  const [aiMediaRespLoading, setAiMediaRespLoading] = useState(false);
  const [aiLegalRisk, setAiLegalRisk] = useState<any>(null);
  const [aiLegalRiskLoading, setAiLegalRiskLoading] = useState(false);
  const [aiSocialCrisis, setAiSocialCrisis] = useState<any>(null);
  const [aiSocialCrisisLoading, setAiSocialCrisisLoading] = useState(false);
  const [aiInflCrisis, setAiInflCrisis] = useState<any>(null);
  const [aiInflCrisisLoading, setAiInflCrisisLoading] = useState(false);
  const [aiBrandRecov, setAiBrandRecov] = useState<any>(null);
  const [aiBrandRecovLoading, setAiBrandRecovLoading] = useState(false);

  const [showAutoSuiteAI, setShowAutoSuiteAI] = useState(false);
  const [aiWorkflowAutoAS, setAiWorkflowAutoAS] = useState<any>(null);
  const [aiWorkflowAutoASLoading, setAiWorkflowAutoASLoading] = useState(false);
  const [aiZapier, setAiZapier] = useState<any>(null);
  const [aiZapierLoading, setAiZapierLoading] = useState(false);
  const [aiIFTTT, setAiIFTTT] = useState<any>(null);
  const [aiIFTTTLoading, setAiIFTTTLoading] = useState(false);
  const [aiMakeScene, setAiMakeScene] = useState<any>(null);
  const [aiMakeSceneLoading, setAiMakeSceneLoading] = useState(false);
  const [aiAutoSched, setAiAutoSched] = useState<any>(null);
  const [aiAutoSchedLoading, setAiAutoSchedLoading] = useState(false);
  const [aiAutoRespAS, setAiAutoRespAS] = useState<any>(null);
  const [aiAutoRespASLoading, setAiAutoRespASLoading] = useState(false);
  const [aiAutoModAS, setAiAutoModAS] = useState<any>(null);
  const [aiAutoModASLoading, setAiAutoModASLoading] = useState(false);
  const [aiAutoBack, setAiAutoBack] = useState<any>(null);
  const [aiAutoBackLoading, setAiAutoBackLoading] = useState(false);
  const [aiAutoRep, setAiAutoRep] = useState<any>(null);
  const [aiAutoRepLoading, setAiAutoRepLoading] = useState(false);
  const [aiAutoOpt, setAiAutoOpt] = useState<any>(null);
  const [aiAutoOptLoading, setAiAutoOptLoading] = useState(false);
  const [aiBatchProc, setAiBatchProc] = useState<any>(null);
  const [aiBatchProcLoading, setAiBatchProcLoading] = useState(false);
  const [aiSmartQueue, setAiSmartQueue] = useState<any>(null);
  const [aiSmartQueueLoading, setAiSmartQueueLoading] = useState(false);
  const [aiContPipeline, setAiContPipeline] = useState<any>(null);
  const [aiContPipelineLoading, setAiContPipelineLoading] = useState(false);
  const [aiTrainData, setAiTrainData] = useState<any>(null);
  const [aiTrainDataLoading, setAiTrainDataLoading] = useState(false);

  const [showBizContAI, setShowBizContAI] = useState(false);
  const [aiCommTrust, setAiCommTrust] = useState<any>(null);
  const [aiCommTrustLoading, setAiCommTrustLoading] = useState(false);
  const [aiAlgoRecov, setAiAlgoRecov] = useState<any>(null);
  const [aiAlgoRecovLoading, setAiAlgoRecovLoading] = useState(false);
  const [aiRevRecov, setAiRevRecov] = useState<any>(null);
  const [aiRevRecovLoading, setAiRevRecovLoading] = useState(false);
  const [aiTeamCrisisBC, setAiTeamCrisisBC] = useState<any>(null);
  const [aiTeamCrisisBCLoading, setAiTeamCrisisBCLoading] = useState(false);
  const [aiLegalDef, setAiLegalDef] = useState<any>(null);
  const [aiLegalDefLoading, setAiLegalDefLoading] = useState(false);
  const [aiInsClaim, setAiInsClaim] = useState<any>(null);
  const [aiInsClaimLoading, setAiInsClaimLoading] = useState(false);
  const [aiContingency, setAiContingency] = useState<any>(null);
  const [aiContingencyLoading, setAiContingencyLoading] = useState(false);
  const [aiDisasterRecov, setAiDisasterRecov] = useState<any>(null);
  const [aiDisasterRecovLoading, setAiDisasterRecovLoading] = useState(false);
  const [aiBizContBC, setAiBizContBC] = useState<any>(null);
  const [aiBizContBCLoading, setAiBizContBCLoading] = useState(false);
  const [aiExitStrat, setAiExitStrat] = useState<any>(null);
  const [aiExitStratLoading, setAiExitStratLoading] = useState(false);

  const [showBrandAI, setShowBrandAI] = useState(false);
  const [aiBrandVoice, setAiBrandVoice] = useState<any>(null);
  const [aiBrandVoiceLoading, setAiBrandVoiceLoading] = useState(false);
  const [aiBrandColors, setAiBrandColors] = useState<any>(null);
  const [aiBrandColorsLoading, setAiBrandColorsLoading] = useState(false);
  const [aiBrandFonts, setAiBrandFonts] = useState<any>(null);
  const [aiBrandFontsLoading, setAiBrandFontsLoading] = useState(false);
  const [aiBrandStory, setAiBrandStory] = useState<any>(null);
  const [aiBrandStoryLoading, setAiBrandStoryLoading] = useState(false);
  const [aiBrandConsist, setAiBrandConsist] = useState<any>(null);
  const [aiBrandConsistLoading, setAiBrandConsistLoading] = useState(false);
  const [aiPillarRefine, setAiPillarRefine] = useState<any>(null);
  const [aiPillarRefineLoading, setAiPillarRefineLoading] = useState(false);
  const [aiTrailer, setAiTrailer] = useState<any>(null);
  const [aiTrailerLoading, setAiTrailerLoading] = useState(false);
  const [aiArtDir, setAiArtDir] = useState<any>(null);
  const [aiArtDirLoading, setAiArtDirLoading] = useState(false);
  const [aiUSP, setAiUSP] = useState<any>(null);
  const [aiUSPLoading, setAiUSPLoading] = useState(false);
  const [aiTargetAud, setAiTargetAud] = useState<any>(null);
  const [aiTargetAudLoading, setAiTargetAudLoading] = useState(false);
  const [aiBrandPartner, setAiBrandPartner] = useState<any>(null);
  const [aiBrandPartnerLoading, setAiBrandPartnerLoading] = useState(false);
  const [aiCrisis, setAiCrisis] = useState<any>(null);
  const [aiCrisisLoading, setAiCrisisLoading] = useState(false);
  const [aiPersonalBrand, setAiPersonalBrand] = useState<any>(null);
  const [aiPersonalBrandLoading, setAiPersonalBrandLoading] = useState(false);
  const [aiBrandEvolution, setAiBrandEvolution] = useState<any>(null);
  const [aiBrandEvolutionLoading, setAiBrandEvolutionLoading] = useState(false);
  const [aiCompDiff, setAiCompDiff] = useState<any>(null);
  const [aiCompDiffLoading, setAiCompDiffLoading] = useState(false);
  const [aiCollabBrief, setAiCollabBrief] = useState<any>(null);
  const [aiCollabBriefLoading, setAiCollabBriefLoading] = useState(false);
  const [aiNetworkPrep, setAiNetworkPrep] = useState<any>(null);
  const [aiNetworkPrepLoading, setAiNetworkPrepLoading] = useState(false);
  const [aiMentorship, setAiMentorship] = useState<any>(null);
  const [aiMentorshipLoading, setAiMentorshipLoading] = useState(false);

  const [showIntegrationsAI, setShowIntegrationsAI] = useState(false);
  const [aiYTAPI, setAiYTAPI] = useState<any>(null);
  const [aiYTAPILoading, setAiYTAPILoading] = useState(false);
  const [aiTwitch, setAiTwitch] = useState<any>(null);
  const [aiTwitchLoading, setAiTwitchLoading] = useState(false);
  const [aiDiscordBot, setAiDiscordBot] = useState<any>(null);
  const [aiDiscordBotLoading, setAiDiscordBotLoading] = useState(false);
  const [aiGA, setAiGA] = useState<any>(null);
  const [aiGALoading, setAiGALoading] = useState(false);
  const [aiSocialSched, setAiSocialSched] = useState<any>(null);
  const [aiSocialSchedLoading, setAiSocialSchedLoading] = useState(false);
  const [aiEmailMkt, setAiEmailMkt] = useState<any>(null);
  const [aiEmailMktLoading, setAiEmailMktLoading] = useState(false);
  const [aiPodcast, setAiPodcast] = useState<any>(null);
  const [aiPodcastLoading, setAiPodcastLoading] = useState(false);
  const [aiWebhooks, setAiWebhooks] = useState<any>(null);
  const [aiWebhooksLoading, setAiWebhooksLoading] = useState(false);
  const [aiRateLimits, setAiRateLimits] = useState<any>(null);
  const [aiRateLimitsLoading, setAiRateLimitsLoading] = useState(false);
  const [aiBackupPlan, setAiBackupPlan] = useState<any>(null);
  const [aiBackupPlanLoading, setAiBackupPlanLoading] = useState(false);
  const [aiNotifOpt, setAiNotifOpt] = useState<any>(null);
  const [aiNotifOptLoading, setAiNotifOptLoading] = useState(false);
  const [aiCrossPost, setAiCrossPost] = useState<any>(null);
  const [aiCrossPostLoading, setAiCrossPostLoading] = useState(false);
  const [aiLinktree, setAiLinktree] = useState<any>(null);
  const [aiLinktreeLoading, setAiLinktreeLoading] = useState(false);
  const [aiQRCodes, setAiQRCodes] = useState<any>(null);
  const [aiQRCodesLoading, setAiQRCodesLoading] = useState(false);
  const [aiChatbot, setAiChatbot] = useState<any>(null);
  const [aiChatbotLoading, setAiChatbotLoading] = useState(false);
  const [aiAnalyticsDash, setAiAnalyticsDash] = useState<any>(null);
  const [aiAnalyticsDashLoading, setAiAnalyticsDashLoading] = useState(false);
  const [aiCDN, setAiCDN] = useState<any>(null);
  const [aiCDNLoading, setAiCDNLoading] = useState(false);
  const [aiAccessibility, setAiAccessibility] = useState<any>(null);
  const [aiAccessibilityLoading, setAiAccessibilityLoading] = useState(false);
  const [aiDeviceTest, setAiDeviceTest] = useState<any>(null);
  const [aiDeviceTestLoading, setAiDeviceTestLoading] = useState(false);
  const [aiPerfMon, setAiPerfMon] = useState<any>(null);
  const [aiPerfMonLoading, setAiPerfMonLoading] = useState(false);
  const [aiSecurityAudit, setAiSecurityAudit] = useState<any>(null);
  const [aiSecurityAuditLoading, setAiSecurityAuditLoading] = useState(false);
  const [aiCookieConsent, setAiCookieConsent] = useState<any>(null);
  const [aiCookieConsentLoading, setAiCookieConsentLoading] = useState(false);
  const [aiAgeGate, setAiAgeGate] = useState<any>(null);
  const [aiAgeGateLoading, setAiAgeGateLoading] = useState(false);
  const [aiDataRetention, setAiDataRetention] = useState<any>(null);
  const [aiDataRetentionLoading, setAiDataRetentionLoading] = useState(false);
  const [aiIncidentResp, setAiIncidentResp] = useState<any>(null);
  const [aiIncidentRespLoading, setAiIncidentRespLoading] = useState(false);

  const [showPowerUserAI, setShowPowerUserAI] = useState(false);
  const [aiShortcuts, setAiShortcuts] = useState<any>(null);
  const [aiShortcutsLoading, setAiShortcutsLoading] = useState(false);
  const [aiAdvSearch, setAiAdvSearch] = useState<any>(null);
  const [aiAdvSearchLoading, setAiAdvSearchLoading] = useState(false);
  const [aiBulkUpload, setAiBulkUpload] = useState<any>(null);
  const [aiBulkUploadLoading, setAiBulkUploadLoading] = useState(false);
  const [aiPlaylistOrg, setAiPlaylistOrg] = useState<any>(null);
  const [aiPlaylistOrgLoading, setAiPlaylistOrgLoading] = useState(false);
  const [aiMultiAcct, setAiMultiAcct] = useState<any>(null);
  const [aiMultiAcctLoading, setAiMultiAcctLoading] = useState(false);
  const [aiCustDash, setAiCustDash] = useState<any>(null);
  const [aiCustDashLoading, setAiCustDashLoading] = useState(false);
  const [aiAutoTag, setAiAutoTag] = useState<any>(null);
  const [aiAutoTagLoading, setAiAutoTagLoading] = useState(false);
  const [aiSmartNotif, setAiSmartNotif] = useState<any>(null);
  const [aiSmartNotifLoading, setAiSmartNotifLoading] = useState(false);
  const [aiTemplates, setAiTemplates] = useState<any>(null);
  const [aiTemplatesLoading, setAiTemplatesLoading] = useState(false);
  const [aiMacros, setAiMacros] = useState<any>(null);
  const [aiMacrosLoading, setAiMacrosLoading] = useState(false);
  const [aiGamification, setAiGamification] = useState<any>(null);
  const [aiGamificationLoading, setAiGamificationLoading] = useState(false);
  const [aiPersonalize, setAiPersonalize] = useState<any>(null);
  const [aiPersonalizeLoading, setAiPersonalizeLoading] = useState(false);
  const [aiContentDNA, setAiContentDNA] = useState<any>(null);
  const [aiContentDNALoading, setAiContentDNALoading] = useState(false);
  const [aiAlgoSim, setAiAlgoSim] = useState<any>(null);
  const [aiAlgoSimLoading, setAiAlgoSimLoading] = useState(false);
  const [aiDataViz, setAiDataViz] = useState<any>(null);
  const [aiDataVizLoading, setAiDataVizLoading] = useState(false);

  const [showEmergingAI, setShowEmergingAI] = useState(false);
  const [aiVR, setAiVR] = useState<any>(null);
  const [aiVRLoading, setAiVRLoading] = useState(false);
  const [aiAR, setAiAR] = useState<any>(null);
  const [aiARLoading, setAiARLoading] = useState(false);
  const [aiVoiceover, setAiVoiceover] = useState<any>(null);
  const [aiVoiceoverLoading, setAiVoiceoverLoading] = useState(false);
  const [aiDeepfake, setAiDeepfake] = useState<any>(null);
  const [aiDeepfakeLoading, setAiDeepfakeLoading] = useState(false);
  const [aiBlockchain, setAiBlockchain] = useState<any>(null);
  const [aiBlockchainLoading, setAiBlockchainLoading] = useState(false);
  const [aiPredTrends, setAiPredTrends] = useState<any>(null);
  const [aiPredTrendsLoading, setAiPredTrendsLoading] = useState(false);
  const [aiContentGraph, setAiContentGraph] = useState<any>(null);
  const [aiContentGraphLoading, setAiContentGraphLoading] = useState(false);
  const [aiPsychograph, setAiPsychograph] = useState<any>(null);
  const [aiPsychographLoading, setAiPsychographLoading] = useState(false);
  const [aiNeuroMkt, setAiNeuroMkt] = useState<any>(null);
  const [aiNeuroMktLoading, setAiNeuroMktLoading] = useState(false);
  const [aiSentPred, setAiSentPred] = useState<any>(null);
  const [aiSentPredLoading, setAiSentPredLoading] = useState(false);
  const [aiCreatorEcon, setAiCreatorEcon] = useState<any>(null);
  const [aiCreatorEconLoading, setAiCreatorEconLoading] = useState(false);
  const [aiWeb3, setAiWeb3] = useState<any>(null);
  const [aiWeb3Loading, setAiWeb3Loading] = useState(false);
  const [aiMetaverse, setAiMetaverse] = useState<any>(null);
  const [aiMetaverseLoading, setAiMetaverseLoading] = useState(false);
  const [aiAgentCust, setAiAgentCust] = useState<any>(null);
  const [aiAgentCustLoading, setAiAgentCustLoading] = useState(false);
  const [aiCreatorAPI, setAiCreatorAPI] = useState<any>(null);
  const [aiCreatorAPILoading, setAiCreatorAPILoading] = useState(false);

  const [showAudioAI, setShowAudioAI] = useState(false);
  const [aiPodLaunch, setAiPodLaunch] = useState<any>(null);
  const [aiPodLaunchLoading, setAiPodLaunchLoading] = useState(false);
  const [aiPodEpisode, setAiPodEpisode] = useState<any>(null);
  const [aiPodEpisodeLoading, setAiPodEpisodeLoading] = useState(false);
  const [aiPodSEO, setAiPodSEO] = useState<any>(null);
  const [aiPodSEOLoading, setAiPodSEOLoading] = useState(false);
  const [aiAudioBrand, setAiAudioBrand] = useState<any>(null);
  const [aiAudioBrandLoading, setAiAudioBrandLoading] = useState(false);
  const [aiMusicComp, setAiMusicComp] = useState<any>(null);
  const [aiMusicCompLoading, setAiMusicCompLoading] = useState(false);
  const [aiASMR, setAiASMR] = useState<any>(null);
  const [aiASMRLoading, setAiASMRLoading] = useState(false);
  const [aiVoiceTrain, setAiVoiceTrain] = useState<any>(null);
  const [aiVoiceTrainLoading, setAiVoiceTrainLoading] = useState(false);
  const [aiAudioMix, setAiAudioMix] = useState<any>(null);
  const [aiAudioMixLoading, setAiAudioMixLoading] = useState(false);

  const [showSecurityAI, setShowSecurityAI] = useState(false);
  const [aiPassSec, setAiPassSec] = useState<any>(null);
  const [aiPassSecLoading, setAiPassSecLoading] = useState(false);
  const [aiPhishing, setAiPhishing] = useState<any>(null);
  const [aiPhishingLoading, setAiPhishingLoading] = useState(false);
  const [aiAcctRecov, setAiAcctRecov] = useState<any>(null);
  const [aiAcctRecovLoading, setAiAcctRecovLoading] = useState(false);
  const [aiPrivSettings, setAiPrivSettings] = useState<any>(null);
  const [aiPrivSettingsLoading, setAiPrivSettingsLoading] = useState(false);
  const [aiDataBreach, setAiDataBreach] = useState<any>(null);
  const [aiDataBreachLoading, setAiDataBreachLoading] = useState(false);
  const [aiVPN, setAiVPN] = useState<any>(null);
  const [aiVPNLoading, setAiVPNLoading] = useState(false);

  const [showMultiPlatAI, setShowMultiPlatAI] = useState(false);
  const [aiTTAlgo, setAiTTAlgo] = useState<any>(null);
  const [aiTTAlgoLoading, setAiTTAlgoLoading] = useState(false);
  const [aiTTSounds, setAiTTSounds] = useState<any>(null);
  const [aiTTSoundsLoading, setAiTTSoundsLoading] = useState(false);
  const [aiTTDuet, setAiTTDuet] = useState<any>(null);
  const [aiTTDuetLoading, setAiTTDuetLoading] = useState(false);
  const [aiTTLive, setAiTTLive] = useState<any>(null);
  const [aiTTLiveLoading, setAiTTLiveLoading] = useState(false);
  const [aiTTShop, setAiTTShop] = useState<any>(null);
  const [aiTTShopLoading, setAiTTShopLoading] = useState(false);
  const [aiTTFund, setAiTTFund] = useState<any>(null);
  const [aiTTFundLoading, setAiTTFundLoading] = useState(false);
  const [aiTTHash, setAiTTHash] = useState<any>(null);
  const [aiTTHashLoading, setAiTTHashLoading] = useState(false);
  const [aiTTProfile, setAiTTProfile] = useState<any>(null);
  const [aiTTProfileLoading, setAiTTProfileLoading] = useState(false);
  const [aiIGReels, setAiIGReels] = useState<any>(null);
  const [aiIGReelsLoading, setAiIGReelsLoading] = useState(false);
  const [aiIGStories, setAiIGStories] = useState<any>(null);
  const [aiIGStoriesLoading, setAiIGStoriesLoading] = useState(false);
  const [aiIGCarousel, setAiIGCarousel] = useState<any>(null);
  const [aiIGCarouselLoading, setAiIGCarouselLoading] = useState(false);
  const [aiIGBio, setAiIGBio] = useState<any>(null);
  const [aiIGBioLoading, setAiIGBioLoading] = useState(false);
  const [aiIGShop, setAiIGShop] = useState<any>(null);
  const [aiIGShopLoading, setAiIGShopLoading] = useState(false);
  const [aiIGCollabs, setAiIGCollabs] = useState<any>(null);
  const [aiIGCollabsLoading, setAiIGCollabsLoading] = useState(false);
  const [aiIGGrowth, setAiIGGrowth] = useState<any>(null);
  const [aiIGGrowthLoading, setAiIGGrowthLoading] = useState(false);
  const [aiIGAesthetic, setAiIGAesthetic] = useState<any>(null);
  const [aiIGAestheticLoading, setAiIGAestheticLoading] = useState(false);
  const [aiXGrowth, setAiXGrowth] = useState<any>(null);
  const [aiXGrowthLoading, setAiXGrowthLoading] = useState(false);
  const [aiXThread, setAiXThread] = useState<any>(null);
  const [aiXThreadLoading, setAiXThreadLoading] = useState(false);
  const [aiLICreator, setAiLICreator] = useState<any>(null);
  const [aiLICreatorLoading, setAiLICreatorLoading] = useState(false);
  const [aiLIArticle, setAiLIArticle] = useState<any>(null);
  const [aiLIArticleLoading, setAiLIArticleLoading] = useState(false);

  const [showCreatorPlatAI, setShowCreatorPlatAI] = useState(false);
  const [aiFBGroups, setAiFBGroups] = useState<any>(null);
  const [aiFBGroupsLoading, setAiFBGroupsLoading] = useState(false);
  const [aiFBReels, setAiFBReels] = useState<any>(null);
  const [aiFBReelsLoading, setAiFBReelsLoading] = useState(false);
  const [aiSnapchat, setAiSnapchat] = useState<any>(null);
  const [aiSnapchatLoading, setAiSnapchatLoading] = useState(false);
  const [aiThreads, setAiThreads] = useState<any>(null);
  const [aiThreadsLoading, setAiThreadsLoading] = useState(false);
  const [aiDiscordOpt, setAiDiscordOpt] = useState<any>(null);
  const [aiDiscordOptLoading, setAiDiscordOptLoading] = useState(false);
  const [aiPatreon, setAiPatreon] = useState<any>(null);
  const [aiPatreonLoading, setAiPatreonLoading] = useState(false);
  const [aiSubstack, setAiSubstack] = useState<any>(null);
  const [aiSubstackLoading, setAiSubstackLoading] = useState(false);
  const [aiGumroad, setAiGumroad] = useState<any>(null);
  const [aiGumroadLoading, setAiGumroadLoading] = useState(false);
  const [aiTeachable, setAiTeachable] = useState<any>(null);
  const [aiTeachableLoading, setAiTeachableLoading] = useState(false);
  const [aiBuyMeCoffee, setAiBuyMeCoffee] = useState<any>(null);
  const [aiBuyMeCoffeeLoading, setAiBuyMeCoffeeLoading] = useState(false);
  const [aiChaturbate, setAiChaturbate] = useState<any>(null);
  const [aiChaturbateLoading, setAiChaturbateLoading] = useState(false);

  useEffect(() => {
    const cachedTeam = sessionStorage.getItem("aiTeamManager");

    if (cachedTeam) {

      try { const e = JSON.parse(cachedTeam); if (e.ts && Date.now() - e.ts < 1800000) { setAiTeam(e.data); setAiTeamLoading(false); } else { sessionStorage.removeItem("aiTeamManager"); setAiTeamLoading(false); } } catch { setAiTeamLoading(false); }

    } else {
      apiRequest("POST", "/api/ai/team-manager")
        .then((res) => res.json())
        .then((data) => { setAiTeam(data); sessionStorage.setItem("aiTeamManager", JSON.stringify({ data: data, ts: Date.now() })); })
        .catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); })
        .finally(() => setAiTeamLoading(false));
    }
    const cachedAuto = sessionStorage.getItem("aiAutomationBuilder");

    if (cachedAuto) {

      try { const e = JSON.parse(cachedAuto); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutomations(e.data); setAiAutomationsLoading(false); } else { sessionStorage.removeItem("aiAutomationBuilder"); setAiAutomationsLoading(false); } } catch { setAiAutomationsLoading(false); }

    } else {
      apiRequest("POST", "/api/ai/automation-builder")
        .then((res) => res.json())
        .then((data) => { setAiAutomations(data); sessionStorage.setItem("aiAutomationBuilder", JSON.stringify({ data: data, ts: Date.now() })); })
        .catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); })
        .finally(() => setAiAutomationsLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hiring");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiHiring(e.data); return; } else { sessionStorage.removeItem("ai_hiring"); } } catch {} }
    setAiHiringLoading(true);
    apiRequest("POST", "/api/ai/hiring", {}).then(r => r.json()).then(d => { setAiHiring(d); sessionStorage.setItem("ai_hiring", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiHiringLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_freelance");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFreelance(e.data); return; } else { sessionStorage.removeItem("ai_freelance"); } } catch {} }
    setAiFreelanceLoading(true);
    apiRequest("POST", "/api/ai/freelancer", {}).then(r => r.json()).then(d => { setAiFreelance(d); sessionStorage.setItem("ai_freelance", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiFreelanceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sop");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSOP(e.data); return; } else { sessionStorage.removeItem("ai_sop"); } } catch {} }
    setAiSOPLoading(true);
    apiRequest("POST", "/api/ai/sop-builder", {}).then(r => r.json()).then(d => { setAiSOP(d); sessionStorage.setItem("ai_sop", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSOPLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_timeline");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTimeline(e.data); return; } else { sessionStorage.removeItem("ai_timeline"); } } catch {} }
    setAiTimelineLoading(true);
    apiRequest("POST", "/api/ai/project-timeline", {}).then(r => r.json()).then(d => { setAiTimeline(d); sessionStorage.setItem("ai_timeline", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTimelineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_approval");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiApproval(e.data); return; } else { sessionStorage.removeItem("ai_approval"); } } catch {} }
    setAiApprovalLoading(true);
    apiRequest("POST", "/api/ai/approval-flow", {}).then(r => r.json()).then(d => { setAiApproval(d); sessionStorage.setItem("ai_approval", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiApprovalLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_edit_checklist");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEditChecklist(e.data); return; } else { sessionStorage.removeItem("ai_edit_checklist"); } } catch {} }
    setAiEditChecklistLoading(true);
    apiRequest("POST", "/api/ai/editing-checklist", {}).then(r => r.json()).then(d => { setAiEditChecklist(d); sessionStorage.setItem("ai_edit_checklist", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEditChecklistLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_prod_budget");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiProdBudget(e.data); return; } else { sessionStorage.removeItem("ai_prod_budget"); } } catch {} }
    setAiProdBudgetLoading(true);
    apiRequest("POST", "/api/ai/production-budget", {}).then(r => r.json()).then(d => { setAiProdBudget(d); sessionStorage.setItem("ai_prod_budget", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiProdBudgetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_equip");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEquip(e.data); return; } else { sessionStorage.removeItem("ai_equip"); } } catch {} }
    setAiEquipLoading(true);
    apiRequest("POST", "/api/ai/equipment", {}).then(r => r.json()).then(d => { setAiEquip(d); sessionStorage.setItem("ai_equip", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEquipLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_studio");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStudio(e.data); return; } else { sessionStorage.removeItem("ai_studio"); } } catch {} }
    setAiStudioLoading(true);
    apiRequest("POST", "/api/ai/studio-setup", {}).then(r => r.json()).then(d => { setAiStudio(d); sessionStorage.setItem("ai_studio", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiStudioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_workflow");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWorkflow(e.data); return; } else { sessionStorage.removeItem("ai_workflow"); } } catch {} }
    setAiWorkflowLoading(true);
    apiRequest("POST", "/api/ai/workflow-optimizer", {}).then(r => r.json()).then(d => { setAiWorkflow(d); sessionStorage.setItem("ai_workflow", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWorkflowLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_batch_rec");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBatchRec(e.data); return; } else { sessionStorage.removeItem("ai_batch_rec"); } } catch {} }
    setAiBatchRecLoading(true);
    apiRequest("POST", "/api/ai/batch-recording", {}).then(r => r.json()).then(d => { setAiBatchRec(d); sessionStorage.setItem("ai_batch_rec", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBatchRecLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_outsource");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiOutsource(e.data); return; } else { sessionStorage.removeItem("ai_outsource"); } } catch {} }
    setAiOutsourceLoading(true);
    apiRequest("POST", "/api/ai/outsourcing", {}).then(r => r.json()).then(d => { setAiOutsource(d); sessionStorage.setItem("ai_outsource", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiOutsourceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tool_stack");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiToolStack(e.data); return; } else { sessionStorage.removeItem("ai_tool_stack"); } } catch {} }
    setAiToolStackLoading(true);
    apiRequest("POST", "/api/ai/tool-stack", {}).then(r => r.json()).then(d => { setAiToolStack(d); sessionStorage.setItem("ai_tool_stack", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiToolStackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_delegation2");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDelegation(e.data); return; } else { sessionStorage.removeItem("ai_delegation2"); } } catch {} }
    setAiDelegationLoading(true);
    apiRequest("POST", "/api/ai/delegation", {}).then(r => r.json()).then(d => { setAiDelegation(d); sessionStorage.setItem("ai_delegation2", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDelegationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_time_mgmt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTimeMgmt(e.data); return; } else { sessionStorage.removeItem("ai_time_mgmt"); } } catch {} }
    setAiTimeMgmtLoading(true);
    apiRequest("POST", "/api/ai/time-management", {}).then(r => r.json()).then(d => { setAiTimeMgmt(d); sessionStorage.setItem("ai_time_mgmt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTimeMgmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mastermind");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMastermind(e.data); return; } else { sessionStorage.removeItem("ai_mastermind"); } } catch {} }
    setAiMastermindLoading(true);
    apiRequest("POST", "/api/ai/mastermind", {}).then(r => r.json()).then(d => { setAiMastermind(d); sessionStorage.setItem("ai_mastermind", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMastermindLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_productivity");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiProductivity(e.data); return; } else { sessionStorage.removeItem("ai_productivity"); } } catch {} }
    setAiProductivityLoading(true);
    apiRequest("POST", "/api/ai/productivity", {}).then(r => r.json()).then(d => { setAiProductivity(d); sessionStorage.setItem("ai_productivity", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiProductivityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_voice");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandVoice(e.data); return; } else { sessionStorage.removeItem("ai_brand_voice"); } } catch {} }
    setAiBrandVoiceLoading(true);
    apiRequest("POST", "/api/ai/brand-voice", {}).then(r => r.json()).then(d => { setAiBrandVoice(d); sessionStorage.setItem("ai_brand_voice", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandVoiceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_colors");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandColors(e.data); return; } else { sessionStorage.removeItem("ai_brand_colors"); } } catch {} }
    setAiBrandColorsLoading(true);
    apiRequest("POST", "/api/ai/brand-colors", {}).then(r => r.json()).then(d => { setAiBrandColors(d); sessionStorage.setItem("ai_brand_colors", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandColorsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_fonts");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandFonts(e.data); return; } else { sessionStorage.removeItem("ai_brand_fonts"); } } catch {} }
    setAiBrandFontsLoading(true);
    apiRequest("POST", "/api/ai/brand-fonts", {}).then(r => r.json()).then(d => { setAiBrandFonts(d); sessionStorage.setItem("ai_brand_fonts", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandFontsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_story");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandStory(e.data); return; } else { sessionStorage.removeItem("ai_brand_story"); } } catch {} }
    setAiBrandStoryLoading(true);
    apiRequest("POST", "/api/ai/brand-story", {}).then(r => r.json()).then(d => { setAiBrandStory(d); sessionStorage.setItem("ai_brand_story", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandStoryLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_consist");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandConsist(e.data); return; } else { sessionStorage.removeItem("ai_brand_consist"); } } catch {} }
    setAiBrandConsistLoading(true);
    apiRequest("POST", "/api/ai/brand-consistency", {}).then(r => r.json()).then(d => { setAiBrandConsist(d); sessionStorage.setItem("ai_brand_consist", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandConsistLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pillar_refine");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPillarRefine(e.data); return; } else { sessionStorage.removeItem("ai_pillar_refine"); } } catch {} }
    setAiPillarRefineLoading(true);
    apiRequest("POST", "/api/ai/pillar-refine", {}).then(r => r.json()).then(d => { setAiPillarRefine(d); sessionStorage.setItem("ai_pillar_refine", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPillarRefineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_trailer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTrailer(e.data); return; } else { sessionStorage.removeItem("ai_trailer"); } } catch {} }
    setAiTrailerLoading(true);
    apiRequest("POST", "/api/ai/channel-trailer", {}).then(r => r.json()).then(d => { setAiTrailer(d); sessionStorage.setItem("ai_trailer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTrailerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_art_dir");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiArtDir(e.data); return; } else { sessionStorage.removeItem("ai_art_dir"); } } catch {} }
    setAiArtDirLoading(true);
    apiRequest("POST", "/api/ai/art-direction", {}).then(r => r.json()).then(d => { setAiArtDir(d); sessionStorage.setItem("ai_art_dir", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiArtDirLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_usp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiUSP(e.data); return; } else { sessionStorage.removeItem("ai_usp"); } } catch {} }
    setAiUSPLoading(true);
    apiRequest("POST", "/api/ai/usp-finder", {}).then(r => r.json()).then(d => { setAiUSP(d); sessionStorage.setItem("ai_usp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiUSPLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_target_aud");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTargetAud(e.data); return; } else { sessionStorage.removeItem("ai_target_aud"); } } catch {} }
    setAiTargetAudLoading(true);
    apiRequest("POST", "/api/ai/target-audience", {}).then(r => r.json()).then(d => { setAiTargetAud(d); sessionStorage.setItem("ai_target_aud", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTargetAudLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_partner");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandPartner(e.data); return; } else { sessionStorage.removeItem("ai_brand_partner"); } } catch {} }
    setAiBrandPartnerLoading(true);
    apiRequest("POST", "/api/ai/brand-partnerships", {}).then(r => r.json()).then(d => { setAiBrandPartner(d); sessionStorage.setItem("ai_brand_partner", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandPartnerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrisis(e.data); return; } else { sessionStorage.removeItem("ai_crisis"); } } catch {} }
    setAiCrisisLoading(true);
    apiRequest("POST", "/api/ai/crisis-comms", {}).then(r => r.json()).then(d => { setAiCrisis(d); sessionStorage.setItem("ai_crisis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_personal_brand");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPersonalBrand(e.data); return; } else { sessionStorage.removeItem("ai_personal_brand"); } } catch {} }
    setAiPersonalBrandLoading(true);
    apiRequest("POST", "/api/ai/personal-brand", {}).then(r => r.json()).then(d => { setAiPersonalBrand(d); sessionStorage.setItem("ai_personal_brand", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPersonalBrandLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_evolution");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandEvolution(e.data); return; } else { sessionStorage.removeItem("ai_brand_evolution"); } } catch {} }
    setAiBrandEvolutionLoading(true);
    apiRequest("POST", "/api/ai/brand-evolution", {}).then(r => r.json()).then(d => { setAiBrandEvolution(d); sessionStorage.setItem("ai_brand_evolution", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandEvolutionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_diff");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompDiff(e.data); return; } else { sessionStorage.removeItem("ai_comp_diff"); } } catch {} }
    setAiCompDiffLoading(true);
    apiRequest("POST", "/api/ai/competitor-diff", {}).then(r => r.json()).then(d => { setAiCompDiff(d); sessionStorage.setItem("ai_comp_diff", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompDiffLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_brief");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabBrief(e.data); return; } else { sessionStorage.removeItem("ai_collab_brief"); } } catch {} }
    setAiCollabBriefLoading(true);
    apiRequest("POST", "/api/ai/collab-brief", {}).then(r => r.json()).then(d => { setAiCollabBrief(d); sessionStorage.setItem("ai_collab_brief", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabBriefLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_network_prep");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNetworkPrep(e.data); return; } else { sessionStorage.removeItem("ai_network_prep"); } } catch {} }
    setAiNetworkPrepLoading(true);
    apiRequest("POST", "/api/ai/networking-prep", {}).then(r => r.json()).then(d => { setAiNetworkPrep(d); sessionStorage.setItem("ai_network_prep", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNetworkPrepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mentorship");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMentorship(e.data); return; } else { sessionStorage.removeItem("ai_mentorship"); } } catch {} }
    setAiMentorshipLoading(true);
    apiRequest("POST", "/api/ai/mentorship", {}).then(r => r.json()).then(d => { setAiMentorship(d); sessionStorage.setItem("ai_mentorship", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMentorshipLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_yt_api");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiYTAPI(e.data); return; } else { sessionStorage.removeItem("ai_yt_api"); } } catch {} }
    setAiYTAPILoading(true);
    apiRequest("POST", "/api/ai/youtube-api", {}).then(r => r.json()).then(d => { setAiYTAPI(d); sessionStorage.setItem("ai_yt_api", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiYTAPILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_twitch");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTwitch(e.data); return; } else { sessionStorage.removeItem("ai_twitch"); } } catch {} }
    setAiTwitchLoading(true);
    apiRequest("POST", "/api/ai/twitch-integration", {}).then(r => r.json()).then(d => { setAiTwitch(d); sessionStorage.setItem("ai_twitch", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTwitchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_discord_bot");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDiscordBot(e.data); return; } else { sessionStorage.removeItem("ai_discord_bot"); } } catch {} }
    setAiDiscordBotLoading(true);
    apiRequest("POST", "/api/ai/discord-bot", {}).then(r => r.json()).then(d => { setAiDiscordBot(d); sessionStorage.setItem("ai_discord_bot", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDiscordBotLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ga");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGA(e.data); return; } else { sessionStorage.removeItem("ai_ga"); } } catch {} }
    setAiGALoading(true);
    apiRequest("POST", "/api/ai/ga-setup", {}).then(r => r.json()).then(d => { setAiGA(d); sessionStorage.setItem("ai_ga", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiGALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_social_sched");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSocialSched(e.data); return; } else { sessionStorage.removeItem("ai_social_sched"); } } catch {} }
    setAiSocialSchedLoading(true);
    apiRequest("POST", "/api/ai/social-scheduler", {}).then(r => r.json()).then(d => { setAiSocialSched(d); sessionStorage.setItem("ai_social_sched", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSocialSchedLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_mkt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEmailMkt(e.data); return; } else { sessionStorage.removeItem("ai_email_mkt"); } } catch {} }
    setAiEmailMktLoading(true);
    apiRequest("POST", "/api/ai/email-marketing", {}).then(r => r.json()).then(d => { setAiEmailMkt(d); sessionStorage.setItem("ai_email_mkt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEmailMktLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_podcast");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPodcast(e.data); return; } else { sessionStorage.removeItem("ai_podcast"); } } catch {} }
    setAiPodcastLoading(true);
    apiRequest("POST", "/api/ai/podcast", {}).then(r => r.json()).then(d => { setAiPodcast(d); sessionStorage.setItem("ai_podcast", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPodcastLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_webhooks");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWebhooks(e.data); return; } else { sessionStorage.removeItem("ai_webhooks"); } } catch {} }
    setAiWebhooksLoading(true);
    apiRequest("POST", "/api/ai/webhook-manager", {}).then(r => r.json()).then(d => { setAiWebhooks(d); sessionStorage.setItem("ai_webhooks", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWebhooksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rate_limits");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRateLimits(e.data); return; } else { sessionStorage.removeItem("ai_rate_limits"); } } catch {} }
    setAiRateLimitsLoading(true);
    apiRequest("POST", "/api/ai/rate-limits", {}).then(r => r.json()).then(d => { setAiRateLimits(d); sessionStorage.setItem("ai_rate_limits", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiRateLimitsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_backup_plan");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBackupPlan(e.data); return; } else { sessionStorage.removeItem("ai_backup_plan"); } } catch {} }
    setAiBackupPlanLoading(true);
    apiRequest("POST", "/api/ai/data-backup", {}).then(r => r.json()).then(d => { setAiBackupPlan(d); sessionStorage.setItem("ai_backup_plan", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBackupPlanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_notif_opt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNotifOpt(e.data); return; } else { sessionStorage.removeItem("ai_notif_opt"); } } catch {} }
    setAiNotifOptLoading(true);
    apiRequest("POST", "/api/ai/notification-optimizer", {}).then(r => r.json()).then(d => { setAiNotifOpt(d); sessionStorage.setItem("ai_notif_opt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNotifOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cross_post");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrossPost(e.data); return; } else { sessionStorage.removeItem("ai_cross_post"); } } catch {} }
    setAiCrossPostLoading(true);
    apiRequest("POST", "/api/ai/cross-post", {}).then(r => r.json()).then(d => { setAiCrossPost(d); sessionStorage.setItem("ai_cross_post", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCrossPostLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_linktree");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLinktree(e.data); return; } else { sessionStorage.removeItem("ai_linktree"); } } catch {} }
    setAiLinktreeLoading(true);
    apiRequest("POST", "/api/ai/linktree", {}).then(r => r.json()).then(d => { setAiLinktree(d); sessionStorage.setItem("ai_linktree", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiLinktreeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_qr_codes");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiQRCodes(e.data); return; } else { sessionStorage.removeItem("ai_qr_codes"); } } catch {} }
    setAiQRCodesLoading(true);
    apiRequest("POST", "/api/ai/qr-codes", {}).then(r => r.json()).then(d => { setAiQRCodes(d); sessionStorage.setItem("ai_qr_codes", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiQRCodesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_chatbot");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiChatbot(e.data); return; } else { sessionStorage.removeItem("ai_chatbot"); } } catch {} }
    setAiChatbotLoading(true);
    apiRequest("POST", "/api/ai/chatbot-integrator", {}).then(r => r.json()).then(d => { setAiChatbot(d); sessionStorage.setItem("ai_chatbot", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiChatbotLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_analytics_dash");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAnalyticsDash(e.data); return; } else { sessionStorage.removeItem("ai_analytics_dash"); } } catch {} }
    setAiAnalyticsDashLoading(true);
    apiRequest("POST", "/api/ai/analytics-dashboard", {}).then(r => r.json()).then(d => { setAiAnalyticsDash(d); sessionStorage.setItem("ai_analytics_dash", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAnalyticsDashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cdn");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCDN(e.data); return; } else { sessionStorage.removeItem("ai_cdn"); } } catch {} }
    setAiCDNLoading(true);
    apiRequest("POST", "/api/ai/cdn-optimizer", {}).then(r => r.json()).then(d => { setAiCDN(d); sessionStorage.setItem("ai_cdn", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCDNLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_accessibility");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAccessibility(e.data); return; } else { sessionStorage.removeItem("ai_accessibility"); } } catch {} }
    setAiAccessibilityLoading(true);
    apiRequest("POST", "/api/ai/accessibility", {}).then(r => r.json()).then(d => { setAiAccessibility(d); sessionStorage.setItem("ai_accessibility", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAccessibilityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_device_test");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDeviceTest(e.data); return; } else { sessionStorage.removeItem("ai_device_test"); } } catch {} }
    setAiDeviceTestLoading(true);
    apiRequest("POST", "/api/ai/device-testing", {}).then(r => r.json()).then(d => { setAiDeviceTest(d); sessionStorage.setItem("ai_device_test", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDeviceTestLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_perf_mon");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPerfMon(e.data); return; } else { sessionStorage.removeItem("ai_perf_mon"); } } catch {} }
    setAiPerfMonLoading(true);
    apiRequest("POST", "/api/ai/performance-monitor", {}).then(r => r.json()).then(d => { setAiPerfMon(d); sessionStorage.setItem("ai_perf_mon", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPerfMonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_security_audit");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSecurityAudit(e.data); return; } else { sessionStorage.removeItem("ai_security_audit"); } } catch {} }
    setAiSecurityAuditLoading(true);
    apiRequest("POST", "/api/ai/security-audit", {}).then(r => r.json()).then(d => { setAiSecurityAudit(d); sessionStorage.setItem("ai_security_audit", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSecurityAuditLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cookie_consent");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCookieConsent(e.data); return; } else { sessionStorage.removeItem("ai_cookie_consent"); } } catch {} }
    setAiCookieConsentLoading(true);
    apiRequest("POST", "/api/ai/cookie-consent", {}).then(r => r.json()).then(d => { setAiCookieConsent(d); sessionStorage.setItem("ai_cookie_consent", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCookieConsentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_age_gate");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAgeGate(e.data); return; } else { sessionStorage.removeItem("ai_age_gate"); } } catch {} }
    setAiAgeGateLoading(true);
    apiRequest("POST", "/api/ai/age-gating", {}).then(r => r.json()).then(d => { setAiAgeGate(d); sessionStorage.setItem("ai_age_gate", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAgeGateLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_retention");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDataRetention(e.data); return; } else { sessionStorage.removeItem("ai_data_retention"); } } catch {} }
    setAiDataRetentionLoading(true);
    apiRequest("POST", "/api/ai/data-retention", {}).then(r => r.json()).then(d => { setAiDataRetention(d); sessionStorage.setItem("ai_data_retention", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDataRetentionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_incident_resp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIncidentResp(e.data); return; } else { sessionStorage.removeItem("ai_incident_resp"); } } catch {} }
    setAiIncidentRespLoading(true);
    apiRequest("POST", "/api/ai/incident-response", {}).then(r => r.json()).then(d => { setAiIncidentResp(d); sessionStorage.setItem("ai_incident_resp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIncidentRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shortcuts");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiShortcuts(e.data); return; } else { sessionStorage.removeItem("ai_shortcuts"); } } catch {} }
    setAiShortcutsLoading(true);
    apiRequest("POST", "/api/ai/shortcuts", {}).then(r => r.json()).then(d => { setAiShortcuts(d); sessionStorage.setItem("ai_shortcuts", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiShortcutsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_adv_search");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAdvSearch(e.data); return; } else { sessionStorage.removeItem("ai_adv_search"); } } catch {} }
    setAiAdvSearchLoading(true);
    apiRequest("POST", "/api/ai/advanced-search", {}).then(r => r.json()).then(d => { setAiAdvSearch(d); sessionStorage.setItem("ai_adv_search", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAdvSearchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_bulk_upload");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBulkUpload(e.data); return; } else { sessionStorage.removeItem("ai_bulk_upload"); } } catch {} }
    setAiBulkUploadLoading(true);
    apiRequest("POST", "/api/ai/bulk-upload", {}).then(r => r.json()).then(d => { setAiBulkUpload(d); sessionStorage.setItem("ai_bulk_upload", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBulkUploadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_playlist_org");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPlaylistOrg(e.data); return; } else { sessionStorage.removeItem("ai_playlist_org"); } } catch {} }
    setAiPlaylistOrgLoading(true);
    apiRequest("POST", "/api/ai/playlist-organizer", {}).then(r => r.json()).then(d => { setAiPlaylistOrg(d); sessionStorage.setItem("ai_playlist_org", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPlaylistOrgLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_acct");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMultiAcct(e.data); return; } else { sessionStorage.removeItem("ai_multi_acct"); } } catch {} }
    setAiMultiAcctLoading(true);
    apiRequest("POST", "/api/ai/multi-account", {}).then(r => r.json()).then(d => { setAiMultiAcct(d); sessionStorage.setItem("ai_multi_acct", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMultiAcctLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cust_dash");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCustDash(e.data); return; } else { sessionStorage.removeItem("ai_cust_dash"); } } catch {} }
    setAiCustDashLoading(true);
    apiRequest("POST", "/api/ai/custom-dashboard", {}).then(r => r.json()).then(d => { setAiCustDash(d); sessionStorage.setItem("ai_cust_dash", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCustDashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_tag");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoTag(e.data); return; } else { sessionStorage.removeItem("ai_auto_tag"); } } catch {} }
    setAiAutoTagLoading(true);
    apiRequest("POST", "/api/ai/auto-tagging", {}).then(r => r.json()).then(d => { setAiAutoTag(d); sessionStorage.setItem("ai_auto_tag", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoTagLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_smart_notif");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSmartNotif(e.data); return; } else { sessionStorage.removeItem("ai_smart_notif"); } } catch {} }
    setAiSmartNotifLoading(true);
    apiRequest("POST", "/api/ai/smart-notifications", {}).then(r => r.json()).then(d => { setAiSmartNotif(d); sessionStorage.setItem("ai_smart_notif", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSmartNotifLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_templates");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTemplates(e.data); return; } else { sessionStorage.removeItem("ai_templates"); } } catch {} }
    setAiTemplatesLoading(true);
    apiRequest("POST", "/api/ai/template-library", {}).then(r => r.json()).then(d => { setAiTemplates(d); sessionStorage.setItem("ai_templates", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTemplatesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_macros");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMacros(e.data); return; } else { sessionStorage.removeItem("ai_macros"); } } catch {} }
    setAiMacrosLoading(true);
    apiRequest("POST", "/api/ai/macro-builder", {}).then(r => r.json()).then(d => { setAiMacros(d); sessionStorage.setItem("ai_macros", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMacrosLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gamification");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGamification(e.data); return; } else { sessionStorage.removeItem("ai_gamification"); } } catch {} }
    setAiGamificationLoading(true);
    apiRequest("POST", "/api/ai/gamification", {}).then(r => r.json()).then(d => { setAiGamification(d); sessionStorage.setItem("ai_gamification", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiGamificationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_personalize");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPersonalize(e.data); return; } else { sessionStorage.removeItem("ai_personalize"); } } catch {} }
    setAiPersonalizeLoading(true);
    apiRequest("POST", "/api/ai/personalization", {}).then(r => r.json()).then(d => { setAiPersonalize(d); sessionStorage.setItem("ai_personalize", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPersonalizeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_dna");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContentDNA(e.data); return; } else { sessionStorage.removeItem("ai_content_dna"); } } catch {} }
    setAiContentDNALoading(true);
    apiRequest("POST", "/api/ai/content-dna", {}).then(r => r.json()).then(d => { setAiContentDNA(d); sessionStorage.setItem("ai_content_dna", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiContentDNALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_algo_sim");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAlgoSim(e.data); return; } else { sessionStorage.removeItem("ai_algo_sim"); } } catch {} }
    setAiAlgoSimLoading(true);
    apiRequest("POST", "/api/ai/algorithm-sim", {}).then(r => r.json()).then(d => { setAiAlgoSim(d); sessionStorage.setItem("ai_algo_sim", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAlgoSimLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_viz");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDataViz(e.data); return; } else { sessionStorage.removeItem("ai_data_viz"); } } catch {} }
    setAiDataVizLoading(true);
    apiRequest("POST", "/api/ai/data-viz", {}).then(r => r.json()).then(d => { setAiDataViz(d); sessionStorage.setItem("ai_data_viz", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDataVizLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vr");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVR(e.data); return; } else { sessionStorage.removeItem("ai_vr"); } } catch {} }
    setAiVRLoading(true);
    apiRequest("POST", "/api/ai/vr-content", {}).then(r => r.json()).then(d => { setAiVR(d); sessionStorage.setItem("ai_vr", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ar");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAR(e.data); return; } else { sessionStorage.removeItem("ai_ar"); } } catch {} }
    setAiARLoading(true);
    apiRequest("POST", "/api/ai/ar-filters", {}).then(r => r.json()).then(d => { setAiAR(d); sessionStorage.setItem("ai_ar", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiARLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voiceover");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVoiceover(e.data); return; } else { sessionStorage.removeItem("ai_voiceover"); } } catch {} }
    setAiVoiceoverLoading(true);
    apiRequest("POST", "/api/ai/voiceover", {}).then(r => r.json()).then(d => { setAiVoiceover(d); sessionStorage.setItem("ai_voiceover", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVoiceoverLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_deepfake");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDeepfake(e.data); return; } else { sessionStorage.removeItem("ai_deepfake"); } } catch {} }
    setAiDeepfakeLoading(true);
    apiRequest("POST", "/api/ai/deepfake-detector", {}).then(r => r.json()).then(d => { setAiDeepfake(d); sessionStorage.setItem("ai_deepfake", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDeepfakeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_blockchain");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBlockchain(e.data); return; } else { sessionStorage.removeItem("ai_blockchain"); } } catch {} }
    setAiBlockchainLoading(true);
    apiRequest("POST", "/api/ai/blockchain-verify", {}).then(r => r.json()).then(d => { setAiBlockchain(d); sessionStorage.setItem("ai_blockchain", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBlockchainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pred_trends");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPredTrends(e.data); return; } else { sessionStorage.removeItem("ai_pred_trends"); } } catch {} }
    setAiPredTrendsLoading(true);
    apiRequest("POST", "/api/ai/predictive-trends", {}).then(r => r.json()).then(d => { setAiPredTrends(d); sessionStorage.setItem("ai_pred_trends", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPredTrendsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_graph");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContentGraph(e.data); return; } else { sessionStorage.removeItem("ai_content_graph"); } } catch {} }
    setAiContentGraphLoading(true);
    apiRequest("POST", "/api/ai/content-graph", {}).then(r => r.json()).then(d => { setAiContentGraph(d); sessionStorage.setItem("ai_content_graph", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiContentGraphLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_psychograph");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPsychograph(e.data); return; } else { sessionStorage.removeItem("ai_psychograph"); } } catch {} }
    setAiPsychographLoading(true);
    apiRequest("POST", "/api/ai/psychographics", {}).then(r => r.json()).then(d => { setAiPsychograph(d); sessionStorage.setItem("ai_psychograph", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPsychographLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_neuro_mkt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNeuroMkt(e.data); return; } else { sessionStorage.removeItem("ai_neuro_mkt"); } } catch {} }
    setAiNeuroMktLoading(true);
    apiRequest("POST", "/api/ai/neuro-marketing", {}).then(r => r.json()).then(d => { setAiNeuroMkt(d); sessionStorage.setItem("ai_neuro_mkt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNeuroMktLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sent_pred");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSentPred(e.data); return; } else { sessionStorage.removeItem("ai_sent_pred"); } } catch {} }
    setAiSentPredLoading(true);
    apiRequest("POST", "/api/ai/sentiment-predict", {}).then(r => r.json()).then(d => { setAiSentPred(d); sessionStorage.setItem("ai_sent_pred", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSentPredLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_econ");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCreatorEcon(e.data); return; } else { sessionStorage.removeItem("ai_creator_econ"); } } catch {} }
    setAiCreatorEconLoading(true);
    apiRequest("POST", "/api/ai/creator-economy", {}).then(r => r.json()).then(d => { setAiCreatorEcon(d); sessionStorage.setItem("ai_creator_econ", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCreatorEconLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_web3");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWeb3(e.data); return; } else { sessionStorage.removeItem("ai_web3"); } } catch {} }
    setAiWeb3Loading(true);
    apiRequest("POST", "/api/ai/web3-tools", {}).then(r => r.json()).then(d => { setAiWeb3(d); sessionStorage.setItem("ai_web3", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWeb3Loading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_metaverse");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMetaverse(e.data); return; } else { sessionStorage.removeItem("ai_metaverse"); } } catch {} }
    setAiMetaverseLoading(true);
    apiRequest("POST", "/api/ai/metaverse", {}).then(r => r.json()).then(d => { setAiMetaverse(d); sessionStorage.setItem("ai_metaverse", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMetaverseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_agent_cust");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAgentCust(e.data); return; } else { sessionStorage.removeItem("ai_agent_cust"); } } catch {} }
    setAiAgentCustLoading(true);
    apiRequest("POST", "/api/ai/agent-customizer", {}).then(r => r.json()).then(d => { setAiAgentCust(d); sessionStorage.setItem("ai_agent_cust", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAgentCustLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_api");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCreatorAPI(e.data); return; } else { sessionStorage.removeItem("ai_creator_api"); } } catch {} }
    setAiCreatorAPILoading(true);
    apiRequest("POST", "/api/ai/creator-api", {}).then(r => r.json()).then(d => { setAiCreatorAPI(d); sessionStorage.setItem("ai_creator_api", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCreatorAPILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_launch");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPodLaunch(e.data); return; } else { sessionStorage.removeItem("ai_pod_launch"); } } catch {} }
    setAiPodLaunchLoading(true);
    apiRequest("POST", "/api/ai/podcast-launch", {}).then(r => r.json()).then(d => { setAiPodLaunch(d); sessionStorage.setItem("ai_pod_launch", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPodLaunchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_episode");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPodEpisode(e.data); return; } else { sessionStorage.removeItem("ai_pod_episode"); } } catch {} }
    setAiPodEpisodeLoading(true);
    apiRequest("POST", "/api/ai/podcast-episode", {}).then(r => r.json()).then(d => { setAiPodEpisode(d); sessionStorage.setItem("ai_pod_episode", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPodEpisodeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_seo");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPodSEO(e.data); return; } else { sessionStorage.removeItem("ai_pod_seo"); } } catch {} }
    setAiPodSEOLoading(true);
    apiRequest("POST", "/api/ai/podcast-seo", {}).then(r => r.json()).then(d => { setAiPodSEO(d); sessionStorage.setItem("ai_pod_seo", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPodSEOLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_brand");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAudioBrand(e.data); return; } else { sessionStorage.removeItem("ai_audio_brand"); } } catch {} }
    setAiAudioBrandLoading(true);
    apiRequest("POST", "/api/ai/audio-branding", {}).then(r => r.json()).then(d => { setAiAudioBrand(d); sessionStorage.setItem("ai_audio_brand", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAudioBrandLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_music_comp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMusicComp(e.data); return; } else { sessionStorage.removeItem("ai_music_comp"); } } catch {} }
    setAiMusicCompLoading(true);
    apiRequest("POST", "/api/ai/music-composer", {}).then(r => r.json()).then(d => { setAiMusicComp(d); sessionStorage.setItem("ai_music_comp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMusicCompLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_asmr");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiASMR(e.data); return; } else { sessionStorage.removeItem("ai_asmr"); } } catch {} }
    setAiASMRLoading(true);
    apiRequest("POST", "/api/ai/asmr", {}).then(r => r.json()).then(d => { setAiASMR(d); sessionStorage.setItem("ai_asmr", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiASMRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_train");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVoiceTrain(e.data); return; } else { sessionStorage.removeItem("ai_voice_train"); } } catch {} }
    setAiVoiceTrainLoading(true);
    apiRequest("POST", "/api/ai/voice-training", {}).then(r => r.json()).then(d => { setAiVoiceTrain(d); sessionStorage.setItem("ai_voice_train", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVoiceTrainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_mix");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAudioMix(e.data); return; } else { sessionStorage.removeItem("ai_audio_mix"); } } catch {} }
    setAiAudioMixLoading(true);
    apiRequest("POST", "/api/ai/audio-mixing", {}).then(r => r.json()).then(d => { setAiAudioMix(d); sessionStorage.setItem("ai_audio_mix", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAudioMixLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pass_sec");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPassSec(e.data); return; } else { sessionStorage.removeItem("ai_pass_sec"); } } catch {} }
    setAiPassSecLoading(true);
    apiRequest("POST", "/api/ai/password-security", {}).then(r => r.json()).then(d => { setAiPassSec(d); sessionStorage.setItem("ai_pass_sec", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPassSecLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_phishing");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPhishing(e.data); return; } else { sessionStorage.removeItem("ai_phishing"); } } catch {} }
    setAiPhishingLoading(true);
    apiRequest("POST", "/api/ai/phishing", {}).then(r => r.json()).then(d => { setAiPhishing(d); sessionStorage.setItem("ai_phishing", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPhishingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_acct_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAcctRecov(e.data); return; } else { sessionStorage.removeItem("ai_acct_recov"); } } catch {} }
    setAiAcctRecovLoading(true);
    apiRequest("POST", "/api/ai/account-recovery", {}).then(r => r.json()).then(d => { setAiAcctRecov(d); sessionStorage.setItem("ai_acct_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAcctRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_priv_settings");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPrivSettings(e.data); return; } else { sessionStorage.removeItem("ai_priv_settings"); } } catch {} }
    setAiPrivSettingsLoading(true);
    apiRequest("POST", "/api/ai/privacy-settings", {}).then(r => r.json()).then(d => { setAiPrivSettings(d); sessionStorage.setItem("ai_priv_settings", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPrivSettingsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_breach");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDataBreach(e.data); return; } else { sessionStorage.removeItem("ai_data_breach"); } } catch {} }
    setAiDataBreachLoading(true);
    apiRequest("POST", "/api/ai/data-breach", {}).then(r => r.json()).then(d => { setAiDataBreach(d); sessionStorage.setItem("ai_data_breach", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDataBreachLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vpn");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVPN(e.data); return; } else { sessionStorage.removeItem("ai_vpn"); } } catch {} }
    setAiVPNLoading(true);
    apiRequest("POST", "/api/ai/vpn", {}).then(r => r.json()).then(d => { setAiVPN(d); sessionStorage.setItem("ai_vpn", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVPNLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_algo");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTAlgo(e.data); return; } else { sessionStorage.removeItem("ai_tt_algo"); } } catch {} }
    setAiTTAlgoLoading(true);
    apiRequest("POST", "/api/ai/tiktok-algorithm", {}).then(r => r.json()).then(d => { setAiTTAlgo(d); sessionStorage.setItem("ai_tt_algo", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTAlgoLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_sounds");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTSounds(e.data); return; } else { sessionStorage.removeItem("ai_tt_sounds"); } } catch {} }
    setAiTTSoundsLoading(true);
    apiRequest("POST", "/api/ai/tiktok-sounds", {}).then(r => r.json()).then(d => { setAiTTSounds(d); sessionStorage.setItem("ai_tt_sounds", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTSoundsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_duet");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTDuet(e.data); return; } else { sessionStorage.removeItem("ai_tt_duet"); } } catch {} }
    setAiTTDuetLoading(true);
    apiRequest("POST", "/api/ai/tiktok-duet", {}).then(r => r.json()).then(d => { setAiTTDuet(d); sessionStorage.setItem("ai_tt_duet", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTDuetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_live");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTLive(e.data); return; } else { sessionStorage.removeItem("ai_tt_live"); } } catch {} }
    setAiTTLiveLoading(true);
    apiRequest("POST", "/api/ai/tiktok-live", {}).then(r => r.json()).then(d => { setAiTTLive(d); sessionStorage.setItem("ai_tt_live", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTLiveLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_shop");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTShop(e.data); return; } else { sessionStorage.removeItem("ai_tt_shop"); } } catch {} }
    setAiTTShopLoading(true);
    apiRequest("POST", "/api/ai/tiktok-shop", {}).then(r => r.json()).then(d => { setAiTTShop(d); sessionStorage.setItem("ai_tt_shop", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTShopLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_fund");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTFund(e.data); return; } else { sessionStorage.removeItem("ai_tt_fund"); } } catch {} }
    setAiTTFundLoading(true);
    apiRequest("POST", "/api/ai/tiktok-fund", {}).then(r => r.json()).then(d => { setAiTTFund(d); sessionStorage.setItem("ai_tt_fund", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTFundLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_hash");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTHash(e.data); return; } else { sessionStorage.removeItem("ai_tt_hash"); } } catch {} }
    setAiTTHashLoading(true);
    apiRequest("POST", "/api/ai/tiktok-hashtags", {}).then(r => r.json()).then(d => { setAiTTHash(d); sessionStorage.setItem("ai_tt_hash", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTHashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_profile");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTTProfile(e.data); return; } else { sessionStorage.removeItem("ai_tt_profile"); } } catch {} }
    setAiTTProfileLoading(true);
    apiRequest("POST", "/api/ai/tiktok-profile", {}).then(r => r.json()).then(d => { setAiTTProfile(d); sessionStorage.setItem("ai_tt_profile", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTTProfileLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_reels");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGReels(e.data); return; } else { sessionStorage.removeItem("ai_ig_reels"); } } catch {} }
    setAiIGReelsLoading(true);
    apiRequest("POST", "/api/ai/ig-reels", {}).then(r => r.json()).then(d => { setAiIGReels(d); sessionStorage.setItem("ai_ig_reels", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGReelsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_stories");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGStories(e.data); return; } else { sessionStorage.removeItem("ai_ig_stories"); } } catch {} }
    setAiIGStoriesLoading(true);
    apiRequest("POST", "/api/ai/ig-stories", {}).then(r => r.json()).then(d => { setAiIGStories(d); sessionStorage.setItem("ai_ig_stories", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGStoriesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_carousel");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGCarousel(e.data); return; } else { sessionStorage.removeItem("ai_ig_carousel"); } } catch {} }
    setAiIGCarouselLoading(true);
    apiRequest("POST", "/api/ai/ig-carousel", {}).then(r => r.json()).then(d => { setAiIGCarousel(d); sessionStorage.setItem("ai_ig_carousel", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGCarouselLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_bio");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGBio(e.data); return; } else { sessionStorage.removeItem("ai_ig_bio"); } } catch {} }
    setAiIGBioLoading(true);
    apiRequest("POST", "/api/ai/ig-bio", {}).then(r => r.json()).then(d => { setAiIGBio(d); sessionStorage.setItem("ai_ig_bio", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGBioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_shop");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGShop(e.data); return; } else { sessionStorage.removeItem("ai_ig_shop"); } } catch {} }
    setAiIGShopLoading(true);
    apiRequest("POST", "/api/ai/ig-shopping", {}).then(r => r.json()).then(d => { setAiIGShop(d); sessionStorage.setItem("ai_ig_shop", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGShopLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_collabs");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGCollabs(e.data); return; } else { sessionStorage.removeItem("ai_ig_collabs"); } } catch {} }
    setAiIGCollabsLoading(true);
    apiRequest("POST", "/api/ai/ig-collabs", {}).then(r => r.json()).then(d => { setAiIGCollabs(d); sessionStorage.setItem("ai_ig_collabs", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGCollabsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_growth");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGGrowth(e.data); return; } else { sessionStorage.removeItem("ai_ig_growth"); } } catch {} }
    setAiIGGrowthLoading(true);
    apiRequest("POST", "/api/ai/ig-growth", {}).then(r => r.json()).then(d => { setAiIGGrowth(d); sessionStorage.setItem("ai_ig_growth", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_aesthetic");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIGAesthetic(e.data); return; } else { sessionStorage.removeItem("ai_ig_aesthetic"); } } catch {} }
    setAiIGAestheticLoading(true);
    apiRequest("POST", "/api/ai/ig-aesthetic", {}).then(r => r.json()).then(d => { setAiIGAesthetic(d); sessionStorage.setItem("ai_ig_aesthetic", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIGAestheticLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_x_growth");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiXGrowth(e.data); return; } else { sessionStorage.removeItem("ai_x_growth"); } } catch {} }
    setAiXGrowthLoading(true);
    apiRequest("POST", "/api/ai/x-growth", {}).then(r => r.json()).then(d => { setAiXGrowth(d); sessionStorage.setItem("ai_x_growth", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiXGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_x_thread");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiXThread(e.data); return; } else { sessionStorage.removeItem("ai_x_thread"); } } catch {} }
    setAiXThreadLoading(true);
    apiRequest("POST", "/api/ai/x-thread", {}).then(r => r.json()).then(d => { setAiXThread(d); sessionStorage.setItem("ai_x_thread", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiXThreadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_creator");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLICreator(e.data); return; } else { sessionStorage.removeItem("ai_li_creator"); } } catch {} }
    setAiLICreatorLoading(true);
    apiRequest("POST", "/api/ai/linkedin-creator", {}).then(r => r.json()).then(d => { setAiLICreator(d); sessionStorage.setItem("ai_li_creator", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiLICreatorLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_article");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLIArticle(e.data); return; } else { sessionStorage.removeItem("ai_li_article"); } } catch {} }
    setAiLIArticleLoading(true);
    apiRequest("POST", "/api/ai/linkedin-article", {}).then(r => r.json()).then(d => { setAiLIArticle(d); sessionStorage.setItem("ai_li_article", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiLIArticleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fb_groups");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFBGroups(e.data); return; } else { sessionStorage.removeItem("ai_fb_groups"); } } catch {} }
    setAiFBGroupsLoading(true);
    apiRequest("POST", "/api/ai/fb-groups", {}).then(r => r.json()).then(d => { setAiFBGroups(d); sessionStorage.setItem("ai_fb_groups", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiFBGroupsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fb_reels");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFBReels(e.data); return; } else { sessionStorage.removeItem("ai_fb_reels"); } } catch {} }
    setAiFBReelsLoading(true);
    apiRequest("POST", "/api/ai/fb-reels", {}).then(r => r.json()).then(d => { setAiFBReels(d); sessionStorage.setItem("ai_fb_reels", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiFBReelsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_snapchat");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSnapchat(e.data); return; } else { sessionStorage.removeItem("ai_snapchat"); } } catch {} }
    setAiSnapchatLoading(true);
    apiRequest("POST", "/api/ai/snapchat", {}).then(r => r.json()).then(d => { setAiSnapchat(d); sessionStorage.setItem("ai_snapchat", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSnapchatLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_threads");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiThreads(e.data); return; } else { sessionStorage.removeItem("ai_threads"); } } catch {} }
    setAiThreadsLoading(true);
    apiRequest("POST", "/api/ai/threads", {}).then(r => r.json()).then(d => { setAiThreads(d); sessionStorage.setItem("ai_threads", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiThreadsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_discord_opt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDiscordOpt(e.data); return; } else { sessionStorage.removeItem("ai_discord_opt"); } } catch {} }
    setAiDiscordOptLoading(true);
    apiRequest("POST", "/api/ai/discord-optimize", {}).then(r => r.json()).then(d => { setAiDiscordOpt(d); sessionStorage.setItem("ai_discord_opt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDiscordOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_patreon");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPatreon(e.data); return; } else { sessionStorage.removeItem("ai_patreon"); } } catch {} }
    setAiPatreonLoading(true);
    apiRequest("POST", "/api/ai/patreon-content", {}).then(r => r.json()).then(d => { setAiPatreon(d); sessionStorage.setItem("ai_patreon", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPatreonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_substack");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSubstack(e.data); return; } else { sessionStorage.removeItem("ai_substack"); } } catch {} }
    setAiSubstackLoading(true);
    apiRequest("POST", "/api/ai/substack", {}).then(r => r.json()).then(d => { setAiSubstack(d); sessionStorage.setItem("ai_substack", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSubstackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gumroad");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGumroad(e.data); return; } else { sessionStorage.removeItem("ai_gumroad"); } } catch {} }
    setAiGumroadLoading(true);
    apiRequest("POST", "/api/ai/gumroad", {}).then(r => r.json()).then(d => { setAiGumroad(d); sessionStorage.setItem("ai_gumroad", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiGumroadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_teachable");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTeachable(e.data); return; } else { sessionStorage.removeItem("ai_teachable"); } } catch {} }
    setAiTeachableLoading(true);
    apiRequest("POST", "/api/ai/teachable", {}).then(r => r.json()).then(d => { setAiTeachable(d); sessionStorage.setItem("ai_teachable", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTeachableLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_buy_me_coffee");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBuyMeCoffee(e.data); return; } else { sessionStorage.removeItem("ai_buy_me_coffee"); } } catch {} }
    setAiBuyMeCoffeeLoading(true);
    apiRequest("POST", "/api/ai/buymeacoffee", {}).then(r => r.json()).then(d => { setAiBuyMeCoffee(d); sessionStorage.setItem("ai_buy_me_coffee", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBuyMeCoffeeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_chaturbate");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiChaturbate(e.data); return; } else { sessionStorage.removeItem("ai_chaturbate"); } } catch {} }
    setAiChaturbateLoading(true);
    apiRequest("POST", "/api/ai/chaturbate", {}).then(r => r.json()).then(d => { setAiChaturbate(d); sessionStorage.setItem("ai_chaturbate", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiChaturbateLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis_resp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrisisResp(e.data); return; } else { sessionStorage.removeItem("ai_crisis_resp"); } } catch {} }
    setAiCrisisRespLoading(true);
    apiRequest("POST", "/api/ai/crisis-response", {}).then(r => r.json()).then(d => { setAiCrisisResp(d); sessionStorage.setItem("ai_crisis_resp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCrisisRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_apology");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiApology(e.data); return; } else { sessionStorage.removeItem("ai_apology"); } } catch {} }
    setAiApologyLoading(true);
    apiRequest("POST", "/api/ai/apology-script", {}).then(r => r.json()).then(d => { setAiApology(d); sessionStorage.setItem("ai_apology", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiApologyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_controversy");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiControversy(e.data); return; } else { sessionStorage.removeItem("ai_controversy"); } } catch {} }
    setAiControversyLoading(true);
    apiRequest("POST", "/api/ai/controversy", {}).then(r => r.json()).then(d => { setAiControversy(d); sessionStorage.setItem("ai_controversy", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiControversyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cancel_culture");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCancelCulture(e.data); return; } else { sessionStorage.removeItem("ai_cancel_culture"); } } catch {} }
    setAiCancelCultureLoading(true);
    apiRequest("POST", "/api/ai/cancel-culture", {}).then(r => r.json()).then(d => { setAiCancelCulture(d); sessionStorage.setItem("ai_cancel_culture", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCancelCultureLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis_detect");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrisisDetect(e.data); return; } else { sessionStorage.removeItem("ai_crisis_detect"); } } catch {} }
    setAiCrisisDetectLoading(true);
    apiRequest("POST", "/api/ai/crisis-detector", {}).then(r => r.json()).then(d => { setAiCrisisDetect(d); sessionStorage.setItem("ai_crisis_detect", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCrisisDetectLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_damage_ctrl");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDamageCtrl(e.data); return; } else { sessionStorage.removeItem("ai_damage_ctrl"); } } catch {} }
    setAiDamageCtrlLoading(true);
    apiRequest("POST", "/api/ai/damage-control", {}).then(r => r.json()).then(d => { setAiDamageCtrl(d); sessionStorage.setItem("ai_damage_ctrl", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDamageCtrlLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pr_stmt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPRStmt(e.data); return; } else { sessionStorage.removeItem("ai_pr_stmt"); } } catch {} }
    setAiPRStmtLoading(true);
    apiRequest("POST", "/api/ai/pr-statement", {}).then(r => r.json()).then(d => { setAiPRStmt(d); sessionStorage.setItem("ai_pr_stmt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPRStmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stakeholder");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStakeholder(e.data); return; } else { sessionStorage.removeItem("ai_stakeholder"); } } catch {} }
    setAiStakeholderLoading(true);
    apiRequest("POST", "/api/ai/stakeholder-comm", {}).then(r => r.json()).then(d => { setAiStakeholder(d); sessionStorage.setItem("ai_stakeholder", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiStakeholderLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_recov_strat");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRecovStrat(e.data); return; } else { sessionStorage.removeItem("ai_recov_strat"); } } catch {} }
    setAiRecovStratLoading(true);
    apiRequest("POST", "/api/ai/recovery-strategy", {}).then(r => r.json()).then(d => { setAiRecovStrat(d); sessionStorage.setItem("ai_recov_strat", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiRecovStratLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_media_resp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMediaResp(e.data); return; } else { sessionStorage.removeItem("ai_media_resp"); } } catch {} }
    setAiMediaRespLoading(true);
    apiRequest("POST", "/api/ai/media-response", {}).then(r => r.json()).then(d => { setAiMediaResp(d); sessionStorage.setItem("ai_media_resp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMediaRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_legal_risk");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLegalRisk(e.data); return; } else { sessionStorage.removeItem("ai_legal_risk"); } } catch {} }
    setAiLegalRiskLoading(true);
    apiRequest("POST", "/api/ai/legal-risk", {}).then(r => r.json()).then(d => { setAiLegalRisk(d); sessionStorage.setItem("ai_legal_risk", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiLegalRiskLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_social_crisis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSocialCrisis(e.data); return; } else { sessionStorage.removeItem("ai_social_crisis"); } } catch {} }
    setAiSocialCrisisLoading(true);
    apiRequest("POST", "/api/ai/social-crisis", {}).then(r => r.json()).then(d => { setAiSocialCrisis(d); sessionStorage.setItem("ai_social_crisis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSocialCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infl_crisis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInflCrisis(e.data); return; } else { sessionStorage.removeItem("ai_infl_crisis"); } } catch {} }
    setAiInflCrisisLoading(true);
    apiRequest("POST", "/api/ai/influencer-crisis", {}).then(r => r.json()).then(d => { setAiInflCrisis(d); sessionStorage.setItem("ai_infl_crisis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiInflCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandRecov(e.data); return; } else { sessionStorage.removeItem("ai_brand_recov"); } } catch {} }
    setAiBrandRecovLoading(true);
    apiRequest("POST", "/api/ai/brand-recovery", {}).then(r => r.json()).then(d => { setAiBrandRecov(d); sessionStorage.setItem("ai_brand_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBrandRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_workflow_auto");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWorkflowAutoAS(e.data); return; } else { sessionStorage.removeItem("ai_workflow_auto"); } } catch {} }
    setAiWorkflowAutoASLoading(true);
    apiRequest("POST", "/api/ai/workflow-automation", {}).then(r => r.json()).then(d => { setAiWorkflowAutoAS(d); sessionStorage.setItem("ai_workflow_auto", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWorkflowAutoASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_zapier");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiZapier(e.data); return; } else { sessionStorage.removeItem("ai_zapier"); } } catch {} }
    setAiZapierLoading(true);
    apiRequest("POST", "/api/ai/zapier", {}).then(r => r.json()).then(d => { setAiZapier(d); sessionStorage.setItem("ai_zapier", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiZapierLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ifttt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIFTTT(e.data); return; } else { sessionStorage.removeItem("ai_ifttt"); } } catch {} }
    setAiIFTTTLoading(true);
    apiRequest("POST", "/api/ai/ifttt", {}).then(r => r.json()).then(d => { setAiIFTTT(d); sessionStorage.setItem("ai_ifttt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiIFTTTLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_make_scene");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMakeScene(e.data); return; } else { sessionStorage.removeItem("ai_make_scene"); } } catch {} }
    setAiMakeSceneLoading(true);
    apiRequest("POST", "/api/ai/make-scenario", {}).then(r => r.json()).then(d => { setAiMakeScene(d); sessionStorage.setItem("ai_make_scene", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMakeSceneLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_sched");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoSched(e.data); return; } else { sessionStorage.removeItem("ai_auto_sched"); } } catch {} }
    setAiAutoSchedLoading(true);
    apiRequest("POST", "/api/ai/auto-scheduler", {}).then(r => r.json()).then(d => { setAiAutoSched(d); sessionStorage.setItem("ai_auto_sched", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoSchedLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_resp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoRespAS(e.data); return; } else { sessionStorage.removeItem("ai_auto_resp"); } } catch {} }
    setAiAutoRespASLoading(true);
    apiRequest("POST", "/api/ai/auto-responder", {}).then(r => r.json()).then(d => { setAiAutoRespAS(d); sessionStorage.setItem("ai_auto_resp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoRespASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_mod");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoModAS(e.data); return; } else { sessionStorage.removeItem("ai_auto_mod"); } } catch {} }
    setAiAutoModASLoading(true);
    apiRequest("POST", "/api/ai/auto-moderator", {}).then(r => r.json()).then(d => { setAiAutoModAS(d); sessionStorage.setItem("ai_auto_mod", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoModASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_back");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoBack(e.data); return; } else { sessionStorage.removeItem("ai_auto_back"); } } catch {} }
    setAiAutoBackLoading(true);
    apiRequest("POST", "/api/ai/auto-backup", {}).then(r => r.json()).then(d => { setAiAutoBack(d); sessionStorage.setItem("ai_auto_back", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoBackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_rep");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoRep(e.data); return; } else { sessionStorage.removeItem("ai_auto_rep"); } } catch {} }
    setAiAutoRepLoading(true);
    apiRequest("POST", "/api/ai/auto-reporter", {}).then(r => r.json()).then(d => { setAiAutoRep(d); sessionStorage.setItem("ai_auto_rep", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoRepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_opt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAutoOpt(e.data); return; } else { sessionStorage.removeItem("ai_auto_opt"); } } catch {} }
    setAiAutoOptLoading(true);
    apiRequest("POST", "/api/ai/auto-optimizer", {}).then(r => r.json()).then(d => { setAiAutoOpt(d); sessionStorage.setItem("ai_auto_opt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAutoOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_batch_proc");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBatchProc(e.data); return; } else { sessionStorage.removeItem("ai_batch_proc"); } } catch {} }
    setAiBatchProcLoading(true);
    apiRequest("POST", "/api/ai/batch-processor", {}).then(r => r.json()).then(d => { setAiBatchProc(d); sessionStorage.setItem("ai_batch_proc", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBatchProcLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_smart_queue");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSmartQueue(e.data); return; } else { sessionStorage.removeItem("ai_smart_queue"); } } catch {} }
    setAiSmartQueueLoading(true);
    apiRequest("POST", "/api/ai/smart-queue", {}).then(r => r.json()).then(d => { setAiSmartQueue(d); sessionStorage.setItem("ai_smart_queue", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSmartQueueLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cont_pipeline");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContPipeline(e.data); return; } else { sessionStorage.removeItem("ai_cont_pipeline"); } } catch {} }
    setAiContPipelineLoading(true);
    apiRequest("POST", "/api/ai/content-pipeline", {}).then(r => r.json()).then(d => { setAiContPipeline(d); sessionStorage.setItem("ai_cont_pipeline", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiContPipelineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_train_data");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTrainData(e.data); return; } else { sessionStorage.removeItem("ai_train_data"); } } catch {} }
    setAiTrainDataLoading(true);
    apiRequest("POST", "/api/ai/training-data", {}).then(r => r.json()).then(d => { setAiTrainData(d); sessionStorage.setItem("ai_train_data", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTrainDataLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comm_trust");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCommTrust(e.data); return; } else { sessionStorage.removeItem("ai_comm_trust"); } } catch {} }
    setAiCommTrustLoading(true);
    apiRequest("POST", "/api/ai/trust-rebuild", {}).then(r => r.json()).then(d => { setAiCommTrust(d); sessionStorage.setItem("ai_comm_trust", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCommTrustLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_algo_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAlgoRecov(e.data); return; } else { sessionStorage.removeItem("ai_algo_recov"); } } catch {} }
    setAiAlgoRecovLoading(true);
    apiRequest("POST", "/api/ai/algo-recovery", {}).then(r => r.json()).then(d => { setAiAlgoRecov(d); sessionStorage.setItem("ai_algo_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAlgoRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevRecov(e.data); return; } else { sessionStorage.removeItem("ai_rev_recov"); } } catch {} }
    setAiRevRecovLoading(true);
    apiRequest("POST", "/api/ai/revenue-recovery", {}).then(r => r.json()).then(d => { setAiRevRecov(d); sessionStorage.setItem("ai_rev_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiRevRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_team_crisis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTeamCrisisBC(e.data); return; } else { sessionStorage.removeItem("ai_team_crisis"); } } catch {} }
    setAiTeamCrisisBCLoading(true);
    apiRequest("POST", "/api/ai/team-crisis", {}).then(r => r.json()).then(d => { setAiTeamCrisisBC(d); sessionStorage.setItem("ai_team_crisis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTeamCrisisBCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_legal_def");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLegalDef(e.data); return; } else { sessionStorage.removeItem("ai_legal_def"); } } catch {} }
    setAiLegalDefLoading(true);
    apiRequest("POST", "/api/ai/legal-defense", {}).then(r => r.json()).then(d => { setAiLegalDef(d); sessionStorage.setItem("ai_legal_def", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiLegalDefLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ins_claim");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInsClaim(e.data); return; } else { sessionStorage.removeItem("ai_ins_claim"); } } catch {} }
    setAiInsClaimLoading(true);
    apiRequest("POST", "/api/ai/insurance-claim", {}).then(r => r.json()).then(d => { setAiInsClaim(d); sessionStorage.setItem("ai_ins_claim", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiInsClaimLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contingency");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContingency(e.data); return; } else { sessionStorage.removeItem("ai_contingency"); } } catch {} }
    setAiContingencyLoading(true);
    apiRequest("POST", "/api/ai/contingency", {}).then(r => r.json()).then(d => { setAiContingency(d); sessionStorage.setItem("ai_contingency", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiContingencyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_disaster_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDisasterRecov(e.data); return; } else { sessionStorage.removeItem("ai_disaster_recov"); } } catch {} }
    setAiDisasterRecovLoading(true);
    apiRequest("POST", "/api/ai/disaster-recovery", {}).then(r => r.json()).then(d => { setAiDisasterRecov(d); sessionStorage.setItem("ai_disaster_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDisasterRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_biz_cont");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBizContBC(e.data); return; } else { sessionStorage.removeItem("ai_biz_cont"); } } catch {} }
    setAiBizContBCLoading(true);
    apiRequest("POST", "/api/ai/business-continuity", {}).then(r => r.json()).then(d => { setAiBizContBC(d); sessionStorage.setItem("ai_biz_cont", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBizContBCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exit_strat");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiExitStrat(e.data); return; } else { sessionStorage.removeItem("ai_exit_strat"); } } catch {} }
    setAiExitStratLoading(true);
    apiRequest("POST", "/api/ai/exit-strategy", {}).then(r => r.json()).then(d => { setAiExitStrat(d); sessionStorage.setItem("ai_exit_strat", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiExitStratLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(() => {
    const stored = localStorage.getItem("notificationPrefs");
    if (stored) {
      try {
        return { ...defaultNotificationPrefs, ...JSON.parse(stored) };
      } catch {
        return defaultNotificationPrefs;
      }
    }
    return defaultNotificationPrefs;
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  useEffect(() => {
    localStorage.setItem("notificationPrefs", JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  const updateNotificationPref = (key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const presets = [
    { type: "safe" as const, icon: Shield, title: "Safe", desc: "Conservative. Minimal changes." },
    { type: "normal" as const, icon: Zap, title: "Normal", desc: "Balanced optimization." },
    { type: "aggressive" as const, icon: AlertTriangle, title: "Aggressive", desc: "Maximum growth." },
  ];

  const connectedCount = channels?.length ?? 0;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/user/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "creatoros-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Profile</h2>
        <div className="grid grid-cols-3 gap-3">
          {presets.map(({ type, icon: Icon, title, desc }) => (
            <Card
              key={type}
              data-testid={`card-risk-${type}`}
              onClick={() => setActivePreset(type)}
              className={cn(
                "cursor-pointer",
                activePreset === type ? "border-primary" : "hover-elevate"
              )}
            >
              <CardContent className="p-4">
                <Icon className={cn("h-5 w-5 mb-2", activePreset === type ? "text-primary" : "text-muted-foreground")} />
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">AI Autonomy</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="human-review" className="text-sm font-medium">Human Review Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, AI will pause before publishing and ask for your approval. When disabled, AI auto-approves everything.
              </p>
            </div>
            <Switch
              id="human-review"
              data-testid="switch-human-review"
              checked={humanReviewMode}
              onCheckedChange={setHumanReviewMode}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-compliance" className="text-sm font-medium">Compliance Warnings</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Get alerted about compliance issues</p>
            </div>
            <Switch
              id="notif-compliance"
              data-testid="switch-notif-compliance"
              checked={notificationPrefs.complianceWarnings}
              onCheckedChange={(v) => updateNotificationPref("complianceWarnings", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-milestones" className="text-sm font-medium">Milestone Alerts</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Notifications when you hit growth milestones</p>
            </div>
            <Switch
              id="notif-milestones"
              data-testid="switch-notif-milestones"
              checked={notificationPrefs.milestoneAlerts}
              onCheckedChange={(v) => updateNotificationPref("milestoneAlerts", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-platform" className="text-sm font-medium">Platform Issues</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Alerts about platform outages or API changes</p>
            </div>
            <Switch
              id="notif-platform"
              data-testid="switch-notif-platform"
              checked={notificationPrefs.platformIssues}
              onCheckedChange={(v) => updateNotificationPref("platformIssues", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-revenue" className="text-sm font-medium">Revenue Updates</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Periodic updates on revenue performance</p>
            </div>
            <Switch
              id="notif-revenue"
              data-testid="switch-notif-revenue"
              checked={notificationPrefs.revenueUpdates}
              onCheckedChange={(v) => updateNotificationPref("revenueUpdates", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Connected Platforms
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {connectedCount === 0
                  ? "No channels connected"
                  : `${connectedCount} channel${connectedCount !== 1 ? "s" : ""} connected`}
              </p>
              {connectedCount > 0 && (
                <Badge variant="secondary" data-testid="badge-channel-count">{connectedCount}</Badge>
              )}
            </div>
            <Link href="/channels">
              <Button variant="outline" size="sm" data-testid="link-manage-channels">
                Manage Channels
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-primary" />
            {t("settings.language")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("settings.selectLanguage")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {supportedLanguages.find((l) => l.code === i18n.language)?.nativeName || "English"}
              </p>
            </div>
            <Select
              value={i18n.language}
              onValueChange={(value) => {
                i18n.changeLanguage(value);
                const langName = supportedLanguages.find((l) => l.code === value)?.nativeName || value;
                toast({ title: t("settings.languageChanged", { language: langName }) });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                    {lang.nativeName} ({lang.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LanguageTrafficSuggestions />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t("settings.account") || "Account"}</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" data-testid="text-settings-user-name">{userName}</p>
              {user?.email && (
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-user-email">{user.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                data-testid="button-export-data"
                onClick={handleExportData}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {isExporting ? "Exporting..." : "Export Data"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-sign-out"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                {isLoggingOut ? t("auth.signOut") : t("auth.signOut")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {aiTeamLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-team" />
      ) : aiTeam ? (
        <Card data-testid="card-ai-team">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Team Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiTeam.recommendedRoles?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recommended Roles</p>
                <div className="space-y-3">
                  {aiTeam.recommendedRoles.map((role: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`team-role-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{role.role}</p>
                        {role.priority && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{role.priority}</Badge>}
                      </div>
                      {role.responsibilities && <p className="text-xs text-muted-foreground">{Array.isArray(role.responsibilities) ? role.responsibilities.join(", ") : role.responsibilities}</p>}
                      <div className="flex items-center gap-3 flex-wrap">
                        {role.cost && <span className="text-xs text-muted-foreground">Cost: {role.cost}</span>}
                        {role.roi && <span className="text-xs text-emerald-500">ROI: {role.roi}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiTeam.workflowSteps?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Workflow Steps</p>
                <ol className="text-xs text-muted-foreground space-y-0.5 pl-4 list-decimal">
                  {aiTeam.workflowSteps.map((step: any, i: number) => (
                    <li key={i} data-testid={`workflow-step-${i}`}>{typeof step === "string" ? step : step.name || step.step}</li>
                  ))}
                </ol>
              </div>
            )}
            {aiTeam.approvalFlow && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Approval Flow</p>
                <p className="text-sm" data-testid="text-approval-flow">{typeof aiTeam.approvalFlow === "string" ? aiTeam.approvalFlow : JSON.stringify(aiTeam.approvalFlow)}</p>
              </div>
            )}
            {aiTeam.delegationPlan && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Delegation Plan</p>
                <p className="text-sm" data-testid="text-delegation-plan">{typeof aiTeam.delegationPlan === "string" ? aiTeam.delegationPlan : JSON.stringify(aiTeam.delegationPlan)}</p>
              </div>
            )}
            {aiTeam.communicationPlan && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Communication Plan</p>
                <p className="text-sm" data-testid="text-communication-plan">{typeof aiTeam.communicationPlan === "string" ? aiTeam.communicationPlan : JSON.stringify(aiTeam.communicationPlan)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {aiAutomationsLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-automations" />
      ) : aiAutomations ? (
        <Card data-testid="card-ai-automations">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Automation Builder
            </CardTitle>
            {aiAutomations.totalTimeSaved && (
              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate" data-testid="badge-total-time-saved">
                {aiAutomations.totalTimeSaved} saved
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiAutomations.automations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Automations</p>
                <div className="space-y-2">
                  {aiAutomations.automations.map((auto: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`automation-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{auto.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {auto.timeSaved && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{auto.timeSaved}</Badge>}
                          <Switch
                            checked={auto.enabled !== false}
                            data-testid={`switch-automation-${i}`}
                            onCheckedChange={() => {}}
                          />
                        </div>
                      </div>
                      {auto.trigger && <p className="text-xs text-muted-foreground">Trigger: {auto.trigger}</p>}
                      {auto.actions && (
                        <p className="text-xs text-muted-foreground">Actions: {Array.isArray(auto.actions) ? auto.actions.join(", ") : auto.actions}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAutomations.chains?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Chains</p>
                <div className="space-y-2">
                  {aiAutomations.chains.map((chain: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3" data-testid={`chain-${i}`}>
                      <p className="text-sm font-medium">{chain.name}</p>
                      {chain.description && <p className="text-xs text-muted-foreground">{chain.description}</p>}
                      {chain.steps?.length > 0 && (
                        <ol className="text-xs text-muted-foreground space-y-0.5 pl-4 list-decimal mt-1">
                          {chain.steps.map((step: any, j: number) => <li key={j}>{typeof step === "string" ? step : step.name || step.action}</li>)}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAutomations.schedules?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Schedules</p>
                <div className="space-y-2">
                  {aiAutomations.schedules.map((sched: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`schedule-${i}`}>
                      <div>
                        <p className="text-sm font-medium">{sched.name}</p>
                        {sched.description && <p className="text-xs text-muted-foreground">{sched.description}</p>}
                      </div>
                      {sched.frequency && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{sched.frequency}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowTeamAI(!showTeamAI)}
          data-testid="button-toggle-team-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Team & Workflow Suite</span>
          <Badge variant="outline" className="text-[10px]">17 tools</Badge>
          {showTeamAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showTeamAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiHiringLoading || aiHiring) && (
              <Card data-testid="card-ai-hiring">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Hiring</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHiringLoading ? <Skeleton className="h-24 w-full" /> : aiHiring && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHiring.roles || aiHiring.positions || aiHiring.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFreelanceLoading || aiFreelance) && (
              <Card data-testid="card-ai-freelance">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Freelancer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFreelanceLoading ? <Skeleton className="h-24 w-full" /> : aiFreelance && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFreelance.freelancers || aiFreelance.tasks || aiFreelance.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSOPLoading || aiSOP) && (
              <Card data-testid="card-ai-sop">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI SOP Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSOPLoading ? <Skeleton className="h-24 w-full" /> : aiSOP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSOP.sops || aiSOP.procedures || aiSOP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTimelineLoading || aiTimeline) && (
              <Card data-testid="card-ai-timeline">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Project Timeline</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTimelineLoading ? <Skeleton className="h-24 w-full" /> : aiTimeline && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTimeline.milestones || aiTimeline.phases || aiTimeline.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiApprovalLoading || aiApproval) && (
              <Card data-testid="card-ai-approval">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Approval Flow</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiApprovalLoading ? <Skeleton className="h-24 w-full" /> : aiApproval && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiApproval.steps || aiApproval.flow || aiApproval.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEditChecklistLoading || aiEditChecklist) && (
              <Card data-testid="card-ai-edit-checklist">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Editing Checklist</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEditChecklistLoading ? <Skeleton className="h-24 w-full" /> : aiEditChecklist && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEditChecklist.checklist || aiEditChecklist.items || aiEditChecklist.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProdBudgetLoading || aiProdBudget) && (
              <Card data-testid="card-ai-prod-budget">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Production Budget</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProdBudgetLoading ? <Skeleton className="h-24 w-full" /> : aiProdBudget && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiProdBudget.items || aiProdBudget.budget || aiProdBudget.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEquipLoading || aiEquip) && (
              <Card data-testid="card-ai-equip">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Equipment</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEquipLoading ? <Skeleton className="h-24 w-full" /> : aiEquip && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEquip.equipment || aiEquip.gear || aiEquip.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStudioLoading || aiStudio) && (
              <Card data-testid="card-ai-studio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Studio Setup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStudioLoading ? <Skeleton className="h-24 w-full" /> : aiStudio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStudio.setup || aiStudio.items || aiStudio.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkflowLoading || aiWorkflow) && (
              <Card data-testid="card-ai-workflow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Workflow Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkflowLoading ? <Skeleton className="h-24 w-full" /> : aiWorkflow && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkflow.steps || aiWorkflow.optimizations || aiWorkflow.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBatchRecLoading || aiBatchRec) && (
              <Card data-testid="card-ai-batch-rec">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Batch Recording</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBatchRecLoading ? <Skeleton className="h-24 w-full" /> : aiBatchRec && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBatchRec.sessions || aiBatchRec.schedule || aiBatchRec.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiOutsourceLoading || aiOutsource) && (
              <Card data-testid="card-ai-outsource">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Outsourcing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOutsourceLoading ? <Skeleton className="h-24 w-full" /> : aiOutsource && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOutsource.tasks || aiOutsource.vendors || aiOutsource.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiToolStackLoading || aiToolStack) && (
              <Card data-testid="card-ai-tool-stack">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Tool Stack</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiToolStackLoading ? <Skeleton className="h-24 w-full" /> : aiToolStack && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiToolStack.tools || aiToolStack.stack || aiToolStack.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDelegationLoading || aiDelegation) && (
              <Card data-testid="card-ai-delegation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Delegation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDelegationLoading ? <Skeleton className="h-24 w-full" /> : aiDelegation && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDelegation.tasks || aiDelegation.assignments || aiDelegation.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTimeMgmtLoading || aiTimeMgmt) && (
              <Card data-testid="card-ai-time-mgmt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Time Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTimeMgmtLoading ? <Skeleton className="h-24 w-full" /> : aiTimeMgmt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTimeMgmt.blocks || aiTimeMgmt.schedule || aiTimeMgmt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMastermindLoading || aiMastermind) && (
              <Card data-testid="card-ai-mastermind">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mastermind</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMastermindLoading ? <Skeleton className="h-24 w-full" /> : aiMastermind && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMastermind.groups || aiMastermind.topics || aiMastermind.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProductivityLoading || aiProductivity) && (
              <Card data-testid="card-ai-productivity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Productivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProductivityLoading ? <Skeleton className="h-24 w-full" /> : aiProductivity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiProductivity.tips || aiProductivity.habits || aiProductivity.recommendations)}
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
          onClick={() => setShowBrandAI(!showBrandAI)}
          data-testid="button-toggle-brand-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Brand Identity Suite</span>
          <Badge variant="outline" className="text-[10px]">18 tools</Badge>
          {showBrandAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showBrandAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandVoiceLoading || aiBrandVoice) && (
              <Card data-testid="card-ai-brand-voice">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Voice</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandVoiceLoading ? <Skeleton className="h-24 w-full" /> : aiBrandVoice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandVoice.tones || aiBrandVoice.guidelines || aiBrandVoice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandColorsLoading || aiBrandColors) && (
              <Card data-testid="card-ai-brand-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Colors</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandColorsLoading ? <Skeleton className="h-24 w-full" /> : aiBrandColors && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandColors.palette || aiBrandColors.colors || aiBrandColors.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandFontsLoading || aiBrandFonts) && (
              <Card data-testid="card-ai-brand-fonts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Fonts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandFontsLoading ? <Skeleton className="h-24 w-full" /> : aiBrandFonts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandFonts.fonts || aiBrandFonts.pairings || aiBrandFonts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandStoryLoading || aiBrandStory) && (
              <Card data-testid="card-ai-brand-story">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Story</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandStoryLoading ? <Skeleton className="h-24 w-full" /> : aiBrandStory && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandStory.chapters || aiBrandStory.narrative || aiBrandStory.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandConsistLoading || aiBrandConsist) && (
              <Card data-testid="card-ai-brand-consist">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Consistency</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandConsistLoading ? <Skeleton className="h-24 w-full" /> : aiBrandConsist && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandConsist.checks || aiBrandConsist.issues || aiBrandConsist.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPillarRefineLoading || aiPillarRefine) && (
              <Card data-testid="card-ai-pillar-refine">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pillar Refine</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPillarRefineLoading ? <Skeleton className="h-24 w-full" /> : aiPillarRefine && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPillarRefine.pillars || aiPillarRefine.refinements || aiPillarRefine.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrailerLoading || aiTrailer) && (
              <Card data-testid="card-ai-trailer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Channel Trailer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrailerLoading ? <Skeleton className="h-24 w-full" /> : aiTrailer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrailer.script || aiTrailer.sections || aiTrailer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiArtDirLoading || aiArtDir) && (
              <Card data-testid="card-ai-art-dir">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Art Direction</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiArtDirLoading ? <Skeleton className="h-24 w-full" /> : aiArtDir && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiArtDir.styles || aiArtDir.guidelines || aiArtDir.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiUSPLoading || aiUSP) && (
              <Card data-testid="card-ai-usp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI USP Finder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiUSPLoading ? <Skeleton className="h-24 w-full" /> : aiUSP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiUSP.usps || aiUSP.propositions || aiUSP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTargetAudLoading || aiTargetAud) && (
              <Card data-testid="card-ai-target-aud">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Target Audience</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTargetAudLoading ? <Skeleton className="h-24 w-full" /> : aiTargetAud && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTargetAud.segments || aiTargetAud.personas || aiTargetAud.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandPartnerLoading || aiBrandPartner) && (
              <Card data-testid="card-ai-brand-partner">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Partnerships</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandPartnerLoading ? <Skeleton className="h-24 w-full" /> : aiBrandPartner && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandPartner.partners || aiBrandPartner.opportunities || aiBrandPartner.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrisisLoading || aiCrisis) && (
              <Card data-testid="card-ai-crisis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Crisis Comms</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrisisLoading ? <Skeleton className="h-24 w-full" /> : aiCrisis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrisis.plans || aiCrisis.templates || aiCrisis.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPersonalBrandLoading || aiPersonalBrand) && (
              <Card data-testid="card-ai-personal-brand">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Personal Brand</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPersonalBrandLoading ? <Skeleton className="h-24 w-full" /> : aiPersonalBrand && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPersonalBrand.traits || aiPersonalBrand.strategies || aiPersonalBrand.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandEvolutionLoading || aiBrandEvolution) && (
              <Card data-testid="card-ai-brand-evolution">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Evolution</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandEvolutionLoading ? <Skeleton className="h-24 w-full" /> : aiBrandEvolution && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandEvolution.phases || aiBrandEvolution.timeline || aiBrandEvolution.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompDiffLoading || aiCompDiff) && (
              <Card data-testid="card-ai-comp-diff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Diff</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompDiffLoading ? <Skeleton className="h-24 w-full" /> : aiCompDiff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCompDiff.differences || aiCompDiff.advantages || aiCompDiff.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabBriefLoading || aiCollabBrief) && (
              <Card data-testid="card-ai-collab-brief">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Brief</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabBriefLoading ? <Skeleton className="h-24 w-full" /> : aiCollabBrief && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabBrief.briefs || aiCollabBrief.templates || aiCollabBrief.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNetworkPrepLoading || aiNetworkPrep) && (
              <Card data-testid="card-ai-network-prep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Networking Prep</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNetworkPrepLoading ? <Skeleton className="h-24 w-full" /> : aiNetworkPrep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNetworkPrep.tips || aiNetworkPrep.contacts || aiNetworkPrep.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMentorshipLoading || aiMentorship) && (
              <Card data-testid="card-ai-mentorship">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mentorship</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMentorshipLoading ? <Skeleton className="h-24 w-full" /> : aiMentorship && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMentorship.mentors || aiMentorship.paths || aiMentorship.recommendations)}
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
          onClick={() => setShowIntegrationsAI(!showIntegrationsAI)}
          data-testid="button-toggle-integrations-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Integrations & Automation Suite</span>
          <Badge variant="outline" className="text-[10px]">25 tools</Badge>
          {showIntegrationsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showIntegrationsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiYTAPILoading || aiYTAPI) && (
              <Card data-testid="card-ai-yt-api">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI YouTube API</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiYTAPILoading ? <Skeleton className="h-24 w-full" /> : aiYTAPI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiYTAPI.endpoints || aiYTAPI.recommendations || aiYTAPI.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwitchLoading || aiTwitch) && (
              <Card data-testid="card-ai-twitch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitch Integration</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwitchLoading ? <Skeleton className="h-24 w-full" /> : aiTwitch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwitch.integrations || aiTwitch.recommendations || aiTwitch.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDiscordBotLoading || aiDiscordBot) && (
              <Card data-testid="card-ai-discord-bot">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Discord Bot</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDiscordBotLoading ? <Skeleton className="h-24 w-full" /> : aiDiscordBot && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDiscordBot.commands || aiDiscordBot.recommendations || aiDiscordBot.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGALoading || aiGA) && (
              <Card data-testid="card-ai-ga">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Google Analytics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGALoading ? <Skeleton className="h-24 w-full" /> : aiGA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGA.setup || aiGA.recommendations || aiGA.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSocialSchedLoading || aiSocialSched) && (
              <Card data-testid="card-ai-social-sched">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Social Scheduler</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSocialSchedLoading ? <Skeleton className="h-24 w-full" /> : aiSocialSched && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSocialSched.schedule || aiSocialSched.recommendations || aiSocialSched.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmailMktLoading || aiEmailMkt) && (
              <Card data-testid="card-ai-email-mkt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Email Marketing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmailMktLoading ? <Skeleton className="h-24 w-full" /> : aiEmailMkt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEmailMkt.campaigns || aiEmailMkt.recommendations || aiEmailMkt.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPodcastLoading || aiPodcast) && (
              <Card data-testid="card-ai-podcast">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodcastLoading ? <Skeleton className="h-24 w-full" /> : aiPodcast && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodcast.episodes || aiPodcast.recommendations || aiPodcast.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWebhooksLoading || aiWebhooks) && (
              <Card data-testid="card-ai-webhooks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Webhook Manager</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWebhooksLoading ? <Skeleton className="h-24 w-full" /> : aiWebhooks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWebhooks.webhooks || aiWebhooks.recommendations || aiWebhooks.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRateLimitsLoading || aiRateLimits) && (
              <Card data-testid="card-ai-rate-limits">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Rate Limits</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRateLimitsLoading ? <Skeleton className="h-24 w-full" /> : aiRateLimits && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRateLimits.limits || aiRateLimits.recommendations || aiRateLimits.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBackupPlanLoading || aiBackupPlan) && (
              <Card data-testid="card-ai-backup-plan">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Backup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBackupPlanLoading ? <Skeleton className="h-24 w-full" /> : aiBackupPlan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBackupPlan.plans || aiBackupPlan.recommendations || aiBackupPlan.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNotifOptLoading || aiNotifOpt) && (
              <Card data-testid="card-ai-notif-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Notification Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNotifOptLoading ? <Skeleton className="h-24 w-full" /> : aiNotifOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNotifOpt.optimizations || aiNotifOpt.recommendations || aiNotifOpt.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrossPostLoading || aiCrossPost) && (
              <Card data-testid="card-ai-cross-post">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cross-Post</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrossPostLoading ? <Skeleton className="h-24 w-full" /> : aiCrossPost && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrossPost.platforms || aiCrossPost.recommendations || aiCrossPost.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLinktreeLoading || aiLinktree) && (
              <Card data-testid="card-ai-linktree">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Linktree</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLinktreeLoading ? <Skeleton className="h-24 w-full" /> : aiLinktree && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLinktree.links || aiLinktree.recommendations || aiLinktree.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQRCodesLoading || aiQRCodes) && (
              <Card data-testid="card-ai-qr-codes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI QR Codes</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQRCodesLoading ? <Skeleton className="h-24 w-full" /> : aiQRCodes && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiQRCodes.codes || aiQRCodes.recommendations || aiQRCodes.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiChatbotLoading || aiChatbot) && (
              <Card data-testid="card-ai-chatbot">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Chatbot Integrator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiChatbotLoading ? <Skeleton className="h-24 w-full" /> : aiChatbot && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiChatbot.bots || aiChatbot.recommendations || aiChatbot.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAnalyticsDashLoading || aiAnalyticsDash) && (
              <Card data-testid="card-ai-analytics-dash">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Analytics Dashboard</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAnalyticsDashLoading ? <Skeleton className="h-24 w-full" /> : aiAnalyticsDash && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAnalyticsDash.widgets || aiAnalyticsDash.recommendations || aiAnalyticsDash.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCDNLoading || aiCDN) && (
              <Card data-testid="card-ai-cdn">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI CDN Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCDNLoading ? <Skeleton className="h-24 w-full" /> : aiCDN && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCDN.optimizations || aiCDN.recommendations || aiCDN.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAccessibilityLoading || aiAccessibility) && (
              <Card data-testid="card-ai-accessibility">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Accessibility</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAccessibilityLoading ? <Skeleton className="h-24 w-full" /> : aiAccessibility && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAccessibility.issues || aiAccessibility.recommendations || aiAccessibility.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDeviceTestLoading || aiDeviceTest) && (
              <Card data-testid="card-ai-device-test">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Device Testing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDeviceTestLoading ? <Skeleton className="h-24 w-full" /> : aiDeviceTest && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDeviceTest.devices || aiDeviceTest.recommendations || aiDeviceTest.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPerfMonLoading || aiPerfMon) && (
              <Card data-testid="card-ai-perf-mon">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Performance Monitor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPerfMonLoading ? <Skeleton className="h-24 w-full" /> : aiPerfMon && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPerfMon.metrics || aiPerfMon.recommendations || aiPerfMon.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSecurityAuditLoading || aiSecurityAudit) && (
              <Card data-testid="card-ai-security-audit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Security Audit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSecurityAuditLoading ? <Skeleton className="h-24 w-full" /> : aiSecurityAudit && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSecurityAudit.vulnerabilities || aiSecurityAudit.recommendations || aiSecurityAudit.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCookieConsentLoading || aiCookieConsent) && (
              <Card data-testid="card-ai-cookie-consent">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cookie Consent</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCookieConsentLoading ? <Skeleton className="h-24 w-full" /> : aiCookieConsent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCookieConsent.policies || aiCookieConsent.recommendations || aiCookieConsent.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAgeGateLoading || aiAgeGate) && (
              <Card data-testid="card-ai-age-gate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Age Gating</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAgeGateLoading ? <Skeleton className="h-24 w-full" /> : aiAgeGate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAgeGate.gates || aiAgeGate.recommendations || aiAgeGate.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDataRetentionLoading || aiDataRetention) && (
              <Card data-testid="card-ai-data-retention">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Retention</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDataRetentionLoading ? <Skeleton className="h-24 w-full" /> : aiDataRetention && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDataRetention.policies || aiDataRetention.recommendations || aiDataRetention.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIncidentRespLoading || aiIncidentResp) && (
              <Card data-testid="card-ai-incident-resp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Incident Response</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIncidentRespLoading ? <Skeleton className="h-24 w-full" /> : aiIncidentResp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiIncidentResp.plans || aiIncidentResp.recommendations || aiIncidentResp.results)}
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
          onClick={() => setShowPowerUserAI(!showPowerUserAI)}
          data-testid="button-toggle-power-user-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Power User Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showPowerUserAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showPowerUserAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiShortcutsLoading || aiShortcuts) && (
              <Card data-testid="card-ai-shortcuts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shortcuts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortcutsLoading ? <Skeleton className="h-24 w-full" /> : aiShortcuts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortcuts.shortcuts || aiShortcuts.recommendations || aiShortcuts.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAdvSearchLoading || aiAdvSearch) && (
              <Card data-testid="card-ai-adv-search">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Advanced Search</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdvSearchLoading ? <Skeleton className="h-24 w-full" /> : aiAdvSearch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAdvSearch.queries || aiAdvSearch.recommendations || aiAdvSearch.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBulkUploadLoading || aiBulkUpload) && (
              <Card data-testid="card-ai-bulk-upload">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Bulk Upload</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBulkUploadLoading ? <Skeleton className="h-24 w-full" /> : aiBulkUpload && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBulkUpload.uploads || aiBulkUpload.recommendations || aiBulkUpload.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPlaylistOrgLoading || aiPlaylistOrg) && (
              <Card data-testid="card-ai-playlist-org">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Playlist Organizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPlaylistOrgLoading ? <Skeleton className="h-24 w-full" /> : aiPlaylistOrg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPlaylistOrg.playlists || aiPlaylistOrg.recommendations || aiPlaylistOrg.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiAcctLoading || aiMultiAcct) && (
              <Card data-testid="card-ai-multi-acct">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Multi-Account</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiAcctLoading ? <Skeleton className="h-24 w-full" /> : aiMultiAcct && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiAcct.accounts || aiMultiAcct.recommendations || aiMultiAcct.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCustDashLoading || aiCustDash) && (
              <Card data-testid="card-ai-cust-dash">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Custom Dashboard</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCustDashLoading ? <Skeleton className="h-24 w-full" /> : aiCustDash && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCustDash.widgets || aiCustDash.recommendations || aiCustDash.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoTagLoading || aiAutoTag) && (
              <Card data-testid="card-ai-auto-tag">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Auto-Tagging</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoTagLoading ? <Skeleton className="h-24 w-full" /> : aiAutoTag && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoTag.tags || aiAutoTag.recommendations || aiAutoTag.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSmartNotifLoading || aiSmartNotif) && (
              <Card data-testid="card-ai-smart-notif">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Smart Notifications</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSmartNotifLoading ? <Skeleton className="h-24 w-full" /> : aiSmartNotif && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSmartNotif.notifications || aiSmartNotif.recommendations || aiSmartNotif.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTemplatesLoading || aiTemplates) && (
              <Card data-testid="card-ai-templates">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Template Library</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTemplatesLoading ? <Skeleton className="h-24 w-full" /> : aiTemplates && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTemplates.templates || aiTemplates.recommendations || aiTemplates.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMacrosLoading || aiMacros) && (
              <Card data-testid="card-ai-macros">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Macro Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMacrosLoading ? <Skeleton className="h-24 w-full" /> : aiMacros && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMacros.macros || aiMacros.recommendations || aiMacros.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGamificationLoading || aiGamification) && (
              <Card data-testid="card-ai-gamification">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Gamification</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGamificationLoading ? <Skeleton className="h-24 w-full" /> : aiGamification && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGamification.mechanics || aiGamification.recommendations || aiGamification.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPersonalizeLoading || aiPersonalize) && (
              <Card data-testid="card-ai-personalize">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Personalization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPersonalizeLoading ? <Skeleton className="h-24 w-full" /> : aiPersonalize && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPersonalize.segments || aiPersonalize.recommendations || aiPersonalize.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentDNALoading || aiContentDNA) && (
              <Card data-testid="card-ai-content-dna">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content DNA</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentDNALoading ? <Skeleton className="h-24 w-full" /> : aiContentDNA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentDNA.traits || aiContentDNA.recommendations || aiContentDNA.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAlgoSimLoading || aiAlgoSim) && (
              <Card data-testid="card-ai-algo-sim">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Algorithm Simulator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAlgoSimLoading ? <Skeleton className="h-24 w-full" /> : aiAlgoSim && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAlgoSim.simulations || aiAlgoSim.recommendations || aiAlgoSim.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDataVizLoading || aiDataViz) && (
              <Card data-testid="card-ai-data-viz">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Visualization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDataVizLoading ? <Skeleton className="h-24 w-full" /> : aiDataViz && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDataViz.visualizations || aiDataViz.recommendations || aiDataViz.results)}
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
          onClick={() => setShowEmergingAI(!showEmergingAI)}
          data-testid="button-toggle-emerging-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Emerging Tech Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showEmergingAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showEmergingAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiVRLoading || aiVR) && (
              <Card data-testid="card-ai-vr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI VR Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVRLoading ? <Skeleton className="h-24 w-full" /> : aiVR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVR.content || aiVR.recommendations || aiVR.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiARLoading || aiAR) && (
              <Card data-testid="card-ai-ar">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI AR Filters</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiARLoading ? <Skeleton className="h-24 w-full" /> : aiAR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAR.filters || aiAR.recommendations || aiAR.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceoverLoading || aiVoiceover) && (
              <Card data-testid="card-ai-voiceover">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voiceover</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceoverLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceover && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVoiceover.voices || aiVoiceover.recommendations || aiVoiceover.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDeepfakeLoading || aiDeepfake) && (
              <Card data-testid="card-ai-deepfake">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Deepfake Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDeepfakeLoading ? <Skeleton className="h-24 w-full" /> : aiDeepfake && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDeepfake.detections || aiDeepfake.recommendations || aiDeepfake.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBlockchainLoading || aiBlockchain) && (
              <Card data-testid="card-ai-blockchain">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Blockchain Verify</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBlockchainLoading ? <Skeleton className="h-24 w-full" /> : aiBlockchain && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBlockchain.verifications || aiBlockchain.recommendations || aiBlockchain.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPredTrendsLoading || aiPredTrends) && (
              <Card data-testid="card-ai-pred-trends">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Predictive Trends</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPredTrendsLoading ? <Skeleton className="h-24 w-full" /> : aiPredTrends && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPredTrends.trends || aiPredTrends.recommendations || aiPredTrends.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentGraphLoading || aiContentGraph) && (
              <Card data-testid="card-ai-content-graph">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Graph</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentGraphLoading ? <Skeleton className="h-24 w-full" /> : aiContentGraph && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentGraph.nodes || aiContentGraph.recommendations || aiContentGraph.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPsychographLoading || aiPsychograph) && (
              <Card data-testid="card-ai-psychograph">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Psychographics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPsychographLoading ? <Skeleton className="h-24 w-full" /> : aiPsychograph && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPsychograph.profiles || aiPsychograph.recommendations || aiPsychograph.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNeuroMktLoading || aiNeuroMkt) && (
              <Card data-testid="card-ai-neuro-mkt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Neuro Marketing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNeuroMktLoading ? <Skeleton className="h-24 w-full" /> : aiNeuroMkt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNeuroMkt.strategies || aiNeuroMkt.recommendations || aiNeuroMkt.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSentPredLoading || aiSentPred) && (
              <Card data-testid="card-ai-sent-pred">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sentiment Predict</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSentPredLoading ? <Skeleton className="h-24 w-full" /> : aiSentPred && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSentPred.predictions || aiSentPred.recommendations || aiSentPred.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCreatorEconLoading || aiCreatorEcon) && (
              <Card data-testid="card-ai-creator-econ">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Creator Economy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCreatorEconLoading ? <Skeleton className="h-24 w-full" /> : aiCreatorEcon && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCreatorEcon.trends || aiCreatorEcon.recommendations || aiCreatorEcon.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWeb3Loading || aiWeb3) && (
              <Card data-testid="card-ai-web3">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Web3 Tools</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWeb3Loading ? <Skeleton className="h-24 w-full" /> : aiWeb3 && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWeb3.tools || aiWeb3.recommendations || aiWeb3.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMetaverseLoading || aiMetaverse) && (
              <Card data-testid="card-ai-metaverse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Metaverse</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMetaverseLoading ? <Skeleton className="h-24 w-full" /> : aiMetaverse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMetaverse.plans || aiMetaverse.recommendations || aiMetaverse.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAgentCustLoading || aiAgentCust) && (
              <Card data-testid="card-ai-agent-cust">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Agent Customizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAgentCustLoading ? <Skeleton className="h-24 w-full" /> : aiAgentCust && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAgentCust.agents || aiAgentCust.recommendations || aiAgentCust.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCreatorAPILoading || aiCreatorAPI) && (
              <Card data-testid="card-ai-creator-api">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Creator API</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCreatorAPILoading ? <Skeleton className="h-24 w-full" /> : aiCreatorAPI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCreatorAPI.endpoints || aiCreatorAPI.recommendations || aiCreatorAPI.results)}
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
          onClick={() => setShowAudioAI(!showAudioAI)}
          data-testid="button-toggle-audio-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Audio & Podcast Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showAudioAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAudioAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiPodLaunchLoading || aiPodLaunch) && (
              <Card data-testid="card-ai-pod-launch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast Launch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodLaunchLoading ? <Skeleton className="h-24 w-full" /> : aiPodLaunch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodLaunch.steps || aiPodLaunch.recommendations || aiPodLaunch.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPodEpisodeLoading || aiPodEpisode) && (
              <Card data-testid="card-ai-pod-episode">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast Episode</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodEpisodeLoading ? <Skeleton className="h-24 w-full" /> : aiPodEpisode && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodEpisode.episodes || aiPodEpisode.recommendations || aiPodEpisode.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPodSEOLoading || aiPodSEO) && (
              <Card data-testid="card-ai-pod-seo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast SEO</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodSEOLoading ? <Skeleton className="h-24 w-full" /> : aiPodSEO && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodSEO.keywords || aiPodSEO.recommendations || aiPodSEO.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAudioBrandLoading || aiAudioBrand) && (
              <Card data-testid="card-ai-audio-brand">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audio Branding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAudioBrandLoading ? <Skeleton className="h-24 w-full" /> : aiAudioBrand && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAudioBrand.elements || aiAudioBrand.recommendations || aiAudioBrand.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMusicCompLoading || aiMusicComp) && (
              <Card data-testid="card-ai-music-comp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Music Composer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMusicCompLoading ? <Skeleton className="h-24 w-full" /> : aiMusicComp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMusicComp.tracks || aiMusicComp.recommendations || aiMusicComp.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiASMRLoading || aiASMR) && (
              <Card data-testid="card-ai-asmr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI ASMR</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiASMRLoading ? <Skeleton className="h-24 w-full" /> : aiASMR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiASMR.triggers || aiASMR.recommendations || aiASMR.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceTrainLoading || aiVoiceTrain) && (
              <Card data-testid="card-ai-voice-train">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voice Training</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceTrainLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceTrain && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVoiceTrain.exercises || aiVoiceTrain.recommendations || aiVoiceTrain.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAudioMixLoading || aiAudioMix) && (
              <Card data-testid="card-ai-audio-mix">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audio Mixing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAudioMixLoading ? <Skeleton className="h-24 w-full" /> : aiAudioMix && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAudioMix.settings || aiAudioMix.recommendations || aiAudioMix.results)}
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
          onClick={() => setShowSecurityAI(!showSecurityAI)}
          data-testid="button-toggle-security-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Security & Privacy Suite</span>
          <Badge variant="outline" className="text-[10px]">6 tools</Badge>
          {showSecurityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showSecurityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiPassSecLoading || aiPassSec) && (
              <Card data-testid="card-ai-pass-sec">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Password Security</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPassSecLoading ? <Skeleton className="h-24 w-full" /> : aiPassSec && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPassSec.tips || aiPassSec.recommendations || aiPassSec.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPhishingLoading || aiPhishing) && (
              <Card data-testid="card-ai-phishing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Phishing Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPhishingLoading ? <Skeleton className="h-24 w-full" /> : aiPhishing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPhishing.threats || aiPhishing.recommendations || aiPhishing.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAcctRecovLoading || aiAcctRecov) && (
              <Card data-testid="card-ai-acct-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Account Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAcctRecovLoading ? <Skeleton className="h-24 w-full" /> : aiAcctRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAcctRecov.steps || aiAcctRecov.recommendations || aiAcctRecov.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPrivSettingsLoading || aiPrivSettings) && (
              <Card data-testid="card-ai-priv-settings">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Privacy Settings</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPrivSettingsLoading ? <Skeleton className="h-24 w-full" /> : aiPrivSettings && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPrivSettings.settings || aiPrivSettings.recommendations || aiPrivSettings.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDataBreachLoading || aiDataBreach) && (
              <Card data-testid="card-ai-data-breach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Data Breach Monitor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDataBreachLoading ? <Skeleton className="h-24 w-full" /> : aiDataBreach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDataBreach.alerts || aiDataBreach.recommendations || aiDataBreach.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVPNLoading || aiVPN) && (
              <Card data-testid="card-ai-vpn">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI VPN Advisor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVPNLoading ? <Skeleton className="h-24 w-full" /> : aiVPN && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVPN.providers || aiVPN.recommendations || aiVPN.results)}
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
          onClick={() => setShowMultiPlatAI(!showMultiPlatAI)}
          data-testid="button-toggle-multi-plat-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Multi-Platform Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showMultiPlatAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showMultiPlatAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiTTAlgoLoading || aiTTAlgo) && (
              <Card data-testid="card-ai-tt-algo"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Algorithm</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTAlgoLoading ? <Skeleton className="h-24 w-full" /> : aiTTAlgo && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTAlgo.tips || aiTTAlgo.algorithm || aiTTAlgo.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTSoundsLoading || aiTTSounds) && (
              <Card data-testid="card-ai-tt-sounds"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Sounds</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTSoundsLoading ? <Skeleton className="h-24 w-full" /> : aiTTSounds && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTSounds.sounds || aiTTSounds.trending || aiTTSounds.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTDuetLoading || aiTTDuet) && (
              <Card data-testid="card-ai-tt-duet"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Duet</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTDuetLoading ? <Skeleton className="h-24 w-full" /> : aiTTDuet && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTDuet.ideas || aiTTDuet.strategies || aiTTDuet.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTLiveLoading || aiTTLive) && (
              <Card data-testid="card-ai-tt-live"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Live</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTLiveLoading ? <Skeleton className="h-24 w-full" /> : aiTTLive && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTLive.tips || aiTTLive.strategies || aiTTLive.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTShopLoading || aiTTShop) && (
              <Card data-testid="card-ai-tt-shop"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Shop</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTShopLoading ? <Skeleton className="h-24 w-full" /> : aiTTShop && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTShop.products || aiTTShop.strategies || aiTTShop.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTFundLoading || aiTTFund) && (
              <Card data-testid="card-ai-tt-fund"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Fund</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTFundLoading ? <Skeleton className="h-24 w-full" /> : aiTTFund && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTFund.eligibility || aiTTFund.tips || aiTTFund.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTHashLoading || aiTTHash) && (
              <Card data-testid="card-ai-tt-hash"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Hashtags</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTHashLoading ? <Skeleton className="h-24 w-full" /> : aiTTHash && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTHash.hashtags || aiTTHash.trending || aiTTHash.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTTProfileLoading || aiTTProfile) && (
              <Card data-testid="card-ai-tt-profile"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI TikTok Profile</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTTProfileLoading ? <Skeleton className="h-24 w-full" /> : aiTTProfile && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTTProfile.optimization || aiTTProfile.tips || aiTTProfile.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGReelsLoading || aiIGReels) && (
              <Card data-testid="card-ai-ig-reels"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Reels</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGReelsLoading ? <Skeleton className="h-24 w-full" /> : aiIGReels && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGReels.ideas || aiIGReels.trends || aiIGReels.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGStoriesLoading || aiIGStories) && (
              <Card data-testid="card-ai-ig-stories"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Stories</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGStoriesLoading ? <Skeleton className="h-24 w-full" /> : aiIGStories && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGStories.ideas || aiIGStories.templates || aiIGStories.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGCarouselLoading || aiIGCarousel) && (
              <Card data-testid="card-ai-ig-carousel"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Carousel</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGCarouselLoading ? <Skeleton className="h-24 w-full" /> : aiIGCarousel && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGCarousel.slides || aiIGCarousel.ideas || aiIGCarousel.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGBioLoading || aiIGBio) && (
              <Card data-testid="card-ai-ig-bio"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Bio</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGBioLoading ? <Skeleton className="h-24 w-full" /> : aiIGBio && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGBio.bios || aiIGBio.suggestions || aiIGBio.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGShopLoading || aiIGShop) && (
              <Card data-testid="card-ai-ig-shop"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Shopping</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGShopLoading ? <Skeleton className="h-24 w-full" /> : aiIGShop && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGShop.products || aiIGShop.tips || aiIGShop.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGCollabsLoading || aiIGCollabs) && (
              <Card data-testid="card-ai-ig-collabs"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Collabs</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGCollabsLoading ? <Skeleton className="h-24 w-full" /> : aiIGCollabs && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGCollabs.partners || aiIGCollabs.ideas || aiIGCollabs.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGGrowthLoading || aiIGGrowth) && (
              <Card data-testid="card-ai-ig-growth"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Growth</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiIGGrowth && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGGrowth.strategies || aiIGGrowth.hacks || aiIGGrowth.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiIGAestheticLoading || aiIGAesthetic) && (
              <Card data-testid="card-ai-ig-aesthetic"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI IG Aesthetic</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiIGAestheticLoading ? <Skeleton className="h-24 w-full" /> : aiIGAesthetic && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiIGAesthetic.themes || aiIGAesthetic.palette || aiIGAesthetic.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiXGrowthLoading || aiXGrowth) && (
              <Card data-testid="card-ai-x-growth"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI X Growth</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiXGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiXGrowth && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiXGrowth.strategies || aiXGrowth.tips || aiXGrowth.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiXThreadLoading || aiXThread) && (
              <Card data-testid="card-ai-x-thread"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI X Thread</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiXThreadLoading ? <Skeleton className="h-24 w-full" /> : aiXThread && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiXThread.threads || aiXThread.hooks || aiXThread.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiLICreatorLoading || aiLICreator) && (
              <Card data-testid="card-ai-li-creator"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI LinkedIn Creator</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiLICreatorLoading ? <Skeleton className="h-24 w-full" /> : aiLICreator && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiLICreator.tips || aiLICreator.content || aiLICreator.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiLIArticleLoading || aiLIArticle) && (
              <Card data-testid="card-ai-li-article"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI LinkedIn Article</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiLIArticleLoading ? <Skeleton className="h-24 w-full" /> : aiLIArticle && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiLIArticle.topics || aiLIArticle.outlines || aiLIArticle.recommendations)}</div>)}</CardContent></Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCreatorPlatAI(!showCreatorPlatAI)}
          data-testid="button-toggle-creator-plat-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Creator Platforms Suite</span>
          <Badge variant="outline" className="text-[10px]">11 tools</Badge>
          {showCreatorPlatAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCreatorPlatAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiFBGroupsLoading || aiFBGroups) && (
              <Card data-testid="card-ai-fb-groups"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI FB Groups</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiFBGroupsLoading ? <Skeleton className="h-24 w-full" /> : aiFBGroups && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiFBGroups.groups || aiFBGroups.strategies || aiFBGroups.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiFBReelsLoading || aiFBReels) && (
              <Card data-testid="card-ai-fb-reels"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI FB Reels</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiFBReelsLoading ? <Skeleton className="h-24 w-full" /> : aiFBReels && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiFBReels.ideas || aiFBReels.tips || aiFBReels.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiSnapchatLoading || aiSnapchat) && (
              <Card data-testid="card-ai-snapchat"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Snapchat</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiSnapchatLoading ? <Skeleton className="h-24 w-full" /> : aiSnapchat && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiSnapchat.content || aiSnapchat.tips || aiSnapchat.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiThreadsLoading || aiThreads) && (
              <Card data-testid="card-ai-threads"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Threads</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiThreadsLoading ? <Skeleton className="h-24 w-full" /> : aiThreads && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiThreads.posts || aiThreads.strategies || aiThreads.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiDiscordOptLoading || aiDiscordOpt) && (
              <Card data-testid="card-ai-discord-opt"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Discord Optimize</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiDiscordOptLoading ? <Skeleton className="h-24 w-full" /> : aiDiscordOpt && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiDiscordOpt.channels || aiDiscordOpt.bots || aiDiscordOpt.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiPatreonLoading || aiPatreon) && (
              <Card data-testid="card-ai-patreon"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Patreon Content</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiPatreonLoading ? <Skeleton className="h-24 w-full" /> : aiPatreon && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiPatreon.tiers || aiPatreon.content || aiPatreon.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiSubstackLoading || aiSubstack) && (
              <Card data-testid="card-ai-substack"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Substack</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiSubstackLoading ? <Skeleton className="h-24 w-full" /> : aiSubstack && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiSubstack.topics || aiSubstack.newsletter || aiSubstack.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiGumroadLoading || aiGumroad) && (
              <Card data-testid="card-ai-gumroad"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Gumroad</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiGumroadLoading ? <Skeleton className="h-24 w-full" /> : aiGumroad && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiGumroad.products || aiGumroad.pricing || aiGumroad.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiTeachableLoading || aiTeachable) && (
              <Card data-testid="card-ai-teachable"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Teachable</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiTeachableLoading ? <Skeleton className="h-24 w-full" /> : aiTeachable && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiTeachable.courses || aiTeachable.curriculum || aiTeachable.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiBuyMeCoffeeLoading || aiBuyMeCoffee) && (
              <Card data-testid="card-ai-buy-me-coffee"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Buy Me Coffee</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiBuyMeCoffeeLoading ? <Skeleton className="h-24 w-full" /> : aiBuyMeCoffee && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiBuyMeCoffee.tips || aiBuyMeCoffee.perks || aiBuyMeCoffee.recommendations)}</div>)}</CardContent></Card>
            )}
            {(aiChaturbateLoading || aiChaturbate) && (
              <Card data-testid="card-ai-chaturbate"><CardContent className="p-4"><div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="h-4 w-4 text-purple-400" /><h3 className="font-semibold text-sm">AI Chaturbate</h3><Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge></div>{aiChaturbateLoading ? <Skeleton className="h-24 w-full" /> : aiChaturbate && (<div className="space-y-2 text-xs text-muted-foreground">{renderAIList(aiChaturbate.tips || aiChaturbate.strategies || aiChaturbate.recommendations)}</div>)}</CardContent></Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCrisisAI(!showCrisisAI)}
          data-testid="button-toggle-crisis-ai"
        >
          <Sparkles className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold">AI Crisis Management Suite</span>
          <Badge variant="outline" className="text-[10px]">14 tools</Badge>
          {showCrisisAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCrisisAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCrisisRespLoading || aiCrisisResp) && (
              <Card data-testid="card-ai-crisis-resp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Crisis Response</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrisisRespLoading ? <Skeleton className="h-24 w-full" /> : aiCrisisResp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrisisResp.strategies || aiCrisisResp.tips || aiCrisisResp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiApologyLoading || aiApology) && (
              <Card data-testid="card-ai-apology">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Apology Script</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiApologyLoading ? <Skeleton className="h-24 w-full" /> : aiApology && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiApology.strategies || aiApology.tips || aiApology.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiControversyLoading || aiControversy) && (
              <Card data-testid="card-ai-controversy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Controversy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiControversyLoading ? <Skeleton className="h-24 w-full" /> : aiControversy && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiControversy.strategies || aiControversy.tips || aiControversy.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCancelCultureLoading || aiCancelCulture) && (
              <Card data-testid="card-ai-cancel-culture">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Cancel Culture</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCancelCultureLoading ? <Skeleton className="h-24 w-full" /> : aiCancelCulture && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCancelCulture.strategies || aiCancelCulture.tips || aiCancelCulture.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrisisDetectLoading || aiCrisisDetect) && (
              <Card data-testid="card-ai-crisis-detect">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Crisis Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrisisDetectLoading ? <Skeleton className="h-24 w-full" /> : aiCrisisDetect && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrisisDetect.strategies || aiCrisisDetect.tips || aiCrisisDetect.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDamageCtrlLoading || aiDamageCtrl) && (
              <Card data-testid="card-ai-damage-ctrl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Damage Control</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDamageCtrlLoading ? <Skeleton className="h-24 w-full" /> : aiDamageCtrl && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDamageCtrl.strategies || aiDamageCtrl.tips || aiDamageCtrl.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPRStmtLoading || aiPRStmt) && (
              <Card data-testid="card-ai-pr-stmt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI PR Statement</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPRStmtLoading ? <Skeleton className="h-24 w-full" /> : aiPRStmt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPRStmt.strategies || aiPRStmt.tips || aiPRStmt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStakeholderLoading || aiStakeholder) && (
              <Card data-testid="card-ai-stakeholder">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Stakeholder Comm</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStakeholderLoading ? <Skeleton className="h-24 w-full" /> : aiStakeholder && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStakeholder.strategies || aiStakeholder.tips || aiStakeholder.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRecovStratLoading || aiRecovStrat) && (
              <Card data-testid="card-ai-recov-strat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Recovery Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRecovStratLoading ? <Skeleton className="h-24 w-full" /> : aiRecovStrat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRecovStrat.strategies || aiRecovStrat.tips || aiRecovStrat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediaRespLoading || aiMediaResp) && (
              <Card data-testid="card-ai-media-resp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Media Response</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediaRespLoading ? <Skeleton className="h-24 w-full" /> : aiMediaResp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMediaResp.strategies || aiMediaResp.tips || aiMediaResp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLegalRiskLoading || aiLegalRisk) && (
              <Card data-testid="card-ai-legal-risk">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Legal Risk</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLegalRiskLoading ? <Skeleton className="h-24 w-full" /> : aiLegalRisk && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLegalRisk.strategies || aiLegalRisk.tips || aiLegalRisk.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSocialCrisisLoading || aiSocialCrisis) && (
              <Card data-testid="card-ai-social-crisis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Social Crisis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSocialCrisisLoading ? <Skeleton className="h-24 w-full" /> : aiSocialCrisis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSocialCrisis.strategies || aiSocialCrisis.tips || aiSocialCrisis.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInflCrisisLoading || aiInflCrisis) && (
              <Card data-testid="card-ai-infl-crisis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Influencer Crisis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInflCrisisLoading ? <Skeleton className="h-24 w-full" /> : aiInflCrisis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInflCrisis.strategies || aiInflCrisis.tips || aiInflCrisis.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandRecovLoading || aiBrandRecov) && (
              <Card data-testid="card-ai-brand-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Brand Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandRecovLoading ? <Skeleton className="h-24 w-full" /> : aiBrandRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandRecov.strategies || aiBrandRecov.tips || aiBrandRecov.recommendations)}
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
          onClick={() => setShowAutoSuiteAI(!showAutoSuiteAI)}
          data-testid="button-toggle-auto-suite-ai"
        >
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">AI Automation Suite</span>
          <Badge variant="outline" className="text-[10px]">14 tools</Badge>
          {showAutoSuiteAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAutoSuiteAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiWorkflowAutoASLoading || aiWorkflowAutoAS) && (
              <Card data-testid="card-ai-workflow-auto">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Workflow Automation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkflowAutoASLoading ? <Skeleton className="h-24 w-full" /> : aiWorkflowAutoAS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkflowAutoAS.strategies || aiWorkflowAutoAS.tips || aiWorkflowAutoAS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiZapierLoading || aiZapier) && (
              <Card data-testid="card-ai-zapier">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Zapier</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiZapierLoading ? <Skeleton className="h-24 w-full" /> : aiZapier && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiZapier.strategies || aiZapier.tips || aiZapier.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIFTTTLoading || aiIFTTT) && (
              <Card data-testid="card-ai-ifttt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI IFTTT</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIFTTTLoading ? <Skeleton className="h-24 w-full" /> : aiIFTTT && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiIFTTT.strategies || aiIFTTT.tips || aiIFTTT.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMakeSceneLoading || aiMakeScene) && (
              <Card data-testid="card-ai-make-scene">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Make Scenario</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMakeSceneLoading ? <Skeleton className="h-24 w-full" /> : aiMakeScene && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMakeScene.strategies || aiMakeScene.tips || aiMakeScene.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoSchedLoading || aiAutoSched) && (
              <Card data-testid="card-ai-auto-sched">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Scheduler</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoSchedLoading ? <Skeleton className="h-24 w-full" /> : aiAutoSched && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoSched.strategies || aiAutoSched.tips || aiAutoSched.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoRespASLoading || aiAutoRespAS) && (
              <Card data-testid="card-ai-auto-resp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Responder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoRespASLoading ? <Skeleton className="h-24 w-full" /> : aiAutoRespAS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoRespAS.strategies || aiAutoRespAS.tips || aiAutoRespAS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoModASLoading || aiAutoModAS) && (
              <Card data-testid="card-ai-auto-mod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Moderator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoModASLoading ? <Skeleton className="h-24 w-full" /> : aiAutoModAS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoModAS.strategies || aiAutoModAS.tips || aiAutoModAS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoBackLoading || aiAutoBack) && (
              <Card data-testid="card-ai-auto-back">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Backup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoBackLoading ? <Skeleton className="h-24 w-full" /> : aiAutoBack && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoBack.strategies || aiAutoBack.tips || aiAutoBack.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoRepLoading || aiAutoRep) && (
              <Card data-testid="card-ai-auto-rep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Reporter</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoRepLoading ? <Skeleton className="h-24 w-full" /> : aiAutoRep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoRep.strategies || aiAutoRep.tips || aiAutoRep.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutoOptLoading || aiAutoOpt) && (
              <Card data-testid="card-ai-auto-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Auto Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutoOptLoading ? <Skeleton className="h-24 w-full" /> : aiAutoOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutoOpt.strategies || aiAutoOpt.tips || aiAutoOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBatchProcLoading || aiBatchProc) && (
              <Card data-testid="card-ai-batch-proc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Batch Processor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBatchProcLoading ? <Skeleton className="h-24 w-full" /> : aiBatchProc && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBatchProc.strategies || aiBatchProc.tips || aiBatchProc.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSmartQueueLoading || aiSmartQueue) && (
              <Card data-testid="card-ai-smart-queue">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Smart Queue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSmartQueueLoading ? <Skeleton className="h-24 w-full" /> : aiSmartQueue && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSmartQueue.strategies || aiSmartQueue.tips || aiSmartQueue.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContPipelineLoading || aiContPipeline) && (
              <Card data-testid="card-ai-cont-pipeline">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Content Pipeline</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContPipelineLoading ? <Skeleton className="h-24 w-full" /> : aiContPipeline && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContPipeline.strategies || aiContPipeline.tips || aiContPipeline.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrainDataLoading || aiTrainData) && (
              <Card data-testid="card-ai-train-data">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="font-semibold text-sm">AI Training Data</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrainDataLoading ? <Skeleton className="h-24 w-full" /> : aiTrainData && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrainData.strategies || aiTrainData.tips || aiTrainData.recommendations)}
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
          onClick={() => setShowBizContAI(!showBizContAI)}
          data-testid="button-toggle-biz-cont-ai"
        >
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">AI Business Continuity Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showBizContAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showBizContAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCommTrustLoading || aiCommTrust) && (
              <Card data-testid="card-ai-comm-trust">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Trust Rebuild</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommTrustLoading ? <Skeleton className="h-24 w-full" /> : aiCommTrust && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommTrust.strategies || aiCommTrust.tips || aiCommTrust.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAlgoRecovLoading || aiAlgoRecov) && (
              <Card data-testid="card-ai-algo-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Algorithm Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAlgoRecovLoading ? <Skeleton className="h-24 w-full" /> : aiAlgoRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAlgoRecov.strategies || aiAlgoRecov.tips || aiAlgoRecov.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevRecovLoading || aiRevRecov) && (
              <Card data-testid="card-ai-rev-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Revenue Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevRecovLoading ? <Skeleton className="h-24 w-full" /> : aiRevRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRevRecov.strategies || aiRevRecov.tips || aiRevRecov.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTeamCrisisBCLoading || aiTeamCrisisBC) && (
              <Card data-testid="card-ai-team-crisis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Team Crisis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTeamCrisisBCLoading ? <Skeleton className="h-24 w-full" /> : aiTeamCrisisBC && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTeamCrisisBC.strategies || aiTeamCrisisBC.tips || aiTeamCrisisBC.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLegalDefLoading || aiLegalDef) && (
              <Card data-testid="card-ai-legal-def">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Legal Defense</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLegalDefLoading ? <Skeleton className="h-24 w-full" /> : aiLegalDef && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLegalDef.strategies || aiLegalDef.tips || aiLegalDef.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInsClaimLoading || aiInsClaim) && (
              <Card data-testid="card-ai-ins-claim">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Insurance Claim</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInsClaimLoading ? <Skeleton className="h-24 w-full" /> : aiInsClaim && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInsClaim.strategies || aiInsClaim.tips || aiInsClaim.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContingencyLoading || aiContingency) && (
              <Card data-testid="card-ai-contingency">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Contingency</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContingencyLoading ? <Skeleton className="h-24 w-full" /> : aiContingency && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContingency.strategies || aiContingency.tips || aiContingency.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDisasterRecovLoading || aiDisasterRecov) && (
              <Card data-testid="card-ai-disaster-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Disaster Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDisasterRecovLoading ? <Skeleton className="h-24 w-full" /> : aiDisasterRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDisasterRecov.strategies || aiDisasterRecov.tips || aiDisasterRecov.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBizContBCLoading || aiBizContBC) && (
              <Card data-testid="card-ai-biz-cont">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Business Continuity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBizContBCLoading ? <Skeleton className="h-24 w-full" /> : aiBizContBC && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBizContBC.strategies || aiBizContBC.tips || aiBizContBC.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExitStratLoading || aiExitStrat) && (
              <Card data-testid="card-ai-exit-strat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm">AI Exit Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExitStratLoading ? <Skeleton className="h-24 w-full" /> : aiExitStrat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiExitStrat.strategies || aiExitStrat.tips || aiExitStrat.recommendations)}
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
export default function Settings() {
  usePageTitle("Settings");
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const { data: profile } = useQuery<any>({ queryKey: ["/api/user/profile"] });
  const isAdmin = profile?.role === "admin";
  const tabs = baseTabs.filter((t) => !t.adminOnly || isAdmin);
  const activeTab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : "general";

  const handleTabClick = (tab: TabKey) => {
    if (tab === "general") {
      setLocation("/settings");
    } else {
      setLocation(`/settings/${tab}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Settings</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground">Manage your account, brand, and tools</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="tab-bar">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? "default" : "secondary"}
            size="sm"
            onClick={() => handleTabClick(t.key)}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "general" && <GeneralTab />}
      <Suspense fallback={<TabFallback />}>
        {activeTab === "brand" && <BrandTab />}
        {activeTab === "collabs" && <CollabsTab />}
        {activeTab === "competitors" && <CompetitorsTab />}
        {activeTab === "legal" && <LegalTab />}
        {activeTab === "wellness" && <WellnessTab />}
        {activeTab === "learning" && <LearningTab />}
        {activeTab === "automation" && <AutomationTab />}
        {activeTab === "subscription" && <SubscriptionTab />}
        {activeTab === "admin-codes" && isAdmin && <AdminCodesTab />}
        {activeTab === "admin-users" && isAdmin && <AdminUsersTab />}
      </Suspense>
    </div>
  );
}

const SETTINGS_LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  ru: "Russian", it: "Italian",
};

function LanguageTrafficSuggestions() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const { data: recommendations } = useQuery<any>({
    queryKey: ["/api/localization/recommendations"],
  });

  const recLangs: string[] = Array.isArray(recommendations?.recommendedLanguages)
    ? recommendations.recommendedLanguages
    : [];
  const hasRecs = recLangs.length > 0 && recommendations?.source !== "none";

  const suggestedUiLangs = recLangs
    .filter((code: string) => supportedLanguages.some((l) => l.code === code))
    .filter((code: string) => code !== i18n.language)
    .slice(0, 3);

  if (!hasRecs || suggestedUiLangs.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t" data-testid="section-language-suggestions">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">{t("localization.suggestedByTraffic")}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {suggestedUiLangs.map((code: string) => {
          const lang = supportedLanguages.find((l) => l.code === code);
          if (!lang) return null;
          return (
            <Button
              key={code}
              variant="outline"
              size="sm"
              data-testid={`button-suggest-lang-${code}`}
              onClick={() => {
                i18n.changeLanguage(code);
                toast({ title: t("settings.languageChanged", { language: lang.nativeName }) });
              }}
            >
              <TrendingUp className="h-3 w-3 mr-1.5" />
              {lang.nativeName}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
