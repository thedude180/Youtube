import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Shield, Zap, AlertTriangle, Save, LogOut, Link2, Bell,
  Plus, Sparkles, CalendarDays, Heart, BookOpen, CheckCircle2,
  Link as LinkIcon, Users, Eye, Palette, Trash2, Target, Handshake, Mail, Briefcase,
  ChevronDown, ChevronUp, Clock, Globe, Play, UserPlus, CheckCircle, DollarSign,
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
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";

type TabKey = "general" | "brand" | "collabs" | "competitors" | "legal" | "wellness" | "learning" | "automation";

const VALID_TABS: TabKey[] = ["general", "brand", "collabs", "competitors", "legal", "wellness", "learning", "automation"];

const tabs: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "brand", label: "Brand" },
  { key: "collabs", label: "Collabs" },
  { key: "competitors", label: "Competitors" },
  { key: "legal", label: "Legal" },
  { key: "wellness", label: "Wellness" },
  { key: "learning", label: "Learning" },
  { key: "automation", label: "Automation Hub" },
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
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");
  const [aiTeam, setAiTeam] = useState<any>(null);
  const [aiTeamLoading, setAiTeamLoading] = useState(true);
  const [aiAutomations, setAiAutomations] = useState<any>(null);
  const [aiAutomationsLoading, setAiAutomationsLoading] = useState(true);

  const [showTeamAI, setShowTeamAI] = useState(false);
  const [aiHiring, setAiHiring] = useState<any>(null);
  const [aiHiringLoading, setAiHiringLoading] = useState(false);
  const [aiFreelance, setAiFreelance] = useState<any>(null);
  const [aiFreelanceLoading, setAiFreelanceLoading] = useState(false);
  const [aiSOP, setAiSOP] = useState<any>(null);
  const [aiSOPLoading, setAiSOPLoading] = useState(false);
  const [aiTimeline, setAiTimeline] = useState<any>(null);
  const [aiTimelineLoading, setAiTimelineLoading] = useState(false);
  const [aiApproval, setAiApproval] = useState<any>(null);
  const [aiApprovalLoading, setAiApprovalLoading] = useState(false);
  const [aiEditChecklist, setAiEditChecklist] = useState<any>(null);
  const [aiEditChecklistLoading, setAiEditChecklistLoading] = useState(false);
  const [aiProdBudget, setAiProdBudget] = useState<any>(null);
  const [aiProdBudgetLoading, setAiProdBudgetLoading] = useState(false);
  const [aiEquip, setAiEquip] = useState<any>(null);
  const [aiEquipLoading, setAiEquipLoading] = useState(false);
  const [aiStudio, setAiStudio] = useState<any>(null);
  const [aiStudioLoading, setAiStudioLoading] = useState(false);
  const [aiWorkflow, setAiWorkflow] = useState<any>(null);
  const [aiWorkflowLoading, setAiWorkflowLoading] = useState(false);
  const [aiBatchRec, setAiBatchRec] = useState<any>(null);
  const [aiBatchRecLoading, setAiBatchRecLoading] = useState(false);
  const [aiOutsource, setAiOutsource] = useState<any>(null);
  const [aiOutsourceLoading, setAiOutsourceLoading] = useState(false);
  const [aiToolStack, setAiToolStack] = useState<any>(null);
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
      try { setAiTeam(JSON.parse(cachedTeam)); setAiTeamLoading(false); } catch { setAiTeamLoading(false); }
    } else {
      apiRequest("POST", "/api/ai/team-manager")
        .then((res) => res.json())
        .then((data) => { setAiTeam(data); sessionStorage.setItem("aiTeamManager", JSON.stringify(data)); })
        .catch(() => {})
        .finally(() => setAiTeamLoading(false));
    }
    const cachedAuto = sessionStorage.getItem("aiAutomationBuilder");
    if (cachedAuto) {
      try { setAiAutomations(JSON.parse(cachedAuto)); setAiAutomationsLoading(false); } catch { setAiAutomationsLoading(false); }
    } else {
      apiRequest("POST", "/api/ai/automation-builder")
        .then((res) => res.json())
        .then((data) => { setAiAutomations(data); sessionStorage.setItem("aiAutomationBuilder", JSON.stringify(data)); })
        .catch(() => {})
        .finally(() => setAiAutomationsLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hiring");
    if (cached) { try { setAiHiring(JSON.parse(cached)); return; } catch {} }
    setAiHiringLoading(true);
    apiRequest("POST", "/api/ai/hiring", {}).then(r => r.json()).then(d => { setAiHiring(d); sessionStorage.setItem("ai_hiring", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHiringLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_freelance");
    if (cached) { try { setAiFreelance(JSON.parse(cached)); return; } catch {} }
    setAiFreelanceLoading(true);
    apiRequest("POST", "/api/ai/freelancer", {}).then(r => r.json()).then(d => { setAiFreelance(d); sessionStorage.setItem("ai_freelance", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFreelanceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sop");
    if (cached) { try { setAiSOP(JSON.parse(cached)); return; } catch {} }
    setAiSOPLoading(true);
    apiRequest("POST", "/api/ai/sop-builder", {}).then(r => r.json()).then(d => { setAiSOP(d); sessionStorage.setItem("ai_sop", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSOPLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_timeline");
    if (cached) { try { setAiTimeline(JSON.parse(cached)); return; } catch {} }
    setAiTimelineLoading(true);
    apiRequest("POST", "/api/ai/project-timeline", {}).then(r => r.json()).then(d => { setAiTimeline(d); sessionStorage.setItem("ai_timeline", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTimelineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_approval");
    if (cached) { try { setAiApproval(JSON.parse(cached)); return; } catch {} }
    setAiApprovalLoading(true);
    apiRequest("POST", "/api/ai/approval-flow", {}).then(r => r.json()).then(d => { setAiApproval(d); sessionStorage.setItem("ai_approval", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiApprovalLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_edit_checklist");
    if (cached) { try { setAiEditChecklist(JSON.parse(cached)); return; } catch {} }
    setAiEditChecklistLoading(true);
    apiRequest("POST", "/api/ai/editing-checklist", {}).then(r => r.json()).then(d => { setAiEditChecklist(d); sessionStorage.setItem("ai_edit_checklist", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEditChecklistLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_prod_budget");
    if (cached) { try { setAiProdBudget(JSON.parse(cached)); return; } catch {} }
    setAiProdBudgetLoading(true);
    apiRequest("POST", "/api/ai/production-budget", {}).then(r => r.json()).then(d => { setAiProdBudget(d); sessionStorage.setItem("ai_prod_budget", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProdBudgetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_equip");
    if (cached) { try { setAiEquip(JSON.parse(cached)); return; } catch {} }
    setAiEquipLoading(true);
    apiRequest("POST", "/api/ai/equipment", {}).then(r => r.json()).then(d => { setAiEquip(d); sessionStorage.setItem("ai_equip", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEquipLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_studio");
    if (cached) { try { setAiStudio(JSON.parse(cached)); return; } catch {} }
    setAiStudioLoading(true);
    apiRequest("POST", "/api/ai/studio-setup", {}).then(r => r.json()).then(d => { setAiStudio(d); sessionStorage.setItem("ai_studio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStudioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_workflow");
    if (cached) { try { setAiWorkflow(JSON.parse(cached)); return; } catch {} }
    setAiWorkflowLoading(true);
    apiRequest("POST", "/api/ai/workflow-optimizer", {}).then(r => r.json()).then(d => { setAiWorkflow(d); sessionStorage.setItem("ai_workflow", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorkflowLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_batch_rec");
    if (cached) { try { setAiBatchRec(JSON.parse(cached)); return; } catch {} }
    setAiBatchRecLoading(true);
    apiRequest("POST", "/api/ai/batch-recording", {}).then(r => r.json()).then(d => { setAiBatchRec(d); sessionStorage.setItem("ai_batch_rec", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBatchRecLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_outsource");
    if (cached) { try { setAiOutsource(JSON.parse(cached)); return; } catch {} }
    setAiOutsourceLoading(true);
    apiRequest("POST", "/api/ai/outsourcing", {}).then(r => r.json()).then(d => { setAiOutsource(d); sessionStorage.setItem("ai_outsource", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOutsourceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tool_stack");
    if (cached) { try { setAiToolStack(JSON.parse(cached)); return; } catch {} }
    setAiToolStackLoading(true);
    apiRequest("POST", "/api/ai/tool-stack", {}).then(r => r.json()).then(d => { setAiToolStack(d); sessionStorage.setItem("ai_tool_stack", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiToolStackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_delegation2");
    if (cached) { try { setAiDelegation(JSON.parse(cached)); return; } catch {} }
    setAiDelegationLoading(true);
    apiRequest("POST", "/api/ai/delegation", {}).then(r => r.json()).then(d => { setAiDelegation(d); sessionStorage.setItem("ai_delegation2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDelegationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_time_mgmt");
    if (cached) { try { setAiTimeMgmt(JSON.parse(cached)); return; } catch {} }
    setAiTimeMgmtLoading(true);
    apiRequest("POST", "/api/ai/time-management", {}).then(r => r.json()).then(d => { setAiTimeMgmt(d); sessionStorage.setItem("ai_time_mgmt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTimeMgmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mastermind");
    if (cached) { try { setAiMastermind(JSON.parse(cached)); return; } catch {} }
    setAiMastermindLoading(true);
    apiRequest("POST", "/api/ai/mastermind", {}).then(r => r.json()).then(d => { setAiMastermind(d); sessionStorage.setItem("ai_mastermind", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMastermindLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_productivity");
    if (cached) { try { setAiProductivity(JSON.parse(cached)); return; } catch {} }
    setAiProductivityLoading(true);
    apiRequest("POST", "/api/ai/productivity", {}).then(r => r.json()).then(d => { setAiProductivity(d); sessionStorage.setItem("ai_productivity", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProductivityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_voice");
    if (cached) { try { setAiBrandVoice(JSON.parse(cached)); return; } catch {} }
    setAiBrandVoiceLoading(true);
    apiRequest("POST", "/api/ai/brand-voice", {}).then(r => r.json()).then(d => { setAiBrandVoice(d); sessionStorage.setItem("ai_brand_voice", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandVoiceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_colors");
    if (cached) { try { setAiBrandColors(JSON.parse(cached)); return; } catch {} }
    setAiBrandColorsLoading(true);
    apiRequest("POST", "/api/ai/brand-colors", {}).then(r => r.json()).then(d => { setAiBrandColors(d); sessionStorage.setItem("ai_brand_colors", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandColorsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_fonts");
    if (cached) { try { setAiBrandFonts(JSON.parse(cached)); return; } catch {} }
    setAiBrandFontsLoading(true);
    apiRequest("POST", "/api/ai/brand-fonts", {}).then(r => r.json()).then(d => { setAiBrandFonts(d); sessionStorage.setItem("ai_brand_fonts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandFontsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_story");
    if (cached) { try { setAiBrandStory(JSON.parse(cached)); return; } catch {} }
    setAiBrandStoryLoading(true);
    apiRequest("POST", "/api/ai/brand-story", {}).then(r => r.json()).then(d => { setAiBrandStory(d); sessionStorage.setItem("ai_brand_story", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandStoryLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_consist");
    if (cached) { try { setAiBrandConsist(JSON.parse(cached)); return; } catch {} }
    setAiBrandConsistLoading(true);
    apiRequest("POST", "/api/ai/brand-consistency", {}).then(r => r.json()).then(d => { setAiBrandConsist(d); sessionStorage.setItem("ai_brand_consist", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandConsistLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pillar_refine");
    if (cached) { try { setAiPillarRefine(JSON.parse(cached)); return; } catch {} }
    setAiPillarRefineLoading(true);
    apiRequest("POST", "/api/ai/pillar-refine", {}).then(r => r.json()).then(d => { setAiPillarRefine(d); sessionStorage.setItem("ai_pillar_refine", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPillarRefineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_trailer");
    if (cached) { try { setAiTrailer(JSON.parse(cached)); return; } catch {} }
    setAiTrailerLoading(true);
    apiRequest("POST", "/api/ai/channel-trailer", {}).then(r => r.json()).then(d => { setAiTrailer(d); sessionStorage.setItem("ai_trailer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTrailerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_art_dir");
    if (cached) { try { setAiArtDir(JSON.parse(cached)); return; } catch {} }
    setAiArtDirLoading(true);
    apiRequest("POST", "/api/ai/art-direction", {}).then(r => r.json()).then(d => { setAiArtDir(d); sessionStorage.setItem("ai_art_dir", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiArtDirLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_usp");
    if (cached) { try { setAiUSP(JSON.parse(cached)); return; } catch {} }
    setAiUSPLoading(true);
    apiRequest("POST", "/api/ai/usp-finder", {}).then(r => r.json()).then(d => { setAiUSP(d); sessionStorage.setItem("ai_usp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiUSPLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_target_aud");
    if (cached) { try { setAiTargetAud(JSON.parse(cached)); return; } catch {} }
    setAiTargetAudLoading(true);
    apiRequest("POST", "/api/ai/target-audience", {}).then(r => r.json()).then(d => { setAiTargetAud(d); sessionStorage.setItem("ai_target_aud", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTargetAudLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_partner");
    if (cached) { try { setAiBrandPartner(JSON.parse(cached)); return; } catch {} }
    setAiBrandPartnerLoading(true);
    apiRequest("POST", "/api/ai/brand-partnerships", {}).then(r => r.json()).then(d => { setAiBrandPartner(d); sessionStorage.setItem("ai_brand_partner", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandPartnerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis");
    if (cached) { try { setAiCrisis(JSON.parse(cached)); return; } catch {} }
    setAiCrisisLoading(true);
    apiRequest("POST", "/api/ai/crisis-comms", {}).then(r => r.json()).then(d => { setAiCrisis(d); sessionStorage.setItem("ai_crisis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_personal_brand");
    if (cached) { try { setAiPersonalBrand(JSON.parse(cached)); return; } catch {} }
    setAiPersonalBrandLoading(true);
    apiRequest("POST", "/api/ai/personal-brand", {}).then(r => r.json()).then(d => { setAiPersonalBrand(d); sessionStorage.setItem("ai_personal_brand", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPersonalBrandLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_evolution");
    if (cached) { try { setAiBrandEvolution(JSON.parse(cached)); return; } catch {} }
    setAiBrandEvolutionLoading(true);
    apiRequest("POST", "/api/ai/brand-evolution", {}).then(r => r.json()).then(d => { setAiBrandEvolution(d); sessionStorage.setItem("ai_brand_evolution", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandEvolutionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_diff");
    if (cached) { try { setAiCompDiff(JSON.parse(cached)); return; } catch {} }
    setAiCompDiffLoading(true);
    apiRequest("POST", "/api/ai/competitor-diff", {}).then(r => r.json()).then(d => { setAiCompDiff(d); sessionStorage.setItem("ai_comp_diff", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompDiffLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_brief");
    if (cached) { try { setAiCollabBrief(JSON.parse(cached)); return; } catch {} }
    setAiCollabBriefLoading(true);
    apiRequest("POST", "/api/ai/collab-brief", {}).then(r => r.json()).then(d => { setAiCollabBrief(d); sessionStorage.setItem("ai_collab_brief", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabBriefLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_network_prep");
    if (cached) { try { setAiNetworkPrep(JSON.parse(cached)); return; } catch {} }
    setAiNetworkPrepLoading(true);
    apiRequest("POST", "/api/ai/networking-prep", {}).then(r => r.json()).then(d => { setAiNetworkPrep(d); sessionStorage.setItem("ai_network_prep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNetworkPrepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mentorship");
    if (cached) { try { setAiMentorship(JSON.parse(cached)); return; } catch {} }
    setAiMentorshipLoading(true);
    apiRequest("POST", "/api/ai/mentorship", {}).then(r => r.json()).then(d => { setAiMentorship(d); sessionStorage.setItem("ai_mentorship", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMentorshipLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_yt_api");
    if (cached) { try { setAiYTAPI(JSON.parse(cached)); return; } catch {} }
    setAiYTAPILoading(true);
    apiRequest("POST", "/api/ai/youtube-api", {}).then(r => r.json()).then(d => { setAiYTAPI(d); sessionStorage.setItem("ai_yt_api", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiYTAPILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_twitch");
    if (cached) { try { setAiTwitch(JSON.parse(cached)); return; } catch {} }
    setAiTwitchLoading(true);
    apiRequest("POST", "/api/ai/twitch-integration", {}).then(r => r.json()).then(d => { setAiTwitch(d); sessionStorage.setItem("ai_twitch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTwitchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_discord_bot");
    if (cached) { try { setAiDiscordBot(JSON.parse(cached)); return; } catch {} }
    setAiDiscordBotLoading(true);
    apiRequest("POST", "/api/ai/discord-bot", {}).then(r => r.json()).then(d => { setAiDiscordBot(d); sessionStorage.setItem("ai_discord_bot", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDiscordBotLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ga");
    if (cached) { try { setAiGA(JSON.parse(cached)); return; } catch {} }
    setAiGALoading(true);
    apiRequest("POST", "/api/ai/ga-setup", {}).then(r => r.json()).then(d => { setAiGA(d); sessionStorage.setItem("ai_ga", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_social_sched");
    if (cached) { try { setAiSocialSched(JSON.parse(cached)); return; } catch {} }
    setAiSocialSchedLoading(true);
    apiRequest("POST", "/api/ai/social-scheduler", {}).then(r => r.json()).then(d => { setAiSocialSched(d); sessionStorage.setItem("ai_social_sched", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSocialSchedLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_mkt");
    if (cached) { try { setAiEmailMkt(JSON.parse(cached)); return; } catch {} }
    setAiEmailMktLoading(true);
    apiRequest("POST", "/api/ai/email-marketing", {}).then(r => r.json()).then(d => { setAiEmailMkt(d); sessionStorage.setItem("ai_email_mkt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEmailMktLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_podcast");
    if (cached) { try { setAiPodcast(JSON.parse(cached)); return; } catch {} }
    setAiPodcastLoading(true);
    apiRequest("POST", "/api/ai/podcast", {}).then(r => r.json()).then(d => { setAiPodcast(d); sessionStorage.setItem("ai_podcast", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodcastLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_webhooks");
    if (cached) { try { setAiWebhooks(JSON.parse(cached)); return; } catch {} }
    setAiWebhooksLoading(true);
    apiRequest("POST", "/api/ai/webhook-manager", {}).then(r => r.json()).then(d => { setAiWebhooks(d); sessionStorage.setItem("ai_webhooks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWebhooksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rate_limits");
    if (cached) { try { setAiRateLimits(JSON.parse(cached)); return; } catch {} }
    setAiRateLimitsLoading(true);
    apiRequest("POST", "/api/ai/rate-limits", {}).then(r => r.json()).then(d => { setAiRateLimits(d); sessionStorage.setItem("ai_rate_limits", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRateLimitsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_backup_plan");
    if (cached) { try { setAiBackupPlan(JSON.parse(cached)); return; } catch {} }
    setAiBackupPlanLoading(true);
    apiRequest("POST", "/api/ai/data-backup", {}).then(r => r.json()).then(d => { setAiBackupPlan(d); sessionStorage.setItem("ai_backup_plan", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBackupPlanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_notif_opt");
    if (cached) { try { setAiNotifOpt(JSON.parse(cached)); return; } catch {} }
    setAiNotifOptLoading(true);
    apiRequest("POST", "/api/ai/notification-optimizer", {}).then(r => r.json()).then(d => { setAiNotifOpt(d); sessionStorage.setItem("ai_notif_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNotifOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cross_post");
    if (cached) { try { setAiCrossPost(JSON.parse(cached)); return; } catch {} }
    setAiCrossPostLoading(true);
    apiRequest("POST", "/api/ai/cross-post", {}).then(r => r.json()).then(d => { setAiCrossPost(d); sessionStorage.setItem("ai_cross_post", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrossPostLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_linktree");
    if (cached) { try { setAiLinktree(JSON.parse(cached)); return; } catch {} }
    setAiLinktreeLoading(true);
    apiRequest("POST", "/api/ai/linktree", {}).then(r => r.json()).then(d => { setAiLinktree(d); sessionStorage.setItem("ai_linktree", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLinktreeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_qr_codes");
    if (cached) { try { setAiQRCodes(JSON.parse(cached)); return; } catch {} }
    setAiQRCodesLoading(true);
    apiRequest("POST", "/api/ai/qr-codes", {}).then(r => r.json()).then(d => { setAiQRCodes(d); sessionStorage.setItem("ai_qr_codes", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiQRCodesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_chatbot");
    if (cached) { try { setAiChatbot(JSON.parse(cached)); return; } catch {} }
    setAiChatbotLoading(true);
    apiRequest("POST", "/api/ai/chatbot-integrator", {}).then(r => r.json()).then(d => { setAiChatbot(d); sessionStorage.setItem("ai_chatbot", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChatbotLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_analytics_dash");
    if (cached) { try { setAiAnalyticsDash(JSON.parse(cached)); return; } catch {} }
    setAiAnalyticsDashLoading(true);
    apiRequest("POST", "/api/ai/analytics-dashboard", {}).then(r => r.json()).then(d => { setAiAnalyticsDash(d); sessionStorage.setItem("ai_analytics_dash", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAnalyticsDashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cdn");
    if (cached) { try { setAiCDN(JSON.parse(cached)); return; } catch {} }
    setAiCDNLoading(true);
    apiRequest("POST", "/api/ai/cdn-optimizer", {}).then(r => r.json()).then(d => { setAiCDN(d); sessionStorage.setItem("ai_cdn", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCDNLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_accessibility");
    if (cached) { try { setAiAccessibility(JSON.parse(cached)); return; } catch {} }
    setAiAccessibilityLoading(true);
    apiRequest("POST", "/api/ai/accessibility", {}).then(r => r.json()).then(d => { setAiAccessibility(d); sessionStorage.setItem("ai_accessibility", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAccessibilityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_device_test");
    if (cached) { try { setAiDeviceTest(JSON.parse(cached)); return; } catch {} }
    setAiDeviceTestLoading(true);
    apiRequest("POST", "/api/ai/device-testing", {}).then(r => r.json()).then(d => { setAiDeviceTest(d); sessionStorage.setItem("ai_device_test", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDeviceTestLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_perf_mon");
    if (cached) { try { setAiPerfMon(JSON.parse(cached)); return; } catch {} }
    setAiPerfMonLoading(true);
    apiRequest("POST", "/api/ai/performance-monitor", {}).then(r => r.json()).then(d => { setAiPerfMon(d); sessionStorage.setItem("ai_perf_mon", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPerfMonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_security_audit");
    if (cached) { try { setAiSecurityAudit(JSON.parse(cached)); return; } catch {} }
    setAiSecurityAuditLoading(true);
    apiRequest("POST", "/api/ai/security-audit", {}).then(r => r.json()).then(d => { setAiSecurityAudit(d); sessionStorage.setItem("ai_security_audit", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSecurityAuditLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cookie_consent");
    if (cached) { try { setAiCookieConsent(JSON.parse(cached)); return; } catch {} }
    setAiCookieConsentLoading(true);
    apiRequest("POST", "/api/ai/cookie-consent", {}).then(r => r.json()).then(d => { setAiCookieConsent(d); sessionStorage.setItem("ai_cookie_consent", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCookieConsentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_age_gate");
    if (cached) { try { setAiAgeGate(JSON.parse(cached)); return; } catch {} }
    setAiAgeGateLoading(true);
    apiRequest("POST", "/api/ai/age-gating", {}).then(r => r.json()).then(d => { setAiAgeGate(d); sessionStorage.setItem("ai_age_gate", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAgeGateLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_retention");
    if (cached) { try { setAiDataRetention(JSON.parse(cached)); return; } catch {} }
    setAiDataRetentionLoading(true);
    apiRequest("POST", "/api/ai/data-retention", {}).then(r => r.json()).then(d => { setAiDataRetention(d); sessionStorage.setItem("ai_data_retention", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataRetentionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_incident_resp");
    if (cached) { try { setAiIncidentResp(JSON.parse(cached)); return; } catch {} }
    setAiIncidentRespLoading(true);
    apiRequest("POST", "/api/ai/incident-response", {}).then(r => r.json()).then(d => { setAiIncidentResp(d); sessionStorage.setItem("ai_incident_resp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIncidentRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shortcuts");
    if (cached) { try { setAiShortcuts(JSON.parse(cached)); return; } catch {} }
    setAiShortcutsLoading(true);
    apiRequest("POST", "/api/ai/shortcuts", {}).then(r => r.json()).then(d => { setAiShortcuts(d); sessionStorage.setItem("ai_shortcuts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortcutsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_adv_search");
    if (cached) { try { setAiAdvSearch(JSON.parse(cached)); return; } catch {} }
    setAiAdvSearchLoading(true);
    apiRequest("POST", "/api/ai/advanced-search", {}).then(r => r.json()).then(d => { setAiAdvSearch(d); sessionStorage.setItem("ai_adv_search", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAdvSearchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_bulk_upload");
    if (cached) { try { setAiBulkUpload(JSON.parse(cached)); return; } catch {} }
    setAiBulkUploadLoading(true);
    apiRequest("POST", "/api/ai/bulk-upload", {}).then(r => r.json()).then(d => { setAiBulkUpload(d); sessionStorage.setItem("ai_bulk_upload", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBulkUploadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_playlist_org");
    if (cached) { try { setAiPlaylistOrg(JSON.parse(cached)); return; } catch {} }
    setAiPlaylistOrgLoading(true);
    apiRequest("POST", "/api/ai/playlist-organizer", {}).then(r => r.json()).then(d => { setAiPlaylistOrg(d); sessionStorage.setItem("ai_playlist_org", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPlaylistOrgLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_acct");
    if (cached) { try { setAiMultiAcct(JSON.parse(cached)); return; } catch {} }
    setAiMultiAcctLoading(true);
    apiRequest("POST", "/api/ai/multi-account", {}).then(r => r.json()).then(d => { setAiMultiAcct(d); sessionStorage.setItem("ai_multi_acct", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMultiAcctLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cust_dash");
    if (cached) { try { setAiCustDash(JSON.parse(cached)); return; } catch {} }
    setAiCustDashLoading(true);
    apiRequest("POST", "/api/ai/custom-dashboard", {}).then(r => r.json()).then(d => { setAiCustDash(d); sessionStorage.setItem("ai_cust_dash", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCustDashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_tag");
    if (cached) { try { setAiAutoTag(JSON.parse(cached)); return; } catch {} }
    setAiAutoTagLoading(true);
    apiRequest("POST", "/api/ai/auto-tagging", {}).then(r => r.json()).then(d => { setAiAutoTag(d); sessionStorage.setItem("ai_auto_tag", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoTagLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_smart_notif");
    if (cached) { try { setAiSmartNotif(JSON.parse(cached)); return; } catch {} }
    setAiSmartNotifLoading(true);
    apiRequest("POST", "/api/ai/smart-notifications", {}).then(r => r.json()).then(d => { setAiSmartNotif(d); sessionStorage.setItem("ai_smart_notif", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSmartNotifLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_templates");
    if (cached) { try { setAiTemplates(JSON.parse(cached)); return; } catch {} }
    setAiTemplatesLoading(true);
    apiRequest("POST", "/api/ai/template-library", {}).then(r => r.json()).then(d => { setAiTemplates(d); sessionStorage.setItem("ai_templates", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTemplatesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_macros");
    if (cached) { try { setAiMacros(JSON.parse(cached)); return; } catch {} }
    setAiMacrosLoading(true);
    apiRequest("POST", "/api/ai/macro-builder", {}).then(r => r.json()).then(d => { setAiMacros(d); sessionStorage.setItem("ai_macros", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMacrosLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gamification");
    if (cached) { try { setAiGamification(JSON.parse(cached)); return; } catch {} }
    setAiGamificationLoading(true);
    apiRequest("POST", "/api/ai/gamification", {}).then(r => r.json()).then(d => { setAiGamification(d); sessionStorage.setItem("ai_gamification", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGamificationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_personalize");
    if (cached) { try { setAiPersonalize(JSON.parse(cached)); return; } catch {} }
    setAiPersonalizeLoading(true);
    apiRequest("POST", "/api/ai/personalization", {}).then(r => r.json()).then(d => { setAiPersonalize(d); sessionStorage.setItem("ai_personalize", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPersonalizeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_dna");
    if (cached) { try { setAiContentDNA(JSON.parse(cached)); return; } catch {} }
    setAiContentDNALoading(true);
    apiRequest("POST", "/api/ai/content-dna", {}).then(r => r.json()).then(d => { setAiContentDNA(d); sessionStorage.setItem("ai_content_dna", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentDNALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_algo_sim");
    if (cached) { try { setAiAlgoSim(JSON.parse(cached)); return; } catch {} }
    setAiAlgoSimLoading(true);
    apiRequest("POST", "/api/ai/algorithm-sim", {}).then(r => r.json()).then(d => { setAiAlgoSim(d); sessionStorage.setItem("ai_algo_sim", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAlgoSimLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_viz");
    if (cached) { try { setAiDataViz(JSON.parse(cached)); return; } catch {} }
    setAiDataVizLoading(true);
    apiRequest("POST", "/api/ai/data-viz", {}).then(r => r.json()).then(d => { setAiDataViz(d); sessionStorage.setItem("ai_data_viz", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataVizLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vr");
    if (cached) { try { setAiVR(JSON.parse(cached)); return; } catch {} }
    setAiVRLoading(true);
    apiRequest("POST", "/api/ai/vr-content", {}).then(r => r.json()).then(d => { setAiVR(d); sessionStorage.setItem("ai_vr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ar");
    if (cached) { try { setAiAR(JSON.parse(cached)); return; } catch {} }
    setAiARLoading(true);
    apiRequest("POST", "/api/ai/ar-filters", {}).then(r => r.json()).then(d => { setAiAR(d); sessionStorage.setItem("ai_ar", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiARLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voiceover");
    if (cached) { try { setAiVoiceover(JSON.parse(cached)); return; } catch {} }
    setAiVoiceoverLoading(true);
    apiRequest("POST", "/api/ai/voiceover", {}).then(r => r.json()).then(d => { setAiVoiceover(d); sessionStorage.setItem("ai_voiceover", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVoiceoverLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_deepfake");
    if (cached) { try { setAiDeepfake(JSON.parse(cached)); return; } catch {} }
    setAiDeepfakeLoading(true);
    apiRequest("POST", "/api/ai/deepfake-detector", {}).then(r => r.json()).then(d => { setAiDeepfake(d); sessionStorage.setItem("ai_deepfake", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDeepfakeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_blockchain");
    if (cached) { try { setAiBlockchain(JSON.parse(cached)); return; } catch {} }
    setAiBlockchainLoading(true);
    apiRequest("POST", "/api/ai/blockchain-verify", {}).then(r => r.json()).then(d => { setAiBlockchain(d); sessionStorage.setItem("ai_blockchain", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBlockchainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pred_trends");
    if (cached) { try { setAiPredTrends(JSON.parse(cached)); return; } catch {} }
    setAiPredTrendsLoading(true);
    apiRequest("POST", "/api/ai/predictive-trends", {}).then(r => r.json()).then(d => { setAiPredTrends(d); sessionStorage.setItem("ai_pred_trends", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPredTrendsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_graph");
    if (cached) { try { setAiContentGraph(JSON.parse(cached)); return; } catch {} }
    setAiContentGraphLoading(true);
    apiRequest("POST", "/api/ai/content-graph", {}).then(r => r.json()).then(d => { setAiContentGraph(d); sessionStorage.setItem("ai_content_graph", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentGraphLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_psychograph");
    if (cached) { try { setAiPsychograph(JSON.parse(cached)); return; } catch {} }
    setAiPsychographLoading(true);
    apiRequest("POST", "/api/ai/psychographics", {}).then(r => r.json()).then(d => { setAiPsychograph(d); sessionStorage.setItem("ai_psychograph", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPsychographLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_neuro_mkt");
    if (cached) { try { setAiNeuroMkt(JSON.parse(cached)); return; } catch {} }
    setAiNeuroMktLoading(true);
    apiRequest("POST", "/api/ai/neuro-marketing", {}).then(r => r.json()).then(d => { setAiNeuroMkt(d); sessionStorage.setItem("ai_neuro_mkt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNeuroMktLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sent_pred");
    if (cached) { try { setAiSentPred(JSON.parse(cached)); return; } catch {} }
    setAiSentPredLoading(true);
    apiRequest("POST", "/api/ai/sentiment-predict", {}).then(r => r.json()).then(d => { setAiSentPred(d); sessionStorage.setItem("ai_sent_pred", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSentPredLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_econ");
    if (cached) { try { setAiCreatorEcon(JSON.parse(cached)); return; } catch {} }
    setAiCreatorEconLoading(true);
    apiRequest("POST", "/api/ai/creator-economy", {}).then(r => r.json()).then(d => { setAiCreatorEcon(d); sessionStorage.setItem("ai_creator_econ", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCreatorEconLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_web3");
    if (cached) { try { setAiWeb3(JSON.parse(cached)); return; } catch {} }
    setAiWeb3Loading(true);
    apiRequest("POST", "/api/ai/web3-tools", {}).then(r => r.json()).then(d => { setAiWeb3(d); sessionStorage.setItem("ai_web3", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWeb3Loading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_metaverse");
    if (cached) { try { setAiMetaverse(JSON.parse(cached)); return; } catch {} }
    setAiMetaverseLoading(true);
    apiRequest("POST", "/api/ai/metaverse", {}).then(r => r.json()).then(d => { setAiMetaverse(d); sessionStorage.setItem("ai_metaverse", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMetaverseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_agent_cust");
    if (cached) { try { setAiAgentCust(JSON.parse(cached)); return; } catch {} }
    setAiAgentCustLoading(true);
    apiRequest("POST", "/api/ai/agent-customizer", {}).then(r => r.json()).then(d => { setAiAgentCust(d); sessionStorage.setItem("ai_agent_cust", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAgentCustLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_api");
    if (cached) { try { setAiCreatorAPI(JSON.parse(cached)); return; } catch {} }
    setAiCreatorAPILoading(true);
    apiRequest("POST", "/api/ai/creator-api", {}).then(r => r.json()).then(d => { setAiCreatorAPI(d); sessionStorage.setItem("ai_creator_api", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCreatorAPILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_launch");
    if (cached) { try { setAiPodLaunch(JSON.parse(cached)); return; } catch {} }
    setAiPodLaunchLoading(true);
    apiRequest("POST", "/api/ai/podcast-launch", {}).then(r => r.json()).then(d => { setAiPodLaunch(d); sessionStorage.setItem("ai_pod_launch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodLaunchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_episode");
    if (cached) { try { setAiPodEpisode(JSON.parse(cached)); return; } catch {} }
    setAiPodEpisodeLoading(true);
    apiRequest("POST", "/api/ai/podcast-episode", {}).then(r => r.json()).then(d => { setAiPodEpisode(d); sessionStorage.setItem("ai_pod_episode", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodEpisodeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod_seo");
    if (cached) { try { setAiPodSEO(JSON.parse(cached)); return; } catch {} }
    setAiPodSEOLoading(true);
    apiRequest("POST", "/api/ai/podcast-seo", {}).then(r => r.json()).then(d => { setAiPodSEO(d); sessionStorage.setItem("ai_pod_seo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodSEOLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_brand");
    if (cached) { try { setAiAudioBrand(JSON.parse(cached)); return; } catch {} }
    setAiAudioBrandLoading(true);
    apiRequest("POST", "/api/ai/audio-branding", {}).then(r => r.json()).then(d => { setAiAudioBrand(d); sessionStorage.setItem("ai_audio_brand", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAudioBrandLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_music_comp");
    if (cached) { try { setAiMusicComp(JSON.parse(cached)); return; } catch {} }
    setAiMusicCompLoading(true);
    apiRequest("POST", "/api/ai/music-composer", {}).then(r => r.json()).then(d => { setAiMusicComp(d); sessionStorage.setItem("ai_music_comp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMusicCompLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_asmr");
    if (cached) { try { setAiASMR(JSON.parse(cached)); return; } catch {} }
    setAiASMRLoading(true);
    apiRequest("POST", "/api/ai/asmr", {}).then(r => r.json()).then(d => { setAiASMR(d); sessionStorage.setItem("ai_asmr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiASMRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_train");
    if (cached) { try { setAiVoiceTrain(JSON.parse(cached)); return; } catch {} }
    setAiVoiceTrainLoading(true);
    apiRequest("POST", "/api/ai/voice-training", {}).then(r => r.json()).then(d => { setAiVoiceTrain(d); sessionStorage.setItem("ai_voice_train", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVoiceTrainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_mix");
    if (cached) { try { setAiAudioMix(JSON.parse(cached)); return; } catch {} }
    setAiAudioMixLoading(true);
    apiRequest("POST", "/api/ai/audio-mixing", {}).then(r => r.json()).then(d => { setAiAudioMix(d); sessionStorage.setItem("ai_audio_mix", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAudioMixLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pass_sec");
    if (cached) { try { setAiPassSec(JSON.parse(cached)); return; } catch {} }
    setAiPassSecLoading(true);
    apiRequest("POST", "/api/ai/password-security", {}).then(r => r.json()).then(d => { setAiPassSec(d); sessionStorage.setItem("ai_pass_sec", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPassSecLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_phishing");
    if (cached) { try { setAiPhishing(JSON.parse(cached)); return; } catch {} }
    setAiPhishingLoading(true);
    apiRequest("POST", "/api/ai/phishing", {}).then(r => r.json()).then(d => { setAiPhishing(d); sessionStorage.setItem("ai_phishing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPhishingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_acct_recov");
    if (cached) { try { setAiAcctRecov(JSON.parse(cached)); return; } catch {} }
    setAiAcctRecovLoading(true);
    apiRequest("POST", "/api/ai/account-recovery", {}).then(r => r.json()).then(d => { setAiAcctRecov(d); sessionStorage.setItem("ai_acct_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAcctRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_priv_settings");
    if (cached) { try { setAiPrivSettings(JSON.parse(cached)); return; } catch {} }
    setAiPrivSettingsLoading(true);
    apiRequest("POST", "/api/ai/privacy-settings", {}).then(r => r.json()).then(d => { setAiPrivSettings(d); sessionStorage.setItem("ai_priv_settings", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPrivSettingsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_breach");
    if (cached) { try { setAiDataBreach(JSON.parse(cached)); return; } catch {} }
    setAiDataBreachLoading(true);
    apiRequest("POST", "/api/ai/data-breach", {}).then(r => r.json()).then(d => { setAiDataBreach(d); sessionStorage.setItem("ai_data_breach", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataBreachLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vpn");
    if (cached) { try { setAiVPN(JSON.parse(cached)); return; } catch {} }
    setAiVPNLoading(true);
    apiRequest("POST", "/api/ai/vpn", {}).then(r => r.json()).then(d => { setAiVPN(d); sessionStorage.setItem("ai_vpn", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVPNLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_algo");
    if (cached) { try { setAiTTAlgo(JSON.parse(cached)); return; } catch {} }
    setAiTTAlgoLoading(true);
    apiRequest("POST", "/api/ai/tiktok-algorithm", {}).then(r => r.json()).then(d => { setAiTTAlgo(d); sessionStorage.setItem("ai_tt_algo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTAlgoLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_sounds");
    if (cached) { try { setAiTTSounds(JSON.parse(cached)); return; } catch {} }
    setAiTTSoundsLoading(true);
    apiRequest("POST", "/api/ai/tiktok-sounds", {}).then(r => r.json()).then(d => { setAiTTSounds(d); sessionStorage.setItem("ai_tt_sounds", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTSoundsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_duet");
    if (cached) { try { setAiTTDuet(JSON.parse(cached)); return; } catch {} }
    setAiTTDuetLoading(true);
    apiRequest("POST", "/api/ai/tiktok-duet", {}).then(r => r.json()).then(d => { setAiTTDuet(d); sessionStorage.setItem("ai_tt_duet", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTDuetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_live");
    if (cached) { try { setAiTTLive(JSON.parse(cached)); return; } catch {} }
    setAiTTLiveLoading(true);
    apiRequest("POST", "/api/ai/tiktok-live", {}).then(r => r.json()).then(d => { setAiTTLive(d); sessionStorage.setItem("ai_tt_live", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTLiveLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_shop");
    if (cached) { try { setAiTTShop(JSON.parse(cached)); return; } catch {} }
    setAiTTShopLoading(true);
    apiRequest("POST", "/api/ai/tiktok-shop", {}).then(r => r.json()).then(d => { setAiTTShop(d); sessionStorage.setItem("ai_tt_shop", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTShopLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_fund");
    if (cached) { try { setAiTTFund(JSON.parse(cached)); return; } catch {} }
    setAiTTFundLoading(true);
    apiRequest("POST", "/api/ai/tiktok-fund", {}).then(r => r.json()).then(d => { setAiTTFund(d); sessionStorage.setItem("ai_tt_fund", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTFundLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_hash");
    if (cached) { try { setAiTTHash(JSON.parse(cached)); return; } catch {} }
    setAiTTHashLoading(true);
    apiRequest("POST", "/api/ai/tiktok-hashtags", {}).then(r => r.json()).then(d => { setAiTTHash(d); sessionStorage.setItem("ai_tt_hash", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTHashLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tt_profile");
    if (cached) { try { setAiTTProfile(JSON.parse(cached)); return; } catch {} }
    setAiTTProfileLoading(true);
    apiRequest("POST", "/api/ai/tiktok-profile", {}).then(r => r.json()).then(d => { setAiTTProfile(d); sessionStorage.setItem("ai_tt_profile", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTTProfileLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_reels");
    if (cached) { try { setAiIGReels(JSON.parse(cached)); return; } catch {} }
    setAiIGReelsLoading(true);
    apiRequest("POST", "/api/ai/ig-reels", {}).then(r => r.json()).then(d => { setAiIGReels(d); sessionStorage.setItem("ai_ig_reels", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGReelsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_stories");
    if (cached) { try { setAiIGStories(JSON.parse(cached)); return; } catch {} }
    setAiIGStoriesLoading(true);
    apiRequest("POST", "/api/ai/ig-stories", {}).then(r => r.json()).then(d => { setAiIGStories(d); sessionStorage.setItem("ai_ig_stories", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGStoriesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_carousel");
    if (cached) { try { setAiIGCarousel(JSON.parse(cached)); return; } catch {} }
    setAiIGCarouselLoading(true);
    apiRequest("POST", "/api/ai/ig-carousel", {}).then(r => r.json()).then(d => { setAiIGCarousel(d); sessionStorage.setItem("ai_ig_carousel", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGCarouselLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_bio");
    if (cached) { try { setAiIGBio(JSON.parse(cached)); return; } catch {} }
    setAiIGBioLoading(true);
    apiRequest("POST", "/api/ai/ig-bio", {}).then(r => r.json()).then(d => { setAiIGBio(d); sessionStorage.setItem("ai_ig_bio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGBioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_shop");
    if (cached) { try { setAiIGShop(JSON.parse(cached)); return; } catch {} }
    setAiIGShopLoading(true);
    apiRequest("POST", "/api/ai/ig-shopping", {}).then(r => r.json()).then(d => { setAiIGShop(d); sessionStorage.setItem("ai_ig_shop", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGShopLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_collabs");
    if (cached) { try { setAiIGCollabs(JSON.parse(cached)); return; } catch {} }
    setAiIGCollabsLoading(true);
    apiRequest("POST", "/api/ai/ig-collabs", {}).then(r => r.json()).then(d => { setAiIGCollabs(d); sessionStorage.setItem("ai_ig_collabs", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGCollabsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_growth");
    if (cached) { try { setAiIGGrowth(JSON.parse(cached)); return; } catch {} }
    setAiIGGrowthLoading(true);
    apiRequest("POST", "/api/ai/ig-growth", {}).then(r => r.json()).then(d => { setAiIGGrowth(d); sessionStorage.setItem("ai_ig_growth", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ig_aesthetic");
    if (cached) { try { setAiIGAesthetic(JSON.parse(cached)); return; } catch {} }
    setAiIGAestheticLoading(true);
    apiRequest("POST", "/api/ai/ig-aesthetic", {}).then(r => r.json()).then(d => { setAiIGAesthetic(d); sessionStorage.setItem("ai_ig_aesthetic", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIGAestheticLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_x_growth");
    if (cached) { try { setAiXGrowth(JSON.parse(cached)); return; } catch {} }
    setAiXGrowthLoading(true);
    apiRequest("POST", "/api/ai/x-growth", {}).then(r => r.json()).then(d => { setAiXGrowth(d); sessionStorage.setItem("ai_x_growth", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiXGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_x_thread");
    if (cached) { try { setAiXThread(JSON.parse(cached)); return; } catch {} }
    setAiXThreadLoading(true);
    apiRequest("POST", "/api/ai/x-thread", {}).then(r => r.json()).then(d => { setAiXThread(d); sessionStorage.setItem("ai_x_thread", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiXThreadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_creator");
    if (cached) { try { setAiLICreator(JSON.parse(cached)); return; } catch {} }
    setAiLICreatorLoading(true);
    apiRequest("POST", "/api/ai/linkedin-creator", {}).then(r => r.json()).then(d => { setAiLICreator(d); sessionStorage.setItem("ai_li_creator", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLICreatorLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_article");
    if (cached) { try { setAiLIArticle(JSON.parse(cached)); return; } catch {} }
    setAiLIArticleLoading(true);
    apiRequest("POST", "/api/ai/linkedin-article", {}).then(r => r.json()).then(d => { setAiLIArticle(d); sessionStorage.setItem("ai_li_article", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLIArticleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fb_groups");
    if (cached) { try { setAiFBGroups(JSON.parse(cached)); return; } catch {} }
    setAiFBGroupsLoading(true);
    apiRequest("POST", "/api/ai/fb-groups", {}).then(r => r.json()).then(d => { setAiFBGroups(d); sessionStorage.setItem("ai_fb_groups", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFBGroupsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fb_reels");
    if (cached) { try { setAiFBReels(JSON.parse(cached)); return; } catch {} }
    setAiFBReelsLoading(true);
    apiRequest("POST", "/api/ai/fb-reels", {}).then(r => r.json()).then(d => { setAiFBReels(d); sessionStorage.setItem("ai_fb_reels", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFBReelsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_snapchat");
    if (cached) { try { setAiSnapchat(JSON.parse(cached)); return; } catch {} }
    setAiSnapchatLoading(true);
    apiRequest("POST", "/api/ai/snapchat", {}).then(r => r.json()).then(d => { setAiSnapchat(d); sessionStorage.setItem("ai_snapchat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSnapchatLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_threads");
    if (cached) { try { setAiThreads(JSON.parse(cached)); return; } catch {} }
    setAiThreadsLoading(true);
    apiRequest("POST", "/api/ai/threads", {}).then(r => r.json()).then(d => { setAiThreads(d); sessionStorage.setItem("ai_threads", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThreadsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_discord_opt");
    if (cached) { try { setAiDiscordOpt(JSON.parse(cached)); return; } catch {} }
    setAiDiscordOptLoading(true);
    apiRequest("POST", "/api/ai/discord-optimize", {}).then(r => r.json()).then(d => { setAiDiscordOpt(d); sessionStorage.setItem("ai_discord_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDiscordOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_patreon");
    if (cached) { try { setAiPatreon(JSON.parse(cached)); return; } catch {} }
    setAiPatreonLoading(true);
    apiRequest("POST", "/api/ai/patreon-content", {}).then(r => r.json()).then(d => { setAiPatreon(d); sessionStorage.setItem("ai_patreon", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPatreonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_substack");
    if (cached) { try { setAiSubstack(JSON.parse(cached)); return; } catch {} }
    setAiSubstackLoading(true);
    apiRequest("POST", "/api/ai/substack", {}).then(r => r.json()).then(d => { setAiSubstack(d); sessionStorage.setItem("ai_substack", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubstackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gumroad");
    if (cached) { try { setAiGumroad(JSON.parse(cached)); return; } catch {} }
    setAiGumroadLoading(true);
    apiRequest("POST", "/api/ai/gumroad", {}).then(r => r.json()).then(d => { setAiGumroad(d); sessionStorage.setItem("ai_gumroad", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGumroadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_teachable");
    if (cached) { try { setAiTeachable(JSON.parse(cached)); return; } catch {} }
    setAiTeachableLoading(true);
    apiRequest("POST", "/api/ai/teachable", {}).then(r => r.json()).then(d => { setAiTeachable(d); sessionStorage.setItem("ai_teachable", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTeachableLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_buy_me_coffee");
    if (cached) { try { setAiBuyMeCoffee(JSON.parse(cached)); return; } catch {} }
    setAiBuyMeCoffeeLoading(true);
    apiRequest("POST", "/api/ai/buymeacoffee", {}).then(r => r.json()).then(d => { setAiBuyMeCoffee(d); sessionStorage.setItem("ai_buy_me_coffee", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBuyMeCoffeeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_chaturbate");
    if (cached) { try { setAiChaturbate(JSON.parse(cached)); return; } catch {} }
    setAiChaturbateLoading(true);
    apiRequest("POST", "/api/ai/chaturbate", {}).then(r => r.json()).then(d => { setAiChaturbate(d); sessionStorage.setItem("ai_chaturbate", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChaturbateLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis_resp");
    if (cached) { try { setAiCrisisResp(JSON.parse(cached)); return; } catch {} }
    setAiCrisisRespLoading(true);
    apiRequest("POST", "/api/ai/crisis-response", {}).then(r => r.json()).then(d => { setAiCrisisResp(d); sessionStorage.setItem("ai_crisis_resp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrisisRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_apology");
    if (cached) { try { setAiApology(JSON.parse(cached)); return; } catch {} }
    setAiApologyLoading(true);
    apiRequest("POST", "/api/ai/apology-script", {}).then(r => r.json()).then(d => { setAiApology(d); sessionStorage.setItem("ai_apology", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiApologyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_controversy");
    if (cached) { try { setAiControversy(JSON.parse(cached)); return; } catch {} }
    setAiControversyLoading(true);
    apiRequest("POST", "/api/ai/controversy", {}).then(r => r.json()).then(d => { setAiControversy(d); sessionStorage.setItem("ai_controversy", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiControversyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cancel_culture");
    if (cached) { try { setAiCancelCulture(JSON.parse(cached)); return; } catch {} }
    setAiCancelCultureLoading(true);
    apiRequest("POST", "/api/ai/cancel-culture", {}).then(r => r.json()).then(d => { setAiCancelCulture(d); sessionStorage.setItem("ai_cancel_culture", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCancelCultureLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crisis_detect");
    if (cached) { try { setAiCrisisDetect(JSON.parse(cached)); return; } catch {} }
    setAiCrisisDetectLoading(true);
    apiRequest("POST", "/api/ai/crisis-detector", {}).then(r => r.json()).then(d => { setAiCrisisDetect(d); sessionStorage.setItem("ai_crisis_detect", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrisisDetectLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_damage_ctrl");
    if (cached) { try { setAiDamageCtrl(JSON.parse(cached)); return; } catch {} }
    setAiDamageCtrlLoading(true);
    apiRequest("POST", "/api/ai/damage-control", {}).then(r => r.json()).then(d => { setAiDamageCtrl(d); sessionStorage.setItem("ai_damage_ctrl", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDamageCtrlLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pr_stmt");
    if (cached) { try { setAiPRStmt(JSON.parse(cached)); return; } catch {} }
    setAiPRStmtLoading(true);
    apiRequest("POST", "/api/ai/pr-statement", {}).then(r => r.json()).then(d => { setAiPRStmt(d); sessionStorage.setItem("ai_pr_stmt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPRStmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stakeholder");
    if (cached) { try { setAiStakeholder(JSON.parse(cached)); return; } catch {} }
    setAiStakeholderLoading(true);
    apiRequest("POST", "/api/ai/stakeholder-comm", {}).then(r => r.json()).then(d => { setAiStakeholder(d); sessionStorage.setItem("ai_stakeholder", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStakeholderLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_recov_strat");
    if (cached) { try { setAiRecovStrat(JSON.parse(cached)); return; } catch {} }
    setAiRecovStratLoading(true);
    apiRequest("POST", "/api/ai/recovery-strategy", {}).then(r => r.json()).then(d => { setAiRecovStrat(d); sessionStorage.setItem("ai_recov_strat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRecovStratLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_media_resp");
    if (cached) { try { setAiMediaResp(JSON.parse(cached)); return; } catch {} }
    setAiMediaRespLoading(true);
    apiRequest("POST", "/api/ai/media-response", {}).then(r => r.json()).then(d => { setAiMediaResp(d); sessionStorage.setItem("ai_media_resp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMediaRespLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_legal_risk");
    if (cached) { try { setAiLegalRisk(JSON.parse(cached)); return; } catch {} }
    setAiLegalRiskLoading(true);
    apiRequest("POST", "/api/ai/legal-risk", {}).then(r => r.json()).then(d => { setAiLegalRisk(d); sessionStorage.setItem("ai_legal_risk", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLegalRiskLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_social_crisis");
    if (cached) { try { setAiSocialCrisis(JSON.parse(cached)); return; } catch {} }
    setAiSocialCrisisLoading(true);
    apiRequest("POST", "/api/ai/social-crisis", {}).then(r => r.json()).then(d => { setAiSocialCrisis(d); sessionStorage.setItem("ai_social_crisis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSocialCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infl_crisis");
    if (cached) { try { setAiInflCrisis(JSON.parse(cached)); return; } catch {} }
    setAiInflCrisisLoading(true);
    apiRequest("POST", "/api/ai/influencer-crisis", {}).then(r => r.json()).then(d => { setAiInflCrisis(d); sessionStorage.setItem("ai_infl_crisis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInflCrisisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_recov");
    if (cached) { try { setAiBrandRecov(JSON.parse(cached)); return; } catch {} }
    setAiBrandRecovLoading(true);
    apiRequest("POST", "/api/ai/brand-recovery", {}).then(r => r.json()).then(d => { setAiBrandRecov(d); sessionStorage.setItem("ai_brand_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_workflow_auto");
    if (cached) { try { setAiWorkflowAutoAS(JSON.parse(cached)); return; } catch {} }
    setAiWorkflowAutoASLoading(true);
    apiRequest("POST", "/api/ai/workflow-automation", {}).then(r => r.json()).then(d => { setAiWorkflowAutoAS(d); sessionStorage.setItem("ai_workflow_auto", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorkflowAutoASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_zapier");
    if (cached) { try { setAiZapier(JSON.parse(cached)); return; } catch {} }
    setAiZapierLoading(true);
    apiRequest("POST", "/api/ai/zapier", {}).then(r => r.json()).then(d => { setAiZapier(d); sessionStorage.setItem("ai_zapier", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiZapierLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ifttt");
    if (cached) { try { setAiIFTTT(JSON.parse(cached)); return; } catch {} }
    setAiIFTTTLoading(true);
    apiRequest("POST", "/api/ai/ifttt", {}).then(r => r.json()).then(d => { setAiIFTTT(d); sessionStorage.setItem("ai_ifttt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIFTTTLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_make_scene");
    if (cached) { try { setAiMakeScene(JSON.parse(cached)); return; } catch {} }
    setAiMakeSceneLoading(true);
    apiRequest("POST", "/api/ai/make-scenario", {}).then(r => r.json()).then(d => { setAiMakeScene(d); sessionStorage.setItem("ai_make_scene", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMakeSceneLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_sched");
    if (cached) { try { setAiAutoSched(JSON.parse(cached)); return; } catch {} }
    setAiAutoSchedLoading(true);
    apiRequest("POST", "/api/ai/auto-scheduler", {}).then(r => r.json()).then(d => { setAiAutoSched(d); sessionStorage.setItem("ai_auto_sched", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoSchedLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_resp");
    if (cached) { try { setAiAutoRespAS(JSON.parse(cached)); return; } catch {} }
    setAiAutoRespASLoading(true);
    apiRequest("POST", "/api/ai/auto-responder", {}).then(r => r.json()).then(d => { setAiAutoRespAS(d); sessionStorage.setItem("ai_auto_resp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoRespASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_mod");
    if (cached) { try { setAiAutoModAS(JSON.parse(cached)); return; } catch {} }
    setAiAutoModASLoading(true);
    apiRequest("POST", "/api/ai/auto-moderator", {}).then(r => r.json()).then(d => { setAiAutoModAS(d); sessionStorage.setItem("ai_auto_mod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoModASLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_back");
    if (cached) { try { setAiAutoBack(JSON.parse(cached)); return; } catch {} }
    setAiAutoBackLoading(true);
    apiRequest("POST", "/api/ai/auto-backup", {}).then(r => r.json()).then(d => { setAiAutoBack(d); sessionStorage.setItem("ai_auto_back", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoBackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_rep");
    if (cached) { try { setAiAutoRep(JSON.parse(cached)); return; } catch {} }
    setAiAutoRepLoading(true);
    apiRequest("POST", "/api/ai/auto-reporter", {}).then(r => r.json()).then(d => { setAiAutoRep(d); sessionStorage.setItem("ai_auto_rep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoRepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_auto_opt");
    if (cached) { try { setAiAutoOpt(JSON.parse(cached)); return; } catch {} }
    setAiAutoOptLoading(true);
    apiRequest("POST", "/api/ai/auto-optimizer", {}).then(r => r.json()).then(d => { setAiAutoOpt(d); sessionStorage.setItem("ai_auto_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutoOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_batch_proc");
    if (cached) { try { setAiBatchProc(JSON.parse(cached)); return; } catch {} }
    setAiBatchProcLoading(true);
    apiRequest("POST", "/api/ai/batch-processor", {}).then(r => r.json()).then(d => { setAiBatchProc(d); sessionStorage.setItem("ai_batch_proc", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBatchProcLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_smart_queue");
    if (cached) { try { setAiSmartQueue(JSON.parse(cached)); return; } catch {} }
    setAiSmartQueueLoading(true);
    apiRequest("POST", "/api/ai/smart-queue", {}).then(r => r.json()).then(d => { setAiSmartQueue(d); sessionStorage.setItem("ai_smart_queue", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSmartQueueLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cont_pipeline");
    if (cached) { try { setAiContPipeline(JSON.parse(cached)); return; } catch {} }
    setAiContPipelineLoading(true);
    apiRequest("POST", "/api/ai/content-pipeline", {}).then(r => r.json()).then(d => { setAiContPipeline(d); sessionStorage.setItem("ai_cont_pipeline", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContPipelineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_train_data");
    if (cached) { try { setAiTrainData(JSON.parse(cached)); return; } catch {} }
    setAiTrainDataLoading(true);
    apiRequest("POST", "/api/ai/training-data", {}).then(r => r.json()).then(d => { setAiTrainData(d); sessionStorage.setItem("ai_train_data", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTrainDataLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comm_trust");
    if (cached) { try { setAiCommTrust(JSON.parse(cached)); return; } catch {} }
    setAiCommTrustLoading(true);
    apiRequest("POST", "/api/ai/trust-rebuild", {}).then(r => r.json()).then(d => { setAiCommTrust(d); sessionStorage.setItem("ai_comm_trust", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommTrustLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_algo_recov");
    if (cached) { try { setAiAlgoRecov(JSON.parse(cached)); return; } catch {} }
    setAiAlgoRecovLoading(true);
    apiRequest("POST", "/api/ai/algo-recovery", {}).then(r => r.json()).then(d => { setAiAlgoRecov(d); sessionStorage.setItem("ai_algo_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAlgoRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_recov");
    if (cached) { try { setAiRevRecov(JSON.parse(cached)); return; } catch {} }
    setAiRevRecovLoading(true);
    apiRequest("POST", "/api/ai/revenue-recovery", {}).then(r => r.json()).then(d => { setAiRevRecov(d); sessionStorage.setItem("ai_rev_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRevRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_team_crisis");
    if (cached) { try { setAiTeamCrisisBC(JSON.parse(cached)); return; } catch {} }
    setAiTeamCrisisBCLoading(true);
    apiRequest("POST", "/api/ai/team-crisis", {}).then(r => r.json()).then(d => { setAiTeamCrisisBC(d); sessionStorage.setItem("ai_team_crisis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTeamCrisisBCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_legal_def");
    if (cached) { try { setAiLegalDef(JSON.parse(cached)); return; } catch {} }
    setAiLegalDefLoading(true);
    apiRequest("POST", "/api/ai/legal-defense", {}).then(r => r.json()).then(d => { setAiLegalDef(d); sessionStorage.setItem("ai_legal_def", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLegalDefLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ins_claim");
    if (cached) { try { setAiInsClaim(JSON.parse(cached)); return; } catch {} }
    setAiInsClaimLoading(true);
    apiRequest("POST", "/api/ai/insurance-claim", {}).then(r => r.json()).then(d => { setAiInsClaim(d); sessionStorage.setItem("ai_ins_claim", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInsClaimLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contingency");
    if (cached) { try { setAiContingency(JSON.parse(cached)); return; } catch {} }
    setAiContingencyLoading(true);
    apiRequest("POST", "/api/ai/contingency", {}).then(r => r.json()).then(d => { setAiContingency(d); sessionStorage.setItem("ai_contingency", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContingencyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_disaster_recov");
    if (cached) { try { setAiDisasterRecov(JSON.parse(cached)); return; } catch {} }
    setAiDisasterRecovLoading(true);
    apiRequest("POST", "/api/ai/disaster-recovery", {}).then(r => r.json()).then(d => { setAiDisasterRecov(d); sessionStorage.setItem("ai_disaster_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDisasterRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_biz_cont");
    if (cached) { try { setAiBizContBC(JSON.parse(cached)); return; } catch {} }
    setAiBizContBCLoading(true);
    apiRequest("POST", "/api/ai/business-continuity", {}).then(r => r.json()).then(d => { setAiBizContBC(d); sessionStorage.setItem("ai_biz_cont", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBizContBCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exit_strat");
    if (cached) { try { setAiExitStrat(JSON.parse(cached)); return; } catch {} }
    setAiExitStratLoading(true);
    apiRequest("POST", "/api/ai/exit-strategy", {}).then(r => r.json()).then(d => { setAiExitStrat(d); sessionStorage.setItem("ai_exit_strat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiExitStratLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
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
        <CardContent className="p-6">
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

const ASSET_TYPES = ["color", "logo", "font", "tone"] as const;
const assetTypeLabels: Record<string, string> = { color: "Colors", logo: "Logos", font: "Fonts", tone: "Tone of Voice" };
const assetTypeIcons: Record<string, string> = { color: "bg-gradient-to-br from-purple-500 to-pink-500", logo: "bg-gradient-to-br from-blue-500 to-cyan-500", font: "bg-gradient-to-br from-amber-500 to-orange-500", tone: "bg-gradient-to-br from-emerald-500 to-teal-500" };

function BrandTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assetType, setAssetType] = useState<string>("color");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [aiBrand, setAiBrand] = useState<any>(null);
  const [aiBrandLoading, setAiBrandLoading] = useState(true);

  const [showPersonalBrandAI, setShowPersonalBrandAI] = useState(false);
  const [aiBrandAudit, setAiBrandAudit] = useState<any>(null);
  const [aiBrandAuditLoading, setAiBrandAuditLoading] = useState(false);
  const [aiElevPitch, setAiElevPitch] = useState<any>(null);
  const [aiElevPitchLoading, setAiElevPitchLoading] = useState(false);
  const [aiPressKitPB, setAiPressKitPB] = useState<any>(null);
  const [aiPressKitPBLoading, setAiPressKitPBLoading] = useState(false);
  const [aiSpeakerBio, setAiSpeakerBio] = useState<any>(null);
  const [aiSpeakerBioLoading, setAiSpeakerBioLoading] = useState(false);
  const [aiLIProfile, setAiLIProfile] = useState<any>(null);
  const [aiLIProfileLoading, setAiLIProfileLoading] = useState(false);
  const [aiPersWeb, setAiPersWeb] = useState<any>(null);
  const [aiPersWebLoading, setAiPersWebLoading] = useState(false);
  const [aiThoughtLead, setAiThoughtLead] = useState<any>(null);
  const [aiThoughtLeadLoading, setAiThoughtLeadLoading] = useState(false);
  const [aiPubSpeak, setAiPubSpeak] = useState<any>(null);
  const [aiPubSpeakLoading, setAiPubSpeakLoading] = useState(false);
  const [aiNetworkStrat, setAiNetworkStrat] = useState<any>(null);
  const [aiNetworkStratLoading, setAiNetworkStratLoading] = useState(false);
  const [aiRepMonitor, setAiRepMonitor] = useState<any>(null);
  const [aiRepMonitorLoading, setAiRepMonitorLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiBrandAnalysis");
    if (cached) {
      try {
        setAiBrand(JSON.parse(cached));
        setAiBrandLoading(false);
        return;
      } catch {}
    }
    apiRequest("POST", "/api/ai/brand-analysis")
      .then((res) => res.json())
      .then((data) => {
        setAiBrand(data);
        sessionStorage.setItem("aiBrandAnalysis", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => setAiBrandLoading(false));
  }, []);

  const { data: assets, isLoading } = useQuery<any[]>({ queryKey: ['/api/brand-assets'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/brand-assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      setDialogOpen(false);
      toast({ title: "Brand asset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brand-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      toast({ title: "Asset removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const metadata: any = {};
    if (assetType === "color") metadata.hex = formData.get("value");
    if (assetType === "font") { metadata.fontFamily = formData.get("value"); metadata.fontWeight = formData.get("fontWeight") || "400"; }
    if (assetType === "logo") metadata.url = formData.get("value");
    if (assetType === "tone") metadata.usage = formData.get("usage") || "";
    createMutation.mutate({
      assetType,
      name: formData.get("name"),
      value: formData.get("value"),
      metadata,
    });
  };

  const filtered = filterType ? assets?.filter((a: any) => a.assetType === filterType) : assets;
  const colorAssets = filtered?.filter((a: any) => a.assetType === "color") || [];
  const otherAssets = filtered?.filter((a: any) => a.assetType !== "color") || [];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_audit");
    if (cached) { try { setAiBrandAudit(JSON.parse(cached)); return; } catch {} }
    setAiBrandAuditLoading(true);
    apiRequest("POST", "/api/ai/brand-audit", {}).then(r => r.json()).then(d => { setAiBrandAudit(d); sessionStorage.setItem("ai_brand_audit", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandAuditLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_elev_pitch");
    if (cached) { try { setAiElevPitch(JSON.parse(cached)); return; } catch {} }
    setAiElevPitchLoading(true);
    apiRequest("POST", "/api/ai/elevator-pitch", {}).then(r => r.json()).then(d => { setAiElevPitch(d); sessionStorage.setItem("ai_elev_pitch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiElevPitchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_press_kit");
    if (cached) { try { setAiPressKitPB(JSON.parse(cached)); return; } catch {} }
    setAiPressKitPBLoading(true);
    apiRequest("POST", "/api/ai/press-kit", {}).then(r => r.json()).then(d => { setAiPressKitPB(d); sessionStorage.setItem("ai_press_kit", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPressKitPBLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_speaker_bio");
    if (cached) { try { setAiSpeakerBio(JSON.parse(cached)); return; } catch {} }
    setAiSpeakerBioLoading(true);
    apiRequest("POST", "/api/ai/speaker-bio", {}).then(r => r.json()).then(d => { setAiSpeakerBio(d); sessionStorage.setItem("ai_speaker_bio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSpeakerBioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_profile");
    if (cached) { try { setAiLIProfile(JSON.parse(cached)); return; } catch {} }
    setAiLIProfileLoading(true);
    apiRequest("POST", "/api/ai/linkedin-profile", {}).then(r => r.json()).then(d => { setAiLIProfile(d); sessionStorage.setItem("ai_li_profile", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLIProfileLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pers_web");
    if (cached) { try { setAiPersWeb(JSON.parse(cached)); return; } catch {} }
    setAiPersWebLoading(true);
    apiRequest("POST", "/api/ai/personal-website", {}).then(r => r.json()).then(d => { setAiPersWeb(d); sessionStorage.setItem("ai_pers_web", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPersWebLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thought_lead");
    if (cached) { try { setAiThoughtLead(JSON.parse(cached)); return; } catch {} }
    setAiThoughtLeadLoading(true);
    apiRequest("POST", "/api/ai/thought-leadership", {}).then(r => r.json()).then(d => { setAiThoughtLead(d); sessionStorage.setItem("ai_thought_lead", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThoughtLeadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pub_speak");
    if (cached) { try { setAiPubSpeak(JSON.parse(cached)); return; } catch {} }
    setAiPubSpeakLoading(true);
    apiRequest("POST", "/api/ai/public-speaking", {}).then(r => r.json()).then(d => { setAiPubSpeak(d); sessionStorage.setItem("ai_pub_speak", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPubSpeakLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_network_strat");
    if (cached) { try { setAiNetworkStrat(JSON.parse(cached)); return; } catch {} }
    setAiNetworkStratLoading(true);
    apiRequest("POST", "/api/ai/networking-strategy", {}).then(r => r.json()).then(d => { setAiNetworkStrat(d); sessionStorage.setItem("ai_network_strat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNetworkStratLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rep_monitor");
    if (cached) { try { setAiRepMonitor(JSON.parse(cached)); return; } catch {} }
    setAiRepMonitorLoading(true);
    apiRequest("POST", "/api/ai/reputation-monitor", {}).then(r => r.json()).then(d => { setAiRepMonitor(d); sessionStorage.setItem("ai_rep_monitor", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRepMonitorLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <div className="space-y-6">
      {aiBrandLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-brand" />
      ) : aiBrand ? (
        <Card data-testid="card-ai-brand-analysis">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Brand Analysis
            </CardTitle>
            {aiBrand.brandStrength != null && (
              <Badge variant="secondary" data-testid="badge-brand-strength">
                {aiBrand.brandStrength}/100
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiBrand.brandVoice && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Brand Voice</p>
                <p className="text-sm" data-testid="text-brand-voice">{aiBrand.brandVoice}</p>
              </div>
            )}
            {aiBrand.targetAudience && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Target Audience</p>
                <p className="text-sm" data-testid="text-target-audience">{aiBrand.targetAudience}</p>
              </div>
            )}
            {aiBrand.contentPillars?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Content Pillars</p>
                <div className="flex gap-2 flex-wrap">
                  {aiBrand.contentPillars.map((pillar: string, i: number) => (
                    <Badge key={i} variant="secondary" data-testid={`badge-pillar-${i}`}>{pillar}</Badge>
                  ))}
                </div>
              </div>
            )}
            {aiBrand.uniqueValueProposition && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Unique Value Proposition</p>
                <p className="text-sm" data-testid="text-value-proposition">{aiBrand.uniqueValueProposition}</p>
              </div>
            )}
            {aiBrand.suggestedTagline && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Tagline</p>
                <p className="text-sm italic" data-testid="text-tagline">{aiBrand.suggestedTagline}</p>
              </div>
            )}
            {aiBrand.suggestedColors?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Colors</p>
                <div className="flex gap-2 flex-wrap">
                  {aiBrand.suggestedColors.map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border"
                      style={{ backgroundColor: color }}
                      title={color}
                      data-testid={`color-swatch-${i}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {aiBrand.competitorAnalysis?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Competitor Analysis</p>
                <div className="space-y-2">
                  {aiBrand.competitorAnalysis.map((comp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4 flex-wrap text-sm" data-testid={`competitor-${i}`}>
                      <span className="font-medium">{comp.name}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-similarity-${i}`}>{comp.similarityScore}%</Badge>
                        <span className="text-xs text-muted-foreground">{comp.differentiator}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-brand-title" className="text-lg font-semibold">Brand Kit</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-brand-asset" size="sm"><Plus className="w-4 h-4 mr-1" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Brand Asset</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{assetTypeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-asset-name" placeholder={assetType === "color" ? "Primary Blue" : assetType === "font" ? "Heading Font" : assetType === "logo" ? "Main Logo" : "Brand Voice"} />
              </div>
              <div>
                <Label>{assetType === "color" ? "Hex Color" : assetType === "font" ? "Font Family" : assetType === "logo" ? "Logo URL" : "Voice Description"}</Label>
                {assetType === "color" ? (
                  <div className="flex items-center gap-3">
                    <input type="color" name="value" defaultValue="#6366f1" className="h-9 w-12 rounded-md border cursor-pointer" data-testid="input-asset-color" />
                    <Input name="valueName" placeholder="#6366f1" className="flex-1" readOnly />
                  </div>
                ) : assetType === "tone" ? (
                  <Textarea name="value" required data-testid="input-asset-value" placeholder="Professional yet approachable, uses humor sparingly..." className="resize-none" />
                ) : (
                  <Input name="value" required data-testid="input-asset-value" placeholder={assetType === "font" ? "Inter, sans-serif" : "https://example.com/logo.png"} />
                )}
              </div>
              {assetType === "font" && (
                <div>
                  <Label>Font Weight</Label>
                  <Select name="fontWeight" defaultValue="400">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">Light (300)</SelectItem>
                      <SelectItem value="400">Regular (400)</SelectItem>
                      <SelectItem value="500">Medium (500)</SelectItem>
                      <SelectItem value="600">Semibold (600)</SelectItem>
                      <SelectItem value="700">Bold (700)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {assetType === "tone" && (
                <div>
                  <Label>Usage Context</Label>
                  <Input name="usage" data-testid="input-asset-usage" placeholder="Social media, YouTube descriptions, emails..." />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-brand-asset">
                {createMutation.isPending ? "Adding..." : "Add Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterType === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(null)} data-testid="filter-brand-all">All</Badge>
        {ASSET_TYPES.map((t) => (
          <Badge key={t} variant={filterType === t ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(filterType === t ? null : t)} data-testid={`filter-brand-${t}`}>
            {assetTypeLabels[t]}
          </Badge>
        ))}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Palette className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-brand">Build your brand identity</p>
            <p className="text-xs text-muted-foreground">Add your brand colors, logos, fonts, and voice guidelines</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {colorAssets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Color Palette</p>
              <div className="flex gap-3 flex-wrap">
                {colorAssets.map((asset: any) => (
                  <div key={asset.id} data-testid={`card-brand-asset-${asset.id}`} className="group relative">
                    <div className="w-20 h-20 rounded-md border" style={{ backgroundColor: asset.value }} />
                    <p className="text-xs font-medium mt-1 text-center truncate w-20">{asset.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{asset.value}</p>
                    <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherAssets.length > 0 && (
            <div className="grid gap-3">
              {otherAssets.map((asset: any) => (
                <Card key={asset.id} data-testid={`card-brand-asset-${asset.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-md ${assetTypeIcons[asset.assetType] || "bg-muted"}`} />
                        <div>
                          <p className="text-sm font-medium">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.assetType === "font" ? asset.metadata?.fontFamily || asset.value : asset.assetType === "tone" ? (asset.value?.substring(0, 80) + (asset.value?.length > 80 ? "..." : "")) : asset.value}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize text-xs">{assetTypeLabels[asset.assetType]}</Badge>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowPersonalBrandAI(!showPersonalBrandAI)}
          data-testid="button-toggle-personal-brand-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Personal Brand Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showPersonalBrandAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showPersonalBrandAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandAuditLoading || aiBrandAudit) && (
              <Card data-testid="card-ai-brand-audit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Audit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandAuditLoading ? <Skeleton className="h-24 w-full" /> : aiBrandAudit && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandAudit.strategies || aiBrandAudit.tips || aiBrandAudit.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiElevPitchLoading || aiElevPitch) && (
              <Card data-testid="card-ai-elev-pitch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Elevator Pitch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiElevPitchLoading ? <Skeleton className="h-24 w-full" /> : aiElevPitch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiElevPitch.strategies || aiElevPitch.tips || aiElevPitch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPressKitPBLoading || aiPressKitPB) && (
              <Card data-testid="card-ai-press-kit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Press Kit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPressKitPBLoading ? <Skeleton className="h-24 w-full" /> : aiPressKitPB && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPressKitPB.strategies || aiPressKitPB.tips || aiPressKitPB.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSpeakerBioLoading || aiSpeakerBio) && (
              <Card data-testid="card-ai-speaker-bio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Speaker Bio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSpeakerBioLoading ? <Skeleton className="h-24 w-full" /> : aiSpeakerBio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSpeakerBio.strategies || aiSpeakerBio.tips || aiSpeakerBio.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLIProfileLoading || aiLIProfile) && (
              <Card data-testid="card-ai-li-profile">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI LinkedIn Profile</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLIProfileLoading ? <Skeleton className="h-24 w-full" /> : aiLIProfile && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLIProfile.strategies || aiLIProfile.tips || aiLIProfile.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPersWebLoading || aiPersWeb) && (
              <Card data-testid="card-ai-pers-web">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Personal Website</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPersWebLoading ? <Skeleton className="h-24 w-full" /> : aiPersWeb && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPersWeb.strategies || aiPersWeb.tips || aiPersWeb.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThoughtLeadLoading || aiThoughtLead) && (
              <Card data-testid="card-ai-thought-lead">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thought Leadership</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThoughtLeadLoading ? <Skeleton className="h-24 w-full" /> : aiThoughtLead && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThoughtLead.strategies || aiThoughtLead.tips || aiThoughtLead.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPubSpeakLoading || aiPubSpeak) && (
              <Card data-testid="card-ai-pub-speak">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Public Speaking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPubSpeakLoading ? <Skeleton className="h-24 w-full" /> : aiPubSpeak && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPubSpeak.strategies || aiPubSpeak.tips || aiPubSpeak.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNetworkStratLoading || aiNetworkStrat) && (
              <Card data-testid="card-ai-network-strat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Networking Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNetworkStratLoading ? <Skeleton className="h-24 w-full" /> : aiNetworkStrat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNetworkStrat.strategies || aiNetworkStrat.tips || aiNetworkStrat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRepMonitorLoading || aiRepMonitor) && (
              <Card data-testid="card-ai-rep-monitor">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Reputation Monitor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRepMonitorLoading ? <Skeleton className="h-24 w-full" /> : aiRepMonitor && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRepMonitor.strategies || aiRepMonitor.tips || aiRepMonitor.recommendations)}
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

const COLLAB_STATUSES = ["suggested", "contacted", "active", "completed", "declined"] as const;
const collabStatusColors: Record<string, string> = {
  suggested: "bg-blue-500/10 text-blue-500",
  contacted: "bg-amber-500/10 text-amber-500",
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-purple-500/10 text-purple-500",
  declined: "bg-red-500/10 text-red-500",
};

function CollabsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [aiCollab, setAiCollab] = useState<any>(null);
  const [aiCollabLoading, setAiCollabLoading] = useState(true);

  const [showCollabSuiteAI, setShowCollabSuiteAI] = useState(false);
  const [aiCollabMatch, setAiCollabMatch] = useState<any>(null);
  const [aiCollabMatchLoading, setAiCollabMatchLoading] = useState(false);
  const [aiCollabContract, setAiCollabContract] = useState<any>(null);
  const [aiCollabContractLoading, setAiCollabContractLoading] = useState(false);
  const [aiCollabRev, setAiCollabRev] = useState<any>(null);
  const [aiCollabRevLoading, setAiCollabRevLoading] = useState(false);
  const [aiCollabIdeas, setAiCollabIdeas] = useState<any>(null);
  const [aiCollabIdeasLoading, setAiCollabIdeasLoading] = useState(false);
  const [aiCollabOutreach, setAiCollabOutreach] = useState<any>(null);
  const [aiCollabOutreachLoading, setAiCollabOutreachLoading] = useState(false);
  const [aiCollabPerf, setAiCollabPerf] = useState<any>(null);
  const [aiCollabPerfLoading, setAiCollabPerfLoading] = useState(false);
  const [aiNetworkEff, setAiNetworkEff] = useState<any>(null);
  const [aiNetworkEffLoading, setAiNetworkEffLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCollabMatchmaker");
    if (cached) {
      try { setAiCollab(JSON.parse(cached)); setAiCollabLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/collab-matchmaker")
      .then((res) => res.json())
      .then((data) => { setAiCollab(data); sessionStorage.setItem("aiCollabMatchmaker", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiCollabLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_match2");
    if (cached) { try { setAiCollabMatch(JSON.parse(cached)); return; } catch {} }
    setAiCollabMatchLoading(true);
    apiRequest("POST", "/api/ai/collab-match", {}).then(r => r.json()).then(d => { setAiCollabMatch(d); sessionStorage.setItem("ai_collab_match2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabMatchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_contract");
    if (cached) { try { setAiCollabContract(JSON.parse(cached)); return; } catch {} }
    setAiCollabContractLoading(true);
    apiRequest("POST", "/api/ai/collab-contract", {}).then(r => r.json()).then(d => { setAiCollabContract(d); sessionStorage.setItem("ai_collab_contract", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabContractLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_rev");
    if (cached) { try { setAiCollabRev(JSON.parse(cached)); return; } catch {} }
    setAiCollabRevLoading(true);
    apiRequest("POST", "/api/ai/collab-revenue", {}).then(r => r.json()).then(d => { setAiCollabRev(d); sessionStorage.setItem("ai_collab_rev", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabRevLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_ideas");
    if (cached) { try { setAiCollabIdeas(JSON.parse(cached)); return; } catch {} }
    setAiCollabIdeasLoading(true);
    apiRequest("POST", "/api/ai/collab-ideas", {}).then(r => r.json()).then(d => { setAiCollabIdeas(d); sessionStorage.setItem("ai_collab_ideas", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabIdeasLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_outreach");
    if (cached) { try { setAiCollabOutreach(JSON.parse(cached)); return; } catch {} }
    setAiCollabOutreachLoading(true);
    apiRequest("POST", "/api/ai/collab-outreach", {}).then(r => r.json()).then(d => { setAiCollabOutreach(d); sessionStorage.setItem("ai_collab_outreach", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabOutreachLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_perf");
    if (cached) { try { setAiCollabPerf(JSON.parse(cached)); return; } catch {} }
    setAiCollabPerfLoading(true);
    apiRequest("POST", "/api/ai/collab-performance", {}).then(r => r.json()).then(d => { setAiCollabPerf(d); sessionStorage.setItem("ai_collab_perf", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabPerfLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_network_eff");
    if (cached) { try { setAiNetworkEff(JSON.parse(cached)); return; } catch {} }
    setAiNetworkEffLoading(true);
    apiRequest("POST", "/api/ai/network-effect", {}).then(r => r.json()).then(d => { setAiNetworkEff(d); sessionStorage.setItem("ai_network_eff", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNetworkEffLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ['/api/collaboration-leads'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/collaboration-leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaboration-leads'] });
      setDialogOpen(false);
      toast({ title: "Collaboration lead added" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      creatorName: formData.get("creatorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      status: formData.get("status") || "suggested",
      audienceOverlap: parseFloat(formData.get("audienceOverlap") as string) || null,
      notes: formData.get("notes") || null,
      aiSuggested: false,
    });
  };

  const filtered = filterStatus ? leads?.filter((l: any) => l.status === filterStatus) : leads;
  const aiSuggestedCount = leads?.filter((l: any) => l.aiSuggested)?.length || 0;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {aiCollabLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-collab" />
      ) : aiCollab ? (
        <Card data-testid="card-ai-collab-matchmaker">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Collab Matchmaker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCollab.idealPartnerTypes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Ideal Partner Types</p>
                <div className="space-y-3">
                  {aiCollab.idealPartnerTypes.map((p: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`partner-type-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{p.type}</p>
                        {p.audienceSize && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{p.audienceSize}</Badge>}
                      </div>
                      {p.nicheOverlap && <p className="text-xs text-muted-foreground">Niche Overlap: {p.nicheOverlap}</p>}
                      {p.collabFormat && <p className="text-xs text-muted-foreground">Format: {p.collabFormat}</p>}
                      {p.expectedBenefit && <p className="text-xs text-emerald-500">Benefit: {p.expectedBenefit}</p>}
                      {p.outreachTemplate && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-muted-foreground">Outreach Template</p>
                          <p className="text-xs text-muted-foreground italic">{p.outreachTemplate}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.collabFormats?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Collab Formats</p>
                <div className="grid gap-2">
                  {aiCollab.collabFormats.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`collab-format-${i}`}>
                      <div>
                        <p className="text-sm font-medium">{f.formatName || f.name}</p>
                        {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {f.effortLevel && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{f.effortLevel}</Badge>}
                        {f.impact && <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{f.impact}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.networkingTips?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Networking Tips</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiCollab.networkingTips.map((tip: string, i: number) => <li key={i} data-testid={`networking-tip-${i}`}>{tip}</li>)}
                </ul>
              </div>
            )}
            {aiCollab.collabCalendar && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Collab Calendar Suggestion</p>
                <p className="text-sm" data-testid="text-collab-calendar">{typeof aiCollab.collabCalendar === "string" ? aiCollab.collabCalendar : JSON.stringify(aiCollab.collabCalendar)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 data-testid="text-collabs-title" className="text-lg font-semibold">Collaborations</h2>
          {aiSuggestedCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Sparkles className="w-3 h-3" />{aiSuggestedCount} AI-suggested partner{aiSuggestedCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-collab" size="sm"><Plus className="w-4 h-4 mr-1" />Add Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Collaboration Lead</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Creator Name</Label>
                <Input name="creatorName" required data-testid="input-collab-name" placeholder="Creator name or channel" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-collab-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitter">Twitter</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="suggested">
                    <SelectTrigger data-testid="select-collab-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLLAB_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-collab-url" placeholder="https://youtube.com/@creator" />
              </div>
              <div>
                <Label>Audience Overlap (%)</Label>
                <Input name="audienceOverlap" type="number" min="0" max="100" step="0.1" data-testid="input-collab-overlap" placeholder="e.g. 35" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-collab-notes" placeholder="Potential collab ideas..." className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-collab">
                {createMutation.isPending ? "Adding..." : "Add Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterStatus === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterStatus(null)} data-testid="filter-collab-all">All ({leads?.length || 0})</Badge>
        {COLLAB_STATUSES.map((s) => {
          const count = leads?.filter((l: any) => l.status === s)?.length || 0;
          return (
            <Badge key={s} variant={filterStatus === s ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterStatus(filterStatus === s ? null : s)} data-testid={`filter-collab-${s}`}>
              {s} ({count})
            </Badge>
          );
        })}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-collabs">No collaboration leads yet</p>
            <p className="text-xs text-muted-foreground">Add creators you want to collaborate with or let AI suggest partners</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((lead: any) => (
            <Card key={lead.id} data-testid={`card-collab-${lead.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" data-testid={`text-collab-name-${lead.id}`}>{lead.creatorName}</p>
                        {lead.aiSuggested && <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-400"><Sparkles className="w-3 h-3 mr-1" />AI Pick</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {lead.platform && <span>{lead.platform}</span>}
                        {lead.audienceOverlap != null && <span>{lead.audienceOverlap}% overlap</span>}
                        {lead.contactedAt && <span>Contacted {new Date(lead.contactedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={`capitalize text-xs no-default-hover-elevate no-default-active-elevate ${collabStatusColors[lead.status] || ""}`} data-testid={`badge-collab-status-${lead.id}`}>
                      {lead.status}
                    </Badge>
                    {lead.channelUrl && (
                      <a href={lead.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" data-testid={`button-visit-collab-${lead.id}`}><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                  </div>
                </div>
                {lead.notes && <p className="text-xs text-muted-foreground mt-2 pl-13">{lead.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCollabSuiteAI(!showCollabSuiteAI)}
          data-testid="button-toggle-collab-suite-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Collaboration Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showCollabSuiteAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCollabSuiteAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCollabMatchLoading || aiCollabMatch) && (
              <Card data-testid="card-ai-collab-match2">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Match</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabMatchLoading ? <Skeleton className="h-24 w-full" /> : aiCollabMatch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabMatch.matches || aiCollabMatch.partners || aiCollabMatch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabContractLoading || aiCollabContract) && (
              <Card data-testid="card-ai-collab-contract">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Contract</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabContractLoading ? <Skeleton className="h-24 w-full" /> : aiCollabContract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabContract.clauses || aiCollabContract.terms || aiCollabContract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabRevLoading || aiCollabRev) && (
              <Card data-testid="card-ai-collab-rev">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabRevLoading ? <Skeleton className="h-24 w-full" /> : aiCollabRev && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabRev.revenue || aiCollabRev.splits || aiCollabRev.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabIdeasLoading || aiCollabIdeas) && (
              <Card data-testid="card-ai-collab-ideas">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Ideas</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabIdeasLoading ? <Skeleton className="h-24 w-full" /> : aiCollabIdeas && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabIdeas.ideas || aiCollabIdeas.concepts || aiCollabIdeas.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabOutreachLoading || aiCollabOutreach) && (
              <Card data-testid="card-ai-collab-outreach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Outreach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabOutreachLoading ? <Skeleton className="h-24 w-full" /> : aiCollabOutreach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabOutreach.templates || aiCollabOutreach.messages || aiCollabOutreach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabPerfLoading || aiCollabPerf) && (
              <Card data-testid="card-ai-collab-perf">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Performance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabPerfLoading ? <Skeleton className="h-24 w-full" /> : aiCollabPerf && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabPerf.metrics || aiCollabPerf.performance || aiCollabPerf.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNetworkEffLoading || aiNetworkEff) && (
              <Card data-testid="card-ai-network-eff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Network Effect</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNetworkEffLoading ? <Skeleton className="h-24 w-full" /> : aiNetworkEff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNetworkEff.effects || aiNetworkEff.growth || aiNetworkEff.recommendations)}
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

function CompetitorsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: competitors, isLoading } = useQuery<any[]>({ queryKey: ['/api/competitors'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setDialogOpen(false);
      toast({ title: "Competitor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      toast({ title: "Competitor removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const strengthsRaw = (formData.get("strengths") as string) || "";
    const oppsRaw = (formData.get("opportunities") as string) || "";
    createMutation.mutate({
      competitorName: formData.get("competitorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      subscribers: parseInt(formData.get("subscribers") as string) || null,
      avgViews: parseInt(formData.get("avgViews") as string) || null,
      uploadFrequency: formData.get("uploadFrequency") || null,
      strengths: strengthsRaw ? strengthsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      opportunities: oppsRaw ? oppsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const totalSubs = competitors?.reduce((sum: number, c: any) => sum + (c.subscribers || 0), 0) || 0;
  const avgViewsAll = competitors?.length ? Math.round(competitors.reduce((sum: number, c: any) => sum + (c.avgViews || 0), 0) / competitors.length) : 0;

  const [showCompetitorAI, setShowCompetitorAI] = useState(false);
  const [aiCompAnalysis, setAiCompAnalysis] = useState<any>(null);
  const [aiCompAnalysisLoading, setAiCompAnalysisLoading] = useState(false);
  const [aiCompContent, setAiCompContent] = useState<any>(null);
  const [aiCompContentLoading, setAiCompContentLoading] = useState(false);
  const [aiCompPricing, setAiCompPricing] = useState<any>(null);
  const [aiCompPricingLoading, setAiCompPricingLoading] = useState(false);
  const [aiMktShare, setAiMktShare] = useState<any>(null);
  const [aiMktShareLoading, setAiMktShareLoading] = useState(false);
  const [aiSWOT, setAiSWOT] = useState<any>(null);
  const [aiSWOTLoading, setAiSWOTLoading] = useState(false);
  const [aiCompSocial, setAiCompSocial] = useState<any>(null);
  const [aiCompSocialLoading, setAiCompSocialLoading] = useState(false);
  const [aiBlueOcean, setAiBlueOcean] = useState<any>(null);
  const [aiBlueOceanLoading, setAiBlueOceanLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_analysis");
    if (cached) { try { setAiCompAnalysis(JSON.parse(cached)); return; } catch {} }
    setAiCompAnalysisLoading(true);
    apiRequest("POST", "/api/ai/competitor-analysis", {}).then(r => r.json()).then(d => { setAiCompAnalysis(d); sessionStorage.setItem("ai_comp_analysis", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompAnalysisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_content");
    if (cached) { try { setAiCompContent(JSON.parse(cached)); return; } catch {} }
    setAiCompContentLoading(true);
    apiRequest("POST", "/api/ai/competitor-content", {}).then(r => r.json()).then(d => { setAiCompContent(d); sessionStorage.setItem("ai_comp_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_pricing");
    if (cached) { try { setAiCompPricing(JSON.parse(cached)); return; } catch {} }
    setAiCompPricingLoading(true);
    apiRequest("POST", "/api/ai/competitor-pricing", {}).then(r => r.json()).then(d => { setAiCompPricing(d); sessionStorage.setItem("ai_comp_pricing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompPricingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mkt_share");
    if (cached) { try { setAiMktShare(JSON.parse(cached)); return; } catch {} }
    setAiMktShareLoading(true);
    apiRequest("POST", "/api/ai/market-share", {}).then(r => r.json()).then(d => { setAiMktShare(d); sessionStorage.setItem("ai_mkt_share", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMktShareLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_swot");
    if (cached) { try { setAiSWOT(JSON.parse(cached)); return; } catch {} }
    setAiSWOTLoading(true);
    apiRequest("POST", "/api/ai/swot", {}).then(r => r.json()).then(d => { setAiSWOT(d); sessionStorage.setItem("ai_swot", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSWOTLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_social");
    if (cached) { try { setAiCompSocial(JSON.parse(cached)); return; } catch {} }
    setAiCompSocialLoading(true);
    apiRequest("POST", "/api/ai/competitor-social", {}).then(r => r.json()).then(d => { setAiCompSocial(d); sessionStorage.setItem("ai_comp_social", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompSocialLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_blue_ocean");
    if (cached) { try { setAiBlueOcean(JSON.parse(cached)); return; } catch {} }
    setAiBlueOceanLoading(true);
    apiRequest("POST", "/api/ai/blue-ocean", {}).then(r => r.json()).then(d => { setAiBlueOcean(d); sessionStorage.setItem("ai_blue_ocean", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBlueOceanLoading(false));
  }, []);

  const renderAIListComp = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  if (isLoading) return <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-competitors-title" className="text-lg font-semibold">Competitor Analysis</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor" size="sm"><Plus className="w-4 h-4 mr-1" />Track Competitor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Track a Competitor</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Channel/Creator Name</Label>
                <Input name="competitorName" required data-testid="input-competitor-name" placeholder="Competitor name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-competitor-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Upload Frequency</Label>
                  <Select name="uploadFrequency" defaultValue="weekly">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-competitor-url" placeholder="https://youtube.com/@competitor" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscribers</Label>
                  <Input name="subscribers" type="number" data-testid="input-competitor-subs" placeholder="100000" />
                </div>
                <div>
                  <Label>Avg Views</Label>
                  <Input name="avgViews" type="number" data-testid="input-competitor-views" placeholder="50000" />
                </div>
              </div>
              <div>
                <Label>Strengths (comma-separated)</Label>
                <Input name="strengths" data-testid="input-competitor-strengths" placeholder="Great thumbnails, consistent uploads" />
              </div>
              <div>
                <Label>Opportunities (comma-separated)</Label>
                <Input name="opportunities" data-testid="input-competitor-opps" placeholder="Weak SEO, no shorts strategy" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-competitor">
                {createMutation.isPending ? "Adding..." : "Track Competitor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {competitors && competitors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Tracking</p>
              <p className="text-xl font-bold" data-testid="text-competitor-count">{competitors.length} competitor{competitors.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Combined Subscribers</p>
              <p className="text-xl font-bold" data-testid="text-competitor-total-subs">{totalSubs >= 1000 ? `${(totalSubs / 1000).toFixed(totalSubs >= 10000 ? 0 : 1)}K` : totalSubs}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Views (across all)</p>
              <p className="text-xl font-bold" data-testid="text-competitor-avg-views">{avgViewsAll >= 1000 ? `${(avgViewsAll / 1000).toFixed(avgViewsAll >= 10000 ? 0 : 1)}K` : avgViewsAll}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {(!competitors || competitors.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Eye className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-competitors">No competitors tracked yet</p>
            <p className="text-xs text-muted-foreground">Add competitors to monitor their strategy and find your edge</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {competitors.map((comp: any) => (
            <Card key={comp.id} data-testid={`card-competitor-${comp.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-competitor-name-${comp.id}`}>{comp.competitorName}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="secondary" className="text-xs">{comp.platform}</Badge>
                      {comp.uploadFrequency && <span className="capitalize">{comp.uploadFrequency} uploads</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {comp.channelUrl && (
                      <a href={comp.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost"><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(comp.id)} data-testid={`button-delete-competitor-${comp.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {comp.subscribers != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Subscribers</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-subs-${comp.id}`}>{comp.subscribers >= 1000 ? `${(comp.subscribers / 1000).toFixed(comp.subscribers >= 10000 ? 0 : 1)}K` : comp.subscribers}</p>
                    </div>
                  )}
                  {comp.avgViews != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Views</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-views-${comp.id}`}>{comp.avgViews >= 1000 ? `${(comp.avgViews / 1000).toFixed(comp.avgViews >= 10000 ? 0 : 1)}K` : comp.avgViews}</p>
                    </div>
                  )}
                </div>
                {comp.strengths && comp.strengths.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.strengths.map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {comp.opportunities && comp.opportunities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Your Opportunities</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.opportunities.map((o: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-amber-500/10 text-amber-500 no-default-hover-elevate no-default-active-elevate">{o}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCompetitorAI(!showCompetitorAI)}
          data-testid="button-toggle-competitor-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Competitor Intelligence Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showCompetitorAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCompetitorAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCompAnalysisLoading || aiCompAnalysis) && (
              <Card data-testid="card-ai-comp-analysis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompAnalysisLoading ? <Skeleton className="h-24 w-full" /> : aiCompAnalysis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompAnalysis.competitors || aiCompAnalysis.recommendations || aiCompAnalysis.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompContentLoading || aiCompContent) && (
              <Card data-testid="card-ai-comp-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompContentLoading ? <Skeleton className="h-24 w-full" /> : aiCompContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompContent.content || aiCompContent.recommendations || aiCompContent.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompPricingLoading || aiCompPricing) && (
              <Card data-testid="card-ai-comp-pricing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Pricing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompPricingLoading ? <Skeleton className="h-24 w-full" /> : aiCompPricing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompPricing.pricing || aiCompPricing.recommendations || aiCompPricing.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMktShareLoading || aiMktShare) && (
              <Card data-testid="card-ai-mkt-share">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Market Share</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMktShareLoading ? <Skeleton className="h-24 w-full" /> : aiMktShare && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiMktShare.segments || aiMktShare.recommendations || aiMktShare.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSWOTLoading || aiSWOT) && (
              <Card data-testid="card-ai-swot">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI SWOT Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSWOTLoading ? <Skeleton className="h-24 w-full" /> : aiSWOT && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiSWOT.analysis || aiSWOT.recommendations || aiSWOT.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompSocialLoading || aiCompSocial) && (
              <Card data-testid="card-ai-comp-social">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Social</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompSocialLoading ? <Skeleton className="h-24 w-full" /> : aiCompSocial && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompSocial.platforms || aiCompSocial.recommendations || aiCompSocial.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBlueOceanLoading || aiBlueOcean) && (
              <Card data-testid="card-ai-blue-ocean">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Blue Ocean Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBlueOceanLoading ? <Skeleton className="h-24 w-full" /> : aiBlueOcean && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiBlueOcean.strategies || aiBlueOcean.recommendations || aiBlueOcean.results)}
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

const ENTITY_TYPES = ["sole_proprietor", "llc", "s_corp", "c_corp", "partnership"] as const;
const entityTypeLabels: Record<string, string> = { sole_proprietor: "Sole Proprietor", llc: "LLC", s_corp: "S-Corp", c_corp: "C-Corp", partnership: "Partnership" };
const FORMATION_STEPS = [
  { key: "entity", label: "Choose Entity Type", desc: "Select your business structure" },
  { key: "ein", label: "Get EIN", desc: "Apply for Employer Identification Number" },
  { key: "state", label: "State Registration", desc: "File with your state" },
  { key: "bank", label: "Business Bank Account", desc: "Open a dedicated account" },
  { key: "insurance", label: "Business Insurance", desc: "Get coverage for your business" },
  { key: "trademark", label: "Trademark", desc: "Protect your brand name" },
];

function LegalTab() {
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: taxEstimates } = useQuery<any[]>({ queryKey: ['/api/tax-estimates'] });

  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    const stored = localStorage.getItem("legalFormationSteps");
    return stored ? JSON.parse(stored) : [];
  });

  const toggleStep = (key: string) => {
    setCompletedSteps((prev: string[]) => {
      const next = prev.includes(key) ? prev.filter((k: string) => k !== key) : [...prev, key];
      localStorage.setItem("legalFormationSteps", JSON.stringify(next));
      return next;
    });
  };

  const completionPct = Math.round((completedSteps.length / FORMATION_STEPS.length) * 100);

  const activeVenture = ventures?.find((v: any) => v.status === "active");
  const entityType = activeVenture?.metadata?.entityType || activeVenture?.type || null;

  const upcomingTax = taxEstimates?.find((t: any) => !t.paid && t.dueDate && new Date(t.dueDate) > new Date());

  const [showLegalAI, setShowLegalAI] = useState(false);
  const [aiCopyright, setAiCopyright] = useState<any>(null);
  const [aiCopyrightLoading, setAiCopyrightLoading] = useState(false);
  const [aiFairUse, setAiFairUse] = useState<any>(null);
  const [aiFairUseLoading, setAiFairUseLoading] = useState(false);
  const [aiMusicLicense, setAiMusicLicense] = useState<any>(null);
  const [aiMusicLicenseLoading, setAiMusicLicenseLoading] = useState(false);
  const [aiPrivacyPolicy, setAiPrivacyPolicy] = useState<any>(null);
  const [aiPrivacyPolicyLoading, setAiPrivacyPolicyLoading] = useState(false);
  const [aiToS, setAiToS] = useState<any>(null);
  const [aiToSLoading, setAiToSLoading] = useState(false);
  const [aiFTC, setAiFTC] = useState<any>(null);
  const [aiFTCLoading, setAiFTCLoading] = useState(false);
  const [aiCOPPA, setAiCOPPA] = useState<any>(null);
  const [aiCOPPALoading, setAiCOPPALoading] = useState(false);
  const [aiGDPR, setAiGDPR] = useState<any>(null);
  const [aiGDPRLoading, setAiGDPRLoading] = useState(false);
  const [aiContentID, setAiContentID] = useState<any>(null);
  const [aiContentIDLoading, setAiContentIDLoading] = useState(false);
  const [aiDispute, setAiDispute] = useState<any>(null);
  const [aiDisputeLoading, setAiDisputeLoading] = useState(false);
  const [aiTrademark, setAiTrademark] = useState<any>(null);
  const [aiTrademarkLoading, setAiTrademarkLoading] = useState(false);
  const [aiContractTempl, setAiContractTempl] = useState<any>(null);
  const [aiContractTemplLoading, setAiContractTemplLoading] = useState(false);
  const [aiInsurance, setAiInsurance] = useState<any>(null);
  const [aiInsuranceLoading, setAiInsuranceLoading] = useState(false);
  const [aiBizEntity, setAiBizEntity] = useState<any>(null);
  const [aiBizEntityLoading, setAiBizEntityLoading] = useState(false);
  const [aiIPProtect, setAiIPProtect] = useState<any>(null);
  const [aiIPProtectLoading, setAiIPProtectLoading] = useState(false);

  const [showSensitivityAI, setShowSensitivityAI] = useState(false);
  const [aiDiversityCS, setAiDiversityCS] = useState<any>(null);
  const [aiDiversityCSLoading, setAiDiversityCSLoading] = useState(false);
  const [aiMHContent, setAiMHContent] = useState<any>(null);
  const [aiMHContentLoading, setAiMHContentLoading] = useState(false);
  const [aiPolitical, setAiPolitical] = useState<any>(null);
  const [aiPoliticalLoading, setAiPoliticalLoading] = useState(false);
  const [aiReligious, setAiReligious] = useState<any>(null);
  const [aiReligiousLoading, setAiReligiousLoading] = useState(false);
  const [aiCulturalCS, setAiCulturalCS] = useState<any>(null);
  const [aiCulturalCSLoading, setAiCulturalCSLoading] = useState(false);
  const [aiBodyImage, setAiBodyImage] = useState<any>(null);
  const [aiBodyImageLoading, setAiBodyImageLoading] = useState(false);
  const [aiAddiction, setAiAddiction] = useState<any>(null);
  const [aiAddictionLoading, setAiAddictionLoading] = useState(false);
  const [aiFinDisclaim, setAiFinDisclaim] = useState<any>(null);
  const [aiFinDisclaimLoading, setAiFinDisclaimLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_copyright");
    if (cached) { try { setAiCopyright(JSON.parse(cached)); return; } catch {} }
    setAiCopyrightLoading(true);
    apiRequest("POST", "/api/ai/copyright-check", {}).then(r => r.json()).then(d => { setAiCopyright(d); sessionStorage.setItem("ai_copyright", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCopyrightLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fair_use");
    if (cached) { try { setAiFairUse(JSON.parse(cached)); return; } catch {} }
    setAiFairUseLoading(true);
    apiRequest("POST", "/api/ai/fair-use", {}).then(r => r.json()).then(d => { setAiFairUse(d); sessionStorage.setItem("ai_fair_use", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFairUseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_music_license");
    if (cached) { try { setAiMusicLicense(JSON.parse(cached)); return; } catch {} }
    setAiMusicLicenseLoading(true);
    apiRequest("POST", "/api/ai/music-license", {}).then(r => r.json()).then(d => { setAiMusicLicense(d); sessionStorage.setItem("ai_music_license", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMusicLicenseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_privacy_policy");
    if (cached) { try { setAiPrivacyPolicy(JSON.parse(cached)); return; } catch {} }
    setAiPrivacyPolicyLoading(true);
    apiRequest("POST", "/api/ai/privacy-policy", {}).then(r => r.json()).then(d => { setAiPrivacyPolicy(d); sessionStorage.setItem("ai_privacy_policy", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPrivacyPolicyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tos");
    if (cached) { try { setAiToS(JSON.parse(cached)); return; } catch {} }
    setAiToSLoading(true);
    apiRequest("POST", "/api/ai/terms-of-service", {}).then(r => r.json()).then(d => { setAiToS(d); sessionStorage.setItem("ai_tos", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiToSLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ftc");
    if (cached) { try { setAiFTC(JSON.parse(cached)); return; } catch {} }
    setAiFTCLoading(true);
    apiRequest("POST", "/api/ai/ftc-compliance", {}).then(r => r.json()).then(d => { setAiFTC(d); sessionStorage.setItem("ai_ftc", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFTCLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_coppa");
    if (cached) { try { setAiCOPPA(JSON.parse(cached)); return; } catch {} }
    setAiCOPPALoading(true);
    apiRequest("POST", "/api/ai/coppa", {}).then(r => r.json()).then(d => { setAiCOPPA(d); sessionStorage.setItem("ai_coppa", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCOPPALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gdpr");
    if (cached) { try { setAiGDPR(JSON.parse(cached)); return; } catch {} }
    setAiGDPRLoading(true);
    apiRequest("POST", "/api/ai/gdpr", {}).then(r => r.json()).then(d => { setAiGDPR(d); sessionStorage.setItem("ai_gdpr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGDPRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_id");
    if (cached) { try { setAiContentID(JSON.parse(cached)); return; } catch {} }
    setAiContentIDLoading(true);
    apiRequest("POST", "/api/ai/content-id", {}).then(r => r.json()).then(d => { setAiContentID(d); sessionStorage.setItem("ai_content_id", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentIDLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dispute");
    if (cached) { try { setAiDispute(JSON.parse(cached)); return; } catch {} }
    setAiDisputeLoading(true);
    apiRequest("POST", "/api/ai/dispute-resolution", {}).then(r => r.json()).then(d => { setAiDispute(d); sessionStorage.setItem("ai_dispute", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDisputeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_trademark");
    if (cached) { try { setAiTrademark(JSON.parse(cached)); return; } catch {} }
    setAiTrademarkLoading(true);
    apiRequest("POST", "/api/ai/trademark", {}).then(r => r.json()).then(d => { setAiTrademark(d); sessionStorage.setItem("ai_trademark", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTrademarkLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contract_templ");
    if (cached) { try { setAiContractTempl(JSON.parse(cached)); return; } catch {} }
    setAiContractTemplLoading(true);
    apiRequest("POST", "/api/ai/contract-template", {}).then(r => r.json()).then(d => { setAiContractTempl(d); sessionStorage.setItem("ai_contract_templ", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContractTemplLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_insurance");
    if (cached) { try { setAiInsurance(JSON.parse(cached)); return; } catch {} }
    setAiInsuranceLoading(true);
    apiRequest("POST", "/api/ai/insurance", {}).then(r => r.json()).then(d => { setAiInsurance(d); sessionStorage.setItem("ai_insurance", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInsuranceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_biz_entity");
    if (cached) { try { setAiBizEntity(JSON.parse(cached)); return; } catch {} }
    setAiBizEntityLoading(true);
    apiRequest("POST", "/api/ai/business-entity", {}).then(r => r.json()).then(d => { setAiBizEntity(d); sessionStorage.setItem("ai_biz_entity", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBizEntityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ip_protect");
    if (cached) { try { setAiIPProtect(JSON.parse(cached)); return; } catch {} }
    setAiIPProtectLoading(true);
    apiRequest("POST", "/api/ai/ip-protection", {}).then(r => r.json()).then(d => { setAiIPProtect(d); sessionStorage.setItem("ai_ip_protect", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIPProtectLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_diversity");
    if (cached) { try { setAiDiversityCS(JSON.parse(cached)); return; } catch {} }
    setAiDiversityCSLoading(true);
    apiRequest("POST", "/api/ai/diversity", {}).then(r => r.json()).then(d => { setAiDiversityCS(d); sessionStorage.setItem("ai_diversity", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDiversityCSLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mh_content");
    if (cached) { try { setAiMHContent(JSON.parse(cached)); return; } catch {} }
    setAiMHContentLoading(true);
    apiRequest("POST", "/api/ai/mental-health-content", {}).then(r => r.json()).then(d => { setAiMHContent(d); sessionStorage.setItem("ai_mh_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMHContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_political");
    if (cached) { try { setAiPolitical(JSON.parse(cached)); return; } catch {} }
    setAiPoliticalLoading(true);
    apiRequest("POST", "/api/ai/political-content", {}).then(r => r.json()).then(d => { setAiPolitical(d); sessionStorage.setItem("ai_political", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPoliticalLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_religious");
    if (cached) { try { setAiReligious(JSON.parse(cached)); return; } catch {} }
    setAiReligiousLoading(true);
    apiRequest("POST", "/api/ai/religious-sensitivity", {}).then(r => r.json()).then(d => { setAiReligious(d); sessionStorage.setItem("ai_religious", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiReligiousLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cultural");
    if (cached) { try { setAiCulturalCS(JSON.parse(cached)); return; } catch {} }
    setAiCulturalCSLoading(true);
    apiRequest("POST", "/api/ai/cultural-sensitivity", {}).then(r => r.json()).then(d => { setAiCulturalCS(d); sessionStorage.setItem("ai_cultural", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCulturalCSLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_body_image");
    if (cached) { try { setAiBodyImage(JSON.parse(cached)); return; } catch {} }
    setAiBodyImageLoading(true);
    apiRequest("POST", "/api/ai/body-image", {}).then(r => r.json()).then(d => { setAiBodyImage(d); sessionStorage.setItem("ai_body_image", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBodyImageLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_addiction");
    if (cached) { try { setAiAddiction(JSON.parse(cached)); return; } catch {} }
    setAiAddictionLoading(true);
    apiRequest("POST", "/api/ai/addiction-content", {}).then(r => r.json()).then(d => { setAiAddiction(d); sessionStorage.setItem("ai_addiction", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAddictionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fin_disclaim");
    if (cached) { try { setAiFinDisclaim(JSON.parse(cached)); return; } catch {} }
    setAiFinDisclaimLoading(true);
    apiRequest("POST", "/api/ai/financial-disclaimer", {}).then(r => r.json()).then(d => { setAiFinDisclaim(d); sessionStorage.setItem("ai_fin_disclaim", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFinDisclaimLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <div className="space-y-6">
      <h2 data-testid="text-legal-title" className="text-lg font-semibold">Legal & Formation</h2>

      <Card className={completionPct === 100 ? "border-emerald-500/30 bg-emerald-500/5" : completionPct > 50 ? "border-amber-500/30 bg-amber-500/5" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-sm font-medium" data-testid="text-formation-status">
                {completionPct === 100 ? "Formation Complete" : `Formation Progress: ${completionPct}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {completedSteps.length} of {FORMATION_STEPS.length} steps done
              </p>
            </div>
            {entityType && <Badge variant="secondary" className="text-xs">{entityTypeLabels[entityType] || entityType}</Badge>}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionPct}%` }} data-testid="bar-formation-progress" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {FORMATION_STEPS.map((step) => {
          const done = completedSteps.includes(step.key);
          return (
            <Card key={step.key} className={`cursor-pointer hover-elevate ${done ? "border-emerald-500/20" : ""}`} onClick={() => toggleStep(step.key)} data-testid={`card-formation-step-${step.key}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"}`}>
                    {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {upcomingTax && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium">Upcoming Tax Payment</p>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-upcoming-tax">
              {upcomingTax.quarter} {upcomingTax.year} — Est. ${(upcomingTax.estimatedTax || 0).toLocaleString()} due {upcomingTax.dueDate ? new Date(upcomingTax.dueDate).toLocaleDateString() : "TBD"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Compliance Reminders</p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Annual Report Filing", status: completedSteps.includes("state") ? "done" : "pending" },
              { label: "Quarterly Tax Estimates", status: upcomingTax ? "upcoming" : "done" },
              { label: "Business License Renewal", status: completedSteps.includes("ein") ? "done" : "pending" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`compliance-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <span className="text-xs">{item.label}</span>
                <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${item.status === "done" ? "bg-emerald-500/10 text-emerald-500" : item.status === "upcoming" ? "bg-amber-500/10 text-amber-500" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                  {item.status === "done" ? "Complete" : item.status === "upcoming" ? "Due Soon" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowLegalAI(!showLegalAI)}
          data-testid="button-toggle-legal-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Legal & Compliance Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showLegalAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showLegalAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCopyrightLoading || aiCopyright) && (
              <Card data-testid="card-ai-copyright">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Copyright Check</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCopyrightLoading ? <Skeleton className="h-24 w-full" /> : aiCopyright && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCopyright.issues || aiCopyright.recommendations || aiCopyright.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFairUseLoading || aiFairUse) && (
              <Card data-testid="card-ai-fair-use">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Fair Use</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFairUseLoading ? <Skeleton className="h-24 w-full" /> : aiFairUse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFairUse.analysis || aiFairUse.recommendations || aiFairUse.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMusicLicenseLoading || aiMusicLicense) && (
              <Card data-testid="card-ai-music-license">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Music License</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMusicLicenseLoading ? <Skeleton className="h-24 w-full" /> : aiMusicLicense && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMusicLicense.licenses || aiMusicLicense.recommendations || aiMusicLicense.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPrivacyPolicyLoading || aiPrivacyPolicy) && (
              <Card data-testid="card-ai-privacy-policy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Privacy Policy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPrivacyPolicyLoading ? <Skeleton className="h-24 w-full" /> : aiPrivacyPolicy && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPrivacyPolicy.sections || aiPrivacyPolicy.recommendations || aiPrivacyPolicy.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiToSLoading || aiToS) && (
              <Card data-testid="card-ai-tos">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Terms of Service</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiToSLoading ? <Skeleton className="h-24 w-full" /> : aiToS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiToS.clauses || aiToS.recommendations || aiToS.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFTCLoading || aiFTC) && (
              <Card data-testid="card-ai-ftc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI FTC Compliance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFTCLoading ? <Skeleton className="h-24 w-full" /> : aiFTC && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFTC.guidelines || aiFTC.recommendations || aiFTC.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCOPPALoading || aiCOPPA) && (
              <Card data-testid="card-ai-coppa">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI COPPA</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCOPPALoading ? <Skeleton className="h-24 w-full" /> : aiCOPPA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCOPPA.requirements || aiCOPPA.recommendations || aiCOPPA.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGDPRLoading || aiGDPR) && (
              <Card data-testid="card-ai-gdpr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI GDPR</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGDPRLoading ? <Skeleton className="h-24 w-full" /> : aiGDPR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGDPR.compliance || aiGDPR.recommendations || aiGDPR.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentIDLoading || aiContentID) && (
              <Card data-testid="card-ai-content-id">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content ID</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentIDLoading ? <Skeleton className="h-24 w-full" /> : aiContentID && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentID.claims || aiContentID.recommendations || aiContentID.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDisputeLoading || aiDispute) && (
              <Card data-testid="card-ai-dispute">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Dispute Resolution</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDisputeLoading ? <Skeleton className="h-24 w-full" /> : aiDispute && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDispute.disputes || aiDispute.recommendations || aiDispute.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrademarkLoading || aiTrademark) && (
              <Card data-testid="card-ai-trademark">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Trademark</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrademarkLoading ? <Skeleton className="h-24 w-full" /> : aiTrademark && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrademark.marks || aiTrademark.recommendations || aiTrademark.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContractTemplLoading || aiContractTempl) && (
              <Card data-testid="card-ai-contract-templ">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Contract Template</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContractTemplLoading ? <Skeleton className="h-24 w-full" /> : aiContractTempl && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContractTempl.templates || aiContractTempl.recommendations || aiContractTempl.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInsuranceLoading || aiInsurance) && (
              <Card data-testid="card-ai-insurance">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Insurance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInsuranceLoading ? <Skeleton className="h-24 w-full" /> : aiInsurance && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInsurance.policies || aiInsurance.recommendations || aiInsurance.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBizEntityLoading || aiBizEntity) && (
              <Card data-testid="card-ai-biz-entity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Business Entity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBizEntityLoading ? <Skeleton className="h-24 w-full" /> : aiBizEntity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBizEntity.entities || aiBizEntity.recommendations || aiBizEntity.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIPProtectLoading || aiIPProtect) && (
              <Card data-testid="card-ai-ip-protect">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI IP Protection</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIPProtectLoading ? <Skeleton className="h-24 w-full" /> : aiIPProtect && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiIPProtect.protections || aiIPProtect.recommendations || aiIPProtect.results)}
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
          onClick={() => setShowSensitivityAI(!showSensitivityAI)}
          data-testid="button-toggle-sensitivity-ai"
        >
          <Sparkles className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">AI Content Sensitivity Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showSensitivityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showSensitivityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiDiversityCSLoading || aiDiversityCS) && (
              <Card data-testid="card-ai-diversity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Diversity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDiversityCSLoading ? <Skeleton className="h-24 w-full" /> : aiDiversityCS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDiversityCS.strategies || aiDiversityCS.tips || aiDiversityCS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMHContentLoading || aiMHContent) && (
              <Card data-testid="card-ai-mh-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Mental Health Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMHContentLoading ? <Skeleton className="h-24 w-full" /> : aiMHContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMHContent.strategies || aiMHContent.tips || aiMHContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPoliticalLoading || aiPolitical) && (
              <Card data-testid="card-ai-political">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Political Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPoliticalLoading ? <Skeleton className="h-24 w-full" /> : aiPolitical && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPolitical.strategies || aiPolitical.tips || aiPolitical.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReligiousLoading || aiReligious) && (
              <Card data-testid="card-ai-religious">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Religious Sensitivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReligiousLoading ? <Skeleton className="h-24 w-full" /> : aiReligious && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiReligious.strategies || aiReligious.tips || aiReligious.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCulturalCSLoading || aiCulturalCS) && (
              <Card data-testid="card-ai-cultural">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Cultural Sensitivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCulturalCSLoading ? <Skeleton className="h-24 w-full" /> : aiCulturalCS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCulturalCS.strategies || aiCulturalCS.tips || aiCulturalCS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBodyImageLoading || aiBodyImage) && (
              <Card data-testid="card-ai-body-image">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Body Image</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBodyImageLoading ? <Skeleton className="h-24 w-full" /> : aiBodyImage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBodyImage.strategies || aiBodyImage.tips || aiBodyImage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAddictionLoading || aiAddiction) && (
              <Card data-testid="card-ai-addiction">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Addiction Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAddictionLoading ? <Skeleton className="h-24 w-full" /> : aiAddiction && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAddiction.strategies || aiAddiction.tips || aiAddiction.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFinDisclaimLoading || aiFinDisclaim) && (
              <Card data-testid="card-ai-fin-disclaim">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Financial Disclaimer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFinDisclaimLoading ? <Skeleton className="h-24 w-full" /> : aiFinDisclaim && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFinDisclaim.strategies || aiFinDisclaim.tips || aiFinDisclaim.recommendations)}
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

const MOOD_LABELS = ["Terrible", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["Exhausted", "Low", "Moderate", "High", "Energized"];
const STRESS_LABELS = ["Relaxed", "Low", "Moderate", "High", "Overwhelmed"];

function WellnessTab() {
  const { toast } = useToast();
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);
  const [showCheckin, setShowCheckin] = useState(false);
  const [aiWellness, setAiWellness] = useState<any>(null);
  const [aiWellnessLoading, setAiWellnessLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiWellnessAdvisor");
    if (cached) {
      try { setAiWellness(JSON.parse(cached)); setAiWellnessLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/wellness-advisor")
      .then((res) => res.json())
      .then((data) => { setAiWellness(data); sessionStorage.setItem("aiWellnessAdvisor", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiWellnessLoading(false));
  }, []);

  const [showWellnessAI, setShowWellnessAI] = useState(false);
  const [aiBurnoutRisk, setAiBurnoutRisk] = useState<any>(null);
  const [aiBurnoutRiskLoading, setAiBurnoutRiskLoading] = useState(false);
  const [aiMeditation, setAiMeditation] = useState<any>(null);
  const [aiMeditationLoading, setAiMeditationLoading] = useState(false);
  const [aiWorkLife, setAiWorkLife] = useState<any>(null);
  const [aiWorkLifeLoading, setAiWorkLifeLoading] = useState(false);
  const [aiMentalHealth, setAiMentalHealth] = useState<any>(null);
  const [aiMentalHealthLoading, setAiMentalHealthLoading] = useState(false);
  const [aiSleep, setAiSleep] = useState<any>(null);
  const [aiSleepLoading, setAiSleepLoading] = useState(false);
  const [aiExercise, setAiExercise] = useState<any>(null);
  const [aiExerciseLoading, setAiExerciseLoading] = useState(false);
  const [aiEyeStrain, setAiEyeStrain] = useState<any>(null);
  const [aiEyeStrainLoading, setAiEyeStrainLoading] = useState(false);
  const [aiVoiceCare, setAiVoiceCare] = useState<any>(null);
  const [aiVoiceCareLoading, setAiVoiceCareLoading] = useState(false);
  const [aiStressMgmt, setAiStressMgmt] = useState<any>(null);
  const [aiStressMgmtLoading, setAiStressMgmtLoading] = useState(false);
  const [aiBreakSched, setAiBreakSched] = useState<any>(null);
  const [aiBreakSchedLoading, setAiBreakSchedLoading] = useState(false);

  const [showHealthAI, setShowHealthAI] = useState(false);
  const [aiErgonomicH, setAiErgonomicH] = useState<any>(null);
  const [aiErgonomicHLoading, setAiErgonomicHLoading] = useState(false);
  const [aiEyeCareH, setAiEyeCareH] = useState<any>(null);
  const [aiEyeCareHLoading, setAiEyeCareHLoading] = useState(false);
  const [aiVocalHealthH, setAiVocalHealthH] = useState<any>(null);
  const [aiVocalHealthHLoading, setAiVocalHealthHLoading] = useState(false);
  const [aiSleepOptH, setAiSleepOptH] = useState<any>(null);
  const [aiSleepOptHLoading, setAiSleepOptHLoading] = useState(false);
  const [aiNutritionH, setAiNutritionH] = useState<any>(null);
  const [aiNutritionHLoading, setAiNutritionHLoading] = useState(false);
  const [aiExerciseH, setAiExerciseH] = useState<any>(null);
  const [aiExerciseHLoading, setAiExerciseHLoading] = useState(false);
  const [aiStressMgmtH, setAiStressMgmtH] = useState<any>(null);
  const [aiStressMgmtHLoading, setAiStressMgmtHLoading] = useState(false);
  const [aiWorkLifeH, setAiWorkLifeH] = useState<any>(null);
  const [aiWorkLifeHLoading, setAiWorkLifeHLoading] = useState(false);
  const [aiBurnoutRecovH, setAiBurnoutRecovH] = useState<any>(null);
  const [aiBurnoutRecovHLoading, setAiBurnoutRecovHLoading] = useState(false);
  const [aiMeditationH, setAiMeditationH] = useState<any>(null);
  const [aiMeditationHLoading, setAiMeditationHLoading] = useState(false);
  const [aiTimeBlockH, setAiTimeBlockH] = useState<any>(null);
  const [aiTimeBlockHLoading, setAiTimeBlockHLoading] = useState(false);
  const [aiPomodoroH, setAiPomodoroH] = useState<any>(null);
  const [aiPomodoroHLoading, setAiPomodoroHLoading] = useState(false);
  const [aiDigDetoxH, setAiDigDetoxH] = useState<any>(null);
  const [aiDigDetoxHLoading, setAiDigDetoxHLoading] = useState(false);
  const [aiGratitudeH, setAiGratitudeH] = useState<any>(null);
  const [aiGratitudeHLoading, setAiGratitudeHLoading] = useState(false);
  const [aiAffirmH, setAiAffirmH] = useState<any>(null);
  const [aiAffirmHLoading, setAiAffirmHLoading] = useState(false);
  const [aiHabitStackH, setAiHabitStackH] = useState<any>(null);
  const [aiHabitStackHLoading, setAiHabitStackHLoading] = useState(false);
  const [aiEnergyH, setAiEnergyH] = useState<any>(null);
  const [aiEnergyHLoading, setAiEnergyHLoading] = useState(false);
  const [aiCreatorCommH, setAiCreatorCommH] = useState<any>(null);
  const [aiCreatorCommHLoading, setAiCreatorCommHLoading] = useState(false);
  const [aiMastermindH, setAiMastermindH] = useState<any>(null);
  const [aiMastermindHLoading, setAiMastermindHLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_burnout_risk");
    if (cached) { try { setAiBurnoutRisk(JSON.parse(cached)); return; } catch {} }
    setAiBurnoutRiskLoading(true);
    apiRequest("POST", "/api/ai/burnout-risk", {}).then(r => r.json()).then(d => { setAiBurnoutRisk(d); sessionStorage.setItem("ai_burnout_risk", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBurnoutRiskLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meditation");
    if (cached) { try { setAiMeditation(JSON.parse(cached)); return; } catch {} }
    setAiMeditationLoading(true);
    apiRequest("POST", "/api/ai/meditation", {}).then(r => r.json()).then(d => { setAiMeditation(d); sessionStorage.setItem("ai_meditation", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMeditationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_work_life");
    if (cached) { try { setAiWorkLife(JSON.parse(cached)); return; } catch {} }
    setAiWorkLifeLoading(true);
    apiRequest("POST", "/api/ai/work-life-balance", {}).then(r => r.json()).then(d => { setAiWorkLife(d); sessionStorage.setItem("ai_work_life", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorkLifeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mental_health");
    if (cached) { try { setAiMentalHealth(JSON.parse(cached)); return; } catch {} }
    setAiMentalHealthLoading(true);
    apiRequest("POST", "/api/ai/mental-health", {}).then(r => r.json()).then(d => { setAiMentalHealth(d); sessionStorage.setItem("ai_mental_health", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMentalHealthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sleep");
    if (cached) { try { setAiSleep(JSON.parse(cached)); return; } catch {} }
    setAiSleepLoading(true);
    apiRequest("POST", "/api/ai/sleep", {}).then(r => r.json()).then(d => { setAiSleep(d); sessionStorage.setItem("ai_sleep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSleepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exercise");
    if (cached) { try { setAiExercise(JSON.parse(cached)); return; } catch {} }
    setAiExerciseLoading(true);
    apiRequest("POST", "/api/ai/exercise", {}).then(r => r.json()).then(d => { setAiExercise(d); sessionStorage.setItem("ai_exercise", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiExerciseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_eye_strain");
    if (cached) { try { setAiEyeStrain(JSON.parse(cached)); return; } catch {} }
    setAiEyeStrainLoading(true);
    apiRequest("POST", "/api/ai/eye-strain", {}).then(r => r.json()).then(d => { setAiEyeStrain(d); sessionStorage.setItem("ai_eye_strain", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEyeStrainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_care");
    if (cached) { try { setAiVoiceCare(JSON.parse(cached)); return; } catch {} }
    setAiVoiceCareLoading(true);
    apiRequest("POST", "/api/ai/voice-care", {}).then(r => r.json()).then(d => { setAiVoiceCare(d); sessionStorage.setItem("ai_voice_care", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVoiceCareLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stress_mgmt");
    if (cached) { try { setAiStressMgmt(JSON.parse(cached)); return; } catch {} }
    setAiStressMgmtLoading(true);
    apiRequest("POST", "/api/ai/stress-management", {}).then(r => r.json()).then(d => { setAiStressMgmt(d); sessionStorage.setItem("ai_stress_mgmt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStressMgmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_break_sched");
    if (cached) { try { setAiBreakSched(JSON.parse(cached)); return; } catch {} }
    setAiBreakSchedLoading(true);
    apiRequest("POST", "/api/ai/break-scheduler", {}).then(r => r.json()).then(d => { setAiBreakSched(d); sessionStorage.setItem("ai_break_sched", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBreakSchedLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ergonomic");
    if (cached) { try { setAiErgonomicH(JSON.parse(cached)); return; } catch {} }
    setAiErgonomicHLoading(true);
    apiRequest("POST", "/api/ai/ergonomic-setup", {}).then(r => r.json()).then(d => { setAiErgonomicH(d); sessionStorage.setItem("ai_ergonomic", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiErgonomicHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_eye_care");
    if (cached) { try { setAiEyeCareH(JSON.parse(cached)); return; } catch {} }
    setAiEyeCareHLoading(true);
    apiRequest("POST", "/api/ai/eye-care", {}).then(r => r.json()).then(d => { setAiEyeCareH(d); sessionStorage.setItem("ai_eye_care", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEyeCareHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vocal_health");
    if (cached) { try { setAiVocalHealthH(JSON.parse(cached)); return; } catch {} }
    setAiVocalHealthHLoading(true);
    apiRequest("POST", "/api/ai/vocal-health", {}).then(r => r.json()).then(d => { setAiVocalHealthH(d); sessionStorage.setItem("ai_vocal_health", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVocalHealthHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sleep_h");
    if (cached) { try { setAiSleepOptH(JSON.parse(cached)); return; } catch {} }
    setAiSleepOptHLoading(true);
    apiRequest("POST", "/api/ai/sleep-optimize", {}).then(r => r.json()).then(d => { setAiSleepOptH(d); sessionStorage.setItem("ai_sleep_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSleepOptHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_nutrition");
    if (cached) { try { setAiNutritionH(JSON.parse(cached)); return; } catch {} }
    setAiNutritionHLoading(true);
    apiRequest("POST", "/api/ai/nutrition", {}).then(r => r.json()).then(d => { setAiNutritionH(d); sessionStorage.setItem("ai_nutrition", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNutritionHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exercise_h");
    if (cached) { try { setAiExerciseH(JSON.parse(cached)); return; } catch {} }
    setAiExerciseHLoading(true);
    apiRequest("POST", "/api/ai/exercise", {}).then(r => r.json()).then(d => { setAiExerciseH(d); sessionStorage.setItem("ai_exercise_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiExerciseHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stress_mgmt_h");
    if (cached) { try { setAiStressMgmtH(JSON.parse(cached)); return; } catch {} }
    setAiStressMgmtHLoading(true);
    apiRequest("POST", "/api/ai/stress-management", {}).then(r => r.json()).then(d => { setAiStressMgmtH(d); sessionStorage.setItem("ai_stress_mgmt_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStressMgmtHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_work_life_h");
    if (cached) { try { setAiWorkLifeH(JSON.parse(cached)); return; } catch {} }
    setAiWorkLifeHLoading(true);
    apiRequest("POST", "/api/ai/work-life-balance", {}).then(r => r.json()).then(d => { setAiWorkLifeH(d); sessionStorage.setItem("ai_work_life_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorkLifeHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_burnout_recov");
    if (cached) { try { setAiBurnoutRecovH(JSON.parse(cached)); return; } catch {} }
    setAiBurnoutRecovHLoading(true);
    apiRequest("POST", "/api/ai/burnout-recovery", {}).then(r => r.json()).then(d => { setAiBurnoutRecovH(d); sessionStorage.setItem("ai_burnout_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBurnoutRecovHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meditation_h");
    if (cached) { try { setAiMeditationH(JSON.parse(cached)); return; } catch {} }
    setAiMeditationHLoading(true);
    apiRequest("POST", "/api/ai/meditation", {}).then(r => r.json()).then(d => { setAiMeditationH(d); sessionStorage.setItem("ai_meditation_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMeditationHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_time_block");
    if (cached) { try { setAiTimeBlockH(JSON.parse(cached)); return; } catch {} }
    setAiTimeBlockHLoading(true);
    apiRequest("POST", "/api/ai/time-blocking", {}).then(r => r.json()).then(d => { setAiTimeBlockH(d); sessionStorage.setItem("ai_time_block", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTimeBlockHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pomodoro");
    if (cached) { try { setAiPomodoroH(JSON.parse(cached)); return; } catch {} }
    setAiPomodoroHLoading(true);
    apiRequest("POST", "/api/ai/pomodoro", {}).then(r => r.json()).then(d => { setAiPomodoroH(d); sessionStorage.setItem("ai_pomodoro", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPomodoroHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dig_detox");
    if (cached) { try { setAiDigDetoxH(JSON.parse(cached)); return; } catch {} }
    setAiDigDetoxHLoading(true);
    apiRequest("POST", "/api/ai/digital-detox", {}).then(r => r.json()).then(d => { setAiDigDetoxH(d); sessionStorage.setItem("ai_dig_detox", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDigDetoxHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gratitude");
    if (cached) { try { setAiGratitudeH(JSON.parse(cached)); return; } catch {} }
    setAiGratitudeHLoading(true);
    apiRequest("POST", "/api/ai/gratitude-journal", {}).then(r => r.json()).then(d => { setAiGratitudeH(d); sessionStorage.setItem("ai_gratitude", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGratitudeHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_affirm");
    if (cached) { try { setAiAffirmH(JSON.parse(cached)); return; } catch {} }
    setAiAffirmHLoading(true);
    apiRequest("POST", "/api/ai/affirmations", {}).then(r => r.json()).then(d => { setAiAffirmH(d); sessionStorage.setItem("ai_affirm", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAffirmHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_habit_stack");
    if (cached) { try { setAiHabitStackH(JSON.parse(cached)); return; } catch {} }
    setAiHabitStackHLoading(true);
    apiRequest("POST", "/api/ai/habit-stack", {}).then(r => r.json()).then(d => { setAiHabitStackH(d); sessionStorage.setItem("ai_habit_stack", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHabitStackHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_energy");
    if (cached) { try { setAiEnergyH(JSON.parse(cached)); return; } catch {} }
    setAiEnergyHLoading(true);
    apiRequest("POST", "/api/ai/energy-management", {}).then(r => r.json()).then(d => { setAiEnergyH(d); sessionStorage.setItem("ai_energy", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEnergyHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_comm_h");
    if (cached) { try { setAiCreatorCommH(JSON.parse(cached)); return; } catch {} }
    setAiCreatorCommHLoading(true);
    apiRequest("POST", "/api/ai/creator-community", {}).then(r => r.json()).then(d => { setAiCreatorCommH(d); sessionStorage.setItem("ai_creator_comm_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCreatorCommHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mastermind_h");
    if (cached) { try { setAiMastermindH(JSON.parse(cached)); return; } catch {} }
    setAiMastermindHLoading(true);
    apiRequest("POST", "/api/ai/mastermind-group", {}).then(r => r.json()).then(d => { setAiMastermindH(d); sessionStorage.setItem("ai_mastermind_h", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMastermindHLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const { data: checks, isLoading } = useQuery<any[]>({ queryKey: ['/api/wellness'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wellness'] });
      setShowCheckin(false);
      toast({ title: "Check-in saved" });
    },
  });

  const handleCheckin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      mood, energy, stress,
      hoursWorked: parseFloat(formData.get("hoursWorked") as string) || null,
      notes: formData.get("notes") || null,
    });
  };

  const todayCheck = checks?.[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const checkedInToday = todayCheck && new Date(todayCheck.createdAt) >= todayStart;

  const recentChecks = checks?.slice(0, 7) || [];
  const avgMood = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.mood, 0) / recentChecks.length).toFixed(1) : "—";
  const avgEnergy = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.energy, 0) / recentChecks.length).toFixed(1) : "—";
  const avgStress = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.stress, 0) / recentChecks.length).toFixed(1) : "—";

  const streak = (() => {
    if (!checks?.length) return 0;
    let count = 0;
    const now = new Date();
    for (let i = 0; i < Math.min(checks.length, 30); i++) {
      const checkDate = new Date(checks[i].createdAt);
      const daysDiff = Math.floor((now.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= count + 1) count++;
      else break;
    }
    return count;
  })();

  const moodColor = (val: number) => val <= 1 ? "text-red-400" : val <= 2 ? "text-amber-400" : val <= 3 ? "text-yellow-400" : "text-emerald-400";
  const stressColor = (val: number) => val >= 4 ? "text-red-400" : val >= 3 ? "text-amber-400" : "text-emerald-400";

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const burnoutColor = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "text-emerald-500";
    if (l === "moderate") return "text-amber-500";
    return "text-red-500";
  };
  const burnoutBg = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "bg-emerald-500";
    if (l === "moderate") return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {aiWellnessLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-wellness" />
      ) : aiWellness ? (
        <Card data-testid="card-ai-wellness">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Wellness Advisor
            </CardTitle>
            {aiWellness.burnoutRiskLevel && (
              <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${burnoutColor(aiWellness.burnoutRiskLevel)}`} data-testid="badge-burnout-risk">
                {aiWellness.burnoutRiskLevel} Risk
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiWellness.burnoutScore != null && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Burnout Score</p>
                  <span className={`text-xs font-medium ${burnoutColor(aiWellness.burnoutRiskLevel || "")}`} data-testid="text-burnout-score">{aiWellness.burnoutScore}/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${burnoutBg(aiWellness.burnoutRiskLevel || "")}`} style={{ width: `${aiWellness.burnoutScore}%` }} data-testid="bar-burnout-score" />
                </div>
              </div>
            )}
            {aiWellness.assessment && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Assessment</p>
                <p className="text-sm" data-testid="text-wellness-assessment">{aiWellness.assessment}</p>
              </div>
            )}
            {aiWellness.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recommendations</p>
                <div className="space-y-2">
                  {aiWellness.recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-2 flex-wrap" data-testid={`wellness-rec-${i}`}>
                      <p className="text-sm">{rec.action}</p>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {rec.priority && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.priority}</Badge>}
                        {rec.category && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.category}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiWellness.breakSuggestion && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Break Suggestion</p>
                {aiWellness.breakSuggestion.duration && <p className="text-sm" data-testid="text-break-duration">Duration: {aiWellness.breakSuggestion.duration}</p>}
                {aiWellness.breakSuggestion.activities?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {aiWellness.breakSuggestion.activities.map((a: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{a}</Badge>
                    ))}
                  </div>
                )}
                {aiWellness.breakSuggestion.bestDay && <p className="text-xs text-muted-foreground mt-1">Best day: {aiWellness.breakSuggestion.bestDay}</p>}
              </div>
            )}
            {aiWellness.batchRecordingSchedule && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Batch Recording Schedule</p>
                <p className="text-sm" data-testid="text-batch-schedule">{typeof aiWellness.batchRecordingSchedule === "string" ? aiWellness.batchRecordingSchedule : JSON.stringify(aiWellness.batchRecordingSchedule)}</p>
              </div>
            )}
            {aiWellness.creativeBlockExercises?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Creative Block Exercises</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiWellness.creativeBlockExercises.map((ex: string, i: number) => <li key={i} data-testid={`creative-exercise-${i}`}>{typeof ex === "string" ? ex : (ex as any).name || JSON.stringify(ex)}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-wellness-title" className="text-lg font-semibold">Creator Wellness</h2>
        {!showCheckin && (
          <Button data-testid="button-checkin" size="sm" onClick={() => setShowCheckin(true)}>
            <Heart className="w-4 h-4 mr-1" />
            {checkedInToday ? "Check In Again" : "Daily Check-In"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={checkedInToday ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-bold" data-testid="text-wellness-today">{checkedInToday ? MOOD_LABELS[todayCheck.mood - 1] : "Not yet"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Mood</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-mood">{avgMood}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Energy</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-energy">{avgEnergy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Streak</p>
            <p className="text-lg font-bold" data-testid="text-wellness-streak">{streak} day{streak !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {showCheckin && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCheckin} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Mood</Label>
                  <span className={`text-sm font-medium ${moodColor(mood)}`}>{MOOD_LABELS[mood - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={mood} onChange={(e) => setMood(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-mood" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Terrible</span><span>Great</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Energy</Label>
                  <span className={`text-sm font-medium ${moodColor(energy)}`}>{ENERGY_LABELS[energy - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-energy" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Exhausted</span><span>Energized</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Stress</Label>
                  <span className={`text-sm font-medium ${stressColor(stress)}`}>{STRESS_LABELS[stress - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={stress} onChange={(e) => setStress(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-stress" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Relaxed</span><span>Overwhelmed</span></div>
              </div>
              <div>
                <Label>Hours Worked Today</Label>
                <Input name="hoursWorked" type="number" step="0.5" min="0" max="24" data-testid="input-hours-worked" placeholder="e.g. 8" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-wellness-notes" placeholder="How are you feeling?" className="resize-none" />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={createMutation.isPending} data-testid="button-submit-checkin">
                  {createMutation.isPending ? "Saving..." : "Save Check-In"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCheckin(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {todayCheck?.aiRecommendation && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-medium">AI Recommendation</p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-ai-wellness-rec">{todayCheck.aiRecommendation}</p>
          </CardContent>
        </Card>
      )}

      {recentChecks.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Recent Check-Ins</p>
          <div className="space-y-2">
            {recentChecks.map((check: any) => (
              <Card key={check.id} data-testid={`card-wellness-${check.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(check.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium ${moodColor(check.mood)}`}>Mood: {check.mood}/5</span>
                        <span className={`text-xs font-medium ${moodColor(check.energy)}`}>Energy: {check.energy}/5</span>
                        <span className={`text-xs font-medium ${stressColor(check.stress)}`}>Stress: {check.stress}/5</span>
                      </div>
                    </div>
                    {check.hoursWorked != null && (
                      <span className="text-xs text-muted-foreground">{check.hoursWorked}h worked</span>
                    )}
                  </div>
                  {check.notes && <p className="text-xs text-muted-foreground mt-2">{check.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowWellnessAI(!showWellnessAI)}
          data-testid="button-toggle-wellness-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Wellness & Health Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showWellnessAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWellnessAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBurnoutRiskLoading || aiBurnoutRisk) && (
              <Card data-testid="card-ai-burnout-risk">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Burnout Risk</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBurnoutRiskLoading ? <Skeleton className="h-24 w-full" /> : aiBurnoutRisk && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBurnoutRisk.factors || aiBurnoutRisk.recommendations || aiBurnoutRisk.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMeditationLoading || aiMeditation) && (
              <Card data-testid="card-ai-meditation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Meditation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMeditationLoading ? <Skeleton className="h-24 w-full" /> : aiMeditation && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMeditation.exercises || aiMeditation.recommendations || aiMeditation.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkLifeLoading || aiWorkLife) && (
              <Card data-testid="card-ai-work-life">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Work-Life Balance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkLifeLoading ? <Skeleton className="h-24 w-full" /> : aiWorkLife && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkLife.tips || aiWorkLife.recommendations || aiWorkLife.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMentalHealthLoading || aiMentalHealth) && (
              <Card data-testid="card-ai-mental-health">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mental Health</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMentalHealthLoading ? <Skeleton className="h-24 w-full" /> : aiMentalHealth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMentalHealth.resources || aiMentalHealth.recommendations || aiMentalHealth.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSleepLoading || aiSleep) && (
              <Card data-testid="card-ai-sleep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sleep</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSleepLoading ? <Skeleton className="h-24 w-full" /> : aiSleep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSleep.tips || aiSleep.recommendations || aiSleep.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExerciseLoading || aiExercise) && (
              <Card data-testid="card-ai-exercise">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Exercise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExerciseLoading ? <Skeleton className="h-24 w-full" /> : aiExercise && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiExercise.routines || aiExercise.recommendations || aiExercise.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEyeStrainLoading || aiEyeStrain) && (
              <Card data-testid="card-ai-eye-strain">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Eye Strain</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEyeStrainLoading ? <Skeleton className="h-24 w-full" /> : aiEyeStrain && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEyeStrain.exercises || aiEyeStrain.recommendations || aiEyeStrain.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceCareLoading || aiVoiceCare) && (
              <Card data-testid="card-ai-voice-care">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voice Care</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceCareLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceCare && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVoiceCare.tips || aiVoiceCare.recommendations || aiVoiceCare.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStressMgmtLoading || aiStressMgmt) && (
              <Card data-testid="card-ai-stress-mgmt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Stress Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStressMgmtLoading ? <Skeleton className="h-24 w-full" /> : aiStressMgmt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStressMgmt.techniques || aiStressMgmt.recommendations || aiStressMgmt.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBreakSchedLoading || aiBreakSched) && (
              <Card data-testid="card-ai-break-sched">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Break Scheduler</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBreakSchedLoading ? <Skeleton className="h-24 w-full" /> : aiBreakSched && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBreakSched.schedule || aiBreakSched.recommendations || aiBreakSched.results)}
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
          onClick={() => setShowHealthAI(!showHealthAI)}
          data-testid="button-toggle-health-ai"
        >
          <Sparkles className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold">AI Creator Health Suite</span>
          <Badge variant="outline" className="text-[10px]">19 tools</Badge>
          {showHealthAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showHealthAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiErgonomicHLoading || aiErgonomicH) && (
              <Card data-testid="card-ai-ergonomic">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Ergonomic Setup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiErgonomicHLoading ? <Skeleton className="h-24 w-full" /> : aiErgonomicH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiErgonomicH.strategies || aiErgonomicH.tips || aiErgonomicH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEyeCareHLoading || aiEyeCareH) && (
              <Card data-testid="card-ai-eye-care">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Eye Care</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEyeCareHLoading ? <Skeleton className="h-24 w-full" /> : aiEyeCareH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEyeCareH.strategies || aiEyeCareH.tips || aiEyeCareH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVocalHealthHLoading || aiVocalHealthH) && (
              <Card data-testid="card-ai-vocal-health">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Vocal Health</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVocalHealthHLoading ? <Skeleton className="h-24 w-full" /> : aiVocalHealthH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVocalHealthH.strategies || aiVocalHealthH.tips || aiVocalHealthH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSleepOptHLoading || aiSleepOptH) && (
              <Card data-testid="card-ai-sleep-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Sleep Optimize</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSleepOptHLoading ? <Skeleton className="h-24 w-full" /> : aiSleepOptH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSleepOptH.strategies || aiSleepOptH.tips || aiSleepOptH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNutritionHLoading || aiNutritionH) && (
              <Card data-testid="card-ai-nutrition">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Nutrition</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNutritionHLoading ? <Skeleton className="h-24 w-full" /> : aiNutritionH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNutritionH.strategies || aiNutritionH.tips || aiNutritionH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExerciseHLoading || aiExerciseH) && (
              <Card data-testid="card-ai-exercise-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Exercise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExerciseHLoading ? <Skeleton className="h-24 w-full" /> : aiExerciseH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiExerciseH.strategies || aiExerciseH.tips || aiExerciseH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStressMgmtHLoading || aiStressMgmtH) && (
              <Card data-testid="card-ai-stress-mgmt-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Stress Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStressMgmtHLoading ? <Skeleton className="h-24 w-full" /> : aiStressMgmtH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStressMgmtH.strategies || aiStressMgmtH.tips || aiStressMgmtH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkLifeHLoading || aiWorkLifeH) && (
              <Card data-testid="card-ai-work-life-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Work Life Balance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkLifeHLoading ? <Skeleton className="h-24 w-full" /> : aiWorkLifeH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkLifeH.strategies || aiWorkLifeH.tips || aiWorkLifeH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBurnoutRecovHLoading || aiBurnoutRecovH) && (
              <Card data-testid="card-ai-burnout-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Burnout Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBurnoutRecovHLoading ? <Skeleton className="h-24 w-full" /> : aiBurnoutRecovH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBurnoutRecovH.strategies || aiBurnoutRecovH.tips || aiBurnoutRecovH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMeditationHLoading || aiMeditationH) && (
              <Card data-testid="card-ai-meditation-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Meditation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMeditationHLoading ? <Skeleton className="h-24 w-full" /> : aiMeditationH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMeditationH.strategies || aiMeditationH.tips || aiMeditationH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTimeBlockHLoading || aiTimeBlockH) && (
              <Card data-testid="card-ai-time-block">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Time Blocking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTimeBlockHLoading ? <Skeleton className="h-24 w-full" /> : aiTimeBlockH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTimeBlockH.strategies || aiTimeBlockH.tips || aiTimeBlockH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPomodoroHLoading || aiPomodoroH) && (
              <Card data-testid="card-ai-pomodoro">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Pomodoro</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPomodoroHLoading ? <Skeleton className="h-24 w-full" /> : aiPomodoroH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPomodoroH.strategies || aiPomodoroH.tips || aiPomodoroH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigDetoxHLoading || aiDigDetoxH) && (
              <Card data-testid="card-ai-dig-detox">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Digital Detox</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigDetoxHLoading ? <Skeleton className="h-24 w-full" /> : aiDigDetoxH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDigDetoxH.strategies || aiDigDetoxH.tips || aiDigDetoxH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGratitudeHLoading || aiGratitudeH) && (
              <Card data-testid="card-ai-gratitude">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Gratitude Journal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGratitudeHLoading ? <Skeleton className="h-24 w-full" /> : aiGratitudeH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGratitudeH.strategies || aiGratitudeH.tips || aiGratitudeH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffirmHLoading || aiAffirmH) && (
              <Card data-testid="card-ai-affirm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Affirmations</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffirmHLoading ? <Skeleton className="h-24 w-full" /> : aiAffirmH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAffirmH.strategies || aiAffirmH.tips || aiAffirmH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHabitStackHLoading || aiHabitStackH) && (
              <Card data-testid="card-ai-habit-stack">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Habit Stack</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHabitStackHLoading ? <Skeleton className="h-24 w-full" /> : aiHabitStackH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHabitStackH.strategies || aiHabitStackH.tips || aiHabitStackH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEnergyHLoading || aiEnergyH) && (
              <Card data-testid="card-ai-energy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Energy Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEnergyHLoading ? <Skeleton className="h-24 w-full" /> : aiEnergyH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEnergyH.strategies || aiEnergyH.tips || aiEnergyH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCreatorCommHLoading || aiCreatorCommH) && (
              <Card data-testid="card-ai-creator-comm-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Creator Community</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCreatorCommHLoading ? <Skeleton className="h-24 w-full" /> : aiCreatorCommH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCreatorCommH.strategies || aiCreatorCommH.tips || aiCreatorCommH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMastermindHLoading || aiMastermindH) && (
              <Card data-testid="card-ai-mastermind-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Mastermind Group</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMastermindHLoading ? <Skeleton className="h-24 w-full" /> : aiMastermindH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMastermindH.strategies || aiMastermindH.tips || aiMastermindH.recommendations)}
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

const insightCategoryColors: Record<string, string> = {
  content: "bg-purple-500/10 text-purple-500",
  audience: "bg-blue-500/10 text-blue-500",
  growth: "bg-emerald-500/10 text-emerald-500",
  revenue: "bg-amber-500/10 text-amber-500",
  seo: "bg-cyan-500/10 text-cyan-500",
  engagement: "bg-pink-500/10 text-pink-500",
};

function LearningTab() {
  const [aiAcademy, setAiAcademy] = useState<any>(null);
  const [aiAcademyLoading, setAiAcademyLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCreatorAcademy");
    if (cached) {
      try { setAiAcademy(JSON.parse(cached)); setAiAcademyLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/creator-academy")
      .then((res) => res.json())
      .then((data) => { setAiAcademy(data); sessionStorage.setItem("aiCreatorAcademy", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiAcademyLoading(false));
  }, []);

  const [showEducationAI, setShowEducationAI] = useState(false);
  const [aiSkillAssess, setAiSkillAssess] = useState<any>(null);
  const [aiSkillAssessLoading, setAiSkillAssessLoading] = useState(false);
  const [aiLearnPath, setAiLearnPath] = useState<any>(null);
  const [aiLearnPathLoading, setAiLearnPathLoading] = useState(false);
  const [aiCerts, setAiCerts] = useState<any>(null);
  const [aiCertsLoading, setAiCertsLoading] = useState(false);
  const [aiBooks, setAiBooks] = useState<any>(null);
  const [aiBooksLoading, setAiBooksLoading] = useState(false);
  const [aiToolTut, setAiToolTut] = useState<any>(null);
  const [aiToolTutLoading, setAiToolTutLoading] = useState(false);
  const [aiIndustryReport, setAiIndustryReport] = useState<any>(null);
  const [aiIndustryReportLoading, setAiIndustryReportLoading] = useState(false);
  const [aiCaseStudy, setAiCaseStudy] = useState<any>(null);
  const [aiCaseStudyLoading, setAiCaseStudyLoading] = useState(false);
  const [aiPortfolio, setAiPortfolio] = useState<any>(null);
  const [aiPortfolioLoading, setAiPortfolioLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_skill_assess");
    if (cached) { try { setAiSkillAssess(JSON.parse(cached)); return; } catch {} }
    setAiSkillAssessLoading(true);
    apiRequest("POST", "/api/ai/skill-assessment", {}).then(r => r.json()).then(d => { setAiSkillAssess(d); sessionStorage.setItem("ai_skill_assess", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSkillAssessLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_learn_path");
    if (cached) { try { setAiLearnPath(JSON.parse(cached)); return; } catch {} }
    setAiLearnPathLoading(true);
    apiRequest("POST", "/api/ai/learning-path", {}).then(r => r.json()).then(d => { setAiLearnPath(d); sessionStorage.setItem("ai_learn_path", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLearnPathLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_certs");
    if (cached) { try { setAiCerts(JSON.parse(cached)); return; } catch {} }
    setAiCertsLoading(true);
    apiRequest("POST", "/api/ai/certification", {}).then(r => r.json()).then(d => { setAiCerts(d); sessionStorage.setItem("ai_certs", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCertsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_books");
    if (cached) { try { setAiBooks(JSON.parse(cached)); return; } catch {} }
    setAiBooksLoading(true);
    apiRequest("POST", "/api/ai/book-recommend", {}).then(r => r.json()).then(d => { setAiBooks(d); sessionStorage.setItem("ai_books", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBooksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tool_tut");
    if (cached) { try { setAiToolTut(JSON.parse(cached)); return; } catch {} }
    setAiToolTutLoading(true);
    apiRequest("POST", "/api/ai/tool-tutorial", {}).then(r => r.json()).then(d => { setAiToolTut(d); sessionStorage.setItem("ai_tool_tut", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiToolTutLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_industry_report");
    if (cached) { try { setAiIndustryReport(JSON.parse(cached)); return; } catch {} }
    setAiIndustryReportLoading(true);
    apiRequest("POST", "/api/ai/industry-report", {}).then(r => r.json()).then(d => { setAiIndustryReport(d); sessionStorage.setItem("ai_industry_report", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIndustryReportLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_case_study");
    if (cached) { try { setAiCaseStudy(JSON.parse(cached)); return; } catch {} }
    setAiCaseStudyLoading(true);
    apiRequest("POST", "/api/ai/case-study", {}).then(r => r.json()).then(d => { setAiCaseStudy(d); sessionStorage.setItem("ai_case_study", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCaseStudyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_portfolio");
    if (cached) { try { setAiPortfolio(JSON.parse(cached)); return; } catch {} }
    setAiPortfolioLoading(true);
    apiRequest("POST", "/api/ai/portfolio", {}).then(r => r.json()).then(d => { setAiPortfolio(d); sessionStorage.setItem("ai_portfolio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPortfolioLoading(false));
  }, []);

  const renderAIListLearn = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const { data: insights, isLoading } = useQuery<any[]>({ queryKey: ['/api/learning-insights'] });
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (!insights) return [];
    const cats = new Set(insights.map((i: any) => i.category));
    return Array.from(cats).sort();
  }, [insights]);

  const filtered = filterCategory ? insights?.filter((i: any) => i.category === filterCategory) : insights;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {aiAcademyLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-academy" />
      ) : aiAcademy ? (
        <Card data-testid="card-ai-academy">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Creator Academy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiAcademy.curriculum?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Curriculum</p>
                <div className="space-y-3">
                  {aiAcademy.curriculum.map((mod: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3" data-testid={`curriculum-module-${i}`}>
                      <p className="text-sm font-medium mb-1">{mod.moduleName || mod.name || mod.title}</p>
                      {mod.lessons?.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                          {mod.lessons.map((lesson: any, j: number) => (
                            <li key={j}>{typeof lesson === "string" ? lesson : lesson.title || lesson.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.skillTree?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Skill Tree</p>
                <div className="space-y-2">
                  {aiAcademy.skillTree.map((skill: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`skill-tree-${i}`}>
                      <p className="text-sm">{skill.skillName || skill.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">Lv {skill.level}/{skill.max || skill.maxLevel}</Badge>
                        {skill.impact && <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{skill.impact}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.weeklyPlan?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Weekly Plan</p>
                <div className="space-y-2">
                  {aiAcademy.weeklyPlan.map((day: any, i: number) => (
                    <div key={i} className="flex items-start gap-3" data-testid={`weekly-plan-${i}`}>
                      <span className="text-xs font-medium w-16 shrink-0">{day.day}</span>
                      <div>
                        <p className="text-sm font-medium">{day.focus}</p>
                        {day.tasks?.length > 0 && (
                          <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc mt-0.5">
                            {day.tasks.map((task: string, j: number) => <li key={j}>{task}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.milestones?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Milestones</p>
                <div className="space-y-2">
                  {aiAcademy.milestones.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`milestone-${i}`}>
                      <p className="text-sm font-medium">{m.achievement}</p>
                      {m.criteria && <span className="text-xs text-muted-foreground">{m.criteria}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.recommendedResources?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Recommended Resources</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiAcademy.recommendedResources.map((r: any, i: number) => (
                    <li key={i} data-testid={`resource-${i}`}>{typeof r === "string" ? r : r.title || r.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 data-testid="text-learning-title" className="text-lg font-semibold">Learning Hub</h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI-discovered insights from your content performance
        </p>
      </div>

      {insights && insights.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Insights</p>
              <p className="text-xl font-bold" data-testid="text-learning-total">{insights.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Categories</p>
              <p className="text-xl font-bold" data-testid="text-learning-categories">{categories.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg Confidence</p>
              <p className="text-xl font-bold" data-testid="text-learning-confidence">
                {(insights.reduce((s: number, i: any) => s + (i.confidence || 0), 0) / insights.length * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant={filterCategory === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterCategory(null)} data-testid="filter-learning-all">All</Badge>
          {categories.map((cat: string) => (
            <Badge key={cat} variant={filterCategory === cat ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterCategory(filterCategory === cat ? null : cat)} data-testid={`filter-learning-${cat}`}>
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-learning">No insights yet</p>
            <p className="text-xs text-muted-foreground">AI will analyze your content and discover patterns over time</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((insight: any) => (
            <Card key={insight.id} data-testid={`card-insight-${insight.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-insight-pattern-${insight.id}`}>{insight.pattern}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-xs capitalize no-default-hover-elevate no-default-active-elevate ${insightCategoryColors[insight.category] || ""}`}>
                        {insight.category}
                      </Badge>
                      {insight.sampleSize > 0 && (
                        <span className="text-xs text-muted-foreground">{insight.sampleSize} samples</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="text-sm font-bold" data-testid={`text-insight-confidence-${insight.id}`}>{((insight.confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${(insight.confidence || 0) > 0.7 ? "bg-emerald-500" : (insight.confidence || 0) > 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${(insight.confidence || 0) * 100}%` }} />
                </div>

                {insight.data?.finding && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Finding</p>
                    <p className="text-sm">{insight.data.finding}</p>
                  </div>
                )}
                {insight.data?.recommendation && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <p className="text-xs font-medium">Recommendation</p>
                    </div>
                    <p className="text-sm" data-testid={`text-insight-rec-${insight.id}`}>{insight.data.recommendation}</p>
                  </div>
                )}
                {insight.data?.evidence && insight.data.evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Evidence</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                      {insight.data.evidence.map((ev: string, i: number) => <li key={i}>{ev}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowEducationAI(!showEducationAI)}
          data-testid="button-toggle-education-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Education & Learning Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showEducationAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showEducationAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiSkillAssessLoading || aiSkillAssess) && (
              <Card data-testid="card-ai-skill-assess">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Skill Assessment</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSkillAssessLoading ? <Skeleton className="h-24 w-full" /> : aiSkillAssess && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiSkillAssess.skills || aiSkillAssess.recommendations || aiSkillAssess.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLearnPathLoading || aiLearnPath) && (
              <Card data-testid="card-ai-learn-path">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Learning Path</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLearnPathLoading ? <Skeleton className="h-24 w-full" /> : aiLearnPath && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiLearnPath.paths || aiLearnPath.recommendations || aiLearnPath.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCertsLoading || aiCerts) && (
              <Card data-testid="card-ai-certs">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Certification Guide</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCertsLoading ? <Skeleton className="h-24 w-full" /> : aiCerts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiCerts.certifications || aiCerts.recommendations || aiCerts.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBooksLoading || aiBooks) && (
              <Card data-testid="card-ai-books">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Book Recommendations</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBooksLoading ? <Skeleton className="h-24 w-full" /> : aiBooks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiBooks.books || aiBooks.recommendations || aiBooks.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiToolTutLoading || aiToolTut) && (
              <Card data-testid="card-ai-tool-tut">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Tool Tutorial</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiToolTutLoading ? <Skeleton className="h-24 w-full" /> : aiToolTut && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiToolTut.tutorials || aiToolTut.recommendations || aiToolTut.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIndustryReportLoading || aiIndustryReport) && (
              <Card data-testid="card-ai-industry-report">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Industry Report</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIndustryReportLoading ? <Skeleton className="h-24 w-full" /> : aiIndustryReport && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiIndustryReport.reports || aiIndustryReport.recommendations || aiIndustryReport.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCaseStudyLoading || aiCaseStudy) && (
              <Card data-testid="card-ai-case-study">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Case Study</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaseStudyLoading ? <Skeleton className="h-24 w-full" /> : aiCaseStudy && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiCaseStudy.cases || aiCaseStudy.recommendations || aiCaseStudy.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPortfolioLoading || aiPortfolio) && (
              <Card data-testid="card-ai-portfolio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Portfolio Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPortfolioLoading ? <Skeleton className="h-24 w-full" /> : aiPortfolio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListLearn(aiPortfolio.projects || aiPortfolio.recommendations || aiPortfolio.results)}
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

function AutomationTab() {
  const { toast } = useToast();
  const [showCronSection, setShowCronSection] = useState(false);
  const [showChainSection, setShowChainSection] = useState(false);
  const [showRulesSection, setShowRulesSection] = useState(false);
  const [showWebhookSection, setShowWebhookSection] = useState(false);
  const [showNotifSection, setShowNotifSection] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<any>({ queryKey: ["/api/automation/status"] });
  const { data: cronJobsData } = useQuery<any[]>({ queryKey: ["/api/automation/cron-jobs"] });
  const { data: chainsData } = useQuery<any>({ queryKey: ["/api/automation/chains"] });
  const { data: rulesData } = useQuery<any>({ queryKey: ["/api/automation/rules"] });
  const { data: notifsData } = useQuery<any>({ queryKey: ["/api/automation/notifications"] });
  const { data: webhookData } = useQuery<any[]>({ queryKey: ["/api/automation/webhook-events"] });

  const createCronMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/cron-jobs", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/cron-jobs"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "Cron job created" }); },
  });

  const createChainMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/chains", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/chains"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "AI Chain created" }); },
  });

  const runChainMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/automation/chains/${id}/run`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/chains"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications"] }); toast({ title: "Chain executed successfully" }); },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/rules", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "Rule created" }); },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/automation/notifications/read-all"); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); },
  });

  const automationLevel = status?.automationLevel || 90;
  const cronJobs = cronJobsData || [];
  const chains = chainsData?.chains || [];
  const chainTemplates = chainsData?.templates || status?.chainTemplates || [];
  const rules = rulesData?.rules || [];
  const notifs = notifsData?.notifications || [];
  const unreadCount = notifsData?.unreadCount || 0;
  const webhookEvents = webhookData || [];
  const schedulePresets = status?.schedulePresets || {};
  const featureCategories = status?.categories || {};

  return (
    <div className="space-y-6" data-testid="automation-tab">
      <Card data-testid="card-automation-dashboard">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Sparkles className="h-6 w-6 text-purple-400" />
            <h2 className="text-lg font-bold">Automation Hub</h2>
            <Badge variant="outline" className="text-xs ml-auto">{automationLevel}% Automated</Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-3 mb-4">
            <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all" style={{ width: `${automationLevel}%` }} />
          </div>
          {statusLoading ? <Skeleton className="h-20 w-full" /> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-cron-count">{status?.cronJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Cron Jobs</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-chain-count">{status?.activeChains || 0}</p>
                <p className="text-xs text-muted-foreground">AI Chains</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-rules-count">{status?.activeRules || 0}</p>
                <p className="text-xs text-muted-foreground">Active Rules</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-webhook-count">{status?.webhookEvents || 0}</p>
                <p className="text-xs text-muted-foreground">Events</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-notif-count">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Unread Alerts</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-gap-closers">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="h-5 w-5 text-green-400" />
            <h3 className="text-sm font-bold">100% Automation Coverage</h3>
            <Badge variant="default" className="text-[10px] ml-auto">All Gaps Closed</Badge>
          </div>
          <p className="text-xs text-muted-foreground">These 4 systems run entirely in the background with zero manual input. They close every remaining automation gap.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-onboarding">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <UserPlus className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold">AI Auto-Onboarding</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Configures accounts, connects platforms, and sets optimal defaults automatically for new creators.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-approve">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs font-semibold">AI Sponsorship Auto-Approve</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Evaluates and auto-approves/rejects brand deals every 30 minutes based on your configured criteria.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-creative-autonomy">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Palette className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold">AI Creative Autonomy</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Makes all creative decisions autonomously - thumbnails, titles, scripts, scheduling - matching your unique style.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-payment">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <DollarSign className="h-4 w-4 text-yellow-400" />
                <span className="text-xs font-semibold">AI Auto-Payment Manager</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Handles invoicing, expense categorization, tax prep, and payment optimization every 6 hours.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowCronSection(!showCronSection)} data-testid="button-toggle-cron">
          <Clock className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Cron Job Scheduler</span>
          <Badge variant="outline" className="text-[10px]">{cronJobs.length} jobs</Badge>
          {showCronSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCronSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Schedule AI features to run automatically on intervals. Results are stored and ready when you open the app.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(featureCategories).map(([cat, features]: [string, any]) => (
                <Card key={cat} data-testid={`card-cron-category-${cat}`}>
                  <CardContent className="p-3">
                    <h4 className="text-xs font-semibold capitalize mb-2">{cat}</h4>
                    <div className="space-y-1">
                      {(features as string[]).slice(0, 5).map((f: string) => (
                        <div key={f} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-1 truncate">{f.replace("ai-", "").replace(/-/g, " ")}</span>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => createCronMutation.mutate({ featureKey: f, schedule: "0 */6 * * *" })} data-testid={`button-add-cron-${f}`}>
                            <Plus className="h-3 w-3 mr-1" />Schedule
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {cronJobs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Cron Jobs</h4>
                {cronJobs.map((job: any) => (
                  <Card key={job.id} data-testid={`card-cron-job-${job.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant={job.enabled ? "default" : "secondary"} className="text-[10px]">{job.enabled ? "Active" : "Paused"}</Badge>
                      <span className="text-xs font-medium">{job.featureKey.replace("ai-", "").replace(/-/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{job.schedule}</span>
                      <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowChainSection(!showChainSection)} data-testid="button-toggle-chains">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Chain Orchestrator</span>
          <Badge variant="outline" className="text-[10px]">{chains.length} chains</Badge>
          {showChainSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showChainSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Chain AI agents together so one agent's output feeds the next. Create automated pipelines that run end-to-end.</p>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold">Pipeline Templates</h4>
              {chainTemplates.map((tpl: any, i: number) => (
                <Card key={i} data-testid={`card-chain-template-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h4 className="text-xs font-semibold">{tpl.name}</h4>
                      <Badge variant="outline" className="text-[10px]">{tpl.steps.length} steps</Badge>
                      <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => createChainMutation.mutate({ name: tpl.name, steps: tpl.steps })} data-testid={`button-create-chain-${i}`}>
                        <Plus className="h-3 w-3 mr-1" />Activate
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {tpl.steps.map((s: any, j: number) => (
                        <span key={j}>
                          <Badge variant="secondary" className="text-[9px]">{s.label}</Badge>
                          {j < tpl.steps.length - 1 && <span className="text-muted-foreground text-[10px] mx-0.5">&rarr;</span>}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {chains.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Chains</h4>
                {chains.map((chain: any) => (
                  <Card key={chain.id} data-testid={`card-chain-${chain.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={chain.status === "running" ? "default" : "secondary"} className="text-[10px]">{chain.status}</Badge>
                        <span className="text-xs font-medium">{chain.name}</span>
                        <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => runChainMutation.mutate(chain.id)} disabled={chain.status === "running"} data-testid={`button-run-chain-${chain.id}`}>
                          <Play className="h-3 w-3 mr-1" />Run Now
                        </Button>
                      </div>
                      {chain.lastResult && (
                        <p className="text-[10px] text-muted-foreground mt-1">Last run: {chain.lastResult.completedAt ? new Date(chain.lastResult.completedAt).toLocaleString() : "Never"}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowRulesSection(!showRulesSection)} data-testid="button-toggle-rules">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold">Auto-Action Rules Engine</span>
          <Badge variant="outline" className="text-[10px]">{rules.length} rules</Badge>
          {showRulesSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showRulesSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Set threshold rules that AI executes automatically. Example: "Accept sponsorships above $500 CPM" or "Auto-reply to positive comments".</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { name: "Auto-optimize low CTR videos", trigger: "metric_threshold", agentId: "seo-optimizer", desc: "When CTR drops below 4%, auto-run SEO audit" },
                { name: "Revenue alert", trigger: "revenue_change", agentId: "financial-advisor", desc: "Alert when daily revenue drops 20%" },
                { name: "Comment auto-response", trigger: "event", agentId: "community-manager", desc: "Auto-reply to comments matching positive sentiment" },
                { name: "Content pipeline trigger", trigger: "schedule", agentId: "content-planner", desc: "Daily content idea generation at 9 AM" },
                { name: "Crisis detection", trigger: "ai_result", agentId: "crisis-manager", desc: "Alert on negative sentiment spike" },
                { name: "Growth milestone", trigger: "metric_threshold", agentId: "growth-analyst", desc: "Celebrate when hitting subscriber milestones" },
              ].map((preset, i) => (
                <Card key={i} data-testid={`card-rule-preset-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-xs font-semibold">{preset.name}</h4>
                      <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => createRuleMutation.mutate({ name: preset.name, trigger: preset.trigger, agentId: preset.agentId })} data-testid={`button-add-rule-${i}`}>
                        <Plus className="h-3 w-3 mr-1" />Enable
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{preset.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {rules.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Rules</h4>
                {rules.map((rule: any) => (
                  <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="text-[10px]">Active</Badge>
                      <span className="text-xs font-medium">{rule.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">Triggered {rule.triggerCount || 0}x</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowWebhookSection(!showWebhookSection)} data-testid="button-toggle-webhooks">
          <Globe className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Webhook Event Listeners</span>
          <Badge variant="outline" className="text-[10px]">{webhookEvents.length} events</Badge>
          {showWebhookSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWebhookSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Real-time event listeners from YouTube, Stripe, and other platforms. Events automatically trigger AI chains and rules.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {["youtube", "stripe", "twitch", "tiktok", "instagram", "system"].map((src) => (
                <Card key={src} data-testid={`card-webhook-source-${src}`}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs font-semibold capitalize">{src}</p>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {webhookEvents.filter((e: any) => e.source === src).length} events
                    </Badge>
                    <p className="text-[10px] text-green-500 mt-1">Listening</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {webhookEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Recent Events</h4>
                {webhookEvents.slice(0, 10).map((evt: any) => (
                  <Card key={evt.id} data-testid={`card-webhook-event-${evt.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] capitalize">{evt.source}</Badge>
                      <span className="text-xs">{evt.eventType}</span>
                      <Badge variant={evt.processed ? "default" : "outline"} className="text-[10px] ml-auto">{evt.processed ? "Processed" : "Pending"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowNotifSection(!showNotifSection)} data-testid="button-toggle-notifications">
          <Bell className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">Notification & Alert Pipeline</span>
          <Badge variant="outline" className="text-[10px]">{unreadCount} unread</Badge>
          {showNotifSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showNotifSection && (
          <div className="p-4 pt-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1">Exception-only alerts from background jobs, webhooks, and AI chains. Only notifies when something needs attention.</p>
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => markAllReadMutation.mutate()} data-testid="button-mark-all-read">
                  Mark All Read
                </Button>
              )}
            </div>
            {notifs.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">No notifications yet. Automation events will appear here.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {notifs.slice(0, 20).map((n: any) => (
                  <Card key={n.id} data-testid={`card-notification-${n.id}`} className={n.read ? "opacity-60" : ""}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={n.severity === "warning" ? "destructive" : n.severity === "error" ? "destructive" : "secondary"} className="text-[10px]">{n.severity}</Badge>
                        <span className="text-xs font-medium">{n.title}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{n.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
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
      {activeTab === "brand" && <BrandTab />}
      {activeTab === "collabs" && <CollabsTab />}
      {activeTab === "competitors" && <CompetitorsTab />}
      {activeTab === "legal" && <LegalTab />}
      {activeTab === "wellness" && <WellnessTab />}
      {activeTab === "learning" && <LearningTab />}
      {activeTab === "automation" && <AutomationTab />}
    </div>
  );
}
