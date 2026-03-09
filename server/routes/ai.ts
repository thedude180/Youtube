import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { requireAuth, requireTier, rateLimitEndpoint, validateAiBody } from "./helpers";
import {
  aiCategorizeExpenses,
  aiFinancialInsights,
  aiStreamRecommendations,
  aiContentIdeas,
  aiDashboardActions,
  aiBrandAnalysis,
  aiScriptWriter,
  aiThumbnailConcepts,
  aiChapterMarkers,
  aiKeywordResearch,
} from "../ai-engine";
import {
  aiRepurposeContent,
  aiSponsorshipManager,
  aiMediaKit,
  aiStreamChatBot,
  aiStreamChecklist,
  aiRaidStrategy,
  aiPostStreamReport,
  aiPLReport,
  aiTeamManager,
  aiAutomationBuilder,
} from "../ai-engine";
import {
  aiCreatorAcademy,
  aiNewsFeed,
  aiMilestoneEngine,
  aiCrossplatformAnalytics,
  aiCommentManager,
  aiCollabMatchmaker,
  aiSEOAudit,
  aiContentCalendarPlanner,
  aiStoryboardGenerator,
} from "../ai-engine";
import {
  aiColorGradingAdvisor,
  aiIntroOutroCreator,
  aiSoundEffectsRecommender,
  aiPacingAnalyzer,
  aiTalkingPointsGenerator,
  aiVideoLengthOptimizer,
  aiMultiFormatExporter,
  aiWatermarkManager,
  aiGreenScreenAdvisor,
  aiTeleprompterFormatter,
} from "../ai-engine";
import {
  aiSceneTransitionRecommender,
  aiVideoQualityEnhancer,
  aiAspectRatioOptimizer,
  aiLowerThirdGenerator,
  aiCtaOverlayDesigner,
  aiSplitScreenBuilder,
  aiTimeLapseAdvisor,
  aiFootageOrganizer,
  aiAudioLevelingAdvisor,
  aiBackgroundNoiseDetector,
} from "../ai-engine";
import {
  aiJumpCutDetector,
  aiCinematicShotPlanner,
  aiVideoCompressionOptimizer,
  aiThumbnailABTester,
  aiThumbnailCTRPredictor,
  aiThumbnailStyleLibrary,
  aiFaceExpressionAnalyzer,
  aiThumbnailTextOptimizer,
  aiThumbnailColorPsychology,
  aiBannerGenerator,
} from "../ai-engine";
import {
  aiSocialCoverCreator,
  aiAnimatedThumbnailCreator,
  aiThumbnailCompetitorComparison,
  aiBrandWatermarkDesigner,
  aiEmojiStickerCreator,
  aiInfographicGenerator,
  aiMemeTemplateCreator,
  aiVisualConsistencyScorer,
  aiVoiceCloneAdvisor,
  aiHookGenerator,
} from "../ai-engine";
import {
  aiTitleSplitTester,
  aiTitleEmotionalScore,
  aiClickbaitDetector,
  aiDescriptionTemplateBuilder,
  aiEndScreenCTAWriter,
  aiPinnedCommentGenerator,
  aiCommunityPostWriter,
  aiEmailSubjectOptimizer,
  aiBioWriter,
  aiVideoTagsOptimizer,
} from "../ai-engine";
import {
  aiHashtagOptimizer2,
  aiPlaylistWriter,
  aiPressReleaseWriter,
  aiTestimonialDrafter,
  aiTagCloudGenerator,
  aiSearchIntentMapper,
  aiAlgorithmDecoder,
  aiFeaturedSnippetOptimizer,
  aiCrossPlatformSEO,
  aiBacklinkTracker,
} from "../ai-engine";
import {
  aiContentFreshnessScorer,
  aiKeywordCannibalization,
  aiLongTailKeywordMiner,
  aiVideoSitemapGenerator,
  aiRichSnippetOptimizer,
  aiVoiceSearchOptimizer,
  aiAutocompleteTracker,
  aiGoogleTrendsIntegrator,
  aiCompetitorKeywordSpy,
  aiSearchRankingTracker,
} from "../ai-engine";
import {
  aiCTRBenchmarker,
  aiImpressionAnalyzer,
  aiRelatedVideoOptimizer,
  aiBrowseFeatureOptimizer,
  aiContentPillarPlanner,
  aiSeriesBuilder,
  aiContentRepurposeMatrix,
  aiViralScorePredictor,
  aiContentGapFinder,
  aiTrendSurfer,
} from "../ai-engine";
import {
  aiEvergreenPlanner,
  aiContentMixOptimizer,
  aiSeasonalContentPlanner,
  aiCollabContentPlanner,
  aiBehindTheScenesPlanner,
  aiReactionContentFinder,
  aiChallengeCreator,
  aiQnAContentPlanner,
  aiTutorialStructurer,
  aiDocumentaryStylePlanner,
} from "../ai-engine";
import {
  aiBurnoutRiskAssessor,
  aiCreatorMentalHealthMonitor,
  aiCreatorBurnoutRecovery,
  aiBurnoutPrevention,
  aiMentalHealthContentGuide,
} from "../ai-engine";
import {
  aiShortFormStrategy,
  aiShortsIdeaGenerator,
  aiShortsToLongPipeline,
  aiLongToShortsClipper,
  aiVerticalVideoOptimizer,
  aiShortsAudioSelector,
  aiShortsCaptionStyler,
  aiShortsHookFormula,
  aiDuetStitchPlanner,
  aiShortsAnalyticsDecoder,
} from "../ai-engine";
import {
  aiShortsBatchPlanner,
  aiShortsRemixStrategy,
  aiShortsMonetization,
  aiContentAudit,
  aiContentVelocityTracker,
  aiNicheResearcher,
  aiCaptionGenerator,
  aiCaptionStyler,
  aiSubtitleTranslator,
  aiMultiLanguageSEO,
} from "../ai-engine";
import {
  aiLocalizationManager,
  aiDubbingAdvisor,
  aiTranscriptOptimizer,
  aiClosedCaptionCompliance,
  aiAudioDescriptionWriter,
  aiLanguagePriorityRanker,
  aiRetentionAnalyzer,
  aiAudienceDemographics,
  aiWatchTimeOptimizer,
  aiEngagementRateAnalyzer,
} from "../ai-engine";
import {
  aiSubscriberGrowthAnalyzer,
  aiRevenueForecaster,
  aiABTestAnalyzer,
  aiAudienceRetentionHeatmap,
  aiTrafficSourceAnalyzer,
  aiDeviceAnalyzer,
  aiPlaybackLocationAnalyzer,
  aiEndScreenAnalyzer,
  aiCardPerformanceAnalyzer,
  aiImpressionFunnelAnalyzer,
} from "../ai-engine";
import {
  aiCompetitorBenchmarker,
  aiGrowthRatePredictor,
  aiChurnPredictor,
  aiViralCoefficientCalculator,
  aiSentimentDashboard,
  aiPeakTimeAnalyzer,
  aiVideoLifecycleTracker,
  aiRevenuePerViewOptimizer,
  aiAudienceOverlapAnalyzer,
  aiContentPerformanceRanker,
} from "../ai-engine";
import {
  aiFunnelLeakDetector,
  aiPredictiveAnalytics,
  aiCustomReportBuilder,
  aiStreamTitleGenerator,
  aiStreamScheduleOptimizer,
  aiStreamOverlayDesigner,
  aiStreamAlertDesigner,
  aiStreamModerationRules,
  aiStreamInteractionPlanner,
  aiStreamRevenueOptimizer,
} from "../ai-engine";
import {
  aiStreamClipHighlighter,
  aiStreamCategoryOptimizer,
  aiStreamPanelDesigner,
  aiStreamEmoteManager,
  aiStreamSubGoalPlanner,
  aiStreamNetworkingAdvisor,
  aiStreamAnalyticsExplainer,
  aiMultiStreamSetup,
  aiStreamBackupPlanner,
  aiStreamCommunityBuilder,
} from "../ai-engine";
import {
  aiStreamBrandingKit,
  aiStreamContentCalendar,
  aiStreamGrowthHacker,
  aiAdRevenueOptimizer,
  aiAdPlacementAdvisor,
  aiCPMMaximizer,
  aiSponsorPricingEngine,
  aiSponsorOutreachWriter,
  aiSponsorNegotiator,
  aiSponsorDeliverableTracker,
} from "../ai-engine";
import {
  aiAffiliateOptimizer,
  aiMerchandiseAdvisor,
  aiMembershipTierBuilder,
  aiDigitalProductCreator,
  aiCourseBuilder,
  aiPatreonOptimizer,
  aiSuperChatOptimizer,
  aiChannelMembershipGrowth,
  aiRevenueStreamDiversifier,
  aiInvoiceGenerator,
} from "../ai-engine";
import {
  aiContractReviewer,
  aiTaxDeductionFinder,
  aiQuarterlyTaxEstimator,
  aiBrandDealEvaluator,
  aiMediaKitEnhancer,
  aiRateCardGenerator,
  aiSponsorROICalculator,
  aiPassiveIncomeBuilder,
  aiPricingStrategyAdvisor,
  aiRevenueAttributionAnalyzer,
} from "../ai-engine";
import {
  aiDonationOptimizer,
  aiCrowdfundingAdvisor,
  aiLicensingAdvisor,
  aiBookDealAdvisor,
  aiSpeakingFeeCalculator,
  aiConsultingPackageBuilder,
  aiExpenseTracker,
  aiProfitMarginAnalyzer,
  aiCashFlowForecaster,
  aiPaymentGatewayAdvisor,
} from "../ai-engine";
import {
  aiSubscriptionBoxBuilder,
  aiNFTContentAdvisor,
  aiRevenueGoalTracker,
  aiCommentResponseGenerator,
  aiSuperfanIdentifier,
  aiDiscordServerPlanner,
  aiCommunityEventPlanner,
  aiPollCreator,
  aiContestRunner,
  aiCommunityGuidelinesWriter,
} from "../ai-engine";
import {
  aiModeratorTrainer,
  aiAMAPlanner,
  aiLoyaltyProgramBuilder,
  aiUserGeneratedContentStrategy,
  aiCommunityHealthScorer,
  aiFanArtCurator,
  aiMilestoneEventPlanner,
  aiDMResponseTemplates,
  aiHashtagCommunityBuilder,
  aiLiveQAManager,
} from "../ai-engine";
import {
  aiReferralProgramBuilder,
  aiCommunityAmbassadorProgram,
  aiEngagementBoostStrategy,
  aiHiringAdvisor,
  aiFreelancerFinder,
  aiSOPBuilder,
  aiProjectTimeline,
  aiContentApprovalFlow,
  aiEditingChecklistBuilder,
  aiProductionBudgetPlanner,
} from "../ai-engine";
import {
  aiEquipmentRecommender,
  aiStudioSetupPlanner,
  aiWorkflowOptimizer,
  aiBatchRecordingScheduler,
  aiOutsourcingAdvisor,
  aiToolStackOptimizer,
  aiBrandVoiceCreator,
  aiBrandColorPalette,
  aiBrandFontSelector,
  aiBrandStoryWriter,
} from "../ai-engine";
import {
  aiBrandConsistencyAuditor,
  aiContentPillarRefiner,
  aiChannelTrailerBuilder,
  aiChannelArtDirector,
  aiUniqueSellingPointFinder,
  aiTargetAudienceDefiner,
  aiBrandPartnershipMatcher,
  aiCrisisCommsPlanner,
  aiPersonalBrandAudit,
  aiBrandEvolutionPlanner,
} from "../ai-engine";
import {
  aiCompetitorDifferentiator,
  aiCollaborationBriefWriter,
  aiNetworkingEventPrep,
  aiMentorshipFinder,
  aiDelegationAdvisor,
  aiTimeManagementCoach,
  aiCreatorMastermindPlanner,
  aiProductivityTracker,
  aiCopyrightChecker,
  aiFairUseAnalyzer,
} from "../ai-engine";
import {
  aiMusicLicenseAdvisor,
  aiPrivacyPolicyGenerator,
  aiTermsOfServiceWriter,
  aiFTCComplianceChecker,
  aiCOPPAAdvisor,
  aiGDPRComplianceChecker,
  aiContentIDManager,
  aiDisputeResolutionAdvisor,
  aiTrademarkAdvisor,
  aiContractTemplateBuilder,
} from "../ai-engine";
import {
  aiInsuranceAdvisor,
  aiBusinessEntityAdvisor,
  aiIntellectualPropertyProtector,
  aiMeditationGuide,
  aiWorkLifeBalancer,
  aiSleepOptimizer,
  aiExerciseForCreators,
  aiEyeStrainPreventer,
} from "../ai-engine";
import {
  aiVoiceCareAdvisor,
  aiStressManagementCoach,
  aiCreatorBreakScheduler,
  aiYouTubeAPIIntegrator,
  aiTwitchIntegrator,
  aiDiscordBotBuilder,
  aiGoogleAnalyticsSetup,
  aiSocialMediaScheduler,
  aiEmailMarketingSetup,
  aiPodcastIntegrator,
} from "../ai-engine";
import {
  aiWebhookManager,
  aiAPIRateLimitManager,
  aiDataBackupPlanner,
  aiNotificationOptimizer,
  aiCrossPostAutomator,
  aiLinkTreeOptimizer,
  aiQRCodeGenerator,
  aiChatbotIntegrator,
  aiAnalyticsDashboardBuilder,
  aiContentDeliveryOptimizer,
} from "../ai-engine";
import {
  aiAccessibilityAuditor,
  aiMultiDeviceTester,
  aiPerformanceMonitor,
  aiSecurityAuditor,
  aiCookieConsentManager,
  aiAgeGatingAdvisor,
  aiDataRetentionPlanner,
  aiIncidentResponsePlanner,
  aiCustomShortcutBuilder,
  aiAdvancedSearchOptimizer,
} from "../ai-engine";
import {
  aiBulkUploadManager,
  aiPlaylistAutoOrganizer,
  aiMultiAccountManager,
  aiCustomDashboardBuilder,
  aiAutoTaggingSystem,
  aiSmartNotificationSystem,
  aiTemplateLibrary,
  aiMacroBuilder,
  aiVRContentAdvisor,
  aiARFilterCreator,
} from "../ai-engine";
import {
  aiAIVoiceoverGenerator,
  aiDeepfakeDetector,
  aiBlockchainContentVerifier,
  aiPredictiveTrendEngine,
  aiContentGraphAnalyzer,
  aiAudiencePsychographer,
  aiNeuroMarketingAdvisor,
  aiGamificationEngine,
  aiPersonalizationEngine,
  aiSentimentPredictiveModel,
} from "../ai-engine";
import {
  aiContentDNAAnalyzer,
  aiAlgorithmSimulator,
  aiCreatorEconomyTracker,
  aiWeb3CreatorTools,
  aiMetaversePresencePlanner,
  aiAIAgentCustomizer,
  aiDataVisualizationEngine,
  aiCreatorAPIBuilder,
  aiPodcastLaunchPlanner,
  aiPodcastEpisodePlanner,
} from "../ai-engine";
import {
  aiPodcastSEO,
  aiAudioBrandingKit,
  aiMusicComposerAdvisor,
  aiASMRContentPlanner,
  aiVoiceTrainingCoach,
  aiAudioMixingGuide,
  aiNewsletterBuilder,
  aiEmailSequenceWriter,
  aiLeadMagnetCreator,
  aiEmailListGrower,
} from "../ai-engine";
import {
  aiEmailAnalyticsAdvisor,
  aiWebinarPlanner,
  aiVirtualEventOrganizer,
  aiMeetupOrganizer,
  aiConferencePrep,
  aiAwardSubmissionWriter,
  aiPanelDiscussionPrep,
  aiCreatorRetreePlanner,
  aiLiveWorkshopBuilder,
  aiOnlineCourseLauncher,
} from "../ai-engine";
import {
  aiMasterclassDesigner,
  aiMediaAppearancePrep,
  aiGuestPostWriter,
  aiInfluencerEventPlanner,
  aiProductLaunchPlanner,
  aiCharityEventAdvisor,
  aiAnniversaryCelebrationPlanner,
  aiSeasonalCampaignPlanner,
  aiHolidayContentCalendar,
  aiEndOfYearReview,
} from "../ai-engine";
import {
  aiSkillAssessment,
  aiLearningPathBuilder,
  aiCertificationAdvisor,
  aiBookRecommender,
  aiToolTutorialCreator,
  aiIndustryReportGenerator,
  aiCaseStudyBuilder,
  aiPortfolioOptimizer,
  aiSocialProofCollector,
  aiTestimonialVideoPlanner,
} from "../ai-engine";
import {
  aiCaseStudyVideoCreator,
  aiBeforeAfterShowcase,
  aiInfluencerScorecard,
  aiCredibilityBooster,
  aiUserReviewManager,
  aiReferencePageBuilder,
  aiEcommerceStoreBuilder,
  aiDropshippingAdvisor,
  aiPrintOnDemandOptimizer,
  aiDigitalDownloadCreator,
} from "../ai-engine";
import {
  aiAffiliatePageBuilder,
  aiUpsellStrategyBuilder,
  aiCartAbandonmentRecovery,
  aiCustomerJourneyMapper,
  aiProductBundleCreator,
  aiFlashSalePlanner,
  aiLoyaltyRewardDesigner,
  aiSubscriptionModelBuilder,
  aiPricingPageOptimizer,
  aiCheckoutOptimizer,
} from "../ai-engine";
import {
  aiInventoryForecaster,
  aiShippingOptimizer,
  aiYouTubeAdsOptimizer,
  aiFacebookAdsCreator,
  aiGoogleAdsManager,
  aiTikTokAdsAdvisor,
  aiInfluencerAdsManager,
  aiRetargetingStrategist,
  aiAdCopyWriter,
  aiAdBudgetAllocator,
} from "../ai-engine";
import {
  aiLandingPageOptimizer,
  aiConversionRateOptimizer,
  aiDataCleaningAdvisor,
  aiDataPipelineBuilder,
  aiAnomalyDetector,
  aiCohortAnalyzer,
  aiAttributionModeler,
  aiPredictiveChurnModeler,
  aiLifetimeValueCalculator,
  aiAccessibilityTextChecker,
} from "../ai-engine";
import {
  aiAltTextGenerator,
  aiColorContrastChecker,
  aiScreenReaderOptimizer,
  aiKeyboardNavChecker,
  aiCaptionQualityChecker,
  aiInclusiveLanguageChecker,
  aiDyslexiaFriendlyFormatter,
  aiMotionSensitivityChecker,
  aiCognitiveLoadReducer,
  aiMultiModalContentCreator,
} from "../ai-engine";
import {
  aiPasswordSecurityAdvisor,
  aiPhishingDetector,
  aiAccountRecoveryPlanner,
  aiPrivacySettingsOptimizer,
  aiDataBreachResponsePlanner,
  aiVPNAdvisor,
  aiCompetitorAnalyzer,
  aiCompetitorContentTracker,
  aiCompetitorPricingMonitor,
  aiMarketShareAnalyzer,
} from "../ai-engine";
import {
  aiSWOTAnalyzer,
  aiCompetitorSocialTracker,
  aiBlueOceanFinder,
  aiMobileOptimizer,
  aiAppDeepLinkBuilder,
  aiPushNotificationOptimizer,
  aiMobileVideoOptimizer,
  aiResponsiveDesignChecker,
  aiMobilePaymentOptimizer,
  aiOfflineContentPlanner,
} from "../ai-engine";
import {
  aiMobileAnalyticsSetup,
  aiAppStoreOptimizer,
  aiWidgetDesigner,
  aiGestureOptimizer,
  aiMobileFirstContentCreator,
  aiWearableContentAdvisor,
  aiCrossPlatformSyncManager,
  aiSmartTVOptimizer,
  aiAchievementSystemBuilder,
  aiLeaderboardDesigner,
} from "../ai-engine";
import {
  aiPointsEconomyBuilder,
  aiBadgeSystemCreator,
  aiStreakSystemBuilder,
  aiProgressVisualizationEngine,
  aiChallengeSystemBuilder,
  aiMonthlyReportGenerator,
  aiWeeklyDigestBuilder,
  aiQuarterlyBusinessReview,
  aiAnnualStrategyPlanner,
  aiCompetitorReportGenerator,
} from "../ai-engine";
import {
  aiAudienceReportBuilder,
  aiContentReportCard,
  aiROIReportGenerator,
  aiGamingNicheOptimizer,
  aiBeautyNicheAdvisor,
  aiTechReviewOptimizer,
  aiFoodContentPlanner,
  aiFitnessContentStrategy,
  aiTravelContentOptimizer,
  aiEducationContentPlanner,
} from "../ai-engine";
import {
  aiFinanceContentAdvisor,
  aiParentingContentStrategy,
  aiPetContentOptimizer,
  aiDIYCraftPlanner,
  aiMusicianContentStrategy,
  aiComedyContentAdvisor,
  aiSportsContentPlanner,
  aiNewsCommentaryPlanner,
  aiLifestyleContentOptimizer,
  aiVideoToBookConverter,
} from "../ai-engine";
import {
  aiVideoToPodcastConverter,
  aiVideoToCourseConverter,
  aiBlogToVideoConverter,
  aiLinkedInContentAdapter,
  aiPinterestPinCreator,
  aiRedditPostOptimizer,
  aiQuoraAnswerWriter,
  aiMediumArticleAdapter,
  aiSlidedeckCreator,
} from "../ai-engine";
import {
  aiInfographicRepurposer,
  aiCollabMatchScorer,
  aiCollabContractWriter,
  aiCollabRevenueCalculator,
  aiCollabContentIdeator,
  aiCollabOutreachWriter,
  aiCollabPerformanceTracker,
  aiNetworkEffectCalculator,
  aiSubMilestoneStrategyBuilder,
  aiSubRetentionOptimizer,
} from "../ai-engine";
import {
  aiNotificationBellOptimizer,
  aiFirstVideoOptimizer,
  aiChannelMembershipPerks,
  aiSubCountdownPlanner,
  aiUnsubscribeAnalyzer,
  aiSubQualityAnalyzer,
  aiGrowthHackingPlaybook,
  aiViralGrowthEngineBuilder,
  aiCrossPromotionPlanner,
  aiWatchTimeBooster,
} from "../ai-engine";
import {
  aiOpenLoopCreator,
  aiPatternInterruptDesigner,
  aiReEngagementHookBuilder,
  aiBingeWatchOptimizer,
  aiYouTubeStudioOptimizer,
  aiYouTubeShortsAlgorithm,
  aiYouTubeCommentsManager,
  aiYouTubePlaylistStrategy,
  aiYouTubePremierePlanner,
  aiYouTubeMembeshipStrategy,
} from "../ai-engine";
import {
  aiYouTubeSuperThanksOptimizer,
  aiYouTubeHandleOptimizer,
  aiYouTubeChannelPageOptimizer,
  aiYouTubeHashtagStrategy,
  aiTwitchEmoteStrategy,
  aiTwitchBitsOptimizer,
  aiTwitchRaidOptimizer,
  aiTwitchChannelPointsDesigner,
  aiTwitchPredictionsCreator,
  aiTwitchHypeTrainMaximizer,
} from "../ai-engine";
import {
  aiTwitchClipStrategy,
  aiTwitchVODOptimizer,
  aiTwitchPanelDesigner,
  aiKickStreamOptimizer,
  aiKickMonetizationAdvisor,
  aiKickCommunityBuilder,
  aiKickContentDifferentiator,
  aiKickDiscoveryOptimizer,
  aiMultiPlatformStreamRouter,
  aiStreamDeckConfigurer,
} from "../ai-engine";
import {
  aiOBSOptimizer,
  aiStreamLabsConfigurator,
  aiStreamElementsOptimizer,
  aiChaturbateStreamAdvisor,
  aiTikTokAlgorithmDecoder,
  aiTikTokSoundStrategy,
  aiTikTokDuetStrategy,
  aiTikTokLiveOptimizer,
  aiTikTokShopAdvisor,
  aiTikTokCreatorFundOptimizer,
} from "../ai-engine";
import {
  aiTikTokHashtagResearcher,
  aiTikTokProfileOptimizer,
  aiInstagramReelsOptimizer,
  aiInstagramStoriesPlanner,
  aiInstagramCarouselCreator,
  aiInstagramBioOptimizer,
  aiInstagramShoppingSetup,
  aiInstagramCollabManager,
  aiInstagramGrowthHacker,
  aiInstagramAestheticPlanner,
} from "../ai-engine";
import {
  aiLinkedInCreatorStrategy,
  aiLinkedInArticleWriter,
  aiFacebookGroupManager,
  aiFacebookReelsOptimizer,
  aiSnapchatSpotlightAdvisor,
  aiThreadsStrategy,
  aiDiscordServerOptimizer,
  aiPatreonContentPlanner,
} from "../ai-engine";
import {
  aiSubstackOptimizer,
  aiGumroadProductOptimizer,
  aiTeachableCoursePlanner,
  aiBuyMeCoffeeOptimizer,
  aiRetirementPlanner,
  aiEmergencyFundAdvisor,
  aiInvestmentAdvisor,
  aiDebtPayoffPlanner,
  aiRealEstateInvestor,
  aiCryptoPortfolioAdvisor,
} from "../ai-engine";
import {
  aiFreelancePricingGuide,
  aiGrantFinder,
  aiBudgetTrackerSetup,
  aiFinancialGoalSetter,
  aiCameraRecommender,
  aiMicrophoneAdvisor,
  aiLightingSetupPlanner,
  aiEditingSoftwareAdvisor,
  aiStudioDesignPlanner,
  aiGreenScreenSetup,
} from "../ai-engine";
import {
  aiTeleprompterAdvisor,
  aiBackupStoragePlanner,
  aiInternetOptimizer,
  aiVATaskDelegator,
  aiEditorHiringGuide,
  aiThumbnailDesignerFinder,
  aiOutsourcingStrategyBuilder,
  aiContentModerationPlanner,
  aiCopyrightClaimResolver,
  aiSponsorshipDisclosureChecker,
} from "../ai-engine";
import {
  aiAgeRestrictionAdvisor,
  aiDefamationRiskChecker,
  aiPlagiarismDetector,
  aiCOPPAComplianceChecker,
  aiGDPRComplianceAdvisor,
  aiHateSpeechDetector,
  aiMisinformationChecker,
  aiTriggerWarningAdvisor,
  aiChildSafetyChecker,
  aiPersonalBrandAuditor,
} from "../ai-engine";
import {
  aiElevatorPitchWriter,
  aiPressKitBuilder,
  aiSpeakerBioWriter,
  aiLinkedInProfileOptimizer,
  aiPersonalWebsiteBuilder,
  aiThoughtLeadershipPlanner,
  aiPublicSpeakingCoach,
  aiNetworkingStrategyBuilder,
  aiReputationMonitor,
  aiCrisisResponsePlanner,
} from "../ai-engine";
import {
  aiApologyScriptWriter,
  aiControversyNavigator,
  aiCancelCultureDefender,
  aiDiversityInclusionAdvisor,
  aiPoliticalContentNavigator,
  aiReligiousSensitivityChecker,
  aiCulturalSensitivityAdvisor,
  aiBodyImageSensitivityChecker,
  aiAddictionContentGuide,
} from "../ai-engine";
import {
  aiFinancialDisclaimerWriter,
  aiWorkflowAutomationBuilder,
  aiZapierIntegrationPlanner,
  aiIFTTTRecipeCreator,
  aiMakeScenarioBuilder,
  aiAutoScheduler,
  aiAutoResponder,
  aiAutoModerator,
  aiAutoBackupper,
  aiAutoReporter,
} from "../ai-engine";
import {
  aiAutoOptimizer,
  aiBatchProcessor,
  aiSmartQueueManager,
  aiContentPipelineBuilder,
  aiAITrainingDataCollector,
  aiCrisisDetector,
  aiDamageControlPlanner,
  aiPRStatementWriter,
  aiStakeholderCommunicator,
  aiRecoveryStrategyBuilder,
} from "../ai-engine";
import {
  aiMediaResponsePlanner,
  aiLegalRiskAssessor,
  aiSocialMediaCrisisManager,
  aiInfluencerCrisisAdvisor,
  aiBrandRecoveryPlanner,
  aiCommunityTrustRebuilder,
  aiAlgorithmRecoveryAdvisor,
  aiRevenueRecoveryPlanner,
  aiTeamCrisisManager,
  aiLegalDefensePrepper,
} from "../ai-engine";
import {
  aiInsuranceClaimHelper,
  aiContingencyPlanner,
  aiDisasterRecoveryPlanner,
  aiBusinessContinuityPlanner,
  aiExitStrategyBuilder,
  aiSummerContentPlanner,
  aiWinterContentStrategy,
  aiBackToSchoolPlanner,
  aiHalloweenContentCreator,
  aiBlackFridayStrategist,
} from "../ai-engine";
import {
  aiChristmasContentPlanner,
  aiNewYearGoalSetter,
  aiValentinesDayPlanner,
  aiEasterContentCreator,
  aiSuperBowlContentPlanner,
  aiParentsDayPlanner,
  aiGraduationContentCreator,
  aiWorldCupContentPlanner,
  aiOlympicsContentStrategy,
  aiAwardsSeasonPlanner,
} from "../ai-engine";
import {
  aiMusicFestivalContentGuide,
  aiGamingEventPlanner,
  aiProductHuntLaunchGuide,
  aiErgonomicSetupAdvisor,
  aiEyeCareAdvisor,
  aiVocalHealthCoach,
  aiNutritionForCreators,
  aiWorkLifeBalanceOptimizer,
  aiMeditationGuideForCreators,
} from "../ai-engine";
import {
  aiTimeBlockingOptimizer,
  aiPomodoroCustomizer,
  aiDigitalDetoxPlanner,
  aiGratitudeJournalPrompts,
  aiAffirmationGenerator,
  aiHabitStackBuilder,
  aiEnergyManagementAdvisor,
  aiCreatorCommunityBuilder,
  aiMastermindGroupFacilitator,
  aiAccountabilityPartnerMatcher,
} from "../ai-engine";
import {
  aiCreatorSabbaticalPlanner,
  aiAutoOnboarding,
  aiAutoApproveSponsorship,
  aiCreativeAutonomy,
  aiAutoPaymentManager,
  aiVideoTranslator,
  aiSubtitleGenerator,
  aiLocalizationAdvisor,
  aiMultiLangSeo,
  aiDubbingScriptGenerator,
} from "../ai-engine";
import {
  aiCulturalAdaptation,
  aiThumbnailLocalizer,
  aiMultiLangHashtags,
  aiTranslationChecker,
  aiAudienceLanguageAnalyzer,
  aiRegionalTrendScanner,
  aiCrossLangCommentManager,
  aiLocalizedContentCalendar,
  aiMultiLangAbTesting,
  aiVoiceOverFormatter,
} from "../ai-engine";
import {
  aiRegionalComplianceChecker,
  aiMultiLangMediaKit,
  aiCompetitorTracker,
  aiCompetitorGapAnalysis,
  aiCompetitorAlerts,
  aiCompetitorContentScorer,
  aiNicheDominationMap,
  aiCompetitorAudienceOverlap,
  aiViralPredictor,
  aiOptimalSchedule,
} from "../ai-engine";
import {
  aiAudiencePersonaBuilder,
  aiSubscriberMagnet,
  aiShortsClipsStrategy,
  aiEndScreenOptimizer,
  aiDealNegotiationCoach,
  aiMerchDemandPredictor,
  aiRevenueStreamOptimizer,
  aiSponsorshipRateCalculator,
  aiMembershipTierDesigner,
  aiAffiliateLinkManager,
} from "../ai-engine";
import {
  aiScriptCoach,
  aiPlatformRepurposer,
  aiContentDecayDetector,
  aiTitleAbTester,
  aiDescriptionOptimizer,
  aiFanLoyaltyTracker,
  aiCommentStrategy,
  aiCommunityPollGenerator,
  aiLiveChatModerator,
  aiFanMilestoneCelebrator,
} from "../ai-engine";
import {
  aiEngagementBooster,
  aiCrossPlatformUnifier,
  aiPlatformPriorityRanker,
  aiCrossPostScheduler,
  aiPlatformSpecificOptimizer,
  aiBrandAuditor,
  aiMediaKitAutoUpdater,
  aiBrandVoiceAnalyzer,
  aiVisualIdentityChecker,
  aiBrandPartnershipScorer,
} from "../ai-engine";
import {
  aiCopyrightShield,
  aiContractAnalyzer,
  aiContentInsuranceAdvisor,
  aiDMCADefenseAssistant,
  aiSubscriberMilestonePredictor,
  aiRetentionHeatmapAnalyzer,
  aiBestVideoFormulaDetector,
  aiGrowthTrajectoryModeler,
  aiAbTestingDashboard,
  aiContentDecayRefresher,
} from "../ai-engine";
import {
  aiContentBatchingPlanner,
  aiCreativeBlockSolver,
  aiWorkLifeBalanceTracker,
  aiMotivationEngine,
  aiGearAdvisor,
  aiEditingStyleCoach,
  aiPublicSpeakingTrainer,
  aiNicheExpertBuilder,
  aiTaskDelegator,
} from "../ai-engine";
import {
  aiTeamPerformanceTracker,
  aiSOPsGenerator,
  aiStatementDrafter,
  aiSurveyBuilder,
  aiViewerJourneyMapper,
  aiDemographicDeepDive,
  aiViewerIntentAnalyzer,
  aiCourseProductPlanner,
  aiMembershipStrategy,
  aiSpeakingEngagementFinder,
} from "../ai-engine";
import {
  aiContentRoadmap,
  aiContentPillarArchitect,
  aiEvergreenContentIdentifier,
  aiIndustryEventTracker,
  aiTalentAgentSimulator,
  aiCreatorEconomyNewsFeed,
  aiRaidTargetOptimizer,
  aiStreamHighlightClipper,
  aiDonationGoalStrategist,
  aiMultiStreamChatUnifier,
} from "../ai-engine";
import {
  aiBackgroundMusicMatcher,
  aiAudioQualityEnhancer,
  aiSoundEffectRecommender,
  aiAccessibilityChecker,
  aiSignLanguageAdvisor,
  aiPrivacyScanner,
  aiAccountSecurityAuditor,
  aiDataBackupStrategist,
  aiDigitalCollectibleAdvisor,
  aiExclusiveContentPlanner,
} from "../ai-engine";
import {
  aiFanMarketplaceBuilder,
  aiChannelExitStrategy,
  aiContentArchiveOptimizer,
  aiBrandLicensingAdvisor,
  aiInboxPrioritizer,
  aiDailyActionPlan,
} from "../ai-engine";

export function registerAiRoutes(app: Express) {
  const aiRateLimit = rateLimitEndpoint(5, 60000);

  app.use("/api/ai", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.body) {
      if (!validateAiBody(req, res)) return;
    }
    next();
  });

  app.post("/api/ai/categorize-expenses", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { expenses } = req.body;
      if (!expenses || !Array.isArray(expenses)) return res.status(400).json({ message: "expenses array required" });
      const result = await aiCategorizeExpenses(expenses, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI categorize error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/ai/financial-insights", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Financial Insights");
    if (!userId) return;
    try {
      const allRevenue = await storage.getRevenueRecords(userId);
      const allExpenses = await storage.getExpenseRecords(userId);
      const totalRevenue = allRevenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const totalExpenses = allExpenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const byPlatform: Record<string, number> = {};
      allRevenue.forEach((r: any) => { byPlatform[r.platform || 'other'] = (byPlatform[r.platform || 'other'] || 0) + (r.amount || 0); });
      const byCat: Record<string, number> = {};
      allExpenses.forEach((e: any) => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + (e.amount || 0); });
      const now = new Date();
      const thisMonth = allRevenue.filter((r: any) => {
        const d = r.recordedAt ? new Date(r.recordedAt) : null;
        return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).reduce((s: number, r: any) => s + (r.amount || 0), 0);

      const result = await aiFinancialInsights({ totalRevenue, totalExpenses, revenueByPlatform: byPlatform, expensesByCategory: byCat, monthlyRevenue: thisMonth }, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI financial insights error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/ai/stream-recommendations", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Stream Recommendations");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const channel = channels[0];
      const streams = await storage.getStreams(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await aiStreamRecommendations({
        channelName: channel?.channelName || "My Channel",
        pastStreams: streams.map((s: any) => ({ title: s.title, category: s.category || "Gaming", platforms: s.platforms || [] })),
        videoCount: videos.length,
      }, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI stream rec error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/ai/content-ideas", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Ideas");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const channel = channels[0];
      const videos = await storage.getVideosByUser(userId);
      const result = await aiContentIdeas({
        channelName: channel?.channelName || "My Channel",
        recentTitles: videos.slice(0, 15).map((v: any) => v.title),
        videoCount: videos.length,
        topPerforming: videos.filter((v: any) => v.metadata?.stats?.views > 10000).slice(0, 5).map((v: any) => v.title),
      }, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI content ideas error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/ai/new-creator-plan", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "AI New Creator Plan");
    if (!userId) return;
    try {
      const { niche, customIdea } = req.body;
      const topic = customIdea || niche || "general content creation";

      const { getOpenAIClient } = await import("../lib/openai");
      const openai = getOpenAIClient();

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert YouTube creator strategist. Generate a comprehensive plan for a new creator starting from scratch. Respond as JSON with this structure:
{
  "channelName": "creative and memorable channel name suggestion",
  "channelDescription": "compelling channel description for YouTube about page (2-3 sentences)",
  "videoIdeas": ["10 specific video title ideas that would perform well for a new channel"],
  "schedule": "recommended posting schedule (e.g. '2 videos per week - Tuesdays and Fridays at 3PM EST')",
  "growthStrategy": "paragraph describing the best growth strategy for this niche, including tips for the first 100 subscribers",
  "brandingTips": "3-4 tips for visual branding (colors, thumbnail style, intro style)",
  "nicheAnalysis": "brief analysis of the niche - competition level, audience size, monetization potential"
}`,
          },
          {
            role: "user",
            content: `Create a complete YouTube channel plan for someone interested in: ${topic}. Make the video ideas specific, searchable, and designed to attract initial viewers. The channel name should be catchy and brandable.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.json({
          channelName: `${topic} Creator`,
          channelDescription: `A channel dedicated to ${topic} content with tutorials, insights, and entertainment.`,
          videoIdeas: [
            `Getting Started with ${topic} - Complete Beginner's Guide`,
            `Top 10 ${topic} Tips Nobody Tells You`,
            `My First Day Trying ${topic}`,
            `${topic} vs Reality - What I Wish I Knew`,
            `The Ultimate ${topic} Setup Guide`,
            `5 Mistakes Every ${topic} Beginner Makes`,
            `How I Got Into ${topic} - My Story`,
            `${topic} on a Budget - Everything You Need`,
            `Day in the Life of a ${topic} Creator`,
            `${topic} Challenge - Can I Do It in 24 Hours?`,
          ],
          schedule: "2 videos per week - Tuesdays and Fridays at 3PM EST",
          growthStrategy: `Focus on searchable content first. Use YouTube Shorts to build initial momentum. Engage with every comment in the first 90 days. Collaborate with other small creators in the ${topic} niche.`,
          brandingTips: `Use bold, contrasting colors for thumbnails. Keep a consistent intro style. Include your channel name in every thumbnail. Create a recognizable visual pattern viewers can spot in their feed.`,
          nicheAnalysis: `The ${topic} space has strong audience potential. Focus on underserved subtopics to stand out. Monetization is achievable through ads, sponsorships, and digital products.`,
        });
      }

      let plan: any;
      try { plan = JSON.parse(content); } catch { plan = null; }
      if (plan) {
        res.json(plan);
        return;
      }
    } catch (error: any) {
      console.error("AI new creator plan error:", error);
      const niche = req.body.niche || "Content";
      res.json({
        channelName: `${niche} Creator`,
        channelDescription: `A channel about ${niche.toLowerCase()} with tips, tutorials, and entertainment.`,
        videoIdeas: [
          `Getting Started with ${niche} - Complete Beginner's Guide`,
          `Top 10 ${niche} Tips Nobody Tells You`,
          `My First Day with ${niche} - Full Experience`,
          `What I Wish I Knew Before Starting ${niche}`,
          `The Ultimate ${niche} Setup Guide on a Budget`,
          `5 Common ${niche} Mistakes to Avoid`,
          `How I Got Into ${niche} - My Story`,
          `Everything You Need to Get Started with ${niche}`,
          `Day in the Life of a ${niche} Creator`,
          `${niche} 30 Day Challenge - Can I Do It?`,
        ],
        schedule: "2 videos per week - Tuesdays and Fridays at 3PM EST",
        growthStrategy: `Start with searchable, helpful ${niche.toLowerCase()} content. Use YouTube Shorts to build initial views. Engage with every comment in your first 90 days. Collaborate with other small creators in the ${niche.toLowerCase()} space.`,
        brandingTips: `Use bold, contrasting colors for thumbnails. Keep a consistent intro style. Include your channel name in every thumbnail. Create a recognizable visual pattern viewers can spot in their feed.`,
        nicheAnalysis: `The ${niche.toLowerCase()} niche has strong audience potential. Focus on underserved subtopics to stand out. Monetization is achievable through ads, sponsorships, and digital products.`,
      });
    }
  });

  app.post("/api/ai/dashboard-actions", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Dashboard Actions");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const channel = channels[0];
      const videos = await storage.getVideosByUser(userId);
      const revenue = await storage.getRevenueRecords(userId);
      const expenses = await storage.getExpenseRecords(userId);
      const goals = await storage.getGoals(userId);
      const ventures = await storage.getVentures(userId);
      const totalRevenue = revenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const result = await aiDashboardActions({
        channelName: channel?.channelName || "My Channel",
        videoCount: videos.length,
        totalRevenue,
        totalExpenses,
        recentTitles: videos.slice(0, 10).map((v: any) => v.title),
        activeGoals: goals.filter((g: any) => g.status === "active").length,
        activeVentures: ventures.filter((v: any) => v.status === "active").length,
      }, userId);
      if (!res.headersSent) res.json(result);
    } catch (error: any) {
      console.error("AI dashboard actions error:", error);
      if (!res.headersSent) {
        res.json({
          actionItems: [
            { title: "AI is warming up", description: "The AI engine is initializing. Your dashboard actions will populate shortly.", priority: "low", category: "content", status: "auto_handled" }
          ],
          opportunities: [],
          todaySummary: "AI is analyzing your channel data. Action items will appear here once analysis is complete."
        });
      }
    }
  });

  app.post("/api/ai/brand-analysis", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Brand Analysis");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const channel = channels[0];
      const videos = await storage.getVideosByUser(userId);
      const result = await aiBrandAnalysis({
        channelName: channel?.channelName || "My Channel",
        recentTitles: videos.slice(0, 15).map((v: any) => v.title),
        videoCount: videos.length,
      }, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI brand analysis error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/ai/script-writer", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Script Writer");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await aiScriptWriter({ ...req.body, channelName: channels[0]?.channelName || "My Channel", recentTitles: videos.slice(0, 5).map((v: any) => v.title) }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI script error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-concepts", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Thumbnail Concepts");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiThumbnailConcepts({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI thumbnail error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/chapter-markers", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Chapter Markers");
    if (!userId) return;
    try {
      const result = await aiChapterMarkers(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI chapters error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/keyword-research", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Keyword Research");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiKeywordResearch({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI keyword error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/repurpose", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Content Repurposer");
    if (!userId) return;
    try {
      const result = await aiRepurposeContent(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI repurpose error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/seo-audit", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI SEO Audit");
    if (!userId) return;
    try {
      const result = await aiSEOAudit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI SEO error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-calendar", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Calendar");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiContentCalendarPlanner({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI calendar error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsorship-manager", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Sponsorship Manager");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const deals = await storage.getSponsorshipDeals(userId);
      const result = await aiSponsorshipManager({
        channelName: channels[0]?.channelName || "My Channel",
        niche: (channels[0] as any)?.category || undefined,
        avgViews: videos.length > 0 ? Math.round(videos.reduce((s: number, v: any) => s + (v.metadata?.stats?.views || 0), 0) / videos.length) : undefined,
        existingSponsors: deals.map((d: any) => d.brandName).filter(Boolean),
      }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI sponsorship error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/media-kit", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Media Kit");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await aiMediaKit({
        channelName: channels[0]?.channelName || "My Channel",
        niche: (channels[0] as any)?.category || undefined,
        totalVideos: videos.length,
      }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI media kit error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pl-report", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI P&L Report");
    if (!userId) return;
    try {
      const revenue = await storage.getRevenueRecords(userId);
      const expenses = await storage.getExpenseRecords(userId);
      const totalRev = revenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const totalExp = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const bySource: Record<string, number> = {};
      revenue.forEach((r: any) => { bySource[r.platform || 'other'] = (bySource[r.platform || 'other'] || 0) + (r.amount || 0); });
      const byCat: Record<string, number> = {};
      expenses.forEach((e: any) => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + (e.amount || 0); });
      const result = await aiPLReport({ totalRevenue: totalRev, totalExpenses: totalExp, revenueBySource: bySource, expensesByCategory: byCat }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI P&L error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/chatbot-config", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiStreamChatBot({ channelName: channels[0]?.channelName || "My Channel", ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI chatbot error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-checklist", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Stream Checklist");
    if (!userId) return;
    try {
      const result = await aiStreamChecklist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI checklist error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/raid-strategy", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Raid Strategy");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiRaidStrategy({ channelName: channels[0]?.channelName || "My Channel", ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI raid error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/post-stream-report", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Post-Stream Report");
    if (!userId) return;
    try {
      const result = await aiPostStreamReport(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI post-stream error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/team-manager", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Team Manager");
    if (!userId) return;
    try {
      const result = await aiTeamManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI team error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/automation-builder", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Automation Builder");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiAutomationBuilder({ ...req.body, platforms: channels.map((c: any) => c.platform) }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI automation error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-academy", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Creator Academy");
    if (!userId) return;
    try {
      const result = await aiCreatorAcademy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI academy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/news-feed", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsFeed(userId);
      res.json(result);
    } catch (e: any) { console.error("AI news error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/milestones", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const videos = await storage.getVideosByUser(userId);
      const revenue = await storage.getRevenueRecords(userId);
      const totalRevenue = revenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const result = await aiMilestoneEngine({ totalVideos: videos.length, revenue: totalRevenue, ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI milestones error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crossplatform-analytics", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Cross-Platform Analytics");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const revenue = await storage.getRevenueRecords(userId);
      const totalRevenue = revenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const result = await aiCrossplatformAnalytics({
        platforms: channels.map((c: any) => c.platform),
        videoCount: videos.length,
        totalRevenue,
        channelName: channels[0]?.channelName || "My Channel",
      }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI crossplatform error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/comment-manager", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Manager");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiCommentManager({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI comment error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-matchmaker", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Collab Matchmaker");
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiCollabMatchmaker({ channelName: channels[0]?.channelName || "My Channel", niche: (channels[0] as any)?.category || undefined, ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI collab error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/storyboard", aiRateLimit, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Storyboard");
    if (!userId) return;
    try {
      const result = await aiStoryboardGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/color-grading", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiColorGradingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/intro-outro", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIntroOutroCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sound-effects", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSoundEffectsRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pacing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPacingAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/talking-points", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTalkingPointsGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-length", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoLengthOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-format", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiFormatExporter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/watermark", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatermarkManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/green-screen", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGreenScreenAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/teleprompter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeleprompterFormatter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/scene-transitions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSceneTransitionRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-quality", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoQualityEnhancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/aspect-ratio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAspectRatioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/lower-thirds", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLowerThirdGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cta-overlays", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCtaOverlayDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/split-screen", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSplitScreenBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/time-lapse", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeLapseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/footage-organizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFootageOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audio-leveling", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioLevelingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/noise-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackgroundNoiseDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/jump-cuts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiJumpCutDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cinematic-shots", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCinematicShotPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/compression", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoCompressionOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-ab", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailABTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-ctr", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailCTRPredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-styles", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailStyleLibrary(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/face-expressions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFaceExpressionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-text", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailTextOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/color-psychology", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailColorPsychology(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/banner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBannerGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/social-covers", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialCoverCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/animated-thumbnails", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnimatedThumbnailCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-competitors", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailCompetitorComparison(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-watermark", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandWatermarkDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/emoji-stickers", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmojiStickerCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/infographic", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfographicGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/meme-templates", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMemeTemplateCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/visual-consistency", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVisualConsistencyScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voice-clone", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceCloneAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hooks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHookGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/title-split-test", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTitleSplitTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/title-emotion", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTitleEmotionalScore(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/clickbait-detect", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiClickbaitDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/description-templates", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDescriptionTemplateBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/end-screen-cta", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndScreenCTAWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pinned-comments", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPinnedCommentGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/community-posts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityPostWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/email-subjects", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailSubjectOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/bio-writer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBioWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-tags", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoTagsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hashtag-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHashtagOptimizer2(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/playlist-writer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaylistWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/press-release", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPressReleaseWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/testimonial-drafter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTestimonialDrafter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tag-cloud", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTagCloudGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/search-intent", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSearchIntentMapper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/algorithm-decoder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/featured-snippets", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFeaturedSnippetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-platform-seo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPlatformSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/backlinks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBacklinkTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-freshness", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentFreshnessScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/keyword-cannibalization", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKeywordCannibalization(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/long-tail-keywords", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLongTailKeywordMiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-sitemap", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoSitemapGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/rich-snippets", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRichSnippetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voice-search", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceSearchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/autocomplete", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutocompleteTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/google-trends", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleTrendsIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-keywords", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorKeywordSpy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/search-rankings", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSearchRankingTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ctr-benchmark", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCTRBenchmarker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/impression-analysis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiImpressionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/related-videos", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRelatedVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/browse-features", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrowseFeatureOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-pillars", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPillarPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/series-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeriesBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/repurpose-matrix", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentRepurposeMatrix(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/viral-score", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralScorePredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-gaps", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentGapFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/trend-surfer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrendSurfer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/evergreen", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEvergreenPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-mix", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentMixOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/seasonal-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeasonalContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/bts-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBehindTheScenesPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/reaction-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReactionContentFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/challenge-creator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChallengeCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/qna-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQnAContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tutorial-structure", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTutorialStructurer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/documentary-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDocumentaryStylePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/short-form-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortFormStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-ideas", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsIdeaGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-to-long", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsToLongPipeline(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/long-to-shorts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLongToShortsClipper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/vertical-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVerticalVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-audio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsAudioSelector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-captions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsCaptionStyler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-hooks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsHookFormula(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/duet-stitch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDuetStitchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-analytics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsAnalyticsDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-batch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsBatchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-remix", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsRemixStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-monetization", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsMonetization(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-velocity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentVelocityTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/niche-research", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNicheResearcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/caption-styler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaptionStyler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subtitle-translator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubtitleTranslator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-language-seo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiLanguageSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/localization", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLocalizationManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dubbing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDubbingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/transcript", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTranscriptOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/caption-compliance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiClosedCaptionCompliance(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audio-description", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioDescriptionWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/language-priority", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLanguagePriorityRanker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audience-demographics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceDemographics(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/watch-time", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatchTimeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/engagement-rate", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEngagementRateAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subscriber-growth", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriberGrowthAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-forecast", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ab-test", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiABTestAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/retention-heatmap", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceRetentionHeatmap(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/traffic-sources", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrafficSourceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/device-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDeviceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/playback-location", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaybackLocationAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/end-screen-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndScreenAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/card-performance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCardPerformanceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/impression-funnel", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiImpressionFunnelAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-benchmark", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorBenchmarker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/growth-prediction", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrowthRatePredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/churn-predictor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChurnPredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/viral-coefficient", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralCoefficientCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sentiment", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSentimentDashboard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/peak-times", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPeakTimeAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-lifecycle", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoLifecycleTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/rpm-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenuePerViewOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audience-overlap", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceOverlapAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/performance-ranker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPerformanceRanker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/funnel-leaks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFunnelLeakDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/predictive-analytics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveAnalytics(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/custom-reports", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomReportBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-titles", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamTitleGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-schedule", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamScheduleOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-overlays", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamOverlayDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-alerts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamAlertDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-moderation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamModerationRules(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-interactions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamInteractionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-revenue", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamRevenueOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-clips", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamClipHighlighter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-categories", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamCategoryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-panels", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamPanelDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-emotes", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamEmoteManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-sub-goals", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamSubGoalPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-networking", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamNetworkingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-analytics-explainer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamAnalyticsExplainer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-stream", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiStreamSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-backup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamBackupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-community", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-branding", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamBrandingKit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-content-calendar", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamContentCalendar(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-growth", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamGrowthHacker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ad-revenue", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdRevenueOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ad-placement", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdPlacementAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cpm-maximizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCPMMaximizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsor-pricing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorPricingEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsor-outreach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorOutreachWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsor-negotiation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorNegotiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsor-deliverables", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorDeliverableTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/affiliate-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffiliateOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/merchandise", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMerchandiseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/membership-tiers", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMembershipTierBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/digital-products", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalProductCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/course-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCourseBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/patreon", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatreonOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/super-chat", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperChatOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/membership-growth", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelMembershipGrowth(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-streams", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueStreamDiversifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/invoice", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInvoiceGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/contract-review", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContractReviewer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tax-deductions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTaxDeductionFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/quarterly-tax", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuarterlyTaxEstimator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-deal", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandDealEvaluator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/media-kit-enhance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaKitEnhancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/rate-card", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRateCardGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsor-roi", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorROICalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/passive-income", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPassiveIncomeBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pricing-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPricingStrategyAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-attribution", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueAttributionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/donation-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDonationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crowdfunding", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrowdfundingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/licensing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLicensingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/book-deal", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBookDealAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/speaking-fees", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSpeakingFeeCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/consulting", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConsultingPackageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/expense-tracker-ai", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExpenseTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/profit-margin", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProfitMarginAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cash-flow", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCashFlowForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/payment-gateway", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPaymentGatewayAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subscription-box", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriptionBoxBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/nft-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNFTContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-goals", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueGoalTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/comment-response", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommentResponseGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/superfan-id", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperfanIdentifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/discord-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordServerPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/community-events", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/poll-creator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPollCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/contest-runner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContestRunner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/community-guidelines", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityGuidelinesWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/moderator-trainer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiModeratorTrainer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ama-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAMAPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/loyalty-program", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLoyaltyProgramBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ugc-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUserGeneratedContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/community-health", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityHealthScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fan-art", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFanArtCurator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/milestone-events", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMilestoneEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dm-templates", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDMResponseTemplates(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hashtag-community", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHashtagCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/live-qa", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLiveQAManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/referral-program", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReferralProgramBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ambassador-program", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityAmbassadorProgram(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/engagement-boost", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEngagementBoostStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hiring", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHiringAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/freelancer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFreelancerFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sop-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSOPBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/project-timeline", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProjectTimeline(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/approval-flow", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentApprovalFlow(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/editing-checklist", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditingChecklistBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/production-budget", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductionBudgetPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/equipment", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEquipmentRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/studio-setup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStudioSetupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/workflow-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkflowOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/batch-recording", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBatchRecordingScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/outsourcing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOutsourcingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tool-stack", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiToolStackOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-voice", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandVoiceCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-colors", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandColorPalette(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-fonts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandFontSelector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-story", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandStoryWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-consistency", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandConsistencyAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pillar-refine", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPillarRefiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/channel-trailer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelTrailerBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/art-direction", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelArtDirector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/usp-finder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUniqueSellingPointFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/target-audience", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTargetAudienceDefiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-partnerships", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandPartnershipMatcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crisis-comms", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisCommsPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/personal-brand", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalBrandAudit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-evolution", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandEvolutionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-diff", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorDifferentiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-brief", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollaborationBriefWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/networking-prep", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkingEventPrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mentorship", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMentorshipFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/delegation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDelegationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/time-management", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeManagementCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mastermind", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorMastermindPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/productivity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductivityTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/copyright-check", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCopyrightChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fair-use", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFairUseAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/music-license", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicLicenseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/privacy-policy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrivacyPolicyGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/terms-of-service", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTermsOfServiceWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ftc-compliance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFTCComplianceChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/coppa", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCOPPAAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gdpr", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGDPRComplianceChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-id", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentIDManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dispute-resolution", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDisputeResolutionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/trademark", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrademarkAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/contract-template", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContractTemplateBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/insurance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInsuranceAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/business-entity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBusinessEntityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ip-protection", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIntellectualPropertyProtector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/meditation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMeditationGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/work-life-balance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkLifeBalancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sleep", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSleepOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/exercise", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExerciseForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/eye-strain", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEyeStrainPreventer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voice-care", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceCareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stress-management", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStressManagementCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/break-scheduler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorBreakScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/youtube-api", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeAPIIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-integration", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/discord-bot", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordBotBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ga-setup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleAnalyticsSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/social-scheduler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialMediaScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/email-marketing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailMarketingSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/podcast", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/webhook-manager", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWebhookManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/rate-limits", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAPIRateLimitManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-backup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataBackupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/notification-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNotificationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-post", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPostAutomator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/linktree", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkTreeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/qr-codes", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQRCodeGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/chatbot-integrator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChatbotIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/analytics-dashboard", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnalyticsDashboardBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cdn-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentDeliveryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/accessibility", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccessibilityAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/device-testing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiDeviceTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/performance-monitor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPerformanceMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/security-audit", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSecurityAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cookie-consent", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCookieConsentManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/age-gating", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAgeGatingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-retention", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataRetentionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/incident-response", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIncidentResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shortcuts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomShortcutBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/advanced-search", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdvancedSearchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/bulk-upload", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBulkUploadManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/playlist-organizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaylistAutoOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-account", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiAccountManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/custom-dashboard", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomDashboardBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-tagging", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoTaggingSystem(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/smart-notifications", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartNotificationSystem(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/template-library", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTemplateLibrary(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/macro-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMacroBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/vr-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVRContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ar-filters", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiARFilterCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voiceover", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAIVoiceoverGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/deepfake-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDeepfakeDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/blockchain-verify", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlockchainContentVerifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/predictive-trends", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveTrendEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-graph", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentGraphAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/psychographics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudiencePsychographer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/neuro-marketing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNeuroMarketingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gamification", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamificationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/personalization", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sentiment-predict", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSentimentPredictiveModel(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/algorithm-sim", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmSimulator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-economy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorEconomyTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/web3-tools", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWeb3CreatorTools(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/metaverse", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMetaversePresencePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/agent-customizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAIAgentCustomizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-viz", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataVisualizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-api", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorAPIBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/podcast-launch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastLaunchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/podcast-episode", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastEpisodePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/podcast-seo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audio-branding", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioBrandingKit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/music-composer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicComposerAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/asmr", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiASMRContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voice-training", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceTrainingCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audio-mixing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioMixingGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/newsletter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsletterBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/email-sequence", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailSequenceWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/lead-magnet", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLeadMagnetCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/email-list", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailListGrower(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/email-analytics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailAnalyticsAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/webinar", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWebinarPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/virtual-event", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVirtualEventOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/meetup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMeetupOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/conference-prep", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConferencePrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/award-submission", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAwardSubmissionWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/panel-prep", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPanelDiscussionPrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-retreat", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorRetreePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/live-workshop", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLiveWorkshopBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/course-launch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOnlineCourseLauncher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/masterclass", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMasterclassDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/media-appearance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaAppearancePrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/guest-post", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGuestPostWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/influencer-event", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/product-launch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductLaunchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/charity-event", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCharityEventAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/anniversary", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnniversaryCelebrationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/seasonal-campaign", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeasonalCampaignPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/holiday-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHolidayContentCalendar(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/year-review", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndOfYearReview(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/skill-assessment", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSkillAssessment(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/learning-path", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLearningPathBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/certification", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCertificationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/book-recommend", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBookRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tool-tutorial", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiToolTutorialCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/industry-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIndustryReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/case-study", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaseStudyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/portfolio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPortfolioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/social-proof", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialProofCollector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/testimonial-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTestimonialVideoPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/case-study-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaseStudyVideoCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/before-after", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBeforeAfterShowcase(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/influencer-score", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerScorecard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/credibility", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCredibilityBooster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/review-manager", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUserReviewManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/reference-page", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReferencePageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ecommerce-store", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEcommerceStoreBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dropshipping", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDropshippingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/print-on-demand", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrintOnDemandOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/digital-download", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalDownloadCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/affiliate-page", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffiliatePageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/upsell", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUpsellStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cart-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCartAbandonmentRecovery(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/customer-journey", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomerJourneyMapper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/product-bundle", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductBundleCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/flash-sale", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFlashSalePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/loyalty-rewards", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLoyaltyRewardDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subscription-model", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriptionModelBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pricing-page", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPricingPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/checkout", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCheckoutOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/inventory", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInventoryForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shipping", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShippingOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/youtube-ads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeAdsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/facebook-ads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookAdsCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/google-ads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleAdsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-ads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokAdsAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/influencer-ads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerAdsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/retargeting", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRetargetingStrategist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ad-copy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdCopyWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ad-budget", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdBudgetAllocator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/landing-page", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLandingPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/conversion-rate", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConversionRateOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-cleaning", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataCleaningAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-pipeline", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataPipelineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/anomaly-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnomalyDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cohort-analysis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCohortAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/attribution-model", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAttributionModeler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/predictive-churn", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveChurnModeler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ltv-calculator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLifetimeValueCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/accessibility-text", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccessibilityTextChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/alt-text", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAltTextGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/color-contrast", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiColorContrastChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/screen-reader", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiScreenReaderOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/keyboard-nav", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKeyboardNavChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/caption-quality", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaptionQualityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/inclusive-language", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInclusiveLanguageChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dyslexia-format", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDyslexiaFriendlyFormatter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/motion-sensitivity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMotionSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cognitive-load", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCognitiveLoadReducer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-modal", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiModalContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/password-security", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPasswordSecurityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/phishing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPhishingDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/account-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccountRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/privacy-settings", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrivacySettingsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-breach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataBreachResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/vpn", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVPNAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-analysis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorContentTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-pricing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorPricingMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/market-share", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMarketShareAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/swot", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSWOTAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-social", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorSocialTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/blue-ocean", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlueOceanFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mobile-optimize", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/deep-links", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAppDeepLinkBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/push-notifications", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPushNotificationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mobile-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/responsive-check", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiResponsiveDesignChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mobile-payment", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobilePaymentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/offline-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOfflineContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mobile-analytics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileAnalyticsSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/app-store", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAppStoreOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/widget-design", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWidgetDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gesture-optimize", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGestureOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mobile-first", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileFirstContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/wearable", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWearableContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-sync", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPlatformSyncManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/smart-tv", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartTVOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/achievements", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAchievementSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/leaderboard", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLeaderboardDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/points-economy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPointsEconomyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/badge-system", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBadgeSystemCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/streak-system", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreakSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/progress-viz", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProgressVisualizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/challenge-system", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChallengeSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/monthly-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMonthlyReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/weekly-digest", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWeeklyDigestBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/quarterly-review", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuarterlyBusinessReview(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/annual-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnnualStrategyPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audience-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceReportBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentReportCard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/roi-report", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiROIReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gaming-niche", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamingNicheOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/beauty-niche", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBeautyNicheAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tech-review", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTechReviewOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/food-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFoodContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fitness-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFitnessContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/travel-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTravelContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/education-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEducationContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/finance-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinanceContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/parenting-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiParentingContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pet-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPetContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/diy-craft", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDIYCraftPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/musician-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicianContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/comedy-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiComedyContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sports-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSportsContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/news-commentary", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsCommentaryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/lifestyle-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLifestyleContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-to-book", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToBookConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-to-podcast", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToPodcastConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-to-course", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToCourseConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/blog-to-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlogToVideoConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/linkedin-adapter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInContentAdapter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pinterest-pins", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPinterestPinCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/reddit-post", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRedditPostOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/quora-answer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuoraAnswerWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/medium-article", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediumArticleAdapter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/slidedeck", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSlidedeckCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/infographic-repurpose", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfographicRepurposer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-match", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabMatchScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-contract", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContractWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-revenue", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabRevenueCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-ideas", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContentIdeator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-outreach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabOutreachWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/collab-performance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabPerformanceTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/network-effect", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkEffectCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sub-milestone", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubMilestoneStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sub-retention", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubRetentionOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/bell-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNotificationBellOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/first-video", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFirstVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/membership-perks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelMembershipPerks(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sub-countdown", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubCountdownPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/unsub-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUnsubscribeAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sub-quality", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubQualityAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/growth-playbook", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrowthHackingPlaybook(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/viral-engine", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralGrowthEngineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-promo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPromotionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/watch-time-boost", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatchTimeBooster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/open-loops", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOpenLoopCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pattern-interrupts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatternInterruptDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/re-engagement", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReEngagementHookBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/binge-watch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBingeWatchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-studio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeStudioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-shorts-algo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeShortsAlgorithm(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-comments", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeCommentsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-playlists", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubePlaylistStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-premiere", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubePremierePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-membership", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeMembeshipStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-super-thanks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeSuperThanksOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-handle", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeHandleOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-channel-page", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeChannelPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/yt-hashtags", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeHashtagStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-emotes", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchEmoteStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-bits", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchBitsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-raids", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchRaidOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-points", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchChannelPointsDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-predictions", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchPredictionsCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-hype-train", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchHypeTrainMaximizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-clips", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchClipStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-vods", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchVODOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/twitch-panels", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchPanelDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/kick-stream", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickStreamOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/kick-monetization", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickMonetizationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/kick-community", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/kick-differentiator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickContentDifferentiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/kick-discovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickDiscoveryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-router", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiPlatformStreamRouter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-deck", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamDeckConfigurer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/obs-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOBSOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/streamlabs", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamLabsConfigurator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-elements", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamElementsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/chaturbate", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChaturbateStreamAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-algorithm", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokAlgorithmDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-sounds", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokSoundStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-duet", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokDuetStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-live", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokLiveOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-shop", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokShopAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-fund", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokCreatorFundOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-hashtags", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokHashtagResearcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/tiktok-profile", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokProfileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-reels", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramReelsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-stories", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramStoriesPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-carousel", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramCarouselCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-bio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramBioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-shopping", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramShoppingSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-collabs", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramCollabManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-growth", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramGrowthHacker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ig-aesthetic", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramAestheticPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/linkedin-creator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInCreatorStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/linkedin-article", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInArticleWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fb-groups", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookGroupManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fb-reels", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookReelsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/snapchat", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSnapchatSpotlightAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/threads", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThreadsStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/discord-optimize", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordServerOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/patreon-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatreonContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/substack", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubstackOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gumroad", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGumroadProductOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/teachable", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeachableCoursePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/buymeacoffee", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBuyMeCoffeeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/retirement", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRetirementPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/emergency-fund", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmergencyFundAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/investment", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInvestmentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/debt-payoff", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDebtPayoffPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/real-estate", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRealEstateInvestor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crypto-portfolio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCryptoPortfolioAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/freelance-pricing", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFreelancePricingGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/grant-finder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrantFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-diversify", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueStreamDiversifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/budget-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBudgetTrackerSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/financial-goals", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinancialGoalSetter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/camera-recommend", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCameraRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/microphone", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMicrophoneAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/lighting-setup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLightingSetupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/editing-software", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditingSoftwareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/studio-design", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStudioDesignPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/backup-storage", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackupStoragePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/internet-optimize", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInternetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/va-tasks", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVATaskDelegator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/editor-hiring", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditorHiringGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-designer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailDesignerFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-moderation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentModerationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/copyright-claim", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCopyrightClaimResolver(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsorship-disclosure", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorshipDisclosureChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/age-restriction", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAgeRestrictionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/defamation-risk", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDefamationRiskChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/plagiarism", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlagiarismDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hate-speech", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHateSpeechDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/misinformation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMisinformationChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/trigger-warning", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTriggerWarningAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/child-safety", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChildSafetyChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-audit", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalBrandAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/elevator-pitch", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiElevatorPitchWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/press-kit", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPressKitBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/speaker-bio", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSpeakerBioWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/linkedin-profile", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInProfileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/personal-website", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalWebsiteBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thought-leadership", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThoughtLeadershipPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/public-speaking", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPublicSpeakingCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/networking-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkingStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/reputation-monitor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReputationMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crisis-response", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/apology-script", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiApologyScriptWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/controversy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiControversyNavigator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cancel-culture", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCancelCultureDefender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/diversity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiversityInclusionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/political-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPoliticalContentNavigator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/religious-sensitivity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReligiousSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cultural-sensitivity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCulturalSensitivityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/body-image", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBodyImageSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/addiction-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAddictionContentGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/financial-disclaimer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinancialDisclaimerWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/workflow-automation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkflowAutomationBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/zapier", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiZapierIntegrationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ifttt", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIFTTTRecipeCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/make-scenario", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMakeScenarioBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-scheduler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-responder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoResponder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-moderator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoModerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-backup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoBackupper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-reporter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoReporter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/batch-processor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBatchProcessor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/smart-queue", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartQueueManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-pipeline", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPipelineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/training-data", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAITrainingDataCollector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crisis-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/damage-control", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDamageControlPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pr-statement", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPRStatementWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stakeholder-comm", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStakeholderCommunicator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/recovery-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRecoveryStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/media-response", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/legal-risk", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLegalRiskAssessor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/social-crisis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialMediaCrisisManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/influencer-crisis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerCrisisAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/trust-rebuild", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityTrustRebuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/algo-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmRecoveryAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/team-crisis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeamCrisisManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/legal-defense", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLegalDefensePrepper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/insurance-claim", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInsuranceClaimHelper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/contingency", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContingencyPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/disaster-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDisasterRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/business-continuity", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBusinessContinuityPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/exit-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExitStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/summer-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSummerContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/winter-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWinterContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/back-to-school", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackToSchoolPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/halloween-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHalloweenContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/black-friday", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlackFridayStrategist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/christmas-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChristmasContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/new-year-goals", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewYearGoalSetter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/valentines", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiValentinesDayPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/easter-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEasterContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/super-bowl", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperBowlContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/parents-day", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiParentsDayPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/graduation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGraduationContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/world-cup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorldCupContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/olympics", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOlympicsContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/awards-season", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAwardsSeasonPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/music-festival", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicFestivalContentGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gaming-event", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamingEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/product-hunt", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductHuntLaunchGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ergonomic-setup", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiErgonomicSetupAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/eye-care", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEyeCareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/vocal-health", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVocalHealthCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sleep-optimize", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSleepOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/nutrition", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNutritionForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/time-blocking", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeBlockingOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pomodoro", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPomodoroCustomizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/digital-detox", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalDetoxPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gratitude-journal", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGratitudeJournalPrompts(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/affirmations", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffirmationGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/habit-stack", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHabitStackBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/energy-management", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEnergyManagementAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-community", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mastermind-group", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMastermindGroupFacilitator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/accountability", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccountabilityPartnerMatcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sabbatical", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorSabbaticalPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-onboarding", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoOnboarding(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-onboarding error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-approve-sponsorship", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoApproveSponsorship(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-approve error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creative-autonomy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreativeAutonomy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI creative-autonomy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/auto-payment-manager", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoPaymentManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-payment error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/video-translator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVideoTranslator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI video-translator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subtitle-generator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubtitleGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subtitle-generator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/localization-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLocalizationAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI localization-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-lang-seo", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangSeo(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-seo error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dubbing-script", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDubbingScriptGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI dubbing-script error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cultural-adaptation", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCulturalAdaptation(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cultural-adaptation error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-localizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiThumbnailLocalizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI thumbnail-localizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-lang-hashtags", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangHashtags(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-hashtags error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/translation-checker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTranslationChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI translation-checker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audience-language-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudienceLanguageAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audience-language error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/regional-trends", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRegionalTrendScanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI regional-trends error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-lang-comments", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossLangCommentManager(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-lang-comments error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/localized-calendar", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLocalizedContentCalendar(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI localized-calendar error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-lang-ab-test", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangAbTesting(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-ab-test error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/voice-over-formatter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVoiceOverFormatter(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI voice-over-formatter error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/regional-compliance", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRegionalComplianceChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI regional-compliance error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-lang-media-kit", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangMediaKit(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-media-kit error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-tracker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-gap-analysis", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorGapAnalysis(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-gap-analysis error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-alerts", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorAlerts(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-alerts error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-content-scorer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorContentScorer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-content-scorer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/niche-domination-map", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiNicheDominationMap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI niche-domination-map error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/competitor-audience-overlap", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorAudienceOverlap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-audience-overlap error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/optimal-schedule", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiOptimalSchedule(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI optimal-schedule error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audience-persona-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudiencePersonaBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audience-persona-builder error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subscriber-magnet", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubscriberMagnet(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subscriber-magnet error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/shorts-clips-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiShortsClipsStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI shorts-clips-strategy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/deal-negotiation-coach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDealNegotiationCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI deal-negotiation-coach error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/merch-demand-predictor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMerchDemandPredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI merch-demand-predictor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-stream-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRevenueStreamOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI revenue-stream-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/revenue-forecaster", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRevenueForecaster(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI revenue-forecaster error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sponsorship-rate-calculator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSponsorshipRateCalculator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sponsorship-rate-calculator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/membership-tier-designer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMembershipTierDesigner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI membership-tier-designer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/super-chat-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSuperChatOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI super-chat-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/affiliate-link-manager", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAffiliateLinkManager(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI affiliate-link-manager error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/script-coach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiScriptCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI script-coach error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/thumbnail-ctr-predictor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiThumbnailCTRPredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI thumbnail-ctr-predictor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/watch-time-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiWatchTimeOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI watch-time-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/platform-repurposer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformRepurposer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-repurposer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-decay-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentDecayDetector(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-decay-detector error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/title-ab-tester", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTitleAbTester(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI title-ab-tester error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/pacing-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPacingAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI pacing-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fan-loyalty-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanLoyaltyTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-loyalty-tracker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/comment-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCommentStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI comment-strategy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/community-poll-generator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCommunityPollGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI community-poll-generator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/live-chat-moderator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLiveChatModerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI live-chat-moderator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fan-milestone-celebrator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanMilestoneCelebrator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-milestone-celebrator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/engagement-booster", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEngagementBooster(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI engagement-booster error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-platform-unifier", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossPlatformUnifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-platform-unifier error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/platform-priority-ranker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformPriorityRanker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-priority-ranker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/cross-post-scheduler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossPostScheduler(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-post-scheduler error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/platform-specific-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformSpecificOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-specific-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-auditor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandAuditor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-auditor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/media-kit-auto-updater", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMediaKitAutoUpdater(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI media-kit-auto-updater error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-voice-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandVoiceAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-voice-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/visual-identity-checker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVisualIdentityChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI visual-identity-checker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-partnership-scorer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandPartnershipScorer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-partnership-scorer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/copyright-shield", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCopyrightShield(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI copyright-shield error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/contract-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContractAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI contract-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-insurance-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentInsuranceAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-insurance-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fair-use-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFairUseAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fair-use-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/dmca-defense-assistant", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDMCADefenseAssistant(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI dmca-defense-assistant error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/subscriber-milestone-predictor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubscriberMilestonePredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subscriber-milestone-predictor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/retention-heatmap-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRetentionHeatmapAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI retention-heatmap-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/best-video-formula-detector", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBestVideoFormulaDetector(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI best-video-formula-detector error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/growth-trajectory-modeler", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiGrowthTrajectoryModeler(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI growth-trajectory-modeler error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/ab-testing-dashboard", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAbTestingDashboard(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI ab-testing-dashboard error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-decay-refresher", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentDecayRefresher(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-decay-refresher error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-batching-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentBatchingPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-batching-planner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creative-block-solver", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreativeBlockSolver(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI creative-block-solver error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/work-life-balance-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiWorkLifeBalanceTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI work-life-balance-tracker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/motivation-engine", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMotivationEngine(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI motivation-engine error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/gear-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiGearAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI gear-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/editing-style-coach", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEditingStyleCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI editing-style-coach error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/public-speaking-trainer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPublicSpeakingTrainer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI public-speaking-trainer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/niche-expert-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiNicheExpertBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI niche-expert-builder error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/hiring-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiHiringAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI hiring-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/task-delegator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTaskDelegator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI task-delegator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/team-performance-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTeamPerformanceTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI team-performance-tracker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sops-generator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSOPsGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sops-generator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/crisis-response-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrisisResponsePlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI crisis-response-planner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/statement-drafter", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStatementDrafter(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI statement-drafter error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/survey-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSurveyBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI survey-builder error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/viewer-journey-mapper", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiViewerJourneyMapper(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI viewer-journey-mapper error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/demographic-deep-dive", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDemographicDeepDive(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI demographic-deep-dive error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/viewer-intent-analyzer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiViewerIntentAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI viewer-intent-analyzer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/course-product-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCourseProductPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI course-product-planner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/membership-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMembershipStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI membership-strategy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/speaking-engagement-finder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSpeakingEngagementFinder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI speaking-engagement-finder error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-roadmap", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentRoadmap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-roadmap error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-pillar-architect", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentPillarArchitect(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-pillar-architect error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/seasonal-content-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSeasonalContentPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI seasonal-content-planner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/evergreen-content-identifier", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEvergreenContentIdentifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI evergreen-content-identifier error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/industry-event-tracker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiIndustryEventTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI industry-event-tracker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/talent-agent-simulator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTalentAgentSimulator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI talent-agent-simulator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/creator-economy-news-feed", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreatorEconomyNewsFeed(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI creator-economy-news-feed error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-overlay-designer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStreamOverlayDesigner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI stream-overlay-designer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/raid-target-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRaidTargetOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI raid-target-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/stream-highlight-clipper", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStreamHighlightClipper(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI stream-highlight-clipper error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/donation-goal-strategist", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDonationGoalStrategist(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI donation-goal-strategist error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/multi-stream-chat-unifier", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiStreamChatUnifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-stream-chat-unifier error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/background-music-matcher", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBackgroundMusicMatcher(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI background-music-matcher error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/audio-quality-enhancer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudioQualityEnhancer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audio-quality-enhancer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sound-effect-recommender", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSoundEffectRecommender(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sound-effect-recommender error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/accessibility-checker", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAccessibilityChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI accessibility-checker error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/alt-text-generator", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAltTextGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI alt-text-generator error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/sign-language-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSignLanguageAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sign-language-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/privacy-scanner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPrivacyScanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI privacy-scanner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/account-security-auditor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAccountSecurityAuditor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI account-security-auditor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/data-backup-strategist", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDataBackupStrategist(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI data-backup-strategist error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/digital-collectible-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDigitalCollectibleAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI digital-collectible-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/exclusive-content-planner", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiExclusiveContentPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI exclusive-content-planner error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/fan-marketplace-builder", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanMarketplaceBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-marketplace-builder error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/channel-exit-strategy", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiChannelExitStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI channel-exit-strategy error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/content-archive-optimizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentArchiveOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-archive-optimizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/brand-licensing-advisor", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandLicensingAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-licensing-advisor error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/inbox-prioritizer", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiInboxPrioritizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI inbox-prioritizer error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/daily-action-plan", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDailyActionPlan(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI daily-action-plan error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/burnout-risk", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBurnoutRiskAssessor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI burnout-risk error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mental-health", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreatorMentalHealthMonitor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI mental-health error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/burnout-recovery", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreatorBurnoutRecovery(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI burnout-recovery error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/burnout-prevention", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBurnoutPrevention(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI burnout-prevention error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/mental-health-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMentalHealthContentGuide(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI mental-health-content error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/ai/autumn-content", aiRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSeasonalContentPlanner({ ...req.body, quarter: "Q4" }, userId); res.json(result); }
    catch (e: any) { console.error("AI autumn-content error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });
}
