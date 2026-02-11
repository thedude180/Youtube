import { useState, useMemo, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useVideos } from "@/hooks/use-videos";
import { useChannels, useCreateChannel } from "@/hooks/use-channels";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { PlatformIcon, PlatformBadge } from "@/components/PlatformIcon";
import { PLATFORM_INFO, PLATFORMS, type Platform, type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  Search, PlayCircle, Video, Radio, Calendar, Plus, Trash2,
  RefreshCw, Loader2, CheckCircle2, Circle, ExternalLink, Sparkles,
  FileText, BarChart3, Hash, Share2, CalendarDays, Image, ListOrdered, ChevronDown, ChevronUp,
  Globe, Languages, Captions, Megaphone, Mic, Eye, Users, MapPin, MessageSquare, Clock, FlaskConical, ShieldCheck, Briefcase,
  TrendingUp, Zap, LogIn,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { Link } from "wouter";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ContentTab = "library" | "channels" | "calendar" | "localization";

const TYPE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  vod: "default", short: "secondary", live_replay: "outline",
};
const TYPE_LABEL: Record<string, string> = { vod: "VOD", short: "Short", live_replay: "Live Replay" };

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "streaming", label: "Streaming" },
  { key: "social", label: "Social" },
  { key: "content", label: "Content" },
  { key: "monetization", label: "Monetization" },
  { key: "messaging", label: "Messaging" },
] as const;
type CategoryFilter = typeof CATEGORIES[number]["key"];

export default function Content() {
  const params = useParams<{ tab?: string }>();
  const tabParam = params?.tab;
  const validTabs: ContentTab[] = ["library", "channels", "calendar", "localization"];
  const initialTab = validTabs.includes(tabParam as ContentTab) ? (tabParam as ContentTab) : "library";
  const [activeTab, setActiveTab] = useState<ContentTab>(initialTab);
  const { isAdvanced } = useAdvancedMode();
  const { t } = useTranslation();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">{t("content.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("content.subtitle", "Manage your videos, channels, and schedule")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
        <TabsList data-testid="tabs-content">
          <TabsTrigger value="library" data-testid="tab-library">
            <Video className="h-3.5 w-3.5 mr-1.5" />{t("content.library")}
          </TabsTrigger>
          <TabsTrigger value="channels" data-testid="tab-channels">
            <Radio className="h-3.5 w-3.5 mr-1.5" />{t("content.channels")}
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />{t("content.calendar")}
          </TabsTrigger>
          <TabsTrigger value="localization" data-testid="tab-localization">
            <Globe className="h-3.5 w-3.5 mr-1.5" />{t("content.localization")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <LibraryTab isAdvanced={isAdvanced} />
        </TabsContent>
        <TabsContent value="channels" className="mt-4">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="localization" className="mt-4">
          <LocalizationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LibraryTab({ isAdvanced }: { isAdvanced: boolean }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: videos, isLoading } = useVideos();
  const [aiContentIdeas, setAiContentIdeas] = useState<any>(null);
  const [aiIdeasLoading, setAiIdeasLoading] = useState(false);

  const [kwData, setKwData] = useState<any>(null);
  const [kwLoading, setKwLoading] = useState(false);
  const [calData, setCalData] = useState<any>(null);
  const [calLoading, setCalLoading] = useState(false);

  const [scriptTopic, setScriptTopic] = useState("");
  const [scriptStyle, setScriptStyle] = useState("educational");
  const [scriptDuration, setScriptDuration] = useState("10");
  const [scriptResult, setScriptResult] = useState<any>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);

  const [repurposeVideo, setRepurposeVideo] = useState("");
  const [repurposePlatform, setRepurposePlatform] = useState("");
  const [repurposeResult, setRepurposeResult] = useState<any>(null);
  const [repurposeLoading, setRepurposeLoading] = useState(false);

  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDesc, setChapterDesc] = useState("");
  const [chapterResult, setChapterResult] = useState<any>(null);
  const [chapterLoading, setChapterLoading] = useState(false);

  const [seoVideoId, setSeoVideoId] = useState<number | null>(null);
  const [seoResult, setSeoResult] = useState<any>(null);
  const [seoLoading, setSeoLoading] = useState(false);

  const [thumbVideoId, setThumbVideoId] = useState<number | null>(null);
  const [thumbResult, setThumbResult] = useState<any>(null);
  const [thumbLoading, setThumbLoading] = useState(false);

  const [showProductionAI, setShowProductionAI] = useState(false);
  const [showThumbnailAI, setShowThumbnailAI] = useState(false);
  const [showTitlesCopyAI, setShowTitlesCopyAI] = useState(false);
  const [showSEOAI, setShowSEOAI] = useState(false);
  const [showStrategyAI, setShowStrategyAI] = useState(false);
  const [showShortsAI, setShowShortsAI] = useState(false);
  const [showCaptionsAI, setShowCaptionsAI] = useState(false);

  const [aiCaptions, setAiCaptions] = useState<any>(null);
  const [aiCaptionsLoading, setAiCaptionsLoading] = useState(false);
  const [aiCaptionStyle, setAiCaptionStyle] = useState<any>(null);
  const [aiCaptionStyleLoading, setAiCaptionStyleLoading] = useState(false);
  const [aiSubtitles, setAiSubtitles] = useState<any>(null);
  const [aiSubtitlesLoading, setAiSubtitlesLoading] = useState(false);
  const [aiMultiLangSEO, setAiMultiLangSEO] = useState<any>(null);
  const [aiMultiLangSEOLoading, setAiMultiLangSEOLoading] = useState(false);
  const [aiLocalization, setAiLocalization] = useState<any>(null);
  const [aiLocalizationLoading, setAiLocalizationLoading] = useState(false);
  const [aiDubbing, setAiDubbing] = useState<any>(null);
  const [aiDubbingLoading, setAiDubbingLoading] = useState(false);
  const [aiTranscript, setAiTranscript] = useState<any>(null);
  const [aiTranscriptLoading, setAiTranscriptLoading] = useState(false);
  const [aiCaptionComp, setAiCaptionComp] = useState<any>(null);
  const [aiCaptionCompLoading, setAiCaptionCompLoading] = useState(false);
  const [aiAudioDesc, setAiAudioDesc] = useState<any>(null);
  const [aiAudioDescLoading, setAiAudioDescLoading] = useState(false);
  const [aiLangPriority, setAiLangPriority] = useState<any>(null);
  const [aiLangPriorityLoading, setAiLangPriorityLoading] = useState(false);

  const [aiStoryboard, setAiStoryboard] = useState<any>(null);
  const [aiStoryboardLoading, setAiStoryboardLoading] = useState(false);
  const [aiColorGrading, setAiColorGrading] = useState<any>(null);
  const [aiColorGradingLoading, setAiColorGradingLoading] = useState(false);
  const [aiIntroOutro, setAiIntroOutro] = useState<any>(null);
  const [aiIntroOutroLoading, setAiIntroOutroLoading] = useState(false);
  const [aiSoundEffects, setAiSoundEffects] = useState<any>(null);
  const [aiSoundEffectsLoading, setAiSoundEffectsLoading] = useState(false);
  const [aiPacing, setAiPacing] = useState<any>(null);
  const [aiPacingLoading, setAiPacingLoading] = useState(false);
  const [aiTalkingPoints, setAiTalkingPoints] = useState<any>(null);
  const [aiTalkingPointsLoading, setAiTalkingPointsLoading] = useState(false);
  const [aiVideoLength, setAiVideoLength] = useState<any>(null);
  const [aiVideoLengthLoading, setAiVideoLengthLoading] = useState(false);
  const [aiMultiFormat, setAiMultiFormat] = useState<any>(null);
  const [aiMultiFormatLoading, setAiMultiFormatLoading] = useState(false);
  const [aiWatermark, setAiWatermark] = useState<any>(null);
  const [aiWatermarkLoading, setAiWatermarkLoading] = useState(false);
  const [aiGreenScreen, setAiGreenScreen] = useState<any>(null);
  const [aiGreenScreenLoading, setAiGreenScreenLoading] = useState(false);
  const [aiTeleprompter, setAiTeleprompter] = useState<any>(null);
  const [aiTeleprompterLoading, setAiTeleprompterLoading] = useState(false);
  const [aiTransitions, setAiTransitions] = useState<any>(null);
  const [aiTransitionsLoading, setAiTransitionsLoading] = useState(false);
  const [aiVideoQuality, setAiVideoQuality] = useState<any>(null);
  const [aiVideoQualityLoading, setAiVideoQualityLoading] = useState(false);
  const [aiAspectRatio, setAiAspectRatio] = useState<any>(null);
  const [aiAspectRatioLoading, setAiAspectRatioLoading] = useState(false);
  const [aiLowerThirds, setAiLowerThirds] = useState<any>(null);
  const [aiLowerThirdsLoading, setAiLowerThirdsLoading] = useState(false);
  const [aiCtaOverlays, setAiCtaOverlays] = useState<any>(null);
  const [aiCtaOverlaysLoading, setAiCtaOverlaysLoading] = useState(false);
  const [aiSplitScreen, setAiSplitScreen] = useState<any>(null);
  const [aiSplitScreenLoading, setAiSplitScreenLoading] = useState(false);
  const [aiTimeLapse, setAiTimeLapse] = useState<any>(null);
  const [aiTimeLapseLoading, setAiTimeLapseLoading] = useState(false);
  const [aiFootageOrg, setAiFootageOrg] = useState<any>(null);
  const [aiFootageOrgLoading, setAiFootageOrgLoading] = useState(false);
  const [aiAudioLeveling, setAiAudioLeveling] = useState<any>(null);
  const [aiAudioLevelingLoading, setAiAudioLevelingLoading] = useState(false);
  const [aiNoiseDetector, setAiNoiseDetector] = useState<any>(null);
  const [aiNoiseDetectorLoading, setAiNoiseDetectorLoading] = useState(false);
  const [aiJumpCuts, setAiJumpCuts] = useState<any>(null);
  const [aiJumpCutsLoading, setAiJumpCutsLoading] = useState(false);
  const [aiCinematicShots, setAiCinematicShots] = useState<any>(null);
  const [aiCinematicShotsLoading, setAiCinematicShotsLoading] = useState(false);
  const [aiCompression, setAiCompression] = useState<any>(null);
  const [aiCompressionLoading, setAiCompressionLoading] = useState(false);

  const [aiThumbAB, setAiThumbAB] = useState<any>(null);
  const [aiThumbABLoading, setAiThumbABLoading] = useState(false);
  const [aiThumbCTR, setAiThumbCTR] = useState<any>(null);
  const [aiThumbCTRLoading, setAiThumbCTRLoading] = useState(false);
  const [aiThumbStyles, setAiThumbStyles] = useState<any>(null);
  const [aiThumbStylesLoading, setAiThumbStylesLoading] = useState(false);
  const [aiFaceExpr, setAiFaceExpr] = useState<any>(null);
  const [aiFaceExprLoading, setAiFaceExprLoading] = useState(false);
  const [aiThumbText, setAiThumbText] = useState<any>(null);
  const [aiThumbTextLoading, setAiThumbTextLoading] = useState(false);
  const [aiColorPsych, setAiColorPsych] = useState<any>(null);
  const [aiColorPsychLoading, setAiColorPsychLoading] = useState(false);
  const [aiBanner, setAiBanner] = useState<any>(null);
  const [aiBannerLoading, setAiBannerLoading] = useState(false);
  const [aiSocialCovers, setAiSocialCovers] = useState<any>(null);
  const [aiSocialCoversLoading, setAiSocialCoversLoading] = useState(false);
  const [aiAnimatedThumb, setAiAnimatedThumb] = useState<any>(null);
  const [aiAnimatedThumbLoading, setAiAnimatedThumbLoading] = useState(false);
  const [aiThumbCompetitors, setAiThumbCompetitors] = useState<any>(null);
  const [aiThumbCompetitorsLoading, setAiThumbCompetitorsLoading] = useState(false);
  const [aiBrandWatermark, setAiBrandWatermark] = useState<any>(null);
  const [aiBrandWatermarkLoading, setAiBrandWatermarkLoading] = useState(false);
  const [aiStickerPack, setAiStickerPack] = useState<any>(null);
  const [aiStickerPackLoading, setAiStickerPackLoading] = useState(false);
  const [aiInfographic, setAiInfographic] = useState<any>(null);
  const [aiInfographicLoading, setAiInfographicLoading] = useState(false);
  const [aiMemeTemplates, setAiMemeTemplates] = useState<any>(null);
  const [aiMemeTemplatesLoading, setAiMemeTemplatesLoading] = useState(false);
  const [aiVisualScore, setAiVisualScore] = useState<any>(null);
  const [aiVisualScoreLoading, setAiVisualScoreLoading] = useState(false);
  const [aiVoiceClone, setAiVoiceClone] = useState<any>(null);
  const [aiVoiceCloneLoading, setAiVoiceCloneLoading] = useState(false);

  const [aiHooks, setAiHooks] = useState<any>(null);
  const [aiHooksLoading, setAiHooksLoading] = useState(false);
  const [aiTitleSplit, setAiTitleSplit] = useState<any>(null);
  const [aiTitleSplitLoading, setAiTitleSplitLoading] = useState(false);
  const [aiTitleEmotion, setAiTitleEmotion] = useState<any>(null);
  const [aiTitleEmotionLoading, setAiTitleEmotionLoading] = useState(false);
  const [aiClickbait, setAiClickbait] = useState<any>(null);
  const [aiClickbaitLoading, setAiClickbaitLoading] = useState(false);
  const [aiDescTemplates, setAiDescTemplates] = useState<any>(null);
  const [aiDescTemplatesLoading, setAiDescTemplatesLoading] = useState(false);
  const [aiEndScreenCTA, setAiEndScreenCTA] = useState<any>(null);
  const [aiEndScreenCTALoading, setAiEndScreenCTALoading] = useState(false);
  const [aiPinnedComment, setAiPinnedComment] = useState<any>(null);
  const [aiPinnedCommentLoading, setAiPinnedCommentLoading] = useState(false);
  const [aiCommunityPosts, setAiCommunityPosts] = useState<any>(null);
  const [aiCommunityPostsLoading, setAiCommunityPostsLoading] = useState(false);
  const [aiEmailSubjects, setAiEmailSubjects] = useState<any>(null);
  const [aiEmailSubjectsLoading, setAiEmailSubjectsLoading] = useState(false);
  const [aiBioWriterData, setAiBioWriterData] = useState<any>(null);
  const [aiBioWriterDataLoading, setAiBioWriterDataLoading] = useState(false);
  const [aiVideoTags, setAiVideoTags] = useState<any>(null);
  const [aiVideoTagsLoading, setAiVideoTagsLoading] = useState(false);
  const [aiHashtags, setAiHashtags] = useState<any>(null);
  const [aiHashtagsLoading, setAiHashtagsLoading] = useState(false);
  const [aiPlaylist, setAiPlaylist] = useState<any>(null);
  const [aiPlaylistLoading, setAiPlaylistLoading] = useState(false);
  const [aiPressRelease, setAiPressRelease] = useState<any>(null);
  const [aiPressReleaseLoading, setAiPressReleaseLoading] = useState(false);
  const [aiTestimonial, setAiTestimonial] = useState<any>(null);
  const [aiTestimonialLoading, setAiTestimonialLoading] = useState(false);

  const [aiTagCloud, setAiTagCloud] = useState<any>(null);
  const [aiTagCloudLoading, setAiTagCloudLoading] = useState(false);
  const [aiSearchIntent, setAiSearchIntent] = useState<any>(null);
  const [aiSearchIntentLoading, setAiSearchIntentLoading] = useState(false);
  const [aiAlgorithm, setAiAlgorithm] = useState<any>(null);
  const [aiAlgorithmLoading, setAiAlgorithmLoading] = useState(false);
  const [aiFeaturedSnippet, setAiFeaturedSnippet] = useState<any>(null);
  const [aiFeaturedSnippetLoading, setAiFeaturedSnippetLoading] = useState(false);
  const [aiCrossSEO, setAiCrossSEO] = useState<any>(null);
  const [aiCrossSEOLoading, setAiCrossSEOLoading] = useState(false);
  const [aiBacklinks, setAiBacklinks] = useState<any>(null);
  const [aiBacklinksLoading, setAiBacklinksLoading] = useState(false);
  const [aiFreshness, setAiFreshness] = useState<any>(null);
  const [aiFreshnessLoading, setAiFreshnessLoading] = useState(false);
  const [aiCannibalization, setAiCannibalization] = useState<any>(null);
  const [aiCannibalizationLoading, setAiCannibalizationLoading] = useState(false);
  const [aiLongTail, setAiLongTail] = useState<any>(null);
  const [aiLongTailLoading, setAiLongTailLoading] = useState(false);
  const [aiSitemap, setAiSitemap] = useState<any>(null);
  const [aiSitemapLoading, setAiSitemapLoading] = useState(false);
  const [aiRichSnippets, setAiRichSnippets] = useState<any>(null);
  const [aiRichSnippetsLoading, setAiRichSnippetsLoading] = useState(false);
  const [aiVoiceSearch, setAiVoiceSearch] = useState<any>(null);
  const [aiVoiceSearchLoading, setAiVoiceSearchLoading] = useState(false);
  const [aiAutocomplete, setAiAutocomplete] = useState<any>(null);
  const [aiAutocompleteLoading, setAiAutocompleteLoading] = useState(false);
  const [aiGoogleTrends, setAiGoogleTrends] = useState<any>(null);
  const [aiGoogleTrendsLoading, setAiGoogleTrendsLoading] = useState(false);
  const [aiCompKeywords, setAiCompKeywords] = useState<any>(null);
  const [aiCompKeywordsLoading, setAiCompKeywordsLoading] = useState(false);
  const [aiSearchRanking, setAiSearchRanking] = useState<any>(null);
  const [aiSearchRankingLoading, setAiSearchRankingLoading] = useState(false);
  const [aiCTRBench, setAiCTRBench] = useState<any>(null);
  const [aiCTRBenchLoading, setAiCTRBenchLoading] = useState(false);
  const [aiImpressions, setAiImpressions] = useState<any>(null);
  const [aiImpressionsLoading, setAiImpressionsLoading] = useState(false);
  const [aiRelatedVids, setAiRelatedVids] = useState<any>(null);
  const [aiRelatedVidsLoading, setAiRelatedVidsLoading] = useState(false);
  const [aiBrowseFeatures, setAiBrowseFeatures] = useState<any>(null);
  const [aiBrowseFeaturesLoading, setAiBrowseFeaturesLoading] = useState(false);

  const [aiPillars, setAiPillars] = useState<any>(null);
  const [aiPillarsLoading, setAiPillarsLoading] = useState(false);
  const [aiSeriesData, setAiSeriesData] = useState<any>(null);
  const [aiSeriesDataLoading, setAiSeriesDataLoading] = useState(false);
  const [aiRepurposeMatrix, setAiRepurposeMatrix] = useState<any>(null);
  const [aiRepurposeMatrixLoading, setAiRepurposeMatrixLoading] = useState(false);
  const [aiViralScore, setAiViralScore] = useState<any>(null);
  const [aiViralScoreLoading, setAiViralScoreLoading] = useState(false);
  const [aiContentGaps, setAiContentGaps] = useState<any>(null);
  const [aiContentGapsLoading, setAiContentGapsLoading] = useState(false);
  const [aiTrendSurf, setAiTrendSurf] = useState<any>(null);
  const [aiTrendSurfLoading, setAiTrendSurfLoading] = useState(false);
  const [aiEvergreen, setAiEvergreen] = useState<any>(null);
  const [aiEvergreenLoading, setAiEvergreenLoading] = useState(false);
  const [aiContentMix, setAiContentMix] = useState<any>(null);
  const [aiContentMixLoading, setAiContentMixLoading] = useState(false);
  const [aiSeasonalPlan, setAiSeasonalPlan] = useState<any>(null);
  const [aiSeasonalPlanLoading, setAiSeasonalPlanLoading] = useState(false);
  const [aiCollabContent, setAiCollabContent] = useState<any>(null);
  const [aiCollabContentLoading, setAiCollabContentLoading] = useState(false);
  const [aiBTSPlan, setAiBTSPlan] = useState<any>(null);
  const [aiBTSPlanLoading, setAiBTSPlanLoading] = useState(false);
  const [aiReactionContent, setAiReactionContent] = useState<any>(null);
  const [aiReactionContentLoading, setAiReactionContentLoading] = useState(false);
  const [aiChallenge, setAiChallenge] = useState<any>(null);
  const [aiChallengeLoading, setAiChallengeLoading] = useState(false);
  const [aiQnAPlan, setAiQnAPlan] = useState<any>(null);
  const [aiQnAPlanLoading, setAiQnAPlanLoading] = useState(false);
  const [aiTutorial, setAiTutorial] = useState<any>(null);
  const [aiTutorialLoading, setAiTutorialLoading] = useState(false);
  const [aiDocumentary, setAiDocumentary] = useState<any>(null);
  const [aiDocumentaryLoading, setAiDocumentaryLoading] = useState(false);

  const [aiShortForm, setAiShortForm] = useState<any>(null);
  const [aiShortFormLoading, setAiShortFormLoading] = useState(false);
  const [aiShortsIdeas, setAiShortsIdeas] = useState<any>(null);
  const [aiShortsIdeasLoading, setAiShortsIdeasLoading] = useState(false);
  const [aiShortsToLong, setAiShortsToLong] = useState<any>(null);
  const [aiShortsToLongLoading, setAiShortsToLongLoading] = useState(false);
  const [aiLongToShorts, setAiLongToShorts] = useState<any>(null);
  const [aiLongToShortsLoading, setAiLongToShortsLoading] = useState(false);
  const [aiVerticalVid, setAiVerticalVid] = useState<any>(null);
  const [aiVerticalVidLoading, setAiVerticalVidLoading] = useState(false);
  const [aiShortsAudio, setAiShortsAudio] = useState<any>(null);
  const [aiShortsAudioLoading, setAiShortsAudioLoading] = useState(false);
  const [aiShortsCaptions, setAiShortsCaptions] = useState<any>(null);
  const [aiShortsCaptionsLoading, setAiShortsCaptionsLoading] = useState(false);
  const [aiShortsHooks, setAiShortsHooks] = useState<any>(null);
  const [aiShortsHooksLoading, setAiShortsHooksLoading] = useState(false);
  const [aiDuetStitch, setAiDuetStitch] = useState<any>(null);
  const [aiDuetStitchLoading, setAiDuetStitchLoading] = useState(false);
  const [aiShortsAnalytics, setAiShortsAnalytics] = useState<any>(null);
  const [aiShortsAnalyticsLoading, setAiShortsAnalyticsLoading] = useState(false);
  const [aiShortsBatch, setAiShortsBatch] = useState<any>(null);
  const [aiShortsBatchLoading, setAiShortsBatchLoading] = useState(false);
  const [aiShortsRemix, setAiShortsRemix] = useState<any>(null);
  const [aiShortsRemixLoading, setAiShortsRemixLoading] = useState(false);
  const [aiShortsMoney, setAiShortsMoney] = useState<any>(null);
  const [aiShortsMoneyLoading, setAiShortsMoneyLoading] = useState(false);
  const [aiAudit, setAiAudit] = useState<any>(null);
  const [aiAuditLoading, setAiAuditLoading] = useState(false);
  const [aiVelocity, setAiVelocity] = useState<any>(null);
  const [aiVelocityLoading, setAiVelocityLoading] = useState(false);
  const [aiNiche, setAiNiche] = useState<any>(null);
  const [aiNicheLoading, setAiNicheLoading] = useState(false);

  const [showAudioAI, setShowAudioAI] = useState(false);
  const [aiPodcastLaunch, setAiPodcastLaunch] = useState<any>(null);
  const [aiPodcastLaunchLoading, setAiPodcastLaunchLoading] = useState(false);
  const [aiPodcastEp, setAiPodcastEp] = useState<any>(null);
  const [aiPodcastEpLoading, setAiPodcastEpLoading] = useState(false);
  const [aiPodcastSEO, setAiPodcastSEO] = useState<any>(null);
  const [aiPodcastSEOLoading, setAiPodcastSEOLoading] = useState(false);
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

  const [showAccessibilityAI, setShowAccessibilityAI] = useState(false);
  const [aiAccText, setAiAccText] = useState<any>(null);
  const [aiAccTextLoading, setAiAccTextLoading] = useState(false);
  const [aiAltText, setAiAltText] = useState<any>(null);
  const [aiAltTextLoading, setAiAltTextLoading] = useState(false);
  const [aiContrast, setAiContrast] = useState<any>(null);
  const [aiContrastLoading, setAiContrastLoading] = useState(false);
  const [aiScreenRead, setAiScreenRead] = useState<any>(null);
  const [aiScreenReadLoading, setAiScreenReadLoading] = useState(false);
  const [aiKbdNav, setAiKbdNav] = useState<any>(null);
  const [aiKbdNavLoading, setAiKbdNavLoading] = useState(false);
  const [aiCapQuality, setAiCapQuality] = useState<any>(null);
  const [aiCapQualityLoading, setAiCapQualityLoading] = useState(false);
  const [aiInclLang, setAiInclLang] = useState<any>(null);
  const [aiInclLangLoading, setAiInclLangLoading] = useState(false);
  const [aiDyslexia, setAiDyslexia] = useState<any>(null);
  const [aiDyslexiaLoading, setAiDyslexiaLoading] = useState(false);
  const [aiMotionSens, setAiMotionSens] = useState<any>(null);
  const [aiMotionSensLoading, setAiMotionSensLoading] = useState(false);
  const [aiCogLoad, setAiCogLoad] = useState<any>(null);
  const [aiCogLoadLoading, setAiCogLoadLoading] = useState(false);
  const [aiMultiModal, setAiMultiModal] = useState<any>(null);
  const [aiMultiModalLoading, setAiMultiModalLoading] = useState(false);

  const [showMobileAI, setShowMobileAI] = useState(false);
  const [aiMobileOpt, setAiMobileOpt] = useState<any>(null);
  const [aiMobileOptLoading, setAiMobileOptLoading] = useState(false);
  const [aiDeepLinks, setAiDeepLinks] = useState<any>(null);
  const [aiDeepLinksLoading, setAiDeepLinksLoading] = useState(false);
  const [aiPushNotif, setAiPushNotif] = useState<any>(null);
  const [aiPushNotifLoading, setAiPushNotifLoading] = useState(false);
  const [aiMobileVid, setAiMobileVid] = useState<any>(null);
  const [aiMobileVidLoading, setAiMobileVidLoading] = useState(false);
  const [aiResponsive, setAiResponsive] = useState<any>(null);
  const [aiResponsiveLoading, setAiResponsiveLoading] = useState(false);
  const [aiMobilePay, setAiMobilePay] = useState<any>(null);
  const [aiMobilePayLoading, setAiMobilePayLoading] = useState(false);
  const [aiOffline, setAiOffline] = useState<any>(null);
  const [aiOfflineLoading, setAiOfflineLoading] = useState(false);
  const [aiMobileAnalytics, setAiMobileAnalytics] = useState<any>(null);
  const [aiMobileAnalyticsLoading, setAiMobileAnalyticsLoading] = useState(false);
  const [aiAppStore, setAiAppStore] = useState<any>(null);
  const [aiAppStoreLoading, setAiAppStoreLoading] = useState(false);
  const [aiWidgets, setAiWidgets] = useState<any>(null);
  const [aiWidgetsLoading, setAiWidgetsLoading] = useState(false);
  const [aiGestures, setAiGestures] = useState<any>(null);
  const [aiGesturesLoading, setAiGesturesLoading] = useState(false);
  const [aiMobileFirst, setAiMobileFirst] = useState<any>(null);
  const [aiMobileFirstLoading, setAiMobileFirstLoading] = useState(false);
  const [aiWearable, setAiWearable] = useState<any>(null);
  const [aiWearableLoading, setAiWearableLoading] = useState(false);
  const [aiSmartTV, setAiSmartTV] = useState<any>(null);
  const [aiSmartTVLoading, setAiSmartTVLoading] = useState(false);

  const [showNicheAI, setShowNicheAI] = useState(false);
  const [aiGamingNiche, setAiGamingNiche] = useState<any>(null);
  const [aiGamingNicheLoading, setAiGamingNicheLoading] = useState(false);
  const [aiBeautyNiche, setAiBeautyNiche] = useState<any>(null);
  const [aiBeautyNicheLoading, setAiBeautyNicheLoading] = useState(false);
  const [aiTechReview, setAiTechReview] = useState<any>(null);
  const [aiTechReviewLoading, setAiTechReviewLoading] = useState(false);
  const [aiFoodContent, setAiFoodContent] = useState<any>(null);
  const [aiFoodContentLoading, setAiFoodContentLoading] = useState(false);
  const [aiFitnessContent, setAiFitnessContent] = useState<any>(null);
  const [aiFitnessContentLoading, setAiFitnessContentLoading] = useState(false);
  const [aiTravelContent, setAiTravelContent] = useState<any>(null);
  const [aiTravelContentLoading, setAiTravelContentLoading] = useState(false);
  const [aiEduContent, setAiEduContent] = useState<any>(null);
  const [aiEduContentLoading, setAiEduContentLoading] = useState(false);
  const [aiFinContent, setAiFinContent] = useState<any>(null);
  const [aiFinContentLoading, setAiFinContentLoading] = useState(false);
  const [aiParentContent, setAiParentContent] = useState<any>(null);
  const [aiParentContentLoading, setAiParentContentLoading] = useState(false);
  const [aiPetContent, setAiPetContent] = useState<any>(null);
  const [aiPetContentLoading, setAiPetContentLoading] = useState(false);
  const [aiDIYCraft, setAiDIYCraft] = useState<any>(null);
  const [aiDIYCraftLoading, setAiDIYCraftLoading] = useState(false);
  const [aiMusicianContent, setAiMusicianContent] = useState<any>(null);
  const [aiMusicianContentLoading, setAiMusicianContentLoading] = useState(false);
  const [aiComedyContent, setAiComedyContent] = useState<any>(null);
  const [aiComedyContentLoading, setAiComedyContentLoading] = useState(false);
  const [aiSportsContent, setAiSportsContent] = useState<any>(null);
  const [aiSportsContentLoading, setAiSportsContentLoading] = useState(false);
  const [aiNewsCommen, setAiNewsCommen] = useState<any>(null);
  const [aiNewsCommenLoading, setAiNewsCommenLoading] = useState(false);
  const [aiLifestyleContent, setAiLifestyleContent] = useState<any>(null);
  const [aiLifestyleContentLoading, setAiLifestyleContentLoading] = useState(false);

  const [showRepurposeMatrixAI, setShowRepurposeMatrixAI] = useState(false);
  const [aiVidToBook, setAiVidToBook] = useState<any>(null);
  const [aiVidToBookLoading, setAiVidToBookLoading] = useState(false);
  const [aiVidToPod, setAiVidToPod] = useState<any>(null);
  const [aiVidToPodLoading, setAiVidToPodLoading] = useState(false);
  const [aiVidToCourse, setAiVidToCourse] = useState<any>(null);
  const [aiVidToCourseLoading, setAiVidToCourseLoading] = useState(false);
  const [aiBlogToVid, setAiBlogToVid] = useState<any>(null);
  const [aiBlogToVidLoading, setAiBlogToVidLoading] = useState(false);
  const [aiTwitThread, setAiTwitThread] = useState<any>(null);
  const [aiTwitThreadLoading, setAiTwitThreadLoading] = useState(false);
  const [aiLIAdapter, setAiLIAdapter] = useState<any>(null);
  const [aiLIAdapterLoading, setAiLIAdapterLoading] = useState(false);
  const [aiPintPins, setAiPintPins] = useState<any>(null);
  const [aiPintPinsLoading, setAiPintPinsLoading] = useState(false);
  const [aiRedditOpt, setAiRedditOpt] = useState<any>(null);
  const [aiRedditOptLoading, setAiRedditOptLoading] = useState(false);
  const [aiQuoraAns, setAiQuoraAns] = useState<any>(null);
  const [aiQuoraAnsLoading, setAiQuoraAnsLoading] = useState(false);
  const [aiMediumArt, setAiMediumArt] = useState<any>(null);
  const [aiMediumArtLoading, setAiMediumArtLoading] = useState(false);
  const [aiSlidedeck, setAiSlidedeck] = useState<any>(null);
  const [aiSlidedeckLoading, setAiSlidedeckLoading] = useState(false);
  const [aiInfographicRep, setAiInfographicRep] = useState<any>(null);
  const [aiInfographicRepLoading, setAiInfographicRepLoading] = useState(false);

  const [showWatchTimeAI, setShowWatchTimeAI] = useState(false);
  const [aiWatchTime, setAiWatchTime] = useState<any>(null);
  const [aiWatchTimeLoading, setAiWatchTimeLoading] = useState(false);
  const [aiOpenLoops, setAiOpenLoops] = useState<any>(null);
  const [aiOpenLoopsLoading, setAiOpenLoopsLoading] = useState(false);
  const [aiPatternInt, setAiPatternInt] = useState<any>(null);
  const [aiPatternIntLoading, setAiPatternIntLoading] = useState(false);
  const [aiReEngage, setAiReEngage] = useState<any>(null);
  const [aiReEngageLoading, setAiReEngageLoading] = useState(false);
  const [aiBingeWatch, setAiBingeWatch] = useState<any>(null);
  const [aiBingeWatchLoading, setAiBingeWatchLoading] = useState(false);

  const [showEquipmentAI, setShowEquipmentAI] = useState(false);
  const [aiCameraEQ, setAiCameraEQ] = useState<any>(null);
  const [aiCameraEQLoading, setAiCameraEQLoading] = useState(false);
  const [aiMicEQ, setAiMicEQ] = useState<any>(null);
  const [aiMicEQLoading, setAiMicEQLoading] = useState(false);
  const [aiLightingEQ, setAiLightingEQ] = useState<any>(null);
  const [aiLightingEQLoading, setAiLightingEQLoading] = useState(false);
  const [aiEditSoft, setAiEditSoft] = useState<any>(null);
  const [aiEditSoftLoading, setAiEditSoftLoading] = useState(false);
  const [aiStudioEQ, setAiStudioEQ] = useState<any>(null);
  const [aiStudioEQLoading, setAiStudioEQLoading] = useState(false);
  const [aiGreenScrEQ, setAiGreenScrEQ] = useState<any>(null);
  const [aiGreenScrEQLoading, setAiGreenScrEQLoading] = useState(false);
  const [aiTeleprompterEQ, setAiTeleprompterEQ] = useState<any>(null);
  const [aiTeleprompterEQLoading, setAiTeleprompterEQLoading] = useState(false);
  const [aiBackupStore, setAiBackupStore] = useState<any>(null);
  const [aiBackupStoreLoading, setAiBackupStoreLoading] = useState(false);
  const [aiInternetEQ, setAiInternetEQ] = useState<any>(null);
  const [aiInternetEQLoading, setAiInternetEQLoading] = useState(false);
  const [aiHiringEQ, setAiHiringEQ] = useState<any>(null);
  const [aiHiringEQLoading, setAiHiringEQLoading] = useState(false);
  const [aiVATasks, setAiVATasks] = useState<any>(null);
  const [aiVATasksLoading, setAiVATasksLoading] = useState(false);
  const [aiEditorHire, setAiEditorHire] = useState<any>(null);
  const [aiEditorHireLoading, setAiEditorHireLoading] = useState(false);
  const [aiThumbDesigner, setAiThumbDesigner] = useState<any>(null);
  const [aiThumbDesignerLoading, setAiThumbDesignerLoading] = useState(false);
  const [aiOutsourceEQ, setAiOutsourceEQ] = useState<any>(null);
  const [aiOutsourceEQLoading, setAiOutsourceEQLoading] = useState(false);

  const [showContentSafetyAI, setShowContentSafetyAI] = useState(false);
  const [aiContentMod, setAiContentMod] = useState<any>(null);
  const [aiContentModLoading, setAiContentModLoading] = useState(false);
  const [aiCopyClaim, setAiCopyClaim] = useState<any>(null);
  const [aiCopyClaimLoading, setAiCopyClaimLoading] = useState(false);
  const [aiSponDisclose, setAiSponDisclose] = useState<any>(null);
  const [aiSponDiscloseLoading, setAiSponDiscloseLoading] = useState(false);
  const [aiAgeRestrict, setAiAgeRestrict] = useState<any>(null);
  const [aiAgeRestrictLoading, setAiAgeRestrictLoading] = useState(false);
  const [aiDefamation, setAiDefamation] = useState<any>(null);
  const [aiDefamationLoading, setAiDefamationLoading] = useState(false);
  const [aiPlagiarismCS, setAiPlagiarismCS] = useState<any>(null);
  const [aiPlagiarismCSLoading, setAiPlagiarismCSLoading] = useState(false);
  const [aiCOPPA, setAiCOPPA] = useState<any>(null);
  const [aiCOPPALoading, setAiCOPPALoading] = useState(false);
  const [aiGDPR, setAiGDPR] = useState<any>(null);
  const [aiGDPRLoading, setAiGDPRLoading] = useState(false);
  const [aiCommGuideCS, setAiCommGuideCS] = useState<any>(null);
  const [aiCommGuideCSLoading, setAiCommGuideCSLoading] = useState(false);
  const [aiHateSpeech, setAiHateSpeech] = useState<any>(null);
  const [aiHateSpeechLoading, setAiHateSpeechLoading] = useState(false);
  const [aiMisinfo, setAiMisinfo] = useState<any>(null);
  const [aiMisinfoLoading, setAiMisinfoLoading] = useState(false);
  const [aiTriggerWarn, setAiTriggerWarn] = useState<any>(null);
  const [aiTriggerWarnLoading, setAiTriggerWarnLoading] = useState(false);
  const [aiChildSafe, setAiChildSafe] = useState<any>(null);
  const [aiChildSafeLoading, setAiChildSafeLoading] = useState(false);
  const [aiDataRetention2, setAiDataRetention2] = useState<any>(null);
  const [aiDataRetention2Loading, setAiDataRetention2Loading] = useState(false);

  const [showSeasonalAI, setShowSeasonalAI] = useState(false);
  const [aiSummer, setAiSummer] = useState<any>(null);
  const [aiSummerLoading, setAiSummerLoading] = useState(false);
  const [aiWinter, setAiWinter] = useState<any>(null);
  const [aiWinterLoading, setAiWinterLoading] = useState(false);
  const [aiBackSchool, setAiBackSchool] = useState<any>(null);
  const [aiBackSchoolLoading, setAiBackSchoolLoading] = useState(false);
  const [aiHalloween, setAiHalloween] = useState<any>(null);
  const [aiHalloweenLoading, setAiHalloweenLoading] = useState(false);
  const [aiBlackFriday, setAiBlackFriday] = useState<any>(null);
  const [aiBlackFridayLoading, setAiBlackFridayLoading] = useState(false);
  const [aiChristmas, setAiChristmas] = useState<any>(null);
  const [aiChristmasLoading, setAiChristmasLoading] = useState(false);
  const [aiNewYear, setAiNewYear] = useState<any>(null);
  const [aiNewYearLoading, setAiNewYearLoading] = useState(false);
  const [aiValentines, setAiValentines] = useState<any>(null);
  const [aiValentinesLoading, setAiValentinesLoading] = useState(false);
  const [aiEaster, setAiEaster] = useState<any>(null);
  const [aiEasterLoading, setAiEasterLoading] = useState(false);
  const [aiSuperBowl, setAiSuperBowl] = useState<any>(null);
  const [aiSuperBowlLoading, setAiSuperBowlLoading] = useState(false);
  const [aiParentsDay, setAiParentsDay] = useState<any>(null);
  const [aiParentsDayLoading, setAiParentsDayLoading] = useState(false);
  const [aiGraduation, setAiGraduation] = useState<any>(null);
  const [aiGraduationLoading, setAiGraduationLoading] = useState(false);
  const [aiWorldCup, setAiWorldCup] = useState<any>(null);
  const [aiWorldCupLoading, setAiWorldCupLoading] = useState(false);
  const [aiOlympics, setAiOlympics] = useState<any>(null);
  const [aiOlympicsLoading, setAiOlympicsLoading] = useState(false);
  const [aiAwardsSeason, setAiAwardsSeason] = useState<any>(null);
  const [aiAwardsSeasonLoading, setAiAwardsSeasonLoading] = useState(false);
  const [aiMusicFest, setAiMusicFest] = useState<any>(null);
  const [aiMusicFestLoading, setAiMusicFestLoading] = useState(false);
  const [aiGamingEvent, setAiGamingEvent] = useState<any>(null);
  const [aiGamingEventLoading, setAiGamingEventLoading] = useState(false);
  const [aiProdHunt, setAiProdHunt] = useState<any>(null);
  const [aiProdHuntLoading, setAiProdHuntLoading] = useState(false);
  const [aiSpringContent, setAiSpringContent] = useState<any>(null);
  const [aiSpringContentLoading, setAiSpringContentLoading] = useState(false);
  const [aiAutumnContent, setAiAutumnContent] = useState<any>(null);
  const [aiAutumnContentLoading, setAiAutumnContentLoading] = useState(false);

  const [showContentQualityAI, setShowContentQualityAI] = useState(false);
  const [aiScriptCoach, setAiScriptCoach] = useState<any>(null);
  const [aiScriptCoachLoading, setAiScriptCoachLoading] = useState(false);
  const [aiThumbCTRPredictor, setAiThumbCTRPredictor] = useState<any>(null);
  const [aiThumbCTRPredictorLoading, setAiThumbCTRPredictorLoading] = useState(false);
  const [aiPlatformRepurposer, setAiPlatformRepurposer] = useState<any>(null);
  const [aiPlatformRepurposerLoading, setAiPlatformRepurposerLoading] = useState(false);
  const [aiContentDecay, setAiContentDecay] = useState<any>(null);
  const [aiContentDecayLoading, setAiContentDecayLoading] = useState(false);
  const [aiTitleABTester, setAiTitleABTester] = useState<any>(null);
  const [aiTitleABTesterLoading, setAiTitleABTesterLoading] = useState(false);
  const [aiDescOptimizer, setAiDescOptimizer] = useState<any>(null);
  const [aiDescOptimizerLoading, setAiDescOptimizerLoading] = useState(false);
  const [aiContentRoadmap, setAiContentRoadmap] = useState<any>(null);
  const [aiContentRoadmapLoading, setAiContentRoadmapLoading] = useState(false);
  const [aiEvergreenIdentifier, setAiEvergreenIdentifier] = useState<any>(null);
  const [aiEvergreenIdentifierLoading, setAiEvergreenIdentifierLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_camera");
    if (cached) { try { setAiCameraEQ(JSON.parse(cached)); return; } catch {} }
    setAiCameraEQLoading(true);
    apiRequest("POST", "/api/ai/camera-recommend", {}).then(r => r.json()).then(d => { setAiCameraEQ(d); sessionStorage.setItem("ai_camera", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCameraEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mic");
    if (cached) { try { setAiMicEQ(JSON.parse(cached)); return; } catch {} }
    setAiMicEQLoading(true);
    apiRequest("POST", "/api/ai/microphone", {}).then(r => r.json()).then(d => { setAiMicEQ(d); sessionStorage.setItem("ai_mic", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMicEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lighting");
    if (cached) { try { setAiLightingEQ(JSON.parse(cached)); return; } catch {} }
    setAiLightingEQLoading(true);
    apiRequest("POST", "/api/ai/lighting-setup", {}).then(r => r.json()).then(d => { setAiLightingEQ(d); sessionStorage.setItem("ai_lighting", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLightingEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_edit_soft");
    if (cached) { try { setAiEditSoft(JSON.parse(cached)); return; } catch {} }
    setAiEditSoftLoading(true);
    apiRequest("POST", "/api/ai/editing-software", {}).then(r => r.json()).then(d => { setAiEditSoft(d); sessionStorage.setItem("ai_edit_soft", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEditSoftLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_studio_eq");
    if (cached) { try { setAiStudioEQ(JSON.parse(cached)); return; } catch {} }
    setAiStudioEQLoading(true);
    apiRequest("POST", "/api/ai/studio-design", {}).then(r => r.json()).then(d => { setAiStudioEQ(d); sessionStorage.setItem("ai_studio_eq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStudioEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_green_scr_eq");
    if (cached) { try { setAiGreenScrEQ(JSON.parse(cached)); return; } catch {} }
    setAiGreenScrEQLoading(true);
    apiRequest("POST", "/api/ai/green-screen", {}).then(r => r.json()).then(d => { setAiGreenScrEQ(d); sessionStorage.setItem("ai_green_scr_eq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGreenScrEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_teleprompter_eq");
    if (cached) { try { setAiTeleprompterEQ(JSON.parse(cached)); return; } catch {} }
    setAiTeleprompterEQLoading(true);
    apiRequest("POST", "/api/ai/teleprompter", {}).then(r => r.json()).then(d => { setAiTeleprompterEQ(d); sessionStorage.setItem("ai_teleprompter_eq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTeleprompterEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_backup_store");
    if (cached) { try { setAiBackupStore(JSON.parse(cached)); return; } catch {} }
    setAiBackupStoreLoading(true);
    apiRequest("POST", "/api/ai/backup-storage", {}).then(r => r.json()).then(d => { setAiBackupStore(d); sessionStorage.setItem("ai_backup_store", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBackupStoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_internet");
    if (cached) { try { setAiInternetEQ(JSON.parse(cached)); return; } catch {} }
    setAiInternetEQLoading(true);
    apiRequest("POST", "/api/ai/internet-optimize", {}).then(r => r.json()).then(d => { setAiInternetEQ(d); sessionStorage.setItem("ai_internet", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInternetEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hiring_eq");
    if (cached) { try { setAiHiringEQ(JSON.parse(cached)); return; } catch {} }
    setAiHiringEQLoading(true);
    apiRequest("POST", "/api/ai/hiring", {}).then(r => r.json()).then(d => { setAiHiringEQ(d); sessionStorage.setItem("ai_hiring_eq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHiringEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_va_tasks");
    if (cached) { try { setAiVATasks(JSON.parse(cached)); return; } catch {} }
    setAiVATasksLoading(true);
    apiRequest("POST", "/api/ai/va-tasks", {}).then(r => r.json()).then(d => { setAiVATasks(d); sessionStorage.setItem("ai_va_tasks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVATasksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_editor_hire");
    if (cached) { try { setAiEditorHire(JSON.parse(cached)); return; } catch {} }
    setAiEditorHireLoading(true);
    apiRequest("POST", "/api/ai/editor-hiring", {}).then(r => r.json()).then(d => { setAiEditorHire(d); sessionStorage.setItem("ai_editor_hire", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEditorHireLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_designer");
    if (cached) { try { setAiThumbDesigner(JSON.parse(cached)); return; } catch {} }
    setAiThumbDesignerLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-designer", {}).then(r => r.json()).then(d => { setAiThumbDesigner(d); sessionStorage.setItem("ai_thumb_designer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbDesignerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_outsource_eq");
    if (cached) { try { setAiOutsourceEQ(JSON.parse(cached)); return; } catch {} }
    setAiOutsourceEQLoading(true);
    apiRequest("POST", "/api/ai/outsourcing", {}).then(r => r.json()).then(d => { setAiOutsourceEQ(d); sessionStorage.setItem("ai_outsource_eq", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOutsourceEQLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_mod");
    if (cached) { try { setAiContentMod(JSON.parse(cached)); return; } catch {} }
    setAiContentModLoading(true);
    apiRequest("POST", "/api/ai/content-moderation", {}).then(r => r.json()).then(d => { setAiContentMod(d); sessionStorage.setItem("ai_content_mod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentModLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_copy_claim");
    if (cached) { try { setAiCopyClaim(JSON.parse(cached)); return; } catch {} }
    setAiCopyClaimLoading(true);
    apiRequest("POST", "/api/ai/copyright-claim", {}).then(r => r.json()).then(d => { setAiCopyClaim(d); sessionStorage.setItem("ai_copy_claim", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCopyClaimLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_spon_disclose");
    if (cached) { try { setAiSponDisclose(JSON.parse(cached)); return; } catch {} }
    setAiSponDiscloseLoading(true);
    apiRequest("POST", "/api/ai/sponsorship-disclosure", {}).then(r => r.json()).then(d => { setAiSponDisclose(d); sessionStorage.setItem("ai_spon_disclose", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponDiscloseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_age_restrict");
    if (cached) { try { setAiAgeRestrict(JSON.parse(cached)); return; } catch {} }
    setAiAgeRestrictLoading(true);
    apiRequest("POST", "/api/ai/age-restriction", {}).then(r => r.json()).then(d => { setAiAgeRestrict(d); sessionStorage.setItem("ai_age_restrict", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAgeRestrictLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_defamation");
    if (cached) { try { setAiDefamation(JSON.parse(cached)); return; } catch {} }
    setAiDefamationLoading(true);
    apiRequest("POST", "/api/ai/defamation-risk", {}).then(r => r.json()).then(d => { setAiDefamation(d); sessionStorage.setItem("ai_defamation", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDefamationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_plagiarism");
    if (cached) { try { setAiPlagiarismCS(JSON.parse(cached)); return; } catch {} }
    setAiPlagiarismCSLoading(true);
    apiRequest("POST", "/api/ai/plagiarism", {}).then(r => r.json()).then(d => { setAiPlagiarismCS(d); sessionStorage.setItem("ai_plagiarism", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPlagiarismCSLoading(false));
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
    const cached = sessionStorage.getItem("ai_comm_guide");
    if (cached) { try { setAiCommGuideCS(JSON.parse(cached)); return; } catch {} }
    setAiCommGuideCSLoading(true);
    apiRequest("POST", "/api/ai/community-guidelines", {}).then(r => r.json()).then(d => { setAiCommGuideCS(d); sessionStorage.setItem("ai_comm_guide", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommGuideCSLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hate_speech");
    if (cached) { try { setAiHateSpeech(JSON.parse(cached)); return; } catch {} }
    setAiHateSpeechLoading(true);
    apiRequest("POST", "/api/ai/hate-speech", {}).then(r => r.json()).then(d => { setAiHateSpeech(d); sessionStorage.setItem("ai_hate_speech", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHateSpeechLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_misinfo");
    if (cached) { try { setAiMisinfo(JSON.parse(cached)); return; } catch {} }
    setAiMisinfoLoading(true);
    apiRequest("POST", "/api/ai/misinformation", {}).then(r => r.json()).then(d => { setAiMisinfo(d); sessionStorage.setItem("ai_misinfo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMisinfoLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_trigger_warn");
    if (cached) { try { setAiTriggerWarn(JSON.parse(cached)); return; } catch {} }
    setAiTriggerWarnLoading(true);
    apiRequest("POST", "/api/ai/trigger-warning", {}).then(r => r.json()).then(d => { setAiTriggerWarn(d); sessionStorage.setItem("ai_trigger_warn", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTriggerWarnLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_child_safe");
    if (cached) { try { setAiChildSafe(JSON.parse(cached)); return; } catch {} }
    setAiChildSafeLoading(true);
    apiRequest("POST", "/api/ai/child-safety", {}).then(r => r.json()).then(d => { setAiChildSafe(d); sessionStorage.setItem("ai_child_safe", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChildSafeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_data_retention2");
    if (cached) { try { setAiDataRetention2(JSON.parse(cached)); return; } catch {} }
    setAiDataRetention2Loading(true);
    apiRequest("POST", "/api/ai/data-retention", {}).then(r => r.json()).then(d => { setAiDataRetention2(d); sessionStorage.setItem("ai_data_retention2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDataRetention2Loading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_summer");
    if (cached) { try { setAiSummer(JSON.parse(cached)); return; } catch {} }
    setAiSummerLoading(true);
    apiRequest("POST", "/api/ai/summer-content", {}).then(r => r.json()).then(d => { setAiSummer(d); sessionStorage.setItem("ai_summer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSummerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_winter");
    if (cached) { try { setAiWinter(JSON.parse(cached)); return; } catch {} }
    setAiWinterLoading(true);
    apiRequest("POST", "/api/ai/winter-content", {}).then(r => r.json()).then(d => { setAiWinter(d); sessionStorage.setItem("ai_winter", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWinterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_back_school");
    if (cached) { try { setAiBackSchool(JSON.parse(cached)); return; } catch {} }
    setAiBackSchoolLoading(true);
    apiRequest("POST", "/api/ai/back-to-school", {}).then(r => r.json()).then(d => { setAiBackSchool(d); sessionStorage.setItem("ai_back_school", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBackSchoolLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_halloween");
    if (cached) { try { setAiHalloween(JSON.parse(cached)); return; } catch {} }
    setAiHalloweenLoading(true);
    apiRequest("POST", "/api/ai/halloween-content", {}).then(r => r.json()).then(d => { setAiHalloween(d); sessionStorage.setItem("ai_halloween", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHalloweenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_black_friday");
    if (cached) { try { setAiBlackFriday(JSON.parse(cached)); return; } catch {} }
    setAiBlackFridayLoading(true);
    apiRequest("POST", "/api/ai/black-friday", {}).then(r => r.json()).then(d => { setAiBlackFriday(d); sessionStorage.setItem("ai_black_friday", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBlackFridayLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_christmas");
    if (cached) { try { setAiChristmas(JSON.parse(cached)); return; } catch {} }
    setAiChristmasLoading(true);
    apiRequest("POST", "/api/ai/christmas-content", {}).then(r => r.json()).then(d => { setAiChristmas(d); sessionStorage.setItem("ai_christmas", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChristmasLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_new_year");
    if (cached) { try { setAiNewYear(JSON.parse(cached)); return; } catch {} }
    setAiNewYearLoading(true);
    apiRequest("POST", "/api/ai/new-year-goals", {}).then(r => r.json()).then(d => { setAiNewYear(d); sessionStorage.setItem("ai_new_year", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNewYearLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_valentines");
    if (cached) { try { setAiValentines(JSON.parse(cached)); return; } catch {} }
    setAiValentinesLoading(true);
    apiRequest("POST", "/api/ai/valentines", {}).then(r => r.json()).then(d => { setAiValentines(d); sessionStorage.setItem("ai_valentines", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiValentinesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_easter");
    if (cached) { try { setAiEaster(JSON.parse(cached)); return; } catch {} }
    setAiEasterLoading(true);
    apiRequest("POST", "/api/ai/easter-content", {}).then(r => r.json()).then(d => { setAiEaster(d); sessionStorage.setItem("ai_easter", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEasterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_super_bowl");
    if (cached) { try { setAiSuperBowl(JSON.parse(cached)); return; } catch {} }
    setAiSuperBowlLoading(true);
    apiRequest("POST", "/api/ai/super-bowl", {}).then(r => r.json()).then(d => { setAiSuperBowl(d); sessionStorage.setItem("ai_super_bowl", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSuperBowlLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_parents_day");
    if (cached) { try { setAiParentsDay(JSON.parse(cached)); return; } catch {} }
    setAiParentsDayLoading(true);
    apiRequest("POST", "/api/ai/parents-day", {}).then(r => r.json()).then(d => { setAiParentsDay(d); sessionStorage.setItem("ai_parents_day", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiParentsDayLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_graduation");
    if (cached) { try { setAiGraduation(JSON.parse(cached)); return; } catch {} }
    setAiGraduationLoading(true);
    apiRequest("POST", "/api/ai/graduation", {}).then(r => r.json()).then(d => { setAiGraduation(d); sessionStorage.setItem("ai_graduation", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGraduationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_world_cup");
    if (cached) { try { setAiWorldCup(JSON.parse(cached)); return; } catch {} }
    setAiWorldCupLoading(true);
    apiRequest("POST", "/api/ai/world-cup", {}).then(r => r.json()).then(d => { setAiWorldCup(d); sessionStorage.setItem("ai_world_cup", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWorldCupLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_olympics");
    if (cached) { try { setAiOlympics(JSON.parse(cached)); return; } catch {} }
    setAiOlympicsLoading(true);
    apiRequest("POST", "/api/ai/olympics", {}).then(r => r.json()).then(d => { setAiOlympics(d); sessionStorage.setItem("ai_olympics", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOlympicsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_awards_season");
    if (cached) { try { setAiAwardsSeason(JSON.parse(cached)); return; } catch {} }
    setAiAwardsSeasonLoading(true);
    apiRequest("POST", "/api/ai/awards-season", {}).then(r => r.json()).then(d => { setAiAwardsSeason(d); sessionStorage.setItem("ai_awards_season", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAwardsSeasonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_music_fest");
    if (cached) { try { setAiMusicFest(JSON.parse(cached)); return; } catch {} }
    setAiMusicFestLoading(true);
    apiRequest("POST", "/api/ai/music-festival", {}).then(r => r.json()).then(d => { setAiMusicFest(d); sessionStorage.setItem("ai_music_fest", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMusicFestLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gaming_event");
    if (cached) { try { setAiGamingEvent(JSON.parse(cached)); return; } catch {} }
    setAiGamingEventLoading(true);
    apiRequest("POST", "/api/ai/gaming-event", {}).then(r => r.json()).then(d => { setAiGamingEvent(d); sessionStorage.setItem("ai_gaming_event", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGamingEventLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_prod_hunt");
    if (cached) { try { setAiProdHunt(JSON.parse(cached)); return; } catch {} }
    setAiProdHuntLoading(true);
    apiRequest("POST", "/api/ai/product-hunt", {}).then(r => r.json()).then(d => { setAiProdHunt(d); sessionStorage.setItem("ai_prod_hunt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProdHuntLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_spring_content");
    if (cached) { try { setAiSpringContent(JSON.parse(cached)); return; } catch {} }
    setAiSpringContentLoading(true);
    apiRequest("POST", "/api/ai/spring-content", {}).then(r => r.json()).then(d => { setAiSpringContent(d); sessionStorage.setItem("ai_spring_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSpringContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_autumn_content");
    if (cached) { try { setAiAutumnContent(JSON.parse(cached)); return; } catch {} }
    setAiAutumnContentLoading(true);
    apiRequest("POST", "/api/ai/autumn-content", {}).then(r => r.json()).then(d => { setAiAutumnContent(d); sessionStorage.setItem("ai_autumn_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutumnContentLoading(false));
  }, []);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_script_coach");
    if (cached) { try { setAiScriptCoach(JSON.parse(cached)); return; } catch {} }
    setAiScriptCoachLoading(true);
    apiRequest("POST", "/api/ai/script-coach", {}).then(r => r.json()).then(d => { setAiScriptCoach(d); sessionStorage.setItem("ai_script_coach", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiScriptCoachLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_thumb_ctr_predictor");
    if (cached) { try { setAiThumbCTRPredictor(JSON.parse(cached)); return; } catch {} }
    setAiThumbCTRPredictorLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-ctr-predictor", {}).then(r => r.json()).then(d => { setAiThumbCTRPredictor(d); sessionStorage.setItem("ai_thumb_ctr_predictor", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbCTRPredictorLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_platform_repurposer");
    if (cached) { try { setAiPlatformRepurposer(JSON.parse(cached)); return; } catch {} }
    setAiPlatformRepurposerLoading(true);
    apiRequest("POST", "/api/ai/platform-repurposer", {}).then(r => r.json()).then(d => { setAiPlatformRepurposer(d); sessionStorage.setItem("ai_platform_repurposer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPlatformRepurposerLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_content_decay");
    if (cached) { try { setAiContentDecay(JSON.parse(cached)); return; } catch {} }
    setAiContentDecayLoading(true);
    apiRequest("POST", "/api/ai/content-decay-detector", {}).then(r => r.json()).then(d => { setAiContentDecay(d); sessionStorage.setItem("ai_content_decay", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentDecayLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_title_ab_tester");
    if (cached) { try { setAiTitleABTester(JSON.parse(cached)); return; } catch {} }
    setAiTitleABTesterLoading(true);
    apiRequest("POST", "/api/ai/title-ab-tester", {}).then(r => r.json()).then(d => { setAiTitleABTester(d); sessionStorage.setItem("ai_title_ab_tester", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTitleABTesterLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_desc_optimizer");
    if (cached) { try { setAiDescOptimizer(JSON.parse(cached)); return; } catch {} }
    setAiDescOptimizerLoading(true);
    apiRequest("POST", "/api/ai/description-optimizer", {}).then(r => r.json()).then(d => { setAiDescOptimizer(d); sessionStorage.setItem("ai_desc_optimizer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDescOptimizerLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_content_roadmap");
    if (cached) { try { setAiContentRoadmap(JSON.parse(cached)); return; } catch {} }
    setAiContentRoadmapLoading(true);
    apiRequest("POST", "/api/ai/content-roadmap", {}).then(r => r.json()).then(d => { setAiContentRoadmap(d); sessionStorage.setItem("ai_content_roadmap", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentRoadmapLoading(false));
  }, [showContentQualityAI]);
  useEffect(() => {
    if (!showContentQualityAI) return;
    const cached = sessionStorage.getItem("ai_evergreen_identifier");
    if (cached) { try { setAiEvergreenIdentifier(JSON.parse(cached)); return; } catch {} }
    setAiEvergreenIdentifierLoading(true);
    apiRequest("POST", "/api/ai/evergreen-content-identifier", {}).then(r => r.json()).then(d => { setAiEvergreenIdentifier(d); sessionStorage.setItem("ai_evergreen_identifier", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEvergreenIdentifierLoading(false));
  }, [showContentQualityAI]);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  useEffect(() => {
    const cached = sessionStorage.getItem("aiContentIdeas");
    if (cached) {
      try {
        setAiContentIdeas(JSON.parse(cached));
        return;
      } catch {}
    }
    setAiIdeasLoading(true);
    apiRequest("POST", "/api/ai/content-ideas")
      .then((res) => res.json())
      .then((data) => {
        setAiContentIdeas(data);
        sessionStorage.setItem("aiContentIdeas", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => setAiIdeasLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiKeywordResearch");
    if (cached) {
      try { setKwData(JSON.parse(cached)); return; } catch {}
    }
    setKwLoading(true);
    apiRequest("POST", "/api/ai/keyword-research", { niche: "content creation" })
      .then((res) => res.json())
      .then((data) => {
        setKwData(data);
        sessionStorage.setItem("aiKeywordResearch", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => setKwLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiContentCalendar");
    if (cached) {
      try { setCalData(JSON.parse(cached)); return; } catch {}
    }
    setCalLoading(true);
    apiRequest("POST", "/api/ai/content-calendar", {})
      .then((res) => res.json())
      .then((data) => {
        setCalData(data);
        sessionStorage.setItem("aiContentCalendar", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, []);

  const handleScriptSubmit = async () => {
    if (!scriptTopic.trim()) return;
    setScriptLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/script-writer", { topic: scriptTopic, style: scriptStyle, duration: scriptDuration });
      const data = await res.json();
      setScriptResult(data);
      setScriptExpanded(true);
    } catch {}
    setScriptLoading(false);
  };

  const handleRepurpose = async () => {
    if (!repurposeVideo || !repurposePlatform) return;
    setRepurposeLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/repurpose", { videoTitle: repurposeVideo, platform: repurposePlatform });
      setRepurposeResult(await res.json());
    } catch {}
    setRepurposeLoading(false);
  };

  const handleChapterSubmit = async () => {
    if (!chapterTitle.trim()) return;
    setChapterLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/chapter-markers", { title: chapterTitle, description: chapterDesc });
      setChapterResult(await res.json());
    } catch {}
    setChapterLoading(false);
  };

  const handleSeoAudit = async (video: any) => {
    setSeoVideoId(video.id);
    setSeoLoading(true);
    setSeoResult(null);
    try {
      const res = await apiRequest("POST", "/api/ai/seo-audit", {
        videoTitle: video.title,
        description: video.metadata?.description || "",
        tags: video.metadata?.tags || [],
      });
      setSeoResult(await res.json());
    } catch {}
    setSeoLoading(false);
  };

  const handleThumbnails = async (video: any) => {
    setThumbVideoId(video.id);
    setThumbLoading(true);
    setThumbResult(null);
    try {
      const res = await apiRequest("POST", "/api/ai/thumbnail-concepts", { videoTitle: video.title });
      setThumbResult(await res.json());
    } catch {}
    setThumbLoading(false);
  };

  useEffect(() => {
    if (repurposeVideo && repurposePlatform) handleRepurpose();
  }, [repurposeVideo, repurposePlatform]);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_storyboard");
    if (cached) { try { setAiStoryboard(JSON.parse(cached)); return; } catch {} }
    setAiStoryboardLoading(true);
    apiRequest("POST", "/api/ai/storyboard", {}).then(r => r.json()).then(d => { setAiStoryboard(d); sessionStorage.setItem("ai_storyboard", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStoryboardLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_color_grading");
    if (cached) { try { setAiColorGrading(JSON.parse(cached)); return; } catch {} }
    setAiColorGradingLoading(true);
    apiRequest("POST", "/api/ai/color-grading", {}).then(r => r.json()).then(d => { setAiColorGrading(d); sessionStorage.setItem("ai_color_grading", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiColorGradingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_intro_outro");
    if (cached) { try { setAiIntroOutro(JSON.parse(cached)); return; } catch {} }
    setAiIntroOutroLoading(true);
    apiRequest("POST", "/api/ai/intro-outro", {}).then(r => r.json()).then(d => { setAiIntroOutro(d); sessionStorage.setItem("ai_intro_outro", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiIntroOutroLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sound_effects");
    if (cached) { try { setAiSoundEffects(JSON.parse(cached)); return; } catch {} }
    setAiSoundEffectsLoading(true);
    apiRequest("POST", "/api/ai/sound-effects", {}).then(r => r.json()).then(d => { setAiSoundEffects(d); sessionStorage.setItem("ai_sound_effects", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSoundEffectsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pacing");
    if (cached) { try { setAiPacing(JSON.parse(cached)); return; } catch {} }
    setAiPacingLoading(true);
    apiRequest("POST", "/api/ai/pacing", {}).then(r => r.json()).then(d => { setAiPacing(d); sessionStorage.setItem("ai_pacing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPacingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_talking_points");
    if (cached) { try { setAiTalkingPoints(JSON.parse(cached)); return; } catch {} }
    setAiTalkingPointsLoading(true);
    apiRequest("POST", "/api/ai/talking-points", {}).then(r => r.json()).then(d => { setAiTalkingPoints(d); sessionStorage.setItem("ai_talking_points", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTalkingPointsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_video_length");
    if (cached) { try { setAiVideoLength(JSON.parse(cached)); return; } catch {} }
    setAiVideoLengthLoading(true);
    apiRequest("POST", "/api/ai/video-length", {}).then(r => r.json()).then(d => { setAiVideoLength(d); sessionStorage.setItem("ai_video_length", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVideoLengthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_format");
    if (cached) { try { setAiMultiFormat(JSON.parse(cached)); return; } catch {} }
    setAiMultiFormatLoading(true);
    apiRequest("POST", "/api/ai/multi-format", {}).then(r => r.json()).then(d => { setAiMultiFormat(d); sessionStorage.setItem("ai_multi_format", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMultiFormatLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_watermark");
    if (cached) { try { setAiWatermark(JSON.parse(cached)); return; } catch {} }
    setAiWatermarkLoading(true);
    apiRequest("POST", "/api/ai/watermark", {}).then(r => r.json()).then(d => { setAiWatermark(d); sessionStorage.setItem("ai_watermark", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWatermarkLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_green_screen");
    if (cached) { try { setAiGreenScreen(JSON.parse(cached)); return; } catch {} }
    setAiGreenScreenLoading(true);
    apiRequest("POST", "/api/ai/green-screen", {}).then(r => r.json()).then(d => { setAiGreenScreen(d); sessionStorage.setItem("ai_green_screen", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGreenScreenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_teleprompter");
    if (cached) { try { setAiTeleprompter(JSON.parse(cached)); return; } catch {} }
    setAiTeleprompterLoading(true);
    apiRequest("POST", "/api/ai/teleprompter", {}).then(r => r.json()).then(d => { setAiTeleprompter(d); sessionStorage.setItem("ai_teleprompter", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTeleprompterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_transitions");
    if (cached) { try { setAiTransitions(JSON.parse(cached)); return; } catch {} }
    setAiTransitionsLoading(true);
    apiRequest("POST", "/api/ai/scene-transitions", {}).then(r => r.json()).then(d => { setAiTransitions(d); sessionStorage.setItem("ai_transitions", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTransitionsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_video_quality");
    if (cached) { try { setAiVideoQuality(JSON.parse(cached)); return; } catch {} }
    setAiVideoQualityLoading(true);
    apiRequest("POST", "/api/ai/video-quality", {}).then(r => r.json()).then(d => { setAiVideoQuality(d); sessionStorage.setItem("ai_video_quality", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVideoQualityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_aspect_ratio");
    if (cached) { try { setAiAspectRatio(JSON.parse(cached)); return; } catch {} }
    setAiAspectRatioLoading(true);
    apiRequest("POST", "/api/ai/aspect-ratio", {}).then(r => r.json()).then(d => { setAiAspectRatio(d); sessionStorage.setItem("ai_aspect_ratio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAspectRatioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lower_thirds");
    if (cached) { try { setAiLowerThirds(JSON.parse(cached)); return; } catch {} }
    setAiLowerThirdsLoading(true);
    apiRequest("POST", "/api/ai/lower-thirds", {}).then(r => r.json()).then(d => { setAiLowerThirds(d); sessionStorage.setItem("ai_lower_thirds", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLowerThirdsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cta_overlays");
    if (cached) { try { setAiCtaOverlays(JSON.parse(cached)); return; } catch {} }
    setAiCtaOverlaysLoading(true);
    apiRequest("POST", "/api/ai/cta-overlays", {}).then(r => r.json()).then(d => { setAiCtaOverlays(d); sessionStorage.setItem("ai_cta_overlays", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCtaOverlaysLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_split_screen");
    if (cached) { try { setAiSplitScreen(JSON.parse(cached)); return; } catch {} }
    setAiSplitScreenLoading(true);
    apiRequest("POST", "/api/ai/split-screen", {}).then(r => r.json()).then(d => { setAiSplitScreen(d); sessionStorage.setItem("ai_split_screen", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSplitScreenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_time_lapse");
    if (cached) { try { setAiTimeLapse(JSON.parse(cached)); return; } catch {} }
    setAiTimeLapseLoading(true);
    apiRequest("POST", "/api/ai/time-lapse", {}).then(r => r.json()).then(d => { setAiTimeLapse(d); sessionStorage.setItem("ai_time_lapse", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTimeLapseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_footage_org");
    if (cached) { try { setAiFootageOrg(JSON.parse(cached)); return; } catch {} }
    setAiFootageOrgLoading(true);
    apiRequest("POST", "/api/ai/footage-organizer", {}).then(r => r.json()).then(d => { setAiFootageOrg(d); sessionStorage.setItem("ai_footage_org", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFootageOrgLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_leveling");
    if (cached) { try { setAiAudioLeveling(JSON.parse(cached)); return; } catch {} }
    setAiAudioLevelingLoading(true);
    apiRequest("POST", "/api/ai/audio-leveling", {}).then(r => r.json()).then(d => { setAiAudioLeveling(d); sessionStorage.setItem("ai_audio_leveling", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAudioLevelingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_noise_detector");
    if (cached) { try { setAiNoiseDetector(JSON.parse(cached)); return; } catch {} }
    setAiNoiseDetectorLoading(true);
    apiRequest("POST", "/api/ai/noise-detector", {}).then(r => r.json()).then(d => { setAiNoiseDetector(d); sessionStorage.setItem("ai_noise_detector", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNoiseDetectorLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_jump_cuts");
    if (cached) { try { setAiJumpCuts(JSON.parse(cached)); return; } catch {} }
    setAiJumpCutsLoading(true);
    apiRequest("POST", "/api/ai/jump-cuts", {}).then(r => r.json()).then(d => { setAiJumpCuts(d); sessionStorage.setItem("ai_jump_cuts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiJumpCutsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cinematic_shots");
    if (cached) { try { setAiCinematicShots(JSON.parse(cached)); return; } catch {} }
    setAiCinematicShotsLoading(true);
    apiRequest("POST", "/api/ai/cinematic-shots", {}).then(r => r.json()).then(d => { setAiCinematicShots(d); sessionStorage.setItem("ai_cinematic_shots", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCinematicShotsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_compression");
    if (cached) { try { setAiCompression(JSON.parse(cached)); return; } catch {} }
    setAiCompressionLoading(true);
    apiRequest("POST", "/api/ai/compression", {}).then(r => r.json()).then(d => { setAiCompression(d); sessionStorage.setItem("ai_compression", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompressionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_ab");
    if (cached) { try { setAiThumbAB(JSON.parse(cached)); return; } catch {} }
    setAiThumbABLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-ab", {}).then(r => r.json()).then(d => { setAiThumbAB(d); sessionStorage.setItem("ai_thumb_ab", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbABLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_ctr");
    if (cached) { try { setAiThumbCTR(JSON.parse(cached)); return; } catch {} }
    setAiThumbCTRLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-ctr", {}).then(r => r.json()).then(d => { setAiThumbCTR(d); sessionStorage.setItem("ai_thumb_ctr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbCTRLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_styles");
    if (cached) { try { setAiThumbStyles(JSON.parse(cached)); return; } catch {} }
    setAiThumbStylesLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-styles", {}).then(r => r.json()).then(d => { setAiThumbStyles(d); sessionStorage.setItem("ai_thumb_styles", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbStylesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_face_expr");
    if (cached) { try { setAiFaceExpr(JSON.parse(cached)); return; } catch {} }
    setAiFaceExprLoading(true);
    apiRequest("POST", "/api/ai/face-expressions", {}).then(r => r.json()).then(d => { setAiFaceExpr(d); sessionStorage.setItem("ai_face_expr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFaceExprLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_text");
    if (cached) { try { setAiThumbText(JSON.parse(cached)); return; } catch {} }
    setAiThumbTextLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-text", {}).then(r => r.json()).then(d => { setAiThumbText(d); sessionStorage.setItem("ai_thumb_text", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbTextLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_color_psych");
    if (cached) { try { setAiColorPsych(JSON.parse(cached)); return; } catch {} }
    setAiColorPsychLoading(true);
    apiRequest("POST", "/api/ai/color-psychology", {}).then(r => r.json()).then(d => { setAiColorPsych(d); sessionStorage.setItem("ai_color_psych", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiColorPsychLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_banner");
    if (cached) { try { setAiBanner(JSON.parse(cached)); return; } catch {} }
    setAiBannerLoading(true);
    apiRequest("POST", "/api/ai/banner", {}).then(r => r.json()).then(d => { setAiBanner(d); sessionStorage.setItem("ai_banner", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBannerLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_social_covers");
    if (cached) { try { setAiSocialCovers(JSON.parse(cached)); return; } catch {} }
    setAiSocialCoversLoading(true);
    apiRequest("POST", "/api/ai/social-covers", {}).then(r => r.json()).then(d => { setAiSocialCovers(d); sessionStorage.setItem("ai_social_covers", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSocialCoversLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_animated_thumb");
    if (cached) { try { setAiAnimatedThumb(JSON.parse(cached)); return; } catch {} }
    setAiAnimatedThumbLoading(true);
    apiRequest("POST", "/api/ai/animated-thumbnails", {}).then(r => r.json()).then(d => { setAiAnimatedThumb(d); sessionStorage.setItem("ai_animated_thumb", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAnimatedThumbLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_thumb_competitors");
    if (cached) { try { setAiThumbCompetitors(JSON.parse(cached)); return; } catch {} }
    setAiThumbCompetitorsLoading(true);
    apiRequest("POST", "/api/ai/thumbnail-competitors", {}).then(r => r.json()).then(d => { setAiThumbCompetitors(d); sessionStorage.setItem("ai_thumb_competitors", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiThumbCompetitorsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_watermark");
    if (cached) { try { setAiBrandWatermark(JSON.parse(cached)); return; } catch {} }
    setAiBrandWatermarkLoading(true);
    apiRequest("POST", "/api/ai/brand-watermark", {}).then(r => r.json()).then(d => { setAiBrandWatermark(d); sessionStorage.setItem("ai_brand_watermark", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandWatermarkLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sticker_pack");
    if (cached) { try { setAiStickerPack(JSON.parse(cached)); return; } catch {} }
    setAiStickerPackLoading(true);
    apiRequest("POST", "/api/ai/emoji-stickers", {}).then(r => r.json()).then(d => { setAiStickerPack(d); sessionStorage.setItem("ai_sticker_pack", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStickerPackLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infographic");
    if (cached) { try { setAiInfographic(JSON.parse(cached)); return; } catch {} }
    setAiInfographicLoading(true);
    apiRequest("POST", "/api/ai/infographic", {}).then(r => r.json()).then(d => { setAiInfographic(d); sessionStorage.setItem("ai_infographic", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInfographicLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meme_templates");
    if (cached) { try { setAiMemeTemplates(JSON.parse(cached)); return; } catch {} }
    setAiMemeTemplatesLoading(true);
    apiRequest("POST", "/api/ai/meme-templates", {}).then(r => r.json()).then(d => { setAiMemeTemplates(d); sessionStorage.setItem("ai_meme_templates", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMemeTemplatesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_visual_score");
    if (cached) { try { setAiVisualScore(JSON.parse(cached)); return; } catch {} }
    setAiVisualScoreLoading(true);
    apiRequest("POST", "/api/ai/visual-consistency", {}).then(r => r.json()).then(d => { setAiVisualScore(d); sessionStorage.setItem("ai_visual_score", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVisualScoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_clone");
    if (cached) { try { setAiVoiceClone(JSON.parse(cached)); return; } catch {} }
    setAiVoiceCloneLoading(true);
    apiRequest("POST", "/api/ai/voice-clone", {}).then(r => r.json()).then(d => { setAiVoiceClone(d); sessionStorage.setItem("ai_voice_clone", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVoiceCloneLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hooks");
    if (cached) { try { setAiHooks(JSON.parse(cached)); return; } catch {} }
    setAiHooksLoading(true);
    apiRequest("POST", "/api/ai/hooks", {}).then(r => r.json()).then(d => { setAiHooks(d); sessionStorage.setItem("ai_hooks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHooksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_title_split");
    if (cached) { try { setAiTitleSplit(JSON.parse(cached)); return; } catch {} }
    setAiTitleSplitLoading(true);
    apiRequest("POST", "/api/ai/title-split-test", {}).then(r => r.json()).then(d => { setAiTitleSplit(d); sessionStorage.setItem("ai_title_split", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTitleSplitLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_title_emotion");
    if (cached) { try { setAiTitleEmotion(JSON.parse(cached)); return; } catch {} }
    setAiTitleEmotionLoading(true);
    apiRequest("POST", "/api/ai/title-emotion", {}).then(r => r.json()).then(d => { setAiTitleEmotion(d); sessionStorage.setItem("ai_title_emotion", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTitleEmotionLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_clickbait");
    if (cached) { try { setAiClickbait(JSON.parse(cached)); return; } catch {} }
    setAiClickbaitLoading(true);
    apiRequest("POST", "/api/ai/clickbait-detect", {}).then(r => r.json()).then(d => { setAiClickbait(d); sessionStorage.setItem("ai_clickbait", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiClickbaitLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_desc_templates");
    if (cached) { try { setAiDescTemplates(JSON.parse(cached)); return; } catch {} }
    setAiDescTemplatesLoading(true);
    apiRequest("POST", "/api/ai/description-templates", {}).then(r => r.json()).then(d => { setAiDescTemplates(d); sessionStorage.setItem("ai_desc_templates", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDescTemplatesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_end_screen_cta");
    if (cached) { try { setAiEndScreenCTA(JSON.parse(cached)); return; } catch {} }
    setAiEndScreenCTALoading(true);
    apiRequest("POST", "/api/ai/end-screen-cta", {}).then(r => r.json()).then(d => { setAiEndScreenCTA(d); sessionStorage.setItem("ai_end_screen_cta", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEndScreenCTALoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pinned_comments");
    if (cached) { try { setAiPinnedComment(JSON.parse(cached)); return; } catch {} }
    setAiPinnedCommentLoading(true);
    apiRequest("POST", "/api/ai/pinned-comments", {}).then(r => r.json()).then(d => { setAiPinnedComment(d); sessionStorage.setItem("ai_pinned_comments", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPinnedCommentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_community_posts");
    if (cached) { try { setAiCommunityPosts(JSON.parse(cached)); return; } catch {} }
    setAiCommunityPostsLoading(true);
    apiRequest("POST", "/api/ai/community-posts", {}).then(r => r.json()).then(d => { setAiCommunityPosts(d); sessionStorage.setItem("ai_community_posts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCommunityPostsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_email_subjects");
    if (cached) { try { setAiEmailSubjects(JSON.parse(cached)); return; } catch {} }
    setAiEmailSubjectsLoading(true);
    apiRequest("POST", "/api/ai/email-subjects", {}).then(r => r.json()).then(d => { setAiEmailSubjects(d); sessionStorage.setItem("ai_email_subjects", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEmailSubjectsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_bio_writer");
    if (cached) { try { setAiBioWriterData(JSON.parse(cached)); return; } catch {} }
    setAiBioWriterDataLoading(true);
    apiRequest("POST", "/api/ai/bio-writer", {}).then(r => r.json()).then(d => { setAiBioWriterData(d); sessionStorage.setItem("ai_bio_writer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBioWriterDataLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_video_tags");
    if (cached) { try { setAiVideoTags(JSON.parse(cached)); return; } catch {} }
    setAiVideoTagsLoading(true);
    apiRequest("POST", "/api/ai/video-tags", {}).then(r => r.json()).then(d => { setAiVideoTags(d); sessionStorage.setItem("ai_video_tags", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVideoTagsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_hashtags2");
    if (cached) { try { setAiHashtags(JSON.parse(cached)); return; } catch {} }
    setAiHashtagsLoading(true);
    apiRequest("POST", "/api/ai/hashtag-optimizer", {}).then(r => r.json()).then(d => { setAiHashtags(d); sessionStorage.setItem("ai_hashtags2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiHashtagsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_playlist_writer");
    if (cached) { try { setAiPlaylist(JSON.parse(cached)); return; } catch {} }
    setAiPlaylistLoading(true);
    apiRequest("POST", "/api/ai/playlist-writer", {}).then(r => r.json()).then(d => { setAiPlaylist(d); sessionStorage.setItem("ai_playlist_writer", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPlaylistLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_press_release");
    if (cached) { try { setAiPressRelease(JSON.parse(cached)); return; } catch {} }
    setAiPressReleaseLoading(true);
    apiRequest("POST", "/api/ai/press-release", {}).then(r => r.json()).then(d => { setAiPressRelease(d); sessionStorage.setItem("ai_press_release", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPressReleaseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_testimonial");
    if (cached) { try { setAiTestimonial(JSON.parse(cached)); return; } catch {} }
    setAiTestimonialLoading(true);
    apiRequest("POST", "/api/ai/testimonial-drafter", {}).then(r => r.json()).then(d => { setAiTestimonial(d); sessionStorage.setItem("ai_testimonial", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTestimonialLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tag_cloud");
    if (cached) { try { setAiTagCloud(JSON.parse(cached)); return; } catch {} }
    setAiTagCloudLoading(true);
    apiRequest("POST", "/api/ai/tag-cloud", {}).then(r => r.json()).then(d => { setAiTagCloud(d); sessionStorage.setItem("ai_tag_cloud", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTagCloudLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_search_intent");
    if (cached) { try { setAiSearchIntent(JSON.parse(cached)); return; } catch {} }
    setAiSearchIntentLoading(true);
    apiRequest("POST", "/api/ai/search-intent", {}).then(r => r.json()).then(d => { setAiSearchIntent(d); sessionStorage.setItem("ai_search_intent", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSearchIntentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_algorithm");
    if (cached) { try { setAiAlgorithm(JSON.parse(cached)); return; } catch {} }
    setAiAlgorithmLoading(true);
    apiRequest("POST", "/api/ai/algorithm-decoder", {}).then(r => r.json()).then(d => { setAiAlgorithm(d); sessionStorage.setItem("ai_algorithm", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAlgorithmLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_featured_snippets");
    if (cached) { try { setAiFeaturedSnippet(JSON.parse(cached)); return; } catch {} }
    setAiFeaturedSnippetLoading(true);
    apiRequest("POST", "/api/ai/featured-snippets", {}).then(r => r.json()).then(d => { setAiFeaturedSnippet(d); sessionStorage.setItem("ai_featured_snippets", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFeaturedSnippetLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cross_seo");
    if (cached) { try { setAiCrossSEO(JSON.parse(cached)); return; } catch {} }
    setAiCrossSEOLoading(true);
    apiRequest("POST", "/api/ai/cross-platform-seo", {}).then(r => r.json()).then(d => { setAiCrossSEO(d); sessionStorage.setItem("ai_cross_seo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrossSEOLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_backlinks");
    if (cached) { try { setAiBacklinks(JSON.parse(cached)); return; } catch {} }
    setAiBacklinksLoading(true);
    apiRequest("POST", "/api/ai/backlinks", {}).then(r => r.json()).then(d => { setAiBacklinks(d); sessionStorage.setItem("ai_backlinks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBacklinksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_freshness");
    if (cached) { try { setAiFreshness(JSON.parse(cached)); return; } catch {} }
    setAiFreshnessLoading(true);
    apiRequest("POST", "/api/ai/content-freshness", {}).then(r => r.json()).then(d => { setAiFreshness(d); sessionStorage.setItem("ai_freshness", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFreshnessLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cannibalization");
    if (cached) { try { setAiCannibalization(JSON.parse(cached)); return; } catch {} }
    setAiCannibalizationLoading(true);
    apiRequest("POST", "/api/ai/keyword-cannibalization", {}).then(r => r.json()).then(d => { setAiCannibalization(d); sessionStorage.setItem("ai_cannibalization", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCannibalizationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_long_tail");
    if (cached) { try { setAiLongTail(JSON.parse(cached)); return; } catch {} }
    setAiLongTailLoading(true);
    apiRequest("POST", "/api/ai/long-tail-keywords", {}).then(r => r.json()).then(d => { setAiLongTail(d); sessionStorage.setItem("ai_long_tail", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLongTailLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sitemap");
    if (cached) { try { setAiSitemap(JSON.parse(cached)); return; } catch {} }
    setAiSitemapLoading(true);
    apiRequest("POST", "/api/ai/video-sitemap", {}).then(r => r.json()).then(d => { setAiSitemap(d); sessionStorage.setItem("ai_sitemap", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSitemapLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rich_snippets");
    if (cached) { try { setAiRichSnippets(JSON.parse(cached)); return; } catch {} }
    setAiRichSnippetsLoading(true);
    apiRequest("POST", "/api/ai/rich-snippets", {}).then(r => r.json()).then(d => { setAiRichSnippets(d); sessionStorage.setItem("ai_rich_snippets", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRichSnippetsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_search");
    if (cached) { try { setAiVoiceSearch(JSON.parse(cached)); return; } catch {} }
    setAiVoiceSearchLoading(true);
    apiRequest("POST", "/api/ai/voice-search", {}).then(r => r.json()).then(d => { setAiVoiceSearch(d); sessionStorage.setItem("ai_voice_search", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVoiceSearchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_autocomplete");
    if (cached) { try { setAiAutocomplete(JSON.parse(cached)); return; } catch {} }
    setAiAutocompleteLoading(true);
    apiRequest("POST", "/api/ai/autocomplete", {}).then(r => r.json()).then(d => { setAiAutocomplete(d); sessionStorage.setItem("ai_autocomplete", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAutocompleteLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_google_trends");
    if (cached) { try { setAiGoogleTrends(JSON.parse(cached)); return; } catch {} }
    setAiGoogleTrendsLoading(true);
    apiRequest("POST", "/api/ai/google-trends", {}).then(r => r.json()).then(d => { setAiGoogleTrends(d); sessionStorage.setItem("ai_google_trends", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGoogleTrendsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_keywords");
    if (cached) { try { setAiCompKeywords(JSON.parse(cached)); return; } catch {} }
    setAiCompKeywordsLoading(true);
    apiRequest("POST", "/api/ai/competitor-keywords", {}).then(r => r.json()).then(d => { setAiCompKeywords(d); sessionStorage.setItem("ai_comp_keywords", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCompKeywordsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_search_ranking");
    if (cached) { try { setAiSearchRanking(JSON.parse(cached)); return; } catch {} }
    setAiSearchRankingLoading(true);
    apiRequest("POST", "/api/ai/search-rankings", {}).then(r => r.json()).then(d => { setAiSearchRanking(d); sessionStorage.setItem("ai_search_ranking", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSearchRankingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ctr_bench");
    if (cached) { try { setAiCTRBench(JSON.parse(cached)); return; } catch {} }
    setAiCTRBenchLoading(true);
    apiRequest("POST", "/api/ai/ctr-benchmark", {}).then(r => r.json()).then(d => { setAiCTRBench(d); sessionStorage.setItem("ai_ctr_bench", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCTRBenchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_impressions");
    if (cached) { try { setAiImpressions(JSON.parse(cached)); return; } catch {} }
    setAiImpressionsLoading(true);
    apiRequest("POST", "/api/ai/impression-analysis", {}).then(r => r.json()).then(d => { setAiImpressions(d); sessionStorage.setItem("ai_impressions", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiImpressionsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_related_vids");
    if (cached) { try { setAiRelatedVids(JSON.parse(cached)); return; } catch {} }
    setAiRelatedVidsLoading(true);
    apiRequest("POST", "/api/ai/related-videos", {}).then(r => r.json()).then(d => { setAiRelatedVids(d); sessionStorage.setItem("ai_related_vids", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRelatedVidsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_browse_features");
    if (cached) { try { setAiBrowseFeatures(JSON.parse(cached)); return; } catch {} }
    setAiBrowseFeaturesLoading(true);
    apiRequest("POST", "/api/ai/browse-features", {}).then(r => r.json()).then(d => { setAiBrowseFeatures(d); sessionStorage.setItem("ai_browse_features", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrowseFeaturesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pillars");
    if (cached) { try { setAiPillars(JSON.parse(cached)); return; } catch {} }
    setAiPillarsLoading(true);
    apiRequest("POST", "/api/ai/content-pillars", {}).then(r => r.json()).then(d => { setAiPillars(d); sessionStorage.setItem("ai_pillars", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPillarsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_series");
    if (cached) { try { setAiSeriesData(JSON.parse(cached)); return; } catch {} }
    setAiSeriesDataLoading(true);
    apiRequest("POST", "/api/ai/series-builder", {}).then(r => r.json()).then(d => { setAiSeriesData(d); sessionStorage.setItem("ai_series", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSeriesDataLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_repurpose_matrix");
    if (cached) { try { setAiRepurposeMatrix(JSON.parse(cached)); return; } catch {} }
    setAiRepurposeMatrixLoading(true);
    apiRequest("POST", "/api/ai/repurpose-matrix", {}).then(r => r.json()).then(d => { setAiRepurposeMatrix(d); sessionStorage.setItem("ai_repurpose_matrix", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRepurposeMatrixLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_viral_score");
    if (cached) { try { setAiViralScore(JSON.parse(cached)); return; } catch {} }
    setAiViralScoreLoading(true);
    apiRequest("POST", "/api/ai/viral-score", {}).then(r => r.json()).then(d => { setAiViralScore(d); sessionStorage.setItem("ai_viral_score", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiViralScoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_gaps");
    if (cached) { try { setAiContentGaps(JSON.parse(cached)); return; } catch {} }
    setAiContentGapsLoading(true);
    apiRequest("POST", "/api/ai/content-gaps", {}).then(r => r.json()).then(d => { setAiContentGaps(d); sessionStorage.setItem("ai_content_gaps", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentGapsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_trend_surf");
    if (cached) { try { setAiTrendSurf(JSON.parse(cached)); return; } catch {} }
    setAiTrendSurfLoading(true);
    apiRequest("POST", "/api/ai/trend-surfer", {}).then(r => r.json()).then(d => { setAiTrendSurf(d); sessionStorage.setItem("ai_trend_surf", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTrendSurfLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_evergreen");
    if (cached) { try { setAiEvergreen(JSON.parse(cached)); return; } catch {} }
    setAiEvergreenLoading(true);
    apiRequest("POST", "/api/ai/evergreen", {}).then(r => r.json()).then(d => { setAiEvergreen(d); sessionStorage.setItem("ai_evergreen", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEvergreenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_content_mix");
    if (cached) { try { setAiContentMix(JSON.parse(cached)); return; } catch {} }
    setAiContentMixLoading(true);
    apiRequest("POST", "/api/ai/content-mix", {}).then(r => r.json()).then(d => { setAiContentMix(d); sessionStorage.setItem("ai_content_mix", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContentMixLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_seasonal");
    if (cached) { try { setAiSeasonalPlan(JSON.parse(cached)); return; } catch {} }
    setAiSeasonalPlanLoading(true);
    apiRequest("POST", "/api/ai/seasonal-content", {}).then(r => r.json()).then(d => { setAiSeasonalPlan(d); sessionStorage.setItem("ai_seasonal", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSeasonalPlanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_content");
    if (cached) { try { setAiCollabContent(JSON.parse(cached)); return; } catch {} }
    setAiCollabContentLoading(true);
    apiRequest("POST", "/api/ai/collab-content", {}).then(r => r.json()).then(d => { setAiCollabContent(d); sessionStorage.setItem("ai_collab_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCollabContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_bts");
    if (cached) { try { setAiBTSPlan(JSON.parse(cached)); return; } catch {} }
    setAiBTSPlanLoading(true);
    apiRequest("POST", "/api/ai/bts-planner", {}).then(r => r.json()).then(d => { setAiBTSPlan(d); sessionStorage.setItem("ai_bts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBTSPlanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_reaction");
    if (cached) { try { setAiReactionContent(JSON.parse(cached)); return; } catch {} }
    setAiReactionContentLoading(true);
    apiRequest("POST", "/api/ai/reaction-content", {}).then(r => r.json()).then(d => { setAiReactionContent(d); sessionStorage.setItem("ai_reaction", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiReactionContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_challenge");
    if (cached) { try { setAiChallenge(JSON.parse(cached)); return; } catch {} }
    setAiChallengeLoading(true);
    apiRequest("POST", "/api/ai/challenge-creator", {}).then(r => r.json()).then(d => { setAiChallenge(d); sessionStorage.setItem("ai_challenge", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiChallengeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_qna");
    if (cached) { try { setAiQnAPlan(JSON.parse(cached)); return; } catch {} }
    setAiQnAPlanLoading(true);
    apiRequest("POST", "/api/ai/qna-planner", {}).then(r => r.json()).then(d => { setAiQnAPlan(d); sessionStorage.setItem("ai_qna", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiQnAPlanLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tutorial");
    if (cached) { try { setAiTutorial(JSON.parse(cached)); return; } catch {} }
    setAiTutorialLoading(true);
    apiRequest("POST", "/api/ai/tutorial-structure", {}).then(r => r.json()).then(d => { setAiTutorial(d); sessionStorage.setItem("ai_tutorial", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTutorialLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_documentary");
    if (cached) { try { setAiDocumentary(JSON.parse(cached)); return; } catch {} }
    setAiDocumentaryLoading(true);
    apiRequest("POST", "/api/ai/documentary-planner", {}).then(r => r.json()).then(d => { setAiDocumentary(d); sessionStorage.setItem("ai_documentary", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDocumentaryLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_short_form");
    if (cached) { try { setAiShortForm(JSON.parse(cached)); return; } catch {} }
    setAiShortFormLoading(true);
    apiRequest("POST", "/api/ai/short-form-strategy", {}).then(r => r.json()).then(d => { setAiShortForm(d); sessionStorage.setItem("ai_short_form", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortFormLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_ideas");
    if (cached) { try { setAiShortsIdeas(JSON.parse(cached)); return; } catch {} }
    setAiShortsIdeasLoading(true);
    apiRequest("POST", "/api/ai/shorts-ideas", {}).then(r => r.json()).then(d => { setAiShortsIdeas(d); sessionStorage.setItem("ai_shorts_ideas", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsIdeasLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_to_long");
    if (cached) { try { setAiShortsToLong(JSON.parse(cached)); return; } catch {} }
    setAiShortsToLongLoading(true);
    apiRequest("POST", "/api/ai/shorts-to-long", {}).then(r => r.json()).then(d => { setAiShortsToLong(d); sessionStorage.setItem("ai_shorts_to_long", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsToLongLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_long_to_shorts");
    if (cached) { try { setAiLongToShorts(JSON.parse(cached)); return; } catch {} }
    setAiLongToShortsLoading(true);
    apiRequest("POST", "/api/ai/long-to-shorts", {}).then(r => r.json()).then(d => { setAiLongToShorts(d); sessionStorage.setItem("ai_long_to_shorts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLongToShortsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vertical");
    if (cached) { try { setAiVerticalVid(JSON.parse(cached)); return; } catch {} }
    setAiVerticalVidLoading(true);
    apiRequest("POST", "/api/ai/vertical-video", {}).then(r => r.json()).then(d => { setAiVerticalVid(d); sessionStorage.setItem("ai_vertical", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVerticalVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_audio");
    if (cached) { try { setAiShortsAudio(JSON.parse(cached)); return; } catch {} }
    setAiShortsAudioLoading(true);
    apiRequest("POST", "/api/ai/shorts-audio", {}).then(r => r.json()).then(d => { setAiShortsAudio(d); sessionStorage.setItem("ai_shorts_audio", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsAudioLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_captions");
    if (cached) { try { setAiShortsCaptions(JSON.parse(cached)); return; } catch {} }
    setAiShortsCaptionsLoading(true);
    apiRequest("POST", "/api/ai/shorts-captions", {}).then(r => r.json()).then(d => { setAiShortsCaptions(d); sessionStorage.setItem("ai_shorts_captions", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsCaptionsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_hooks");
    if (cached) { try { setAiShortsHooks(JSON.parse(cached)); return; } catch {} }
    setAiShortsHooksLoading(true);
    apiRequest("POST", "/api/ai/shorts-hooks", {}).then(r => r.json()).then(d => { setAiShortsHooks(d); sessionStorage.setItem("ai_shorts_hooks", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsHooksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_duet_stitch");
    if (cached) { try { setAiDuetStitch(JSON.parse(cached)); return; } catch {} }
    setAiDuetStitchLoading(true);
    apiRequest("POST", "/api/ai/duet-stitch", {}).then(r => r.json()).then(d => { setAiDuetStitch(d); sessionStorage.setItem("ai_duet_stitch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDuetStitchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_analytics");
    if (cached) { try { setAiShortsAnalytics(JSON.parse(cached)); return; } catch {} }
    setAiShortsAnalyticsLoading(true);
    apiRequest("POST", "/api/ai/shorts-analytics", {}).then(r => r.json()).then(d => { setAiShortsAnalytics(d); sessionStorage.setItem("ai_shorts_analytics", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsAnalyticsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_batch");
    if (cached) { try { setAiShortsBatch(JSON.parse(cached)); return; } catch {} }
    setAiShortsBatchLoading(true);
    apiRequest("POST", "/api/ai/shorts-batch", {}).then(r => r.json()).then(d => { setAiShortsBatch(d); sessionStorage.setItem("ai_shorts_batch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsBatchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_remix");
    if (cached) { try { setAiShortsRemix(JSON.parse(cached)); return; } catch {} }
    setAiShortsRemixLoading(true);
    apiRequest("POST", "/api/ai/shorts-remix", {}).then(r => r.json()).then(d => { setAiShortsRemix(d); sessionStorage.setItem("ai_shorts_remix", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsRemixLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shorts_money");
    if (cached) { try { setAiShortsMoney(JSON.parse(cached)); return; } catch {} }
    setAiShortsMoneyLoading(true);
    apiRequest("POST", "/api/ai/shorts-monetization", {}).then(r => r.json()).then(d => { setAiShortsMoney(d); sessionStorage.setItem("ai_shorts_money", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShortsMoneyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audit");
    if (cached) { try { setAiAudit(JSON.parse(cached)); return; } catch {} }
    setAiAuditLoading(true);
    apiRequest("POST", "/api/ai/content-audit", {}).then(r => r.json()).then(d => { setAiAudit(d); sessionStorage.setItem("ai_audit", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAuditLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_velocity");
    if (cached) { try { setAiVelocity(JSON.parse(cached)); return; } catch {} }
    setAiVelocityLoading(true);
    apiRequest("POST", "/api/ai/content-velocity", {}).then(r => r.json()).then(d => { setAiVelocity(d); sessionStorage.setItem("ai_velocity", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVelocityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_niche");
    if (cached) { try { setAiNiche(JSON.parse(cached)); return; } catch {} }
    setAiNicheLoading(true);
    apiRequest("POST", "/api/ai/niche-research", {}).then(r => r.json()).then(d => { setAiNiche(d); sessionStorage.setItem("ai_niche", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNicheLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_captions");
    if (cached) { try { setAiCaptions(JSON.parse(cached)); return; } catch {} }
    setAiCaptionsLoading(true);
    apiRequest("POST", "/api/ai/caption-generator", {}).then(r => r.json()).then(d => { setAiCaptions(d); sessionStorage.setItem("ai_captions", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCaptionsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_caption_style");
    if (cached) { try { setAiCaptionStyle(JSON.parse(cached)); return; } catch {} }
    setAiCaptionStyleLoading(true);
    apiRequest("POST", "/api/ai/caption-styler", {}).then(r => r.json()).then(d => { setAiCaptionStyle(d); sessionStorage.setItem("ai_caption_style", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCaptionStyleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_subtitles");
    if (cached) { try { setAiSubtitles(JSON.parse(cached)); return; } catch {} }
    setAiSubtitlesLoading(true);
    apiRequest("POST", "/api/ai/subtitle-translator", {}).then(r => r.json()).then(d => { setAiSubtitles(d); sessionStorage.setItem("ai_subtitles", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubtitlesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_lang_seo");
    if (cached) { try { setAiMultiLangSEO(JSON.parse(cached)); return; } catch {} }
    setAiMultiLangSEOLoading(true);
    apiRequest("POST", "/api/ai/multi-language-seo", {}).then(r => r.json()).then(d => { setAiMultiLangSEO(d); sessionStorage.setItem("ai_multi_lang_seo", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMultiLangSEOLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_localization");
    if (cached) { try { setAiLocalization(JSON.parse(cached)); return; } catch {} }
    setAiLocalizationLoading(true);
    apiRequest("POST", "/api/ai/localization", {}).then(r => r.json()).then(d => { setAiLocalization(d); sessionStorage.setItem("ai_localization", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLocalizationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dubbing");
    if (cached) { try { setAiDubbing(JSON.parse(cached)); return; } catch {} }
    setAiDubbingLoading(true);
    apiRequest("POST", "/api/ai/dubbing", {}).then(r => r.json()).then(d => { setAiDubbing(d); sessionStorage.setItem("ai_dubbing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDubbingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_transcript");
    if (cached) { try { setAiTranscript(JSON.parse(cached)); return; } catch {} }
    setAiTranscriptLoading(true);
    apiRequest("POST", "/api/ai/transcript", {}).then(r => r.json()).then(d => { setAiTranscript(d); sessionStorage.setItem("ai_transcript", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTranscriptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_caption_comp");
    if (cached) { try { setAiCaptionComp(JSON.parse(cached)); return; } catch {} }
    setAiCaptionCompLoading(true);
    apiRequest("POST", "/api/ai/caption-compliance", {}).then(r => r.json()).then(d => { setAiCaptionComp(d); sessionStorage.setItem("ai_caption_comp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCaptionCompLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_audio_desc");
    if (cached) { try { setAiAudioDesc(JSON.parse(cached)); return; } catch {} }
    setAiAudioDescLoading(true);
    apiRequest("POST", "/api/ai/audio-description", {}).then(r => r.json()).then(d => { setAiAudioDesc(d); sessionStorage.setItem("ai_audio_desc", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAudioDescLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lang_priority");
    if (cached) { try { setAiLangPriority(JSON.parse(cached)); return; } catch {} }
    setAiLangPriorityLoading(true);
    apiRequest("POST", "/api/ai/language-priority", {}).then(r => r.json()).then(d => { setAiLangPriority(d); sessionStorage.setItem("ai_lang_priority", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLangPriorityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_podcast_launch");
    if (cached) { try { setAiPodcastLaunch(JSON.parse(cached)); return; } catch {} }
    setAiPodcastLaunchLoading(true);
    apiRequest("POST", "/api/ai/podcast-launch", {}).then(r => r.json()).then(d => { setAiPodcastLaunch(d); sessionStorage.setItem("ai_podcast_launch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodcastLaunchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_podcast_ep");
    if (cached) { try { setAiPodcastEp(JSON.parse(cached)); return; } catch {} }
    setAiPodcastEpLoading(true);
    apiRequest("POST", "/api/ai/podcast-episode", {}).then(r => r.json()).then(d => { setAiPodcastEp(d); sessionStorage.setItem("ai_podcast_ep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodcastEpLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_podcast_seo2");
    if (cached) { try { setAiPodcastSEO(JSON.parse(cached)); return; } catch {} }
    setAiPodcastSEOLoading(true);
    apiRequest("POST", "/api/ai/podcast-seo", {}).then(r => r.json()).then(d => { setAiPodcastSEO(d); sessionStorage.setItem("ai_podcast_seo2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPodcastSEOLoading(false));
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
    const cached = sessionStorage.getItem("ai_acc_text");
    if (cached) { try { setAiAccText(JSON.parse(cached)); return; } catch {} }
    setAiAccTextLoading(true);
    apiRequest("POST", "/api/ai/accessibility-text", {}).then(r => r.json()).then(d => { setAiAccText(d); sessionStorage.setItem("ai_acc_text", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAccTextLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_alt_text");
    if (cached) { try { setAiAltText(JSON.parse(cached)); return; } catch {} }
    setAiAltTextLoading(true);
    apiRequest("POST", "/api/ai/alt-text", {}).then(r => r.json()).then(d => { setAiAltText(d); sessionStorage.setItem("ai_alt_text", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAltTextLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contrast");
    if (cached) { try { setAiContrast(JSON.parse(cached)); return; } catch {} }
    setAiContrastLoading(true);
    apiRequest("POST", "/api/ai/color-contrast", {}).then(r => r.json()).then(d => { setAiContrast(d); sessionStorage.setItem("ai_contrast", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContrastLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_screen_read");
    if (cached) { try { setAiScreenRead(JSON.parse(cached)); return; } catch {} }
    setAiScreenReadLoading(true);
    apiRequest("POST", "/api/ai/screen-reader", {}).then(r => r.json()).then(d => { setAiScreenRead(d); sessionStorage.setItem("ai_screen_read", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiScreenReadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_kbd_nav");
    if (cached) { try { setAiKbdNav(JSON.parse(cached)); return; } catch {} }
    setAiKbdNavLoading(true);
    apiRequest("POST", "/api/ai/keyboard-nav", {}).then(r => r.json()).then(d => { setAiKbdNav(d); sessionStorage.setItem("ai_kbd_nav", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiKbdNavLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cap_quality");
    if (cached) { try { setAiCapQuality(JSON.parse(cached)); return; } catch {} }
    setAiCapQualityLoading(true);
    apiRequest("POST", "/api/ai/caption-quality", {}).then(r => r.json()).then(d => { setAiCapQuality(d); sessionStorage.setItem("ai_cap_quality", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCapQualityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_incl_lang");
    if (cached) { try { setAiInclLang(JSON.parse(cached)); return; } catch {} }
    setAiInclLangLoading(true);
    apiRequest("POST", "/api/ai/inclusive-language", {}).then(r => r.json()).then(d => { setAiInclLang(d); sessionStorage.setItem("ai_incl_lang", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInclLangLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dyslexia");
    if (cached) { try { setAiDyslexia(JSON.parse(cached)); return; } catch {} }
    setAiDyslexiaLoading(true);
    apiRequest("POST", "/api/ai/dyslexia-format", {}).then(r => r.json()).then(d => { setAiDyslexia(d); sessionStorage.setItem("ai_dyslexia", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDyslexiaLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_motion_sens");
    if (cached) { try { setAiMotionSens(JSON.parse(cached)); return; } catch {} }
    setAiMotionSensLoading(true);
    apiRequest("POST", "/api/ai/motion-sensitivity", {}).then(r => r.json()).then(d => { setAiMotionSens(d); sessionStorage.setItem("ai_motion_sens", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMotionSensLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cog_load");
    if (cached) { try { setAiCogLoad(JSON.parse(cached)); return; } catch {} }
    setAiCogLoadLoading(true);
    apiRequest("POST", "/api/ai/cognitive-load", {}).then(r => r.json()).then(d => { setAiCogLoad(d); sessionStorage.setItem("ai_cog_load", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCogLoadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_modal");
    if (cached) { try { setAiMultiModal(JSON.parse(cached)); return; } catch {} }
    setAiMultiModalLoading(true);
    apiRequest("POST", "/api/ai/multi-modal", {}).then(r => r.json()).then(d => { setAiMultiModal(d); sessionStorage.setItem("ai_multi_modal", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMultiModalLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mobile_opt");
    if (cached) { try { setAiMobileOpt(JSON.parse(cached)); return; } catch {} }
    setAiMobileOptLoading(true);
    apiRequest("POST", "/api/ai/mobile-optimize", {}).then(r => r.json()).then(d => { setAiMobileOpt(d); sessionStorage.setItem("ai_mobile_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMobileOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_deep_links");
    if (cached) { try { setAiDeepLinks(JSON.parse(cached)); return; } catch {} }
    setAiDeepLinksLoading(true);
    apiRequest("POST", "/api/ai/deep-links", {}).then(r => r.json()).then(d => { setAiDeepLinks(d); sessionStorage.setItem("ai_deep_links", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDeepLinksLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_push_notif");
    if (cached) { try { setAiPushNotif(JSON.parse(cached)); return; } catch {} }
    setAiPushNotifLoading(true);
    apiRequest("POST", "/api/ai/push-notifications", {}).then(r => r.json()).then(d => { setAiPushNotif(d); sessionStorage.setItem("ai_push_notif", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPushNotifLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mobile_vid");
    if (cached) { try { setAiMobileVid(JSON.parse(cached)); return; } catch {} }
    setAiMobileVidLoading(true);
    apiRequest("POST", "/api/ai/mobile-video", {}).then(r => r.json()).then(d => { setAiMobileVid(d); sessionStorage.setItem("ai_mobile_vid", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMobileVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_responsive");
    if (cached) { try { setAiResponsive(JSON.parse(cached)); return; } catch {} }
    setAiResponsiveLoading(true);
    apiRequest("POST", "/api/ai/responsive-check", {}).then(r => r.json()).then(d => { setAiResponsive(d); sessionStorage.setItem("ai_responsive", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiResponsiveLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mobile_pay");
    if (cached) { try { setAiMobilePay(JSON.parse(cached)); return; } catch {} }
    setAiMobilePayLoading(true);
    apiRequest("POST", "/api/ai/mobile-payment", {}).then(r => r.json()).then(d => { setAiMobilePay(d); sessionStorage.setItem("ai_mobile_pay", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMobilePayLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_offline");
    if (cached) { try { setAiOffline(JSON.parse(cached)); return; } catch {} }
    setAiOfflineLoading(true);
    apiRequest("POST", "/api/ai/offline-content", {}).then(r => r.json()).then(d => { setAiOffline(d); sessionStorage.setItem("ai_offline", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOfflineLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mobile_analytics2");
    if (cached) { try { setAiMobileAnalytics(JSON.parse(cached)); return; } catch {} }
    setAiMobileAnalyticsLoading(true);
    apiRequest("POST", "/api/ai/mobile-analytics", {}).then(r => r.json()).then(d => { setAiMobileAnalytics(d); sessionStorage.setItem("ai_mobile_analytics2", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMobileAnalyticsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_app_store");
    if (cached) { try { setAiAppStore(JSON.parse(cached)); return; } catch {} }
    setAiAppStoreLoading(true);
    apiRequest("POST", "/api/ai/app-store", {}).then(r => r.json()).then(d => { setAiAppStore(d); sessionStorage.setItem("ai_app_store", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAppStoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_widgets");
    if (cached) { try { setAiWidgets(JSON.parse(cached)); return; } catch {} }
    setAiWidgetsLoading(true);
    apiRequest("POST", "/api/ai/widget-design", {}).then(r => r.json()).then(d => { setAiWidgets(d); sessionStorage.setItem("ai_widgets", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWidgetsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gestures");
    if (cached) { try { setAiGestures(JSON.parse(cached)); return; } catch {} }
    setAiGesturesLoading(true);
    apiRequest("POST", "/api/ai/gesture-optimize", {}).then(r => r.json()).then(d => { setAiGestures(d); sessionStorage.setItem("ai_gestures", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGesturesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mobile_first");
    if (cached) { try { setAiMobileFirst(JSON.parse(cached)); return; } catch {} }
    setAiMobileFirstLoading(true);
    apiRequest("POST", "/api/ai/mobile-first", {}).then(r => r.json()).then(d => { setAiMobileFirst(d); sessionStorage.setItem("ai_mobile_first", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMobileFirstLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_wearable");
    if (cached) { try { setAiWearable(JSON.parse(cached)); return; } catch {} }
    setAiWearableLoading(true);
    apiRequest("POST", "/api/ai/wearable", {}).then(r => r.json()).then(d => { setAiWearable(d); sessionStorage.setItem("ai_wearable", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWearableLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_smart_tv");
    if (cached) { try { setAiSmartTV(JSON.parse(cached)); return; } catch {} }
    setAiSmartTVLoading(true);
    apiRequest("POST", "/api/ai/smart-tv", {}).then(r => r.json()).then(d => { setAiSmartTV(d); sessionStorage.setItem("ai_smart_tv", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSmartTVLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gaming_niche");
    if (cached) { try { setAiGamingNiche(JSON.parse(cached)); return; } catch {} }
    setAiGamingNicheLoading(true);
    apiRequest("POST", "/api/ai/gaming-niche", {}).then(r => r.json()).then(d => { setAiGamingNiche(d); sessionStorage.setItem("ai_gaming_niche", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiGamingNicheLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_beauty_niche");
    if (cached) { try { setAiBeautyNiche(JSON.parse(cached)); return; } catch {} }
    setAiBeautyNicheLoading(true);
    apiRequest("POST", "/api/ai/beauty-niche", {}).then(r => r.json()).then(d => { setAiBeautyNiche(d); sessionStorage.setItem("ai_beauty_niche", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBeautyNicheLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tech_review");
    if (cached) { try { setAiTechReview(JSON.parse(cached)); return; } catch {} }
    setAiTechReviewLoading(true);
    apiRequest("POST", "/api/ai/tech-review", {}).then(r => r.json()).then(d => { setAiTechReview(d); sessionStorage.setItem("ai_tech_review", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTechReviewLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_food_content");
    if (cached) { try { setAiFoodContent(JSON.parse(cached)); return; } catch {} }
    setAiFoodContentLoading(true);
    apiRequest("POST", "/api/ai/food-content", {}).then(r => r.json()).then(d => { setAiFoodContent(d); sessionStorage.setItem("ai_food_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFoodContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fitness_content");
    if (cached) { try { setAiFitnessContent(JSON.parse(cached)); return; } catch {} }
    setAiFitnessContentLoading(true);
    apiRequest("POST", "/api/ai/fitness-content", {}).then(r => r.json()).then(d => { setAiFitnessContent(d); sessionStorage.setItem("ai_fitness_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFitnessContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_travel_content");
    if (cached) { try { setAiTravelContent(JSON.parse(cached)); return; } catch {} }
    setAiTravelContentLoading(true);
    apiRequest("POST", "/api/ai/travel-content", {}).then(r => r.json()).then(d => { setAiTravelContent(d); sessionStorage.setItem("ai_travel_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTravelContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_edu_content");
    if (cached) { try { setAiEduContent(JSON.parse(cached)); return; } catch {} }
    setAiEduContentLoading(true);
    apiRequest("POST", "/api/ai/education-content", {}).then(r => r.json()).then(d => { setAiEduContent(d); sessionStorage.setItem("ai_edu_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEduContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_fin_content");
    if (cached) { try { setAiFinContent(JSON.parse(cached)); return; } catch {} }
    setAiFinContentLoading(true);
    apiRequest("POST", "/api/ai/finance-content", {}).then(r => r.json()).then(d => { setAiFinContent(d); sessionStorage.setItem("ai_fin_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFinContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_parent_content");
    if (cached) { try { setAiParentContent(JSON.parse(cached)); return; } catch {} }
    setAiParentContentLoading(true);
    apiRequest("POST", "/api/ai/parenting-content", {}).then(r => r.json()).then(d => { setAiParentContent(d); sessionStorage.setItem("ai_parent_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiParentContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pet_content");
    if (cached) { try { setAiPetContent(JSON.parse(cached)); return; } catch {} }
    setAiPetContentLoading(true);
    apiRequest("POST", "/api/ai/pet-content", {}).then(r => r.json()).then(d => { setAiPetContent(d); sessionStorage.setItem("ai_pet_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPetContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_diy_craft");
    if (cached) { try { setAiDIYCraft(JSON.parse(cached)); return; } catch {} }
    setAiDIYCraftLoading(true);
    apiRequest("POST", "/api/ai/diy-craft", {}).then(r => r.json()).then(d => { setAiDIYCraft(d); sessionStorage.setItem("ai_diy_craft", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDIYCraftLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_musician_content");
    if (cached) { try { setAiMusicianContent(JSON.parse(cached)); return; } catch {} }
    setAiMusicianContentLoading(true);
    apiRequest("POST", "/api/ai/musician-content", {}).then(r => r.json()).then(d => { setAiMusicianContent(d); sessionStorage.setItem("ai_musician_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMusicianContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comedy_content");
    if (cached) { try { setAiComedyContent(JSON.parse(cached)); return; } catch {} }
    setAiComedyContentLoading(true);
    apiRequest("POST", "/api/ai/comedy-content", {}).then(r => r.json()).then(d => { setAiComedyContent(d); sessionStorage.setItem("ai_comedy_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiComedyContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sports_content");
    if (cached) { try { setAiSportsContent(JSON.parse(cached)); return; } catch {} }
    setAiSportsContentLoading(true);
    apiRequest("POST", "/api/ai/sports-content", {}).then(r => r.json()).then(d => { setAiSportsContent(d); sessionStorage.setItem("ai_sports_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSportsContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_news_commen");
    if (cached) { try { setAiNewsCommen(JSON.parse(cached)); return; } catch {} }
    setAiNewsCommenLoading(true);
    apiRequest("POST", "/api/ai/news-commentary", {}).then(r => r.json()).then(d => { setAiNewsCommen(d); sessionStorage.setItem("ai_news_commen", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNewsCommenLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_lifestyle_content");
    if (cached) { try { setAiLifestyleContent(JSON.parse(cached)); return; } catch {} }
    setAiLifestyleContentLoading(true);
    apiRequest("POST", "/api/ai/lifestyle-content", {}).then(r => r.json()).then(d => { setAiLifestyleContent(d); sessionStorage.setItem("ai_lifestyle_content", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLifestyleContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vid_to_book");
    if (cached) { try { setAiVidToBook(JSON.parse(cached)); return; } catch {} }
    setAiVidToBookLoading(true);
    apiRequest("POST", "/api/ai/video-to-book", {}).then(r => r.json()).then(d => { setAiVidToBook(d); sessionStorage.setItem("ai_vid_to_book", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVidToBookLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vid_to_pod");
    if (cached) { try { setAiVidToPod(JSON.parse(cached)); return; } catch {} }
    setAiVidToPodLoading(true);
    apiRequest("POST", "/api/ai/video-to-podcast", {}).then(r => r.json()).then(d => { setAiVidToPod(d); sessionStorage.setItem("ai_vid_to_pod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVidToPodLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vid_to_course");
    if (cached) { try { setAiVidToCourse(JSON.parse(cached)); return; } catch {} }
    setAiVidToCourseLoading(true);
    apiRequest("POST", "/api/ai/video-to-course", {}).then(r => r.json()).then(d => { setAiVidToCourse(d); sessionStorage.setItem("ai_vid_to_course", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiVidToCourseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_blog_to_vid");
    if (cached) { try { setAiBlogToVid(JSON.parse(cached)); return; } catch {} }
    setAiBlogToVidLoading(true);
    apiRequest("POST", "/api/ai/blog-to-video", {}).then(r => r.json()).then(d => { setAiBlogToVid(d); sessionStorage.setItem("ai_blog_to_vid", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBlogToVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_twit_thread");
    if (cached) { try { setAiTwitThread(JSON.parse(cached)); return; } catch {} }
    setAiTwitThreadLoading(true);
    apiRequest("POST", "/api/ai/twitter-thread", {}).then(r => r.json()).then(d => { setAiTwitThread(d); sessionStorage.setItem("ai_twit_thread", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTwitThreadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_li_adapter");
    if (cached) { try { setAiLIAdapter(JSON.parse(cached)); return; } catch {} }
    setAiLIAdapterLoading(true);
    apiRequest("POST", "/api/ai/linkedin-adapter", {}).then(r => r.json()).then(d => { setAiLIAdapter(d); sessionStorage.setItem("ai_li_adapter", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLIAdapterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pint_pins");
    if (cached) { try { setAiPintPins(JSON.parse(cached)); return; } catch {} }
    setAiPintPinsLoading(true);
    apiRequest("POST", "/api/ai/pinterest-pins", {}).then(r => r.json()).then(d => { setAiPintPins(d); sessionStorage.setItem("ai_pint_pins", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPintPinsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_reddit_opt");
    if (cached) { try { setAiRedditOpt(JSON.parse(cached)); return; } catch {} }
    setAiRedditOptLoading(true);
    apiRequest("POST", "/api/ai/reddit-post", {}).then(r => r.json()).then(d => { setAiRedditOpt(d); sessionStorage.setItem("ai_reddit_opt", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRedditOptLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_quora_ans");
    if (cached) { try { setAiQuoraAns(JSON.parse(cached)); return; } catch {} }
    setAiQuoraAnsLoading(true);
    apiRequest("POST", "/api/ai/quora-answer", {}).then(r => r.json()).then(d => { setAiQuoraAns(d); sessionStorage.setItem("ai_quora_ans", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiQuoraAnsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_medium_art");
    if (cached) { try { setAiMediumArt(JSON.parse(cached)); return; } catch {} }
    setAiMediumArtLoading(true);
    apiRequest("POST", "/api/ai/medium-article", {}).then(r => r.json()).then(d => { setAiMediumArt(d); sessionStorage.setItem("ai_medium_art", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMediumArtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_slidedeck");
    if (cached) { try { setAiSlidedeck(JSON.parse(cached)); return; } catch {} }
    setAiSlidedeckLoading(true);
    apiRequest("POST", "/api/ai/slidedeck", {}).then(r => r.json()).then(d => { setAiSlidedeck(d); sessionStorage.setItem("ai_slidedeck", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSlidedeckLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infographic_rep");
    if (cached) { try { setAiInfographicRep(JSON.parse(cached)); return; } catch {} }
    setAiInfographicRepLoading(true);
    apiRequest("POST", "/api/ai/infographic-repurpose", {}).then(r => r.json()).then(d => { setAiInfographicRep(d); sessionStorage.setItem("ai_infographic_rep", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInfographicRepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_watch_time");
    if (cached) { try { setAiWatchTime(JSON.parse(cached)); return; } catch {} }
    setAiWatchTimeLoading(true);
    apiRequest("POST", "/api/ai/watch-time-boost", {}).then(r => r.json()).then(d => { setAiWatchTime(d); sessionStorage.setItem("ai_watch_time", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiWatchTimeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_open_loops");
    if (cached) { try { setAiOpenLoops(JSON.parse(cached)); return; } catch {} }
    setAiOpenLoopsLoading(true);
    apiRequest("POST", "/api/ai/open-loops", {}).then(r => r.json()).then(d => { setAiOpenLoops(d); sessionStorage.setItem("ai_open_loops", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiOpenLoopsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pattern_int");
    if (cached) { try { setAiPatternInt(JSON.parse(cached)); return; } catch {} }
    setAiPatternIntLoading(true);
    apiRequest("POST", "/api/ai/pattern-interrupts", {}).then(r => r.json()).then(d => { setAiPatternInt(d); sessionStorage.setItem("ai_pattern_int", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPatternIntLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_re_engage");
    if (cached) { try { setAiReEngage(JSON.parse(cached)); return; } catch {} }
    setAiReEngageLoading(true);
    apiRequest("POST", "/api/ai/re-engagement", {}).then(r => r.json()).then(d => { setAiReEngage(d); sessionStorage.setItem("ai_re_engage", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiReEngageLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_binge_watch");
    if (cached) { try { setAiBingeWatch(JSON.parse(cached)); return; } catch {} }
    setAiBingeWatchLoading(true);
    apiRequest("POST", "/api/ai/binge-watch", {}).then(r => r.json()).then(d => { setAiBingeWatch(d); sessionStorage.setItem("ai_binge_watch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBingeWatchLoading(false));
  }, []);

  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    let result = videos;
    if (typeFilter !== "all") result = result.filter((v) => v.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }
    return result;
  }, [videos, typeFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aiIdeasLoading ? (
        <Skeleton className="h-48 rounded-md" />
      ) : aiContentIdeas ? (
        <Card data-testid="card-ai-content-ideas" className="overflow-visible">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Content Ideas</span>
              <Badge variant="secondary">Auto-generated</Badge>
            </div>

            {aiContentIdeas.trendAlert && (
              <div data-testid="text-trend-alert" className="text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">
                {aiContentIdeas.trendAlert}
              </div>
            )}

            {aiContentIdeas.ideas && aiContentIdeas.ideas.length > 0 && (
              <div className="space-y-2">
                {aiContentIdeas.ideas.slice(0, 5).map((idea: any, idx: number) => (
                  <div key={idx} data-testid={`ai-idea-${idx}`} className="flex flex-col gap-1 border-b last:border-b-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{idea.title}</span>
                      {idea.type && (
                        <Badge variant={idea.type === "vod" ? "default" : "secondary"} className="text-[10px]">
                          {idea.type === "vod" ? "VOD" : idea.type === "short" ? "Short" : idea.type}
                        </Badge>
                      )}
                      {idea.viralScore != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {idea.viralScore}% viral
                        </Badge>
                      )}
                    </div>
                    {idea.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{idea.description}</p>
                    )}
                    {idea.bestPostTime && (
                      <span className="text-[11px] text-muted-foreground">Best time: {idea.bestPostTime}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {aiContentIdeas.seriesIdeas && aiContentIdeas.seriesIdeas.length > 0 && (
              <div data-testid="section-series-ideas" className="pt-2 border-t space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Series Ideas</span>
                {aiContentIdeas.seriesIdeas.map((series: any, idx: number) => (
                  <div key={idx} data-testid={`series-idea-${idx}`} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{series.title || series.name}</span>
                    {series.description && <span> — {series.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {kwLoading ? (
        <Skeleton className="h-36 rounded-md" />
      ) : kwData ? (
        <Card data-testid="card-ai-keyword-research" className="overflow-visible">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Keyword Research</span>
              <Badge variant="secondary">Auto-generated</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kwData.primaryKeywords && kwData.primaryKeywords.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Primary</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {kwData.primaryKeywords.map((kw: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`keyword-primary-${i}`}>
                        {typeof kw === "string" ? kw : kw.keyword || kw.term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {kwData.longTailKeywords && kwData.longTailKeywords.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Long-tail</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {kwData.longTailKeywords.map((kw: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`keyword-longtail-${i}`}>
                        {typeof kw === "string" ? kw : kw.keyword || kw.term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {kwData.trendingKeywords && kwData.trendingKeywords.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trending</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {kwData.trendingKeywords.map((kw: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]" data-testid={`keyword-trending-${i}`}>
                        {typeof kw === "string" ? kw : kw.keyword || kw.term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {kwData.contentGaps && kwData.contentGaps.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Content Gaps</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {kwData.contentGaps.map((gap: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`keyword-gap-${i}`}>
                        {typeof gap === "string" ? gap : gap.keyword || gap.topic || gap.term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {calLoading ? (
        <Skeleton className="h-48 rounded-md" />
      ) : calData ? (
        <Card data-testid="card-ai-content-calendar" className="overflow-visible">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Content Calendar</span>
              <Badge variant="secondary">Auto-generated</Badge>
            </div>
            {calData.monthPlan && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {(Array.isArray(calData.monthPlan) ? calData.monthPlan : Object.entries(calData.monthPlan).map(([k, v]: any) => ({ week: k, ...v }))).map((week: any, i: number) => (
                  <div key={i} className="border rounded-md p-2 space-y-1" data-testid={`calendar-week-${i}`}>
                    <span className="text-xs font-semibold">{week.week || week.title || `Week ${i + 1}`}</span>
                    {(week.topics || week.content || week.items || []).map((item: any, j: number) => (
                      <p key={j} className="text-xs text-muted-foreground">{typeof item === "string" ? item : item.title || item.topic}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              {calData.contentMix && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Content Mix</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(calData.contentMix).map(([type, pct]: any) => (
                      <Badge key={type} variant="outline" className="text-[10px]">{type}: {pct}%</Badge>
                    ))}
                  </div>
                </div>
              )}
              {calData.seasonalOpportunities && calData.seasonalOpportunities.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seasonal</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {calData.seasonalOpportunities.map((opp: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {typeof opp === "string" ? opp : opp.title || opp.event || opp.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="card-ai-script-writer" className="overflow-visible">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Script Writer</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              data-testid="input-script-topic"
              placeholder="Video topic..."
              value={scriptTopic}
              onChange={(e) => setScriptTopic(e.target.value)}
            />
            <Select value={scriptStyle} onValueChange={setScriptStyle}>
              <SelectTrigger data-testid="select-script-style"><SelectValue placeholder="Style" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="educational">Educational</SelectItem>
                <SelectItem value="entertaining">Entertaining</SelectItem>
                <SelectItem value="tutorial">Tutorial</SelectItem>
                <SelectItem value="vlog">Vlog</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scriptDuration} onValueChange={setScriptDuration}>
              <SelectTrigger data-testid="select-script-duration"><SelectValue placeholder="Duration" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 min</SelectItem>
                <SelectItem value="10">10 min</SelectItem>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="20">20 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleScriptSubmit} disabled={scriptLoading || !scriptTopic.trim()} data-testid="button-generate-script">
            {scriptLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Generate Script
          </Button>
          {scriptResult && (
            <div className="border rounded-md p-3 space-y-2">
              <button
                className="flex items-center gap-1 text-sm font-medium w-full text-left"
                onClick={() => setScriptExpanded(!scriptExpanded)}
                data-testid="button-toggle-script"
              >
                {scriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Script Result
              </button>
              {scriptExpanded && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  {scriptResult.hook && (
                    <div><span className="font-semibold text-foreground">Hook:</span> {scriptResult.hook}</div>
                  )}
                  {scriptResult.sections && scriptResult.sections.map((sec: any, i: number) => (
                    <div key={i} data-testid={`script-section-${i}`}>
                      <span className="font-semibold text-foreground">{sec.title || `Section ${i + 1}`}:</span> {sec.content || sec.description || sec.text}
                    </div>
                  ))}
                  {scriptResult.cta && (
                    <div><span className="font-semibold text-foreground">CTA:</span> {scriptResult.cta}</div>
                  )}
                  {scriptResult.chapters && scriptResult.chapters.length > 0 && (
                    <div>
                      <span className="font-semibold text-foreground">Chapters:</span>
                      <ul className="list-disc list-inside ml-2 mt-0.5">
                        {scriptResult.chapters.map((ch: any, i: number) => (
                          <li key={i}>{typeof ch === "string" ? ch : `${ch.timestamp || ch.time || ""} ${ch.title || ch.name || ""}`}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {scriptResult.thumbnailIdea && (
                    <div><span className="font-semibold text-foreground">Thumbnail Idea:</span> {typeof scriptResult.thumbnailIdea === "string" ? scriptResult.thumbnailIdea : scriptResult.thumbnailIdea.description || JSON.stringify(scriptResult.thumbnailIdea)}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-repurpose" className="overflow-visible">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Share2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Repurpose Hub</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select value={repurposeVideo} onValueChange={(v) => setRepurposeVideo(v)}>
              <SelectTrigger data-testid="select-repurpose-video"><SelectValue placeholder="Select a video" /></SelectTrigger>
              <SelectContent>
                {(videos || []).map((v) => (
                  <SelectItem key={v.id} value={v.title}>{v.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={repurposePlatform} onValueChange={(v) => setRepurposePlatform(v)}>
              <SelectTrigger data-testid="select-repurpose-platform"><SelectValue placeholder="Target platform" /></SelectTrigger>
              <SelectContent>
                {["Twitter", "Instagram", "LinkedIn", "Blog", "Newsletter", "Pinterest", "Podcast"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {repurposeLoading && <Skeleton className="h-24 rounded-md" />}
          {repurposeResult && !repurposeLoading && (
            <div className="border rounded-md p-3 space-y-2 text-xs text-muted-foreground">
              {repurposeResult.content && (
                <div><span className="font-semibold text-foreground">Content:</span> <p className="mt-0.5 whitespace-pre-wrap">{repurposeResult.content}</p></div>
              )}
              {repurposeResult.hashtags && repurposeResult.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {repurposeResult.hashtags.map((tag: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]" data-testid={`repurpose-hashtag-${i}`}>{tag}</Badge>
                  ))}
                </div>
              )}
              {repurposeResult.mediaInstructions && (
                <div><span className="font-semibold text-foreground">Media:</span> {repurposeResult.mediaInstructions}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-chapters" className="overflow-visible">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ListOrdered className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Chapter Markers</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              data-testid="input-chapter-title"
              placeholder="Video title..."
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
            />
            <Input
              data-testid="input-chapter-desc"
              placeholder="Description (optional)..."
              value={chapterDesc}
              onChange={(e) => setChapterDesc(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleChapterSubmit} disabled={chapterLoading || !chapterTitle.trim()} data-testid="button-generate-chapters">
            {chapterLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Generate Chapters
          </Button>
          {chapterResult && (
            <div className="border rounded-md p-3 space-y-1 text-xs text-muted-foreground">
              {(chapterResult.chapters || []).map((ch: any, i: number) => (
                <div key={i} className="flex gap-2" data-testid={`chapter-marker-${i}`}>
                  <span className="font-mono font-semibold text-foreground shrink-0">{ch.timestamp || ch.time || "0:00"}</span>
                  <span>{ch.title || ch.name || ch.description}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "vod", "short", "live_replay"].map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
              data-testid={`filter-type-${t}`}
              className="toggle-elevate"
            >
              {t === "all" ? "All" : TYPE_LABEL[t] || t}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-videos"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PlayCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p data-testid="text-empty-state" className="text-sm text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : "No videos yet. Connect a channel to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <Card key={video.id} data-testid={`card-video-${video.id}`} className="hover-elevate overflow-visible">
              <CardContent className="p-4 flex flex-col gap-2">
                <h3 data-testid={`text-video-title-${video.id}`} className="text-sm font-medium line-clamp-2">
                  {video.title}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={TYPE_BADGE_VARIANT[video.type] || "default"} className="text-[10px]">
                    {TYPE_LABEL[video.type] || video.type}
                  </Badge>
                  <StatusBadge status={video.status} />
                </div>
                {isAdvanced && video.metadata?.seoScore != null && (
                  <span className="text-[11px] text-muted-foreground">SEO {video.metadata.seoScore}/100</span>
                )}
                {video.platform && (
                  <span className="text-[11px] text-muted-foreground capitalize">{video.platform}</span>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleSeoAudit(video)} disabled={seoLoading && seoVideoId === video.id} data-testid={`button-seo-audit-${video.id}`}>
                    {seoLoading && seoVideoId === video.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <BarChart3 className="h-3 w-3 mr-1" />}
                    SEO Audit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleThumbnails(video)} disabled={thumbLoading && thumbVideoId === video.id} data-testid={`button-thumbnail-ideas-${video.id}`}>
                    {thumbLoading && thumbVideoId === video.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Image className="h-3 w-3 mr-1" />}
                    Thumbnail Ideas
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {seoResult && seoVideoId !== null && (
        <Card data-testid="card-ai-seo-audit" className="overflow-visible">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI SEO Audit</span>
              <Badge variant="secondary">Auto-generated</Badge>
              <Button size="sm" variant="ghost" onClick={() => { setSeoResult(null); setSeoVideoId(null); }} data-testid="button-close-seo">
                Close
              </Button>
            </div>
            {seoResult.overallScore != null && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-2xl font-bold">{seoResult.overallScore}<span className="text-sm font-normal text-muted-foreground">/100</span></div>
                {seoResult.titleScore != null && <Badge variant="outline" className="text-[10px]">Title: {seoResult.titleScore}/100</Badge>}
                {seoResult.descriptionScore != null && <Badge variant="outline" className="text-[10px]">Desc: {seoResult.descriptionScore}/100</Badge>}
                {seoResult.tagScore != null && <Badge variant="outline" className="text-[10px]">Tags: {seoResult.tagScore}/100</Badge>}
              </div>
            )}
            {seoResult.quickWins && seoResult.quickWins.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Wins</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {seoResult.quickWins.map((win: any, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground" data-testid={`seo-quickwin-${i}`}>
                      {typeof win === "string" ? win : win.suggestion || win.title || win.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {thumbResult && thumbVideoId !== null && (
        <Card data-testid="card-ai-thumbnails" className="overflow-visible">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Image className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Thumbnail Concepts</span>
              <Badge variant="secondary">Auto-generated</Badge>
              <Button size="sm" variant="ghost" onClick={() => { setThumbResult(null); setThumbVideoId(null); }} data-testid="button-close-thumbnails">
                Close
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(thumbResult.concepts || thumbResult.thumbnails || []).slice(0, 3).map((concept: any, i: number) => (
                <div key={i} className="border rounded-md p-3 space-y-1" data-testid={`thumbnail-concept-${i}`}>
                  <span className="text-xs font-semibold">Concept {i + 1}</span>
                  {concept.layout && <p className="text-xs text-muted-foreground">{concept.layout}</p>}
                  {concept.description && <p className="text-xs text-muted-foreground">{concept.description}</p>}
                  {concept.textOverlay && <p className="text-xs"><span className="font-medium">Text:</span> {concept.textOverlay}</p>}
                  {concept.predictedCTR != null && (
                    <Badge variant="outline" className="text-[10px]">CTR: {concept.predictedCTR}%</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowProductionAI(!showProductionAI)}
          data-testid="button-toggle-production-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Video Production Suite</span>
          <Badge variant="outline" className="text-[10px]">24 tools</Badge>
          {showProductionAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showProductionAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiStoryboardLoading || aiStoryboard) && (
              <Card data-testid="card-ai-storyboard">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Storyboard</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStoryboardLoading ? <Skeleton className="h-24 w-full" /> : aiStoryboard && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStoryboard.scenes || aiStoryboard.storyboard)}
                      {aiStoryboard.description && <p>{aiStoryboard.description}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiColorGradingLoading || aiColorGrading) && (
              <Card data-testid="card-ai-color-grading">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Color Grading</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiColorGradingLoading ? <Skeleton className="h-24 w-full" /> : aiColorGrading && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiColorGrading.style && <p className="font-medium text-foreground">{aiColorGrading.style}</p>}
                      {aiColorGrading.palette && <p>Palette: {Array.isArray(aiColorGrading.palette) ? aiColorGrading.palette.join(", ") : aiColorGrading.palette}</p>}
                      {renderAIList(aiColorGrading.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIntroOutroLoading || aiIntroOutro) && (
              <Card data-testid="card-ai-intro-outro">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Intro/Outro</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIntroOutroLoading ? <Skeleton className="h-24 w-full" /> : aiIntroOutro && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiIntroOutro.intro && <p><span className="font-medium text-foreground">Intro:</span> {typeof aiIntroOutro.intro === "string" ? aiIntroOutro.intro : aiIntroOutro.intro.description || aiIntroOutro.intro.concept}</p>}
                      {aiIntroOutro.outro && <p><span className="font-medium text-foreground">Outro:</span> {typeof aiIntroOutro.outro === "string" ? aiIntroOutro.outro : aiIntroOutro.outro.description || aiIntroOutro.outro.concept}</p>}
                      {renderAIList(aiIntroOutro.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSoundEffectsLoading || aiSoundEffects) && (
              <Card data-testid="card-ai-sound-effects">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sound Effects</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSoundEffectsLoading ? <Skeleton className="h-24 w-full" /> : aiSoundEffects && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSoundEffects.effects || aiSoundEffects.sounds)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPacingLoading || aiPacing) && (
              <Card data-testid="card-ai-pacing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pacing Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPacingLoading ? <Skeleton className="h-24 w-full" /> : aiPacing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiPacing.score != null && <p className="text-lg font-medium text-foreground">{aiPacing.score}<span className="text-xs text-muted-foreground">/100</span></p>}
                      {renderAIList(aiPacing.tips || aiPacing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTalkingPointsLoading || aiTalkingPoints) && (
              <Card data-testid="card-ai-talking-points">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Talking Points</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTalkingPointsLoading ? <Skeleton className="h-24 w-full" /> : aiTalkingPoints && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTalkingPoints.points || aiTalkingPoints.talkingPoints)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVideoLengthLoading || aiVideoLength) && (
              <Card data-testid="card-ai-video-length">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video Length</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVideoLengthLoading ? <Skeleton className="h-24 w-full" /> : aiVideoLength && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiVideoLength.idealLength && <p className="font-medium text-foreground">{aiVideoLength.idealLength}</p>}
                      {aiVideoLength.reasoning && <p>{aiVideoLength.reasoning}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiFormatLoading || aiMultiFormat) && (
              <Card data-testid="card-ai-multi-format">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Multi-Format</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiFormatLoading ? <Skeleton className="h-24 w-full" /> : aiMultiFormat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiFormat.formats || aiMultiFormat.platforms)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWatermarkLoading || aiWatermark) && (
              <Card data-testid="card-ai-watermark">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Watermark Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWatermarkLoading ? <Skeleton className="h-24 w-full" /> : aiWatermark && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiWatermark.strategy && <p className="font-medium text-foreground">{aiWatermark.strategy}</p>}
                      {renderAIList(aiWatermark.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGreenScreenLoading || aiGreenScreen) && (
              <Card data-testid="card-ai-green-screen">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Green Screen</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGreenScreenLoading ? <Skeleton className="h-24 w-full" /> : aiGreenScreen && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGreenScreen.backgrounds || aiGreenScreen.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTeleprompterLoading || aiTeleprompter) && (
              <Card data-testid="card-ai-teleprompter">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Teleprompter</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTeleprompterLoading ? <Skeleton className="h-24 w-full" /> : aiTeleprompter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiTeleprompter.script && <p>{typeof aiTeleprompter.script === "string" ? aiTeleprompter.script : aiTeleprompter.script.text || aiTeleprompter.script.content}</p>}
                      {renderAIList(aiTeleprompter.tips)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTransitionsLoading || aiTransitions) && (
              <Card data-testid="card-ai-transitions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Scene Transitions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTransitionsLoading ? <Skeleton className="h-24 w-full" /> : aiTransitions && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTransitions.transitions || aiTransitions.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVideoQualityLoading || aiVideoQuality) && (
              <Card data-testid="card-ai-video-quality">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video Quality</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVideoQualityLoading ? <Skeleton className="h-24 w-full" /> : aiVideoQuality && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVideoQuality.recommendations || aiVideoQuality.settings)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAspectRatioLoading || aiAspectRatio) && (
              <Card data-testid="card-ai-aspect-ratio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Aspect Ratio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAspectRatioLoading ? <Skeleton className="h-24 w-full" /> : aiAspectRatio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAspectRatio.ratios || aiAspectRatio.platforms)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLowerThirdsLoading || aiLowerThirds) && (
              <Card data-testid="card-ai-lower-thirds">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Lower Thirds</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLowerThirdsLoading ? <Skeleton className="h-24 w-full" /> : aiLowerThirds && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLowerThirds.designs || aiLowerThirds.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCtaOverlaysLoading || aiCtaOverlays) && (
              <Card data-testid="card-ai-cta-overlays">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI CTA Overlays</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCtaOverlaysLoading ? <Skeleton className="h-24 w-full" /> : aiCtaOverlays && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCtaOverlays.overlays || aiCtaOverlays.designs)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSplitScreenLoading || aiSplitScreen) && (
              <Card data-testid="card-ai-split-screen">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Split Screen</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSplitScreenLoading ? <Skeleton className="h-24 w-full" /> : aiSplitScreen && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSplitScreen.layouts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTimeLapseLoading || aiTimeLapse) && (
              <Card data-testid="card-ai-time-lapse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Time-Lapse</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTimeLapseLoading ? <Skeleton className="h-24 w-full" /> : aiTimeLapse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiTimeLapse.advice && <p>{aiTimeLapse.advice}</p>}
                      {aiTimeLapse.settings && <p className="font-medium text-foreground">{typeof aiTimeLapse.settings === "string" ? aiTimeLapse.settings : JSON.stringify(aiTimeLapse.settings)}</p>}
                      {renderAIList(aiTimeLapse.tips || aiTimeLapse.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFootageOrgLoading || aiFootageOrg) && (
              <Card data-testid="card-ai-footage-org">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Footage Organizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFootageOrgLoading ? <Skeleton className="h-24 w-full" /> : aiFootageOrg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFootageOrg.folders || aiFootageOrg.structure)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAudioLevelingLoading || aiAudioLeveling) && (
              <Card data-testid="card-ai-audio-leveling">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audio Leveling</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAudioLevelingLoading ? <Skeleton className="h-24 w-full" /> : aiAudioLeveling && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAudioLeveling.settings || aiAudioLeveling.levels)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNoiseDetectorLoading || aiNoiseDetector) && (
              <Card data-testid="card-ai-noise-detector">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Noise Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNoiseDetectorLoading ? <Skeleton className="h-24 w-full" /> : aiNoiseDetector && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNoiseDetector.issues || aiNoiseDetector.fixes)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiJumpCutsLoading || aiJumpCuts) && (
              <Card data-testid="card-ai-jump-cuts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Jump Cuts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiJumpCutsLoading ? <Skeleton className="h-24 w-full" /> : aiJumpCuts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiJumpCuts.cuts || aiJumpCuts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCinematicShotsLoading || aiCinematicShots) && (
              <Card data-testid="card-ai-cinematic-shots">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cinematic Shots</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCinematicShotsLoading ? <Skeleton className="h-24 w-full" /> : aiCinematicShots && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCinematicShots.shots)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompressionLoading || aiCompression) && (
              <Card data-testid="card-ai-compression">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Compression</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompressionLoading ? <Skeleton className="h-24 w-full" /> : aiCompression && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiCompression.format && <p className="font-medium text-foreground">{aiCompression.format}</p>}
                      {renderAIList(aiCompression.settings || aiCompression.recommendations)}
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
          onClick={() => setShowThumbnailAI(!showThumbnailAI)}
          data-testid="button-toggle-thumbnail-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Thumbnail & Visual Suite</span>
          <Badge variant="outline" className="text-[10px]">16 tools</Badge>
          {showThumbnailAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showThumbnailAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiThumbABLoading || aiThumbAB) && (
              <Card data-testid="card-ai-thumb-ab">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail A/B Test</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbABLoading ? <Skeleton className="h-24 w-full" /> : aiThumbAB && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThumbAB.variants || aiThumbAB.tests)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThumbCTRLoading || aiThumbCTR) && (
              <Card data-testid="card-ai-thumb-ctr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail CTR Predictor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbCTRLoading ? <Skeleton className="h-24 w-full" /> : aiThumbCTR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiThumbCTR.predictedCTR != null && <p className="text-lg font-medium text-foreground">{aiThumbCTR.predictedCTR}% <span className="text-xs text-muted-foreground">predicted CTR</span></p>}
                      {aiThumbCTR.analysis && <p>{aiThumbCTR.analysis}</p>}
                      {renderAIList(aiThumbCTR.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThumbStylesLoading || aiThumbStyles) && (
              <Card data-testid="card-ai-thumb-styles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail Styles</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbStylesLoading ? <Skeleton className="h-24 w-full" /> : aiThumbStyles && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThumbStyles.styles || aiThumbStyles.templates)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFaceExprLoading || aiFaceExpr) && (
              <Card data-testid="card-ai-face-expr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Face Expressions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFaceExprLoading ? <Skeleton className="h-24 w-full" /> : aiFaceExpr && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFaceExpr.tips || aiFaceExpr.expressions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThumbTextLoading || aiThumbText) && (
              <Card data-testid="card-ai-thumb-text">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail Text</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbTextLoading ? <Skeleton className="h-24 w-full" /> : aiThumbText && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThumbText.suggestions || aiThumbText.tips)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiColorPsychLoading || aiColorPsych) && (
              <Card data-testid="card-ai-color-psych">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Color Psychology</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiColorPsychLoading ? <Skeleton className="h-24 w-full" /> : aiColorPsych && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiColorPsych.colors || aiColorPsych.meanings)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBannerLoading || aiBanner) && (
              <Card data-testid="card-ai-banner">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Banner Design</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBannerLoading ? <Skeleton className="h-24 w-full" /> : aiBanner && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBanner.banners || aiBanner.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSocialCoversLoading || aiSocialCovers) && (
              <Card data-testid="card-ai-social-covers">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Social Covers</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSocialCoversLoading ? <Skeleton className="h-24 w-full" /> : aiSocialCovers && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSocialCovers.covers || aiSocialCovers.designs)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAnimatedThumbLoading || aiAnimatedThumb) && (
              <Card data-testid="card-ai-animated-thumb">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Animated Thumbnails</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAnimatedThumbLoading ? <Skeleton className="h-24 w-full" /> : aiAnimatedThumb && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAnimatedThumb.animations || aiAnimatedThumb.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThumbCompetitorsLoading || aiThumbCompetitors) && (
              <Card data-testid="card-ai-thumb-competitors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail Competitors</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbCompetitorsLoading ? <Skeleton className="h-24 w-full" /> : aiThumbCompetitors && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThumbCompetitors.competitors || aiThumbCompetitors.analysis)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandWatermarkLoading || aiBrandWatermark) && (
              <Card data-testid="card-ai-brand-watermark">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Watermark</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandWatermarkLoading ? <Skeleton className="h-24 w-full" /> : aiBrandWatermark && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandWatermark.designs || aiBrandWatermark.watermarks)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStickerPackLoading || aiStickerPack) && (
              <Card data-testid="card-ai-sticker-pack">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sticker Pack</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStickerPackLoading ? <Skeleton className="h-24 w-full" /> : aiStickerPack && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStickerPack.stickers || aiStickerPack.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInfographicLoading || aiInfographic) && (
              <Card data-testid="card-ai-infographic">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Infographic</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInfographicLoading ? <Skeleton className="h-24 w-full" /> : aiInfographic && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInfographic.layouts || aiInfographic.sections)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemeTemplatesLoading || aiMemeTemplates) && (
              <Card data-testid="card-ai-meme-templates">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Meme Templates</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemeTemplatesLoading ? <Skeleton className="h-24 w-full" /> : aiMemeTemplates && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMemeTemplates.templates || aiMemeTemplates.memes)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVisualScoreLoading || aiVisualScore) && (
              <Card data-testid="card-ai-visual-score">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Visual Consistency</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVisualScoreLoading ? <Skeleton className="h-24 w-full" /> : aiVisualScore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiVisualScore.score != null && <p className="text-lg font-medium text-foreground">{aiVisualScore.score}<span className="text-xs text-muted-foreground">/100</span></p>}
                      {renderAIList(aiVisualScore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceCloneLoading || aiVoiceClone) && (
              <Card data-testid="card-ai-voice-clone">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voice Clone</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceCloneLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceClone && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiVoiceClone.guidance && <p>{aiVoiceClone.guidance}</p>}
                      {renderAIList(aiVoiceClone.steps || aiVoiceClone.recommendations)}
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
          onClick={() => setShowTitlesCopyAI(!showTitlesCopyAI)}
          data-testid="button-toggle-titles-copy-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Titles & Copy Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showTitlesCopyAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showTitlesCopyAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiHooksLoading || aiHooks) && (
              <Card data-testid="card-ai-hooks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Hooks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHooksLoading ? <Skeleton className="h-24 w-full" /> : aiHooks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHooks.hooks || aiHooks.suggestions || aiHooks.ideas)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTitleSplitLoading || aiTitleSplit) && (
              <Card data-testid="card-ai-title-split">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Title Split Test</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTitleSplitLoading ? <Skeleton className="h-24 w-full" /> : aiTitleSplit && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTitleSplit.variants || aiTitleSplit.tests || aiTitleSplit.titles)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTitleEmotionLoading || aiTitleEmotion) && (
              <Card data-testid="card-ai-title-emotion">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Title Emotion</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTitleEmotionLoading ? <Skeleton className="h-24 w-full" /> : aiTitleEmotion && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiTitleEmotion.score != null && <p className="text-lg font-medium text-foreground">{aiTitleEmotion.score}<span className="text-xs text-muted-foreground">/100 emotion</span></p>}
                      {renderAIList(aiTitleEmotion.emotions || aiTitleEmotion.analysis || aiTitleEmotion.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiClickbaitLoading || aiClickbait) && (
              <Card data-testid="card-ai-clickbait">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Clickbait Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiClickbaitLoading ? <Skeleton className="h-24 w-full" /> : aiClickbait && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiClickbait.score != null && <p className="text-lg font-medium text-foreground">{aiClickbait.score}<span className="text-xs text-muted-foreground">% clickbait</span></p>}
                      {renderAIList(aiClickbait.flags || aiClickbait.analysis || aiClickbait.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDescTemplatesLoading || aiDescTemplates) && (
              <Card data-testid="card-ai-desc-templates">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Description Templates</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDescTemplatesLoading ? <Skeleton className="h-24 w-full" /> : aiDescTemplates && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDescTemplates.templates || aiDescTemplates.descriptions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEndScreenCTALoading || aiEndScreenCTA) && (
              <Card data-testid="card-ai-end-screen-cta">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI End Screen CTA</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEndScreenCTALoading ? <Skeleton className="h-24 w-full" /> : aiEndScreenCTA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEndScreenCTA.ctas || aiEndScreenCTA.screens || aiEndScreenCTA.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPinnedCommentLoading || aiPinnedComment) && (
              <Card data-testid="card-ai-pinned-comment">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pinned Comments</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPinnedCommentLoading ? <Skeleton className="h-24 w-full" /> : aiPinnedComment && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPinnedComment.comments || aiPinnedComment.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCommunityPostsLoading || aiCommunityPosts) && (
              <Card data-testid="card-ai-community-posts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Community Posts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCommunityPostsLoading ? <Skeleton className="h-24 w-full" /> : aiCommunityPosts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCommunityPosts.posts || aiCommunityPosts.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmailSubjectsLoading || aiEmailSubjects) && (
              <Card data-testid="card-ai-email-subjects">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Email Subjects</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmailSubjectsLoading ? <Skeleton className="h-24 w-full" /> : aiEmailSubjects && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEmailSubjects.subjects || aiEmailSubjects.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBioWriterDataLoading || aiBioWriterData) && (
              <Card data-testid="card-ai-bio-writer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Bio Writer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBioWriterDataLoading ? <Skeleton className="h-24 w-full" /> : aiBioWriterData && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBioWriterData.bios || aiBioWriterData.suggestions || aiBioWriterData.variants)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVideoTagsLoading || aiVideoTags) && (
              <Card data-testid="card-ai-video-tags">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video Tags</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVideoTagsLoading ? <Skeleton className="h-24 w-full" /> : aiVideoTags && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVideoTags.tags || aiVideoTags.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHashtagsLoading || aiHashtags) && (
              <Card data-testid="card-ai-hashtags">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Hashtag Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHashtagsLoading ? <Skeleton className="h-24 w-full" /> : aiHashtags && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHashtags.hashtags || aiHashtags.suggestions || aiHashtags.optimized)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPlaylistLoading || aiPlaylist) && (
              <Card data-testid="card-ai-playlist">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Playlist Writer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPlaylistLoading ? <Skeleton className="h-24 w-full" /> : aiPlaylist && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPlaylist.playlists || aiPlaylist.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPressReleaseLoading || aiPressRelease) && (
              <Card data-testid="card-ai-press-release">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Press Release</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPressReleaseLoading ? <Skeleton className="h-24 w-full" /> : aiPressRelease && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiPressRelease.headline && <p className="font-medium text-foreground">{aiPressRelease.headline}</p>}
                      {renderAIList(aiPressRelease.sections || aiPressRelease.content)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTestimonialLoading || aiTestimonial) && (
              <Card data-testid="card-ai-testimonial">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Testimonial Drafter</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTestimonialLoading ? <Skeleton className="h-24 w-full" /> : aiTestimonial && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTestimonial.testimonials || aiTestimonial.drafts || aiTestimonial.suggestions)}
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
          onClick={() => setShowSEOAI(!showSEOAI)}
          data-testid="button-toggle-seo-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI SEO & Discovery Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showSEOAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showSEOAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiTagCloudLoading || aiTagCloud) && (
              <Card data-testid="card-ai-tag-cloud">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Tag Cloud</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTagCloudLoading ? <Skeleton className="h-24 w-full" /> : aiTagCloud && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTagCloud.tags || aiTagCloud.cloud || aiTagCloud.keywords)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSearchIntentLoading || aiSearchIntent) && (
              <Card data-testid="card-ai-search-intent">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Search Intent</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSearchIntentLoading ? <Skeleton className="h-24 w-full" /> : aiSearchIntent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSearchIntent.intents || aiSearchIntent.analysis || aiSearchIntent.categories)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAlgorithmLoading || aiAlgorithm) && (
              <Card data-testid="card-ai-algorithm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Algorithm Decoder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAlgorithmLoading ? <Skeleton className="h-24 w-full" /> : aiAlgorithm && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAlgorithm.factors || aiAlgorithm.signals || aiAlgorithm.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFeaturedSnippetLoading || aiFeaturedSnippet) && (
              <Card data-testid="card-ai-featured-snippet">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Featured Snippets</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFeaturedSnippetLoading ? <Skeleton className="h-24 w-full" /> : aiFeaturedSnippet && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFeaturedSnippet.snippets || aiFeaturedSnippet.opportunities || aiFeaturedSnippet.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrossSEOLoading || aiCrossSEO) && (
              <Card data-testid="card-ai-cross-seo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cross-Platform SEO</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrossSEOLoading ? <Skeleton className="h-24 w-full" /> : aiCrossSEO && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCrossSEO.platforms || aiCrossSEO.strategies || aiCrossSEO.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBacklinksLoading || aiBacklinks) && (
              <Card data-testid="card-ai-backlinks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Backlinks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBacklinksLoading ? <Skeleton className="h-24 w-full" /> : aiBacklinks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBacklinks.opportunities || aiBacklinks.backlinks || aiBacklinks.strategies)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFreshnessLoading || aiFreshness) && (
              <Card data-testid="card-ai-freshness">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Freshness</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFreshnessLoading ? <Skeleton className="h-24 w-full" /> : aiFreshness && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiFreshness.score != null && <p className="text-lg font-medium text-foreground">{aiFreshness.score}<span className="text-xs text-muted-foreground">/100 freshness</span></p>}
                      {renderAIList(aiFreshness.recommendations || aiFreshness.updates)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCannibalizationLoading || aiCannibalization) && (
              <Card data-testid="card-ai-cannibalization">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Keyword Cannibalization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCannibalizationLoading ? <Skeleton className="h-24 w-full" /> : aiCannibalization && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCannibalization.conflicts || aiCannibalization.issues || aiCannibalization.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLongTailLoading || aiLongTail) && (
              <Card data-testid="card-ai-long-tail">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Long-Tail Keywords</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLongTailLoading ? <Skeleton className="h-24 w-full" /> : aiLongTail && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLongTail.keywords || aiLongTail.suggestions || aiLongTail.phrases)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSitemapLoading || aiSitemap) && (
              <Card data-testid="card-ai-sitemap">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video Sitemap</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSitemapLoading ? <Skeleton className="h-24 w-full" /> : aiSitemap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSitemap.entries || aiSitemap.pages || aiSitemap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRichSnippetsLoading || aiRichSnippets) && (
              <Card data-testid="card-ai-rich-snippets">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Rich Snippets</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRichSnippetsLoading ? <Skeleton className="h-24 w-full" /> : aiRichSnippets && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRichSnippets.snippets || aiRichSnippets.schema || aiRichSnippets.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceSearchLoading || aiVoiceSearch) && (
              <Card data-testid="card-ai-voice-search">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voice Search</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceSearchLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceSearch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVoiceSearch.queries || aiVoiceSearch.optimizations || aiVoiceSearch.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAutocompleteLoading || aiAutocomplete) && (
              <Card data-testid="card-ai-autocomplete">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Autocomplete</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAutocompleteLoading ? <Skeleton className="h-24 w-full" /> : aiAutocomplete && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAutocomplete.suggestions || aiAutocomplete.queries || aiAutocomplete.terms)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGoogleTrendsLoading || aiGoogleTrends) && (
              <Card data-testid="card-ai-google-trends">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Google Trends</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGoogleTrendsLoading ? <Skeleton className="h-24 w-full" /> : aiGoogleTrends && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGoogleTrends.trends || aiGoogleTrends.topics || aiGoogleTrends.keywords)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompKeywordsLoading || aiCompKeywords) && (
              <Card data-testid="card-ai-comp-keywords">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Keywords</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompKeywordsLoading ? <Skeleton className="h-24 w-full" /> : aiCompKeywords && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCompKeywords.keywords || aiCompKeywords.competitors || aiCompKeywords.gaps)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSearchRankingLoading || aiSearchRanking) && (
              <Card data-testid="card-ai-search-ranking">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Search Rankings</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSearchRankingLoading ? <Skeleton className="h-24 w-full" /> : aiSearchRanking && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSearchRanking.rankings || aiSearchRanking.positions || aiSearchRanking.keywords)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCTRBenchLoading || aiCTRBench) && (
              <Card data-testid="card-ai-ctr-bench">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI CTR Benchmark</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCTRBenchLoading ? <Skeleton className="h-24 w-full" /> : aiCTRBench && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiCTRBench.averageCTR != null && <p className="text-lg font-medium text-foreground">{aiCTRBench.averageCTR}%<span className="text-xs text-muted-foreground"> avg CTR</span></p>}
                      {renderAIList(aiCTRBench.benchmarks || aiCTRBench.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiImpressionsLoading || aiImpressions) && (
              <Card data-testid="card-ai-impressions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Impression Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiImpressionsLoading ? <Skeleton className="h-24 w-full" /> : aiImpressions && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiImpressions.insights || aiImpressions.analysis || aiImpressions.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRelatedVidsLoading || aiRelatedVids) && (
              <Card data-testid="card-ai-related-vids">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Related Videos</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRelatedVidsLoading ? <Skeleton className="h-24 w-full" /> : aiRelatedVids && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRelatedVids.videos || aiRelatedVids.suggestions || aiRelatedVids.related)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrowseFeaturesLoading || aiBrowseFeatures) && (
              <Card data-testid="card-ai-browse-features">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Browse Features</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrowseFeaturesLoading ? <Skeleton className="h-24 w-full" /> : aiBrowseFeatures && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrowseFeatures.features || aiBrowseFeatures.opportunities || aiBrowseFeatures.recommendations)}
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
          onClick={() => setShowStrategyAI(!showStrategyAI)}
          data-testid="button-toggle-strategy-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Content Strategy Suite</span>
          <Badge variant="outline" className="text-[10px]">16 tools</Badge>
          {showStrategyAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showStrategyAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiPillarsLoading || aiPillars) && (
              <Card data-testid="card-ai-pillars">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Pillars</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPillarsLoading ? <Skeleton className="h-24 w-full" /> : aiPillars && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPillars.pillars || aiPillars.categories || aiPillars.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSeriesDataLoading || aiSeriesData) && (
              <Card data-testid="card-ai-series">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Series Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSeriesDataLoading ? <Skeleton className="h-24 w-full" /> : aiSeriesData && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSeriesData.series || aiSeriesData.episodes || aiSeriesData.concepts)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRepurposeMatrixLoading || aiRepurposeMatrix) && (
              <Card data-testid="card-ai-repurpose-matrix">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Repurpose Matrix</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRepurposeMatrixLoading ? <Skeleton className="h-24 w-full" /> : aiRepurposeMatrix && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRepurposeMatrix.matrix || aiRepurposeMatrix.formats || aiRepurposeMatrix.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiViralScoreLoading || aiViralScore) && (
              <Card data-testid="card-ai-viral-score">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Viral Score</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiViralScoreLoading ? <Skeleton className="h-24 w-full" /> : aiViralScore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiViralScore.score != null && <p className="text-lg font-medium text-foreground">{aiViralScore.score}<span className="text-xs text-muted-foreground">/100 viral</span></p>}
                      {renderAIList(aiViralScore.factors || aiViralScore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentGapsLoading || aiContentGaps) && (
              <Card data-testid="card-ai-content-gaps">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Gaps</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentGapsLoading ? <Skeleton className="h-24 w-full" /> : aiContentGaps && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentGaps.gaps || aiContentGaps.opportunities || aiContentGaps.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrendSurfLoading || aiTrendSurf) && (
              <Card data-testid="card-ai-trend-surf">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Trend Surfer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrendSurfLoading ? <Skeleton className="h-24 w-full" /> : aiTrendSurf && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrendSurf.trends || aiTrendSurf.topics || aiTrendSurf.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEvergreenLoading || aiEvergreen) && (
              <Card data-testid="card-ai-evergreen">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Evergreen Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEvergreenLoading ? <Skeleton className="h-24 w-full" /> : aiEvergreen && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEvergreen.topics || aiEvergreen.ideas || aiEvergreen.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentMixLoading || aiContentMix) && (
              <Card data-testid="card-ai-content-mix">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Mix</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentMixLoading ? <Skeleton className="h-24 w-full" /> : aiContentMix && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentMix.mix || aiContentMix.categories || aiContentMix.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSeasonalPlanLoading || aiSeasonalPlan) && (
              <Card data-testid="card-ai-seasonal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Seasonal Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSeasonalPlanLoading ? <Skeleton className="h-24 w-full" /> : aiSeasonalPlan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSeasonalPlan.seasons || aiSeasonalPlan.events || aiSeasonalPlan.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabContentLoading || aiCollabContent) && (
              <Card data-testid="card-ai-collab-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabContentLoading ? <Skeleton className="h-24 w-full" /> : aiCollabContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabContent.ideas || aiCollabContent.collaborations || aiCollabContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBTSPlanLoading || aiBTSPlan) && (
              <Card data-testid="card-ai-bts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI BTS Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBTSPlanLoading ? <Skeleton className="h-24 w-full" /> : aiBTSPlan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBTSPlan.ideas || aiBTSPlan.scenes || aiBTSPlan.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReactionContentLoading || aiReactionContent) && (
              <Card data-testid="card-ai-reaction">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Reaction Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReactionContentLoading ? <Skeleton className="h-24 w-full" /> : aiReactionContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiReactionContent.ideas || aiReactionContent.topics || aiReactionContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiChallengeLoading || aiChallenge) && (
              <Card data-testid="card-ai-challenge">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Challenge Creator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiChallengeLoading ? <Skeleton className="h-24 w-full" /> : aiChallenge && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiChallenge.challenges || aiChallenge.ideas || aiChallenge.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQnAPlanLoading || aiQnAPlan) && (
              <Card data-testid="card-ai-qna">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Q&A Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQnAPlanLoading ? <Skeleton className="h-24 w-full" /> : aiQnAPlan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiQnAPlan.questions || aiQnAPlan.topics || aiQnAPlan.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTutorialLoading || aiTutorial) && (
              <Card data-testid="card-ai-tutorial">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Tutorial Structure</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTutorialLoading ? <Skeleton className="h-24 w-full" /> : aiTutorial && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTutorial.steps || aiTutorial.structure || aiTutorial.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDocumentaryLoading || aiDocumentary) && (
              <Card data-testid="card-ai-documentary">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Documentary Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDocumentaryLoading ? <Skeleton className="h-24 w-full" /> : aiDocumentary && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDocumentary.episodes || aiDocumentary.arcs || aiDocumentary.recommendations)}
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
          onClick={() => setShowShortsAI(!showShortsAI)}
          data-testid="button-toggle-shorts-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Shorts & Short-Form Suite</span>
          <Badge variant="outline" className="text-[10px]">16 tools</Badge>
          {showShortsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showShortsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiShortFormLoading || aiShortForm) && (
              <Card data-testid="card-ai-short-form">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Short-Form Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortFormLoading ? <Skeleton className="h-24 w-full" /> : aiShortForm && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortForm.strategies || aiShortForm.tips || aiShortForm.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsIdeasLoading || aiShortsIdeas) && (
              <Card data-testid="card-ai-shorts-ideas">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Ideas</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsIdeasLoading ? <Skeleton className="h-24 w-full" /> : aiShortsIdeas && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsIdeas.ideas || aiShortsIdeas.concepts || aiShortsIdeas.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsToLongLoading || aiShortsToLong) && (
              <Card data-testid="card-ai-shorts-to-long">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts to Long</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsToLongLoading ? <Skeleton className="h-24 w-full" /> : aiShortsToLong && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsToLong.conversions || aiShortsToLong.ideas || aiShortsToLong.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLongToShortsLoading || aiLongToShorts) && (
              <Card data-testid="card-ai-long-to-shorts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Long to Shorts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLongToShortsLoading ? <Skeleton className="h-24 w-full" /> : aiLongToShorts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLongToShorts.clips || aiLongToShorts.segments || aiLongToShorts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVerticalVidLoading || aiVerticalVid) && (
              <Card data-testid="card-ai-vertical">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Vertical Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVerticalVidLoading ? <Skeleton className="h-24 w-full" /> : aiVerticalVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVerticalVid.tips || aiVerticalVid.formats || aiVerticalVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsAudioLoading || aiShortsAudio) && (
              <Card data-testid="card-ai-shorts-audio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Audio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsAudioLoading ? <Skeleton className="h-24 w-full" /> : aiShortsAudio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsAudio.sounds || aiShortsAudio.music || aiShortsAudio.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsCaptionsLoading || aiShortsCaptions) && (
              <Card data-testid="card-ai-shorts-captions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Captions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsCaptionsLoading ? <Skeleton className="h-24 w-full" /> : aiShortsCaptions && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsCaptions.styles || aiShortsCaptions.captions || aiShortsCaptions.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsHooksLoading || aiShortsHooks) && (
              <Card data-testid="card-ai-shorts-hooks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Hooks</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsHooksLoading ? <Skeleton className="h-24 w-full" /> : aiShortsHooks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsHooks.hooks || aiShortsHooks.openings || aiShortsHooks.suggestions)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDuetStitchLoading || aiDuetStitch) && (
              <Card data-testid="card-ai-duet-stitch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Duet & Stitch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDuetStitchLoading ? <Skeleton className="h-24 w-full" /> : aiDuetStitch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDuetStitch.ideas || aiDuetStitch.duets || aiDuetStitch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsAnalyticsLoading || aiShortsAnalytics) && (
              <Card data-testid="card-ai-shorts-analytics">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Analytics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsAnalyticsLoading ? <Skeleton className="h-24 w-full" /> : aiShortsAnalytics && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiShortsAnalytics.score != null && <p className="text-lg font-medium text-foreground">{aiShortsAnalytics.score}<span className="text-xs text-muted-foreground">/100</span></p>}
                      {renderAIList(aiShortsAnalytics.insights || aiShortsAnalytics.metrics || aiShortsAnalytics.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsBatchLoading || aiShortsBatch) && (
              <Card data-testid="card-ai-shorts-batch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Batch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsBatchLoading ? <Skeleton className="h-24 w-full" /> : aiShortsBatch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsBatch.batches || aiShortsBatch.schedule || aiShortsBatch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsRemixLoading || aiShortsRemix) && (
              <Card data-testid="card-ai-shorts-remix">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Remix</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsRemixLoading ? <Skeleton className="h-24 w-full" /> : aiShortsRemix && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsRemix.remixes || aiShortsRemix.ideas || aiShortsRemix.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShortsMoneyLoading || aiShortsMoney) && (
              <Card data-testid="card-ai-shorts-money">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Shorts Monetization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShortsMoneyLoading ? <Skeleton className="h-24 w-full" /> : aiShortsMoney && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiShortsMoney.strategies || aiShortsMoney.revenue || aiShortsMoney.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAuditLoading || aiAudit) && (
              <Card data-testid="card-ai-audit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Audit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAuditLoading ? <Skeleton className="h-24 w-full" /> : aiAudit && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiAudit.score != null && <p className="text-lg font-medium text-foreground">{aiAudit.score}<span className="text-xs text-muted-foreground">/100</span></p>}
                      {renderAIList(aiAudit.findings || aiAudit.issues || aiAudit.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVelocityLoading || aiVelocity) && (
              <Card data-testid="card-ai-velocity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Velocity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVelocityLoading ? <Skeleton className="h-24 w-full" /> : aiVelocity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {aiVelocity.velocity && <p className="font-medium text-foreground">{aiVelocity.velocity}</p>}
                      {renderAIList(aiVelocity.metrics || aiVelocity.tips || aiVelocity.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNicheLoading || aiNiche) && (
              <Card data-testid="card-ai-niche">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Niche Researcher</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNicheLoading ? <Skeleton className="h-24 w-full" /> : aiNiche && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNiche.niches || aiNiche.opportunities || aiNiche.recommendations)}
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
          onClick={() => setShowCaptionsAI(!showCaptionsAI)}
          data-testid="button-toggle-captions-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Captions & Localization Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showCaptionsAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCaptionsAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCaptionsLoading || aiCaptions) && (
              <Card data-testid="card-ai-captions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Caption Generator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaptionsLoading ? <Skeleton className="h-24 w-full" /> : aiCaptions && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCaptions.captions || aiCaptions.suggestions || aiCaptions.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCaptionStyleLoading || aiCaptionStyle) && (
              <Card data-testid="card-ai-caption-style">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Caption Styler</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaptionStyleLoading ? <Skeleton className="h-24 w-full" /> : aiCaptionStyle && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCaptionStyle.styles || aiCaptionStyle.templates || aiCaptionStyle.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubtitlesLoading || aiSubtitles) && (
              <Card data-testid="card-ai-subtitles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Subtitle Translator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubtitlesLoading ? <Skeleton className="h-24 w-full" /> : aiSubtitles && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSubtitles.translations || aiSubtitles.languages || aiSubtitles.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiLangSEOLoading || aiMultiLangSEO) && (
              <Card data-testid="card-ai-multi-lang-seo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Multi-Language SEO</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiLangSEOLoading ? <Skeleton className="h-24 w-full" /> : aiMultiLangSEO && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiLangSEO.keywords || aiMultiLangSEO.languages || aiMultiLangSEO.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLocalizationLoading || aiLocalization) && (
              <Card data-testid="card-ai-localization">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Localization</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLocalizationLoading ? <Skeleton className="h-24 w-full" /> : aiLocalization && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLocalization.regions || aiLocalization.strategies || aiLocalization.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDubbingLoading || aiDubbing) && (
              <Card data-testid="card-ai-dubbing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Dubbing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDubbingLoading ? <Skeleton className="h-24 w-full" /> : aiDubbing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDubbing.languages || aiDubbing.voices || aiDubbing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTranscriptLoading || aiTranscript) && (
              <Card data-testid="card-ai-transcript">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Transcript</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTranscriptLoading ? <Skeleton className="h-24 w-full" /> : aiTranscript && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTranscript.segments || aiTranscript.transcript || aiTranscript.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCaptionCompLoading || aiCaptionComp) && (
              <Card data-testid="card-ai-caption-comp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Caption Compliance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaptionCompLoading ? <Skeleton className="h-24 w-full" /> : aiCaptionComp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCaptionComp.issues || aiCaptionComp.checks || aiCaptionComp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAudioDescLoading || aiAudioDesc) && (
              <Card data-testid="card-ai-audio-desc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Audio Description</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAudioDescLoading ? <Skeleton className="h-24 w-full" /> : aiAudioDesc && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAudioDesc.descriptions || aiAudioDesc.scenes || aiAudioDesc.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLangPriorityLoading || aiLangPriority) && (
              <Card data-testid="card-ai-lang-priority">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Language Priority</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLangPriorityLoading ? <Skeleton className="h-24 w-full" /> : aiLangPriority && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLangPriority.languages || aiLangPriority.priorities || aiLangPriority.recommendations)}
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
            {(aiPodcastLaunchLoading || aiPodcastLaunch) && (
              <Card data-testid="card-ai-podcast-launch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast Launch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodcastLaunchLoading ? <Skeleton className="h-24 w-full" /> : aiPodcastLaunch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodcastLaunch.steps || aiPodcastLaunch.recommendations || aiPodcastLaunch.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPodcastEpLoading || aiPodcastEp) && (
              <Card data-testid="card-ai-podcast-ep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast Episode</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodcastEpLoading ? <Skeleton className="h-24 w-full" /> : aiPodcastEp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodcastEp.episodes || aiPodcastEp.recommendations || aiPodcastEp.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPodcastSEOLoading || aiPodcastSEO) && (
              <Card data-testid="card-ai-podcast-seo">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Podcast SEO</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPodcastSEOLoading ? <Skeleton className="h-24 w-full" /> : aiPodcastSEO && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPodcastSEO.keywords || aiPodcastSEO.recommendations || aiPodcastSEO.results)}
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
                      {renderAIList(aiASMR.sounds || aiASMR.recommendations || aiASMR.results)}
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
          onClick={() => setShowAccessibilityAI(!showAccessibilityAI)}
          data-testid="button-toggle-accessibility-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Accessibility Suite</span>
          <Badge variant="outline" className="text-[10px]">11 tools</Badge>
          {showAccessibilityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showAccessibilityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiAccTextLoading || aiAccText) && (
              <Card data-testid="card-ai-acc-text">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Accessibility Text</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAccTextLoading ? <Skeleton className="h-24 w-full" /> : aiAccText && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAccText.suggestions || aiAccText.text || aiAccText.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAltTextLoading || aiAltText) && (
              <Card data-testid="card-ai-alt-text">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Alt Text</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAltTextLoading ? <Skeleton className="h-24 w-full" /> : aiAltText && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAltText.descriptions || aiAltText.alt_texts || aiAltText.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContrastLoading || aiContrast) && (
              <Card data-testid="card-ai-contrast">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Color Contrast</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContrastLoading ? <Skeleton className="h-24 w-full" /> : aiContrast && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContrast.analysis || aiContrast.issues || aiContrast.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiScreenReadLoading || aiScreenRead) && (
              <Card data-testid="card-ai-screen-read">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Screen Reader</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiScreenReadLoading ? <Skeleton className="h-24 w-full" /> : aiScreenRead && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiScreenRead.optimizations || aiScreenRead.tips || aiScreenRead.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiKbdNavLoading || aiKbdNav) && (
              <Card data-testid="card-ai-kbd-nav">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Keyboard Nav</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiKbdNavLoading ? <Skeleton className="h-24 w-full" /> : aiKbdNav && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiKbdNav.patterns || aiKbdNav.shortcuts || aiKbdNav.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCapQualityLoading || aiCapQuality) && (
              <Card data-testid="card-ai-cap-quality">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Caption Quality</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCapQualityLoading ? <Skeleton className="h-24 w-full" /> : aiCapQuality && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCapQuality.scores || aiCapQuality.issues || aiCapQuality.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInclLangLoading || aiInclLang) && (
              <Card data-testid="card-ai-incl-lang">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Inclusive Language</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInclLangLoading ? <Skeleton className="h-24 w-full" /> : aiInclLang && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInclLang.suggestions || aiInclLang.alternatives || aiInclLang.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDyslexiaLoading || aiDyslexia) && (
              <Card data-testid="card-ai-dyslexia">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Dyslexia Format</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDyslexiaLoading ? <Skeleton className="h-24 w-full" /> : aiDyslexia && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDyslexia.formats || aiDyslexia.tips || aiDyslexia.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMotionSensLoading || aiMotionSens) && (
              <Card data-testid="card-ai-motion-sens">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Motion Sensitivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMotionSensLoading ? <Skeleton className="h-24 w-full" /> : aiMotionSens && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMotionSens.analysis || aiMotionSens.flags || aiMotionSens.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCogLoadLoading || aiCogLoad) && (
              <Card data-testid="card-ai-cog-load">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Cognitive Load</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCogLoadLoading ? <Skeleton className="h-24 w-full" /> : aiCogLoad && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCogLoad.analysis || aiCogLoad.scores || aiCogLoad.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiModalLoading || aiMultiModal) && (
              <Card data-testid="card-ai-multi-modal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Multi-Modal Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiModalLoading ? <Skeleton className="h-24 w-full" /> : aiMultiModal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiModal.formats || aiMultiModal.content || aiMultiModal.recommendations)}
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
          onClick={() => setShowMobileAI(!showMobileAI)}
          data-testid="button-toggle-mobile-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Mobile & Multi-Device Suite</span>
          <Badge variant="outline" className="text-[10px]">14 tools</Badge>
          {showMobileAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showMobileAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiMobileOptLoading || aiMobileOpt) && (
              <Card data-testid="card-ai-mobile-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mobile Optimize</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMobileOptLoading ? <Skeleton className="h-24 w-full" /> : aiMobileOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMobileOpt.optimizations || aiMobileOpt.tips || aiMobileOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDeepLinksLoading || aiDeepLinks) && (
              <Card data-testid="card-ai-deep-links">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Deep Links</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDeepLinksLoading ? <Skeleton className="h-24 w-full" /> : aiDeepLinks && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDeepLinks.links || aiDeepLinks.strategies || aiDeepLinks.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPushNotifLoading || aiPushNotif) && (
              <Card data-testid="card-ai-push-notif">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Push Notifications</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPushNotifLoading ? <Skeleton className="h-24 w-full" /> : aiPushNotif && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPushNotif.templates || aiPushNotif.strategies || aiPushNotif.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMobileVidLoading || aiMobileVid) && (
              <Card data-testid="card-ai-mobile-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mobile Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMobileVidLoading ? <Skeleton className="h-24 w-full" /> : aiMobileVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMobileVid.formats || aiMobileVid.tips || aiMobileVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiResponsiveLoading || aiResponsive) && (
              <Card data-testid="card-ai-responsive">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Responsive Check</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiResponsiveLoading ? <Skeleton className="h-24 w-full" /> : aiResponsive && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiResponsive.issues || aiResponsive.checks || aiResponsive.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMobilePayLoading || aiMobilePay) && (
              <Card data-testid="card-ai-mobile-pay">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mobile Payment</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMobilePayLoading ? <Skeleton className="h-24 w-full" /> : aiMobilePay && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMobilePay.options || aiMobilePay.integrations || aiMobilePay.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiOfflineLoading || aiOffline) && (
              <Card data-testid="card-ai-offline">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Offline Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOfflineLoading ? <Skeleton className="h-24 w-full" /> : aiOffline && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOffline.strategies || aiOffline.content || aiOffline.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMobileAnalyticsLoading || aiMobileAnalytics) && (
              <Card data-testid="card-ai-mobile-analytics">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mobile Analytics</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMobileAnalyticsLoading ? <Skeleton className="h-24 w-full" /> : aiMobileAnalytics && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMobileAnalytics.metrics || aiMobileAnalytics.insights || aiMobileAnalytics.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAppStoreLoading || aiAppStore) && (
              <Card data-testid="card-ai-app-store">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI App Store</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAppStoreLoading ? <Skeleton className="h-24 w-full" /> : aiAppStore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAppStore.optimization || aiAppStore.listings || aiAppStore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWidgetsLoading || aiWidgets) && (
              <Card data-testid="card-ai-widgets">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Widget Design</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWidgetsLoading ? <Skeleton className="h-24 w-full" /> : aiWidgets && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWidgets.designs || aiWidgets.widgets || aiWidgets.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGesturesLoading || aiGestures) && (
              <Card data-testid="card-ai-gestures">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Gesture Optimize</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGesturesLoading ? <Skeleton className="h-24 w-full" /> : aiGestures && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGestures.patterns || aiGestures.optimizations || aiGestures.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMobileFirstLoading || aiMobileFirst) && (
              <Card data-testid="card-ai-mobile-first">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mobile First</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMobileFirstLoading ? <Skeleton className="h-24 w-full" /> : aiMobileFirst && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMobileFirst.strategies || aiMobileFirst.design || aiMobileFirst.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWearableLoading || aiWearable) && (
              <Card data-testid="card-ai-wearable">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Wearable</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWearableLoading ? <Skeleton className="h-24 w-full" /> : aiWearable && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWearable.content || aiWearable.formats || aiWearable.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSmartTVLoading || aiSmartTV) && (
              <Card data-testid="card-ai-smart-tv">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Smart TV</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSmartTVLoading ? <Skeleton className="h-24 w-full" /> : aiSmartTV && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSmartTV.content || aiSmartTV.formats || aiSmartTV.recommendations)}
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
          onClick={() => setShowNicheAI(!showNicheAI)}
          data-testid="button-toggle-niche-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Niche Content Suite</span>
          <Badge variant="outline" className="text-[10px]">16 tools</Badge>
          {showNicheAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showNicheAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiGamingNicheLoading || aiGamingNiche) && (
              <Card data-testid="card-ai-gaming-niche">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Gaming Niche</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGamingNicheLoading ? <Skeleton className="h-24 w-full" /> : aiGamingNiche && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGamingNiche.content || aiGamingNiche.ideas || aiGamingNiche.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBeautyNicheLoading || aiBeautyNiche) && (
              <Card data-testid="card-ai-beauty-niche">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Beauty Niche</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBeautyNicheLoading ? <Skeleton className="h-24 w-full" /> : aiBeautyNiche && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBeautyNiche.content || aiBeautyNiche.ideas || aiBeautyNiche.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTechReviewLoading || aiTechReview) && (
              <Card data-testid="card-ai-tech-review">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Tech Review</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTechReviewLoading ? <Skeleton className="h-24 w-full" /> : aiTechReview && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTechReview.content || aiTechReview.reviews || aiTechReview.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFoodContentLoading || aiFoodContent) && (
              <Card data-testid="card-ai-food-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Food Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFoodContentLoading ? <Skeleton className="h-24 w-full" /> : aiFoodContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFoodContent.content || aiFoodContent.recipes || aiFoodContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFitnessContentLoading || aiFitnessContent) && (
              <Card data-testid="card-ai-fitness-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Fitness Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFitnessContentLoading ? <Skeleton className="h-24 w-full" /> : aiFitnessContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFitnessContent.content || aiFitnessContent.workouts || aiFitnessContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTravelContentLoading || aiTravelContent) && (
              <Card data-testid="card-ai-travel-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Travel Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTravelContentLoading ? <Skeleton className="h-24 w-full" /> : aiTravelContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTravelContent.content || aiTravelContent.destinations || aiTravelContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEduContentLoading || aiEduContent) && (
              <Card data-testid="card-ai-edu-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Education Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEduContentLoading ? <Skeleton className="h-24 w-full" /> : aiEduContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEduContent.content || aiEduContent.courses || aiEduContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFinContentLoading || aiFinContent) && (
              <Card data-testid="card-ai-fin-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Finance Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFinContentLoading ? <Skeleton className="h-24 w-full" /> : aiFinContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFinContent.content || aiFinContent.topics || aiFinContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiParentContentLoading || aiParentContent) && (
              <Card data-testid="card-ai-parent-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Parenting Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiParentContentLoading ? <Skeleton className="h-24 w-full" /> : aiParentContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiParentContent.content || aiParentContent.topics || aiParentContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPetContentLoading || aiPetContent) && (
              <Card data-testid="card-ai-pet-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pet Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPetContentLoading ? <Skeleton className="h-24 w-full" /> : aiPetContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPetContent.content || aiPetContent.topics || aiPetContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDIYCraftLoading || aiDIYCraft) && (
              <Card data-testid="card-ai-diy-craft">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI DIY & Craft</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDIYCraftLoading ? <Skeleton className="h-24 w-full" /> : aiDIYCraft && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDIYCraft.content || aiDIYCraft.projects || aiDIYCraft.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMusicianContentLoading || aiMusicianContent) && (
              <Card data-testid="card-ai-musician-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Musician Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMusicianContentLoading ? <Skeleton className="h-24 w-full" /> : aiMusicianContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMusicianContent.content || aiMusicianContent.ideas || aiMusicianContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiComedyContentLoading || aiComedyContent) && (
              <Card data-testid="card-ai-comedy-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Comedy Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiComedyContentLoading ? <Skeleton className="h-24 w-full" /> : aiComedyContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiComedyContent.content || aiComedyContent.bits || aiComedyContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSportsContentLoading || aiSportsContent) && (
              <Card data-testid="card-ai-sports-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sports Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSportsContentLoading ? <Skeleton className="h-24 w-full" /> : aiSportsContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSportsContent.content || aiSportsContent.coverage || aiSportsContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNewsCommenLoading || aiNewsCommen) && (
              <Card data-testid="card-ai-news-commen">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI News Commentary</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNewsCommenLoading ? <Skeleton className="h-24 w-full" /> : aiNewsCommen && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNewsCommen.content || aiNewsCommen.commentary || aiNewsCommen.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLifestyleContentLoading || aiLifestyleContent) && (
              <Card data-testid="card-ai-lifestyle-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Lifestyle Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLifestyleContentLoading ? <Skeleton className="h-24 w-full" /> : aiLifestyleContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLifestyleContent.content || aiLifestyleContent.ideas || aiLifestyleContent.recommendations)}
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
          onClick={() => setShowRepurposeMatrixAI(!showRepurposeMatrixAI)}
          data-testid="button-toggle-repurpose-matrix-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Content Repurposing Matrix</span>
          <Badge variant="outline" className="text-[10px]">12 tools</Badge>
          {showRepurposeMatrixAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showRepurposeMatrixAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiVidToBookLoading || aiVidToBook) && (
              <Card data-testid="card-ai-vid-to-book">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video to Book</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVidToBookLoading ? <Skeleton className="h-24 w-full" /> : aiVidToBook && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVidToBook.chapters || aiVidToBook.outline || aiVidToBook.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVidToPodLoading || aiVidToPod) && (
              <Card data-testid="card-ai-vid-to-pod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video to Podcast</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVidToPodLoading ? <Skeleton className="h-24 w-full" /> : aiVidToPod && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVidToPod.episodes || aiVidToPod.format || aiVidToPod.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVidToCourseLoading || aiVidToCourse) && (
              <Card data-testid="card-ai-vid-to-course">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Video to Course</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVidToCourseLoading ? <Skeleton className="h-24 w-full" /> : aiVidToCourse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVidToCourse.modules || aiVidToCourse.curriculum || aiVidToCourse.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBlogToVidLoading || aiBlogToVid) && (
              <Card data-testid="card-ai-blog-to-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Blog to Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBlogToVidLoading ? <Skeleton className="h-24 w-full" /> : aiBlogToVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBlogToVid.scripts || aiBlogToVid.storyboard || aiBlogToVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTwitThreadLoading || aiTwitThread) && (
              <Card data-testid="card-ai-twit-thread">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Twitter Thread</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTwitThreadLoading ? <Skeleton className="h-24 w-full" /> : aiTwitThread && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTwitThread.threads || aiTwitThread.tweets || aiTwitThread.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLIAdapterLoading || aiLIAdapter) && (
              <Card data-testid="card-ai-li-adapter">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI LinkedIn Adapter</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLIAdapterLoading ? <Skeleton className="h-24 w-full" /> : aiLIAdapter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLIAdapter.posts || aiLIAdapter.content || aiLIAdapter.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPintPinsLoading || aiPintPins) && (
              <Card data-testid="card-ai-pint-pins">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pinterest Pins</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPintPinsLoading ? <Skeleton className="h-24 w-full" /> : aiPintPins && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPintPins.pins || aiPintPins.boards || aiPintPins.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRedditOptLoading || aiRedditOpt) && (
              <Card data-testid="card-ai-reddit-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Reddit Post</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRedditOptLoading ? <Skeleton className="h-24 w-full" /> : aiRedditOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRedditOpt.posts || aiRedditOpt.subreddits || aiRedditOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQuoraAnsLoading || aiQuoraAns) && (
              <Card data-testid="card-ai-quora-ans">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Quora Answer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQuoraAnsLoading ? <Skeleton className="h-24 w-full" /> : aiQuoraAns && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiQuoraAns.answers || aiQuoraAns.questions || aiQuoraAns.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediumArtLoading || aiMediumArt) && (
              <Card data-testid="card-ai-medium-art">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Medium Article</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediumArtLoading ? <Skeleton className="h-24 w-full" /> : aiMediumArt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMediumArt.articles || aiMediumArt.topics || aiMediumArt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSlidedeckLoading || aiSlidedeck) && (
              <Card data-testid="card-ai-slidedeck">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Slidedeck</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSlidedeckLoading ? <Skeleton className="h-24 w-full" /> : aiSlidedeck && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSlidedeck.slides || aiSlidedeck.outline || aiSlidedeck.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInfographicRepLoading || aiInfographicRep) && (
              <Card data-testid="card-ai-infographic-rep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Infographic Repurpose</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInfographicRepLoading ? <Skeleton className="h-24 w-full" /> : aiInfographicRep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInfographicRep.infographics || aiInfographicRep.data || aiInfographicRep.recommendations)}
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
          onClick={() => setShowWatchTimeAI(!showWatchTimeAI)}
          data-testid="button-toggle-watch-time-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Watch Time Optimization Suite</span>
          <Badge variant="outline" className="text-[10px]">5 tools</Badge>
          {showWatchTimeAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWatchTimeAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiWatchTimeLoading || aiWatchTime) && (
              <Card data-testid="card-ai-watch-time">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Watch Time Boost</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWatchTimeLoading ? <Skeleton className="h-24 w-full" /> : aiWatchTime && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWatchTime.tips || aiWatchTime.strategies || aiWatchTime.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiOpenLoopsLoading || aiOpenLoops) && (
              <Card data-testid="card-ai-open-loops">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Open Loops</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiOpenLoopsLoading ? <Skeleton className="h-24 w-full" /> : aiOpenLoops && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiOpenLoops.loops || aiOpenLoops.hooks || aiOpenLoops.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPatternIntLoading || aiPatternInt) && (
              <Card data-testid="card-ai-pattern-int">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Pattern Interrupts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPatternIntLoading ? <Skeleton className="h-24 w-full" /> : aiPatternInt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPatternInt.interrupts || aiPatternInt.techniques || aiPatternInt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReEngageLoading || aiReEngage) && (
              <Card data-testid="card-ai-re-engage">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Re-Engagement</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReEngageLoading ? <Skeleton className="h-24 w-full" /> : aiReEngage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiReEngage.strategies || aiReEngage.hooks || aiReEngage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBingeWatchLoading || aiBingeWatch) && (
              <Card data-testid="card-ai-binge-watch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Binge Watch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBingeWatchLoading ? <Skeleton className="h-24 w-full" /> : aiBingeWatch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBingeWatch.strategies || aiBingeWatch.series || aiBingeWatch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <button
          className="w-full flex items-center gap-2 p-4 text-left"
          onClick={() => setShowContentQualityAI(!showContentQualityAI)}
          data-testid="button-toggle-content-quality-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Content Quality & Cross-Platform Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showContentQualityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showContentQualityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiScriptCoachLoading || aiScriptCoach) && (
              <Card data-testid="card-ai-script-coach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Script Coach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiScriptCoachLoading ? <Skeleton className="h-24 w-full" /> : aiScriptCoach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiScriptCoach.tips || aiScriptCoach.analysis || aiScriptCoach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThumbCTRPredictorLoading || aiThumbCTRPredictor) && (
              <Card data-testid="card-ai-thumb-ctr-predictor">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thumbnail CTR Predictor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThumbCTRPredictorLoading ? <Skeleton className="h-24 w-full" /> : aiThumbCTRPredictor && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThumbCTRPredictor.predictions || aiThumbCTRPredictor.analysis || aiThumbCTRPredictor.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPlatformRepurposerLoading || aiPlatformRepurposer) && (
              <Card data-testid="card-ai-platform-repurposer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Platform Repurposer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPlatformRepurposerLoading ? <Skeleton className="h-24 w-full" /> : aiPlatformRepurposer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPlatformRepurposer.adaptations || aiPlatformRepurposer.platforms || aiPlatformRepurposer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentDecayLoading || aiContentDecay) && (
              <Card data-testid="card-ai-content-decay">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Decay Detector</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentDecayLoading ? <Skeleton className="h-24 w-full" /> : aiContentDecay && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentDecay.declining || aiContentDecay.videos || aiContentDecay.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTitleABTesterLoading || aiTitleABTester) && (
              <Card data-testid="card-ai-title-ab-tester">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Title A/B Tester</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTitleABTesterLoading ? <Skeleton className="h-24 w-full" /> : aiTitleABTester && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTitleABTester.variations || aiTitleABTester.tests || aiTitleABTester.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDescOptimizerLoading || aiDescOptimizer) && (
              <Card data-testid="card-ai-desc-optimizer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Description Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDescOptimizerLoading ? <Skeleton className="h-24 w-full" /> : aiDescOptimizer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDescOptimizer.descriptions || aiDescOptimizer.suggestions || aiDescOptimizer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentRoadmapLoading || aiContentRoadmap) && (
              <Card data-testid="card-ai-content-roadmap">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Roadmap</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentRoadmapLoading ? <Skeleton className="h-24 w-full" /> : aiContentRoadmap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentRoadmap.milestones || aiContentRoadmap.strategy || aiContentRoadmap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEvergreenIdentifierLoading || aiEvergreenIdentifier) && (
              <Card data-testid="card-ai-evergreen-identifier">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Evergreen Content Identifier</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEvergreenIdentifierLoading ? <Skeleton className="h-24 w-full" /> : aiEvergreenIdentifier && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEvergreenIdentifier.ideas || aiEvergreenIdentifier.topics || aiEvergreenIdentifier.recommendations)}
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

function ChannelsTab() {
  const { data: channels, isLoading } = useChannels();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const { isAdvanced } = useAdvancedMode();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/youtube/auth", { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const channelsByPlatform = useMemo(() => {
    const map: Record<string, Channel[]> = {};
    channels?.forEach((ch) => {
      if (!map[ch.platform]) map[ch.platform] = [];
      map[ch.platform].push(ch);
    });
    return map;
  }, [channels]);

  const connectedCount = channels?.length || 0;
  const allPlatforms = useMemo(() => {
    if (activeCategory === "all") return [...PLATFORMS];
    return PLATFORMS.filter((p: Platform) => PLATFORM_INFO[p].category === activeCategory);
  }, [activeCategory]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{connectedCount} connected</p>
        {isAdvanced && (
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.key}
                size="sm"
                variant={activeCategory === cat.key ? "default" : "outline"}
                onClick={() => setActiveCategory(cat.key)}
                className="toggle-elevate"
                data-testid={`filter-category-${cat.key}`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allPlatforms.map((platform: Platform) => {
          const info = PLATFORM_INFO[platform];
          const connectedChannels = channelsByPlatform[platform] || [];
          const isConnected = connectedChannels.length > 0;
          const isYouTube = platform === "youtube";

          return (
            <Card key={platform} data-testid={`card-platform-${platform}`} className="hover-elevate overflow-visible">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0" style={{ color: info.color }}>
                      <PlatformIcon platform={platform} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{info.label}</p>
                      {isAdvanced && <Badge variant="secondary" className="mt-0.5">{info.category}</Badge>}
                    </div>
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">On</span>
                    </div>
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {isConnected && connectedChannels.map((ch) => (
                  <div key={ch.id} className="text-xs">
                    <p className="font-medium truncate">{ch.channelName}</p>
                    {ch.lastSyncAt && (
                      <span className="text-muted-foreground">Synced {format(new Date(ch.lastSyncAt), "MMM d")}</span>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                  {isYouTube && !isConnected ? (
                    <Button size="sm" onClick={handleConnect} disabled={connecting} data-testid="button-connect-youtube">
                      {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <SiYoutube className="h-3.5 w-3.5 mr-1.5" />}
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : isYouTube && isConnected ? (
                    <ChannelActions channels={connectedChannels} />
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setSelectedPlatform(platform)} data-testid={`button-details-${platform}`}>
                      {isConnected ? "Details" : "Learn More"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedPlatform && (
        <PlatformDialog platform={selectedPlatform} onClose={() => setSelectedPlatform(null)} existingChannels={channels} />
      )}
    </div>
  );
}

function ChannelActions({ channels }: { channels: Channel[] }) {
  const { toast } = useToast();
  const syncMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const res = await apiRequest("POST", `/api/youtube/sync/${channelId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Synced", description: `${data.synced} videos synced` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (channelId: number) => { await apiRequest("DELETE", `/api/channels/${channelId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Removed" });
    },
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {channels.map((ch) => (
        <div key={ch.id} className="flex items-center gap-1">
          {!!ch.accessToken && (
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate(ch.id)} disabled={syncMutation.isPending} data-testid={`button-sync-${ch.id}`}>
              {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Sync
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-remove-${ch.id}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Channel</AlertDialogTitle>
                <AlertDialogDescription>This will disconnect "{ch.channelName}" and remove synced videos.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate(ch.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}

const CONTENT_CRED_LABELS: Record<string, { label: string; placeholder: string; secondaryLabel?: string; secondaryPlaceholder?: string }> = {
  twitch: { label: "Stream Key", placeholder: "live_xxxxxxxxxxxx" },
  kick: { label: "Stream Key", placeholder: "sk_live_xxxxxxxxxxxx" },
  facebook: { label: "Stream Key", placeholder: "FB-xxxxxxxxxxxx" },
  tiktok: { label: "Stream Key", placeholder: "Your TikTok stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://push.tiktok.com/live" },
  x: { label: "Stream Key", placeholder: "Your X stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://va.pscp.tv:80/x" },
  rumble: { label: "Stream Key", placeholder: "Your Rumble stream key" },
  linkedin: { label: "Stream Key", placeholder: "Your LinkedIn stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://live.linkedin.com/live" },
  instagram: { label: "Stream Key", placeholder: "Your Instagram stream key" },
  discord: { label: "Server Invite Link", placeholder: "https://discord.gg/xxxxxxx" },
  snapchat: { label: "Snapchat Username", placeholder: "@yourusername" },
  pinterest: { label: "Pinterest Profile URL", placeholder: "https://pinterest.com/yourbrand" },
  reddit: { label: "Reddit Username", placeholder: "u/yourusername" },
  threads: { label: "Threads Username", placeholder: "@yourusername" },
  bluesky: { label: "Bluesky Handle", placeholder: "@you.bsky.social" },
  mastodon: { label: "Mastodon Handle", placeholder: "@user@mastodon.social" },
  patreon: { label: "Patreon Page URL", placeholder: "https://patreon.com/yourchannel" },
  kofi: { label: "Ko-fi Page URL", placeholder: "https://ko-fi.com/yourpage" },
  substack: { label: "Substack URL", placeholder: "https://yourname.substack.com" },
  spotify: { label: "Spotify Podcast URL", placeholder: "https://podcasters.spotify.com/..." },
  applepodcasts: { label: "Apple Podcasts URL", placeholder: "https://podcasts.apple.com/..." },
  dlive: { label: "Stream Key", placeholder: "Your DLive stream key" },
  trovo: { label: "Stream Key", placeholder: "Your Trovo stream key" },
  whatsapp: { label: "WhatsApp Channel Link", placeholder: "https://whatsapp.com/channel/..." },
};

function PlatformDialog({ platform, onClose, existingChannels }: { platform: Platform; onClose: () => void; existingChannels?: Channel[] }) {
  const info = PLATFORM_INFO[platform];
  const credConfig = CONTENT_CRED_LABELS[platform];
  const isAlreadyConnected = existingChannels?.some(c => c.platform === platform);
  const [credential, setCredential] = useState("");
  const [secondaryCredential, setSecondaryCredential] = useState("");
  const [channelName, setChannelName] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const createChannel = useCreateChannel();

  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
  });

  useEffect(() => {
    setCredential("");
    setSecondaryCredential("");
    setChannelName("");
    setOauthLoading(false);
    setShowManualFallback(false);
  }, [platform]);

  const platformOAuth = oauthStatus?.[platform];
  const hasOAuth = platformOAuth?.hasOAuth || false;
  const isOAuthConfigured = platformOAuth?.configured || false;
  const isYouTube = platform === "youtube" || platform === "youtubeshorts";

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

  const handleManualConnect = () => {
    if (!credential.trim()) {
      toast({ title: "Missing Info", description: `Please enter your ${credConfig?.label || "credential"}`, variant: "destructive" });
      return;
    }
    const name = channelName.trim() || `${info.label} Account`;
    const tokenValue = secondaryCredential.trim()
      ? JSON.stringify({ key: credential.trim(), serverUrl: secondaryCredential.trim() })
      : credential.trim();
    createChannel.mutate({
      userId: user?.id || "",
      platform,
      channelName: name,
      channelId: credential.trim(),
      accessToken: tokenValue,
      refreshToken: null,
      tokenExpiresAt: null,
      settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
    }, { onSuccess: () => onClose() });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid={`dialog-platform-${platform}`}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div style={{ color: info.color }}><PlatformIcon platform={platform} className="h-7 w-7" /></div>
            <div>
              <DialogTitle>{info.label}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">{info.category}</Badge>
                {hasOAuth && (
                  <Badge variant="outline">{isOAuthConfigured || isYouTube ? "OAuth Login" : "OAuth Ready"}</Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <h4 className="text-sm font-semibold mb-1">Strategy</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{info.strategyDescription}</p>
          </div>

          {isAlreadyConnected && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Already connected</span>
              </div>
            </div>
          )}

          {!isAlreadyConnected && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold">Connect {info.label}</h4>

              {(isOAuthConfigured || isYouTube) && (
                <Button
                  data-testid={`button-oauth-login-${platform}`}
                  className="w-full"
                  onClick={handleOAuthLogin}
                  disabled={oauthLoading}
                  style={{ backgroundColor: info.color, borderColor: info.color, color: "#fff" }}
                >
                  {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                  {oauthLoading ? "Redirecting..." : `Login with ${info.label}`}
                </Button>
              )}

              {hasOAuth && !isOAuthConfigured && !isYouTube && (
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-sm text-muted-foreground mb-1">OAuth login available</p>
                  <p className="text-xs text-muted-foreground">Add your {info.label} app credentials to enable one-click login</p>
                </div>
              )}

              {credConfig && (!hasOAuth || !isOAuthConfigured || showManualFallback) && !isYouTube && (
                <>
                  {hasOAuth && !isOAuthConfigured && (
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or connect manually</span></div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Display Name (optional)</label>
                    <input data-testid={`input-channel-name-${platform}`} type="text" placeholder={`My ${info.label}`} value={channelName} onChange={(e) => setChannelName(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">{credConfig.label}</label>
                    <input data-testid={`input-credential-${platform}`} type="password" placeholder={credConfig.placeholder} value={credential} onChange={(e) => setCredential(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono" />
                  </div>
                  {credConfig.secondaryLabel && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">{credConfig.secondaryLabel}</label>
                      <input data-testid={`input-secondary-${platform}`} type="text" placeholder={credConfig.secondaryPlaceholder} value={secondaryCredential} onChange={(e) => setSecondaryCredential(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-xs" />
                    </div>
                  )}
                </>
              )}

              {(isOAuthConfigured || isYouTube) && credConfig && !showManualFallback && (
                <button data-testid={`button-manual-fallback-${platform}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center" onClick={() => setShowManualFallback(true)}>
                  Connect manually with stream key instead
                </button>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Sign Up
            </a>
          </Button>
          {credConfig && !isAlreadyConnected && (!hasOAuth || !isOAuthConfigured || showManualFallback) && !isYouTube && (
            <Button data-testid={`button-connect-${platform}`} size="sm" onClick={handleManualConnect} disabled={createChannel.isPending || !credential.trim()}>
              {createChannel.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {createChannel.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarTab() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");

  const { data: items, isLoading } = useQuery<any[]>({ queryKey: ['/api/schedule'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      setDialogOpen(false);
      toast({ title: "Scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/schedule/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Removed" });
    },
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getItemsForDate = (date: Date) =>
    (items || []).filter((item: any) => isSameDay(new Date(item.scheduledAt), date));

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title"),
      type: formType,
      platform: formPlatform,
      scheduledAt: new Date(`${fd.get("date")}T${fd.get("time")}`).toISOString(),
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-schedule">
              <Plus className="w-4 h-4 mr-1" />Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Content</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input name="title" required data-testid="input-schedule-title" placeholder="Content title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="stream">Stream</SelectItem>
                      <SelectItem value="post">Post</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Platform</Label>
                  <Select value={formPlatform} onValueChange={setFormPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input name="date" type="date" required defaultValue={format(selectedDate, 'yyyy-MM-dd')} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input name="time" type="time" required defaultValue="15:00" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-schedule">
                {createMutation.isPending ? "Saving..." : "Schedule"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayItems = getItemsForDate(day);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[120px] rounded-md border p-2 cursor-pointer transition-colors ${
                today ? 'border-primary bg-primary/5' : selected ? 'border-border bg-secondary/30' : 'border-border'
              }`}
              onClick={() => setSelectedDate(day)}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                <span className={`text-xs font-medium ${today ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
              </div>
              <div className="space-y-1">
                {dayItems.map((item: any) => (
                  <div key={item.id} className="text-xs p-1 rounded bg-secondary truncate">{item.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">{format(selectedDate, 'EEEE, MMMM d')}</h3>
          {getItemsForDate(selectedDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nothing scheduled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getItemsForDate(selectedDate).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-2 rounded bg-secondary/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{format(new Date(item.scheduledAt), "h:mm a")}</span>
                      <PlatformBadge platform={item.platform} className="text-xs" />
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  ru: "Russian", it: "Italian", tr: "Turkish", nl: "Dutch", pl: "Polish",
  sv: "Swedish", th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
};

function LocalizationTab() {
  const { t } = useTranslation();

  const { data: recommendations, isLoading: recsLoading } = useQuery<any>({
    queryKey: ["/api/localization/recommendations"],
  });

  const recLangs: string[] = Array.isArray(recommendations?.recommendedLanguages)
    ? recommendations.recommendedLanguages
    : [];
  const trafficData = recommendations?.trafficData || {};
  const hasRecs = recLangs.length > 0 && recommendations?.source !== "none";

  const localizationFeatures = [
    { key: "videoTranslator", featureKey: "ai-video-translator", icon: Languages, color: "text-blue-400" },
    { key: "subtitleGenerator", featureKey: "ai-subtitle-generator", icon: Captions, color: "text-green-400" },
    { key: "localizationAdvisor", featureKey: "ai-localization-advisor", icon: Globe, color: "text-purple-400" },
    { key: "multiLangSeo", featureKey: "ai-multi-lang-seo", icon: BarChart3, color: "text-orange-400" },
    { key: "dubbingScript", featureKey: "ai-dubbing-script", icon: Mic, color: "text-pink-400" },
    { key: "culturalAdaptation", featureKey: "ai-cultural-adaptation", icon: Users, color: "text-yellow-400" },
    { key: "thumbnailLocalizer", featureKey: "ai-thumbnail-localizer", icon: Image, color: "text-indigo-400" },
    { key: "multiLangHashtags", featureKey: "ai-multi-lang-hashtags", icon: Hash, color: "text-cyan-400" },
    { key: "translationChecker", featureKey: "ai-translation-checker", icon: CheckCircle2, color: "text-emerald-400" },
    { key: "audienceLanguage", featureKey: "ai-audience-language-analyzer", icon: Eye, color: "text-violet-400" },
    { key: "regionalTrends", featureKey: "ai-regional-trends", icon: MapPin, color: "text-rose-400" },
    { key: "crossLangComments", featureKey: "ai-cross-lang-comments", icon: MessageSquare, color: "text-teal-400" },
    { key: "localizedCalendar", featureKey: "ai-localized-calendar", icon: Clock, color: "text-amber-400" },
    { key: "multiLangAbTest", featureKey: "ai-multi-lang-ab-test", icon: FlaskConical, color: "text-lime-400" },
    { key: "voiceOverFormatter", featureKey: "ai-voice-over-formatter", icon: Megaphone, color: "text-fuchsia-400" },
    { key: "regionalCompliance", featureKey: "ai-regional-compliance", icon: ShieldCheck, color: "text-red-400" },
    { key: "multiLangMediaKit", featureKey: "ai-multi-lang-media-kit", icon: Briefcase, color: "text-sky-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 data-testid="text-localization-title" className="text-lg font-display font-semibold flex items-center gap-2 flex-wrap">
          <Globe className="h-5 w-5 text-primary" />
          {t("localization.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("localization.subtitle")}</p>
      </div>

      <Card data-testid="card-traffic-language-intelligence">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">{t("localization.trafficIntelligence")}</h3>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">
              <Zap className="h-3 w-3 mr-1" />{t("localization.trafficDriven")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("localization.trafficIntelligenceDesc")}
          </p>
          {recsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : hasRecs ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{t("localization.priorityLanguages")}:</span>
                {recLangs.map((lang: string, i: number) => (
                  <Badge key={lang} variant={i === 0 ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-priority-lang-${lang}`}>
                    {LANG_NAMES[lang] || lang.toUpperCase()}
                    {i === 0 && <TrendingUp className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
              {trafficData.languageDistribution && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("localization.viewerDistribution")}:</span>
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(trafficData.languageDistribution).slice(0, 6).map(([lang, pct]: [string, any]) => (
                      <Badge key={lang} variant="outline" className="text-[10px]" data-testid={`badge-distribution-${lang}`}>
                        {LANG_NAMES[lang] || lang}: {typeof pct === "number" ? `${pct}%` : pct}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {trafficData.untappedMarkets && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("localization.untappedMarkets")}:</span>
                  <div className="flex gap-1 flex-wrap">
                    {(Array.isArray(trafficData.untappedMarkets) ? trafficData.untappedMarkets : []).slice(0, 4).map((market: any) => {
                      const label = typeof market === "string" ? market : market.language || market.market || JSON.stringify(market);
                      return (
                        <Badge key={label} variant="outline" className="text-[10px] border-dashed" data-testid={`badge-untapped-${label}`}>
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              {t("localization.noTrafficData")}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {localizationFeatures.map((feature) => {
          const Icon = feature.icon;
          const isTrafficDriven = hasRecs && ["videoTranslator", "subtitleGenerator", "dubbingScript", "multiLangSeo", "thumbnailLocalizer", "multiLangHashtags", "localizedCalendar"].includes(feature.key);
          return (
            <Card key={feature.key} data-testid={`card-ai-${feature.key}`} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`h-4 w-4 ${feature.color}`} />
                    <h3 className="font-semibold text-sm">{t(`localization.${feature.key}`)}</h3>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Sparkles className="h-3 w-3 mr-1" />{t("common.aiPowered")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t(`localization.${feature.key}Desc`)}
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">
                    {t("common.autoGenerated")}
                  </Badge>
                  {isTrafficDriven && (
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-traffic-driven-${feature.key}`}>
                      <TrendingUp className="h-3 w-3 mr-1" />{t("localization.trafficDriven")}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
