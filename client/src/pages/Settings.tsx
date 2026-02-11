import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Shield, Zap, AlertTriangle, Save, LogOut, Link2, Bell,
  Plus, Sparkles, CalendarDays, Heart, BookOpen, CheckCircle2,
  Link as LinkIcon, Users, Eye, Palette, Trash2, Target, Handshake, Mail, Briefcase,
  ChevronDown, ChevronUp,
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

type TabKey = "general" | "brand" | "collabs" | "competitors" | "legal" | "wellness" | "learning";

const VALID_TABS: TabKey[] = ["general", "brand", "collabs", "competitors", "legal", "wellness", "learning"];

const tabs: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "brand", label: "Brand" },
  { key: "collabs", label: "Collabs" },
  { key: "competitors", label: "Competitors" },
  { key: "legal", label: "Legal" },
  { key: "wellness", label: "Wellness" },
  { key: "learning", label: "Learning" },
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
          <CardTitle className="text-base">Account</CardTitle>
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
              {isLoggingOut ? "Signing out..." : "Sign Out"}
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
    </div>
  );
}
