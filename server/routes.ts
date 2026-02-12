import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { ADMIN_EMAIL, PLATFORM_INFO, type Platform } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;
function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
import {
  generateVideoMetadata,
  analyzeChannelGrowth,
  runComplianceCheck,
  generateContentInsights,
  getContentStrategyAdvice,
  generateStreamSeo,
  postStreamOptimize,
  generateThumbnailPrompt,
  runAgentTask,
  generateCommunityPost,
  generateTaxStrategy,
  generateExpenseAnalysis,
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
  aiCreatorAcademy,
  aiNewsFeed,
  aiMilestoneEngine,
  aiCrossplatformAnalytics,
  aiCommentManager,
  aiCollabMatchmaker,
  aiWellnessAdvisor,
  aiSEOAudit,
  aiContentCalendarPlanner,
  aiStoryboardGenerator,
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
  aiInsuranceAdvisor,
  aiBusinessEntityAdvisor,
  aiIntellectualPropertyProtector,
  aiBurnoutRiskAssessor,
  aiMeditationGuide,
  aiWorkLifeBalancer,
  aiCreatorMentalHealthMonitor,
  aiSleepOptimizer,
  aiExerciseForCreators,
  aiEyeStrainPreventer,
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
  aiVideoToPodcastConverter,
  aiVideoToCourseConverter,
  aiBlogToVideoConverter,
  aiTwitterThreadCreator,
  aiLinkedInContentAdapter,
  aiPinterestPinCreator,
  aiRedditPostOptimizer,
  aiQuoraAnswerWriter,
  aiMediumArticleAdapter,
  aiSlidedeckCreator,
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
  aiXTwitterGrowthStrategy,
  aiXTwitterThreadWriter,
  aiLinkedInCreatorStrategy,
  aiLinkedInArticleWriter,
  aiFacebookGroupManager,
  aiFacebookReelsOptimizer,
  aiSnapchatSpotlightAdvisor,
  aiThreadsStrategy,
  aiDiscordServerOptimizer,
  aiPatreonContentPlanner,
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
  aiApologyScriptWriter,
  aiControversyNavigator,
  aiCancelCultureDefender,
  aiDiversityInclusionAdvisor,
  aiMentalHealthContentGuide,
  aiPoliticalContentNavigator,
  aiReligiousSensitivityChecker,
  aiCulturalSensitivityAdvisor,
  aiBodyImageSensitivityChecker,
  aiAddictionContentGuide,
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
  aiMusicFestivalContentGuide,
  aiGamingEventPlanner,
  aiProductHuntLaunchGuide,
  aiErgonomicSetupAdvisor,
  aiEyeCareAdvisor,
  aiVocalHealthCoach,
  aiNutritionForCreators,
  aiWorkLifeBalanceOptimizer,
  aiCreatorBurnoutRecovery,
  aiMeditationGuideForCreators,
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
  aiBurnoutPrevention,
  aiContentBatchingPlanner,
  aiCreativeBlockSolver,
  aiWorkLifeBalanceTracker,
  aiMotivationEngine,
  aiGearAdvisor,
  aiEditingStyleCoach,
  aiPublicSpeakingTrainer,
  aiNicheExpertBuilder,
  aiTaskDelegator,
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
  aiFanMarketplaceBuilder,
  aiChannelExitStrategy,
  aiContentArchiveOptimizer,
  aiBrandLicensingAdvisor,
  aiInboxPrioritizer,
  aiDailyActionPlan,
} from "./ai-engine";
import {
  runStyleScan,
  recordFeedback,
  getCreatorPreferences,
  recordLearningSignal,
} from "./creator-intelligence";
import { AI_AGENTS, linkedChannels, streamDestinations } from "@shared/schema";
import {
  startBacklogProcessing,
  getBacklogStatus,
  pauseBacklog,
  resumeBacklog,
  getVideosWithScores,
  bulkOptimize,
  autoScheduleOptimizedContent,
  getStaleVideos,
  pivotToStream,
  resumeFromStream,
} from "./backlog-engine";
import {
  getAuthUrl,
  handleCallback,
  getPendingOAuthUser,
  fetchYouTubeChannelInfo,
  fetchYouTubeVideos,
  updateYouTubeVideo,
  syncYouTubeVideosToLibrary,
} from "./youtube";
import type { Request, Response } from "express";
import {
  generateDailyBriefing, getHealthScore, processActionItems,
  updateAgentScorecard, generateGrowthPrediction, getContentDnaProfile,
} from "./learning-engine";
import {
  startShortsPipeline, getShortsPipelineStatus, pauseShortsPipeline,
  resumeShortsPipeline, extractClipsFromVideo, generateClipHook,
  predictClipVirality, getClipsByVideo, compileAutoReel, trackClipPerformance,
} from "./shorts-pipeline-engine";
import {
  getOptimizationHealthScore, getSubEngineStatuses, runMetadataOptimizer,
  runAbTestEngine, injectTrendingTopic, detectPerformanceDecay,
  predictViralScore, analyzeHashtagHealth, analyzeSentiment,
  detectAlgorithmChanges, manageContentLifecycle, detectEvergreenContent,
  detectContentCannibalization, predictTrends, buildContentDna,
  optimizeCtr, getTrendingTopics, getViralLeaderboard, getDecayAlerts,
  getContentGaps, getAlgorithmCheatSheet, runFullOptimizationPass,
} from "./optimization-engine";
import {
  createManagedPlaylist, getPlaylists, autoOrganizePlaylists,
  addToPlaylist, getPlaylistSeoScore, generatePinnedComment,
  buildDescriptionLinks, generateMultiLanguageMetadata, batchPushOptimizations,
} from "./youtube-manager";
import {
  repurposeVideo, getRepurposedContent, createScriptTemplate,
  getScriptTemplates, suggestBRoll, getRepurposeFormats,
} from "./repurpose-engine";
import {
  getOptimalPostingTimes, updateActivityPatterns, getUploadCadence,
  autoScheduleContent, getScheduleRecommendations,
} from "./smart-scheduler";
import {
  suggestAdBreaks, generateRevenueForecast, trackFanFunnel,
  getFanFunnelData, calculateSponsorRates, getSponsorRates,
  trackEquipmentRoi, getEquipmentRoi, generateInvoice, getInvoices, analyzeDeal,
} from "./monetization-engine";
import {
  logWorkload, getWorkloadSummary, checkBurnoutRisk, getBurnoutAlerts,
  acknowledgeBurnoutAlert, suggestDelegation, createTeamTask, getTeamTasks,
  updateTeamTask, getCreativeBlockSuggestions, scanCompliance,
  storeLegalDocument, getLegalDocuments, manageCrm,
} from "./wellness-engine";

function getUserId(req: Request): string {
  return (req.user as any)?.claims?.sub;
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX_AI = 30;
const RATE_LIMIT_MAX_DEFAULT = 120;

function rateLimit(windowMs: number, max: number) {
  return (req: Request, res: Response, next: () => void) => {
    const userId = getUserId(req) || req.ip || "anon";
    const key = `${userId}:${req.path}`;
    const now = Date.now();
    let entry = rateLimitMap.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      rateLimitMap.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.reset) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.use("/api/ai", rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_AI));
  app.use("/api", rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_DEFAULT));

  const FREE_AI_ROUTES = new Set([
    "/api/ai/dashboard-actions", "/api/ai/content-ideas", "/api/ai/advisor",
    "/api/ai/daily-briefing", "/api/ai/health-score",
  ]);

  app.use("/api/ai", async (req: any, res, next) => {
    if (FREE_AI_ROUTES.has(req.path)) return next();
    if (!req.isAuthenticated()) return next();
    const userId = getUserId(req);
    if (!userId) return next();
    try {
      const user = await storage.getUser(userId);
      if (user && user.tier === "free") {
        return res.status(403).json({
          error: "upgrade_required",
          message: "This feature requires a paid subscription. Please upgrade your plan.",
          currentTier: "free",
        });
      }
    } catch {}
    next();
  });

  function requireAdmin(req: Request, res: Response): string | null {
    const userId = requireAuth(req, res);
    if (!userId) return null;
    const email = (req.user as any)?.claims?.email;
    if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return userId;
  }

  // === USER PROFILE & ROLE ===
  app.get("/api/user/profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const email = (req.user as any)?.claims?.email;
      let user = await storage.getUser(userId);
      if (user && email && email.toLowerCase() === ADMIN_EMAIL && user.role !== "admin") {
        user = await storage.updateUserRole(userId, "admin", "ultimate");
      }
      res.json(user || { id: userId, role: "user", tier: "free" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/user/profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { contentNiche, onboardingCompleted } = req.body;
      const updateData: { contentNiche?: string; onboardingCompleted?: Date } = {};
      if (contentNiche !== undefined) updateData.contentNiche = contentNiche;
      if (onboardingCompleted) updateData.onboardingCompleted = new Date();
      const user = await storage.updateUserProfile(userId, updateData);
      res.json(user);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === ACCESS CODES (Admin Only) ===
  app.get("/api/admin/access-codes", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const codes = await storage.getAccessCodes();
      res.json(codes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/access-codes", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const { label, tier, maxUses, expiresAt } = req.body;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const created = await storage.createAccessCode({
        code,
        label: label || null,
        tier: tier || "ultimate",
        createdBy: userId,
        maxUses: maxUses || 1,
        active: true,
        redeemedBy: null,
        redeemedAt: null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/access-codes/:id", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const revoked = await storage.revokeAccessCode(Number(req.params.id));
      res.json(revoked);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === ACCESS CODE REDEMPTION ===
  app.post("/api/redeem-code", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code required" });
      const result = await storage.redeemAccessCode(code.toUpperCase(), userId);
      if (!result) return res.status(400).json({ error: "Invalid, expired, or already used code" });
      const user = await storage.getUser(userId);
      res.json({ success: true, tier: user?.tier, role: user?.role });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === ADMIN USER MANAGEMENT ===
  app.get("/api/admin/users", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:userId/tier", async (req, res) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    try {
      const { tier, role } = req.body;
      const updated = await storage.updateUserRole(req.params.userId, role || "user", tier || "free");
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === STRIPE SUBSCRIPTION CHECKOUT ===
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId required" });

      const user = await storage.getUser(userId);
      let customerId = user?.stripeCustomerId;

      if (!customerId) {
        const email = (req.user as any)?.claims?.email;
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/settings?tab=subscription&status=success`,
        cancel_url: `${baseUrl}/pricing?status=cancelled`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Stripe checkout error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/customer-portal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No subscription found" });

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === STRIPE PRODUCTS/PRICES ===
  app.get("/api/stripe/products-with-prices", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id as product_id, p.name as product_name, p.description as product_description,
               p.metadata as product_metadata, p.active as product_active,
               pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        const r = row as any;
        if (!productsMap.has(r.product_id)) {
          productsMap.set(r.product_id, {
            id: r.product_id,
            name: r.product_name,
            description: r.product_description,
            metadata: r.product_metadata,
            prices: [],
          });
        }
        if (r.price_id) {
          productsMap.get(r.product_id)!.prices.push({
            id: r.price_id,
            unit_amount: r.unit_amount,
            currency: r.currency,
            recurring: r.recurring,
          });
        }
      }
      res.json(Array.from(productsMap.values()));
    } catch (e: any) {
      if (e.message?.includes("does not exist")) {
        res.json([]);
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // === AUTO-CONNECT YOUTUBE ON FIRST LOGIN ===
  app.post("/api/auto-connect-youtube", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const email = (req.user as any)?.claims?.email;
    const firstName = (req.user as any)?.claims?.first_name;
    const lastName = (req.user as any)?.claims?.last_name;

    try {
      const existingChannels = await storage.getChannelsByUser(userId);
      const hasYoutube = existingChannels.some(c => c.platform === "youtube");
      if (hasYoutube) {
        return res.json({ connected: true, existing: true, channel: existingChannels.find(c => c.platform === "youtube") });
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "My Channel";
      const channelHandle = email?.split("@")[0] || userId.slice(0, 12);

      const channel = await storage.createChannel({
        userId,
        platform: "youtube",
        channelName: `${displayName}'s YouTube`,
        channelId: `UC_${channelHandle}`,
        settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
      });

      await storage.createAuditLog({
        userId,
        action: "youtube_auto_connected",
        target: channel.channelName,
        details: { platform: "youtube", autoConnected: true },
        riskLevel: "low",
      });

      res.json({ connected: true, existing: false, channel });
    } catch (err: any) {
      console.error("Auto-connect YouTube error:", err);
      res.status(500).json({ message: "Failed to auto-connect YouTube" });
    }
  });

  // === CHANNELS ===
  app.get(api.channels.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channels = await storage.getChannelsByUser(userId);
    res.json(channels);
  });

  app.post(api.channels.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.channels.create.input.parse(req.body);
      const channel = await storage.createChannel({ ...input, userId });
      await storage.createAuditLog({
        userId,
        action: "channel_created",
        target: channel.channelName,
        details: { platform: channel.platform, channelId: channel.channelId },
        riskLevel: "low",
      });
      res.status(201).json(channel);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.channels.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channel = await storage.updateChannel(Number(req.params.id), req.body);
    await storage.createAuditLog({
      userId,
      action: "channel_updated",
      target: channel.channelName,
      details: req.body,
      riskLevel: "low",
    });
    res.json(channel);
  });

  app.delete("/api/channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channel = await storage.getChannel(Number(req.params.id));
    if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await storage.deleteChannel(Number(req.params.id));
    await storage.createAuditLog({
      userId,
      action: "channel_deleted",
      target: channel.channelName,
      details: { platform: channel.platform },
      riskLevel: "medium",
    });
    res.json({ success: true });
  });

  // === VIDEOS ===
  app.get(api.videos.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videos = await storage.getVideosByUser(userId);
    res.json(videos);
  });

  app.post(api.videos.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.videos.create.input.parse(req.body);
      const video = await storage.createVideo(input);
      await storage.createAuditLog({
        userId,
        action: "video_created",
        target: video.title,
        details: { type: video.type, status: video.status },
        riskLevel: "low",
      });
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.videos.get.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.json(video);
  });

  app.put(api.videos.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const video = await storage.updateVideo(Number(req.params.id), req.body);
      await storage.createAuditLog({
        userId,
        action: "video_updated",
        target: video.title,
        details: req.body,
        riskLevel: "low",
      });
      res.json(video);
    } catch (e) {
      res.status(404).json({ message: "Video not found" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    await storage.deleteVideo(Number(req.params.id));
    await storage.createAuditLog({
      userId,
      action: "video_deleted",
      target: video.title,
      riskLevel: "medium",
    });
    res.sendStatus(204);
  });

  // AI Metadata Generation
  app.post(api.videos.generateMetadata.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = Number(req.params.id);
    const video = await storage.getVideo(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    try {
      const suggestions = await generateVideoMetadata({
        title: video.title,
        description: video.description,
        type: video.type,
        metadata: video.metadata,
        platform: video.platform || undefined,
      }, userId);

      const newMetadata = {
        ...video.metadata,
        seoScore: suggestions.seoScore || 0,
        aiSuggestions: {
          titleHooks: suggestions.titleHooks || [],
          descriptionTemplate: suggestions.descriptionTemplate || "",
          thumbnailCritique: suggestions.thumbnailCritique || "",
          seoRecommendations: suggestions.seoRecommendations || [],
          complianceNotes: suggestions.complianceNotes || [],
        },
        tags: suggestions.suggestedTags || video.metadata?.tags || [],
      };

      await storage.updateVideo(videoId, { metadata: newMetadata });
      await storage.createAuditLog({
        userId,
        action: "ai_metadata_generated",
        target: video.title,
        details: { seoScore: suggestions.seoScore },
        riskLevel: "low",
      });

      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("AI metadata generation error:", error);
      res.status(500).json({ success: false, message: error.message || "AI generation failed" });
    }
  });

  // === JOBS ===
  app.get(api.jobs.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.post(api.jobs.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob(input);
      await storage.createAuditLog({
        userId,
        action: "job_created",
        target: job.type,
        details: input.payload,
        riskLevel: "low",
      });
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === DASHBOARD ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await storage.getStats();
    res.json(stats);
  });

  // === AUDIT LOGS ===
  app.get(api.auditLogs.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  // === CONTENT INSIGHTS ===
  app.get(api.insights.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const insights = await storage.getContentInsights(channelId);
    res.json(insights);
  });

  app.post(api.insights.generate.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allVideos = await storage.getVideosByUser(userId);
      const videosForAnalysis = channelId
        ? allVideos.filter(v => v.channelId === channelId)
        : allVideos;

      const result = await generateContentInsights(
        videosForAnalysis.map(v => ({
          title: v.title,
          type: v.type,
          metadata: v.metadata,
        }))
      );

      if (channelId) await storage.clearInsights(channelId);

      for (const insight of (result.insights || [])) {
        await storage.createContentInsight({
          channelId: channelId || null,
          insightType: insight.insightType,
          category: insight.category,
          data: {
            finding: insight.finding,
            confidence: insight.confidence,
            recommendation: insight.recommendation,
            evidence: insight.evidence || [],
          },
        });
      }

      await storage.createAuditLog({
        userId,
        action: "insights_generated",
        target: channelId ? `channel_${channelId}` : "all",
        riskLevel: "low",
      });

      res.json({ success: true, insights: result.insights, weeklyReport: result.weeklyReport });
    } catch (error: any) {
      console.error("Insights generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === COMPLIANCE ===
  app.get(api.compliance.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const records = await storage.getComplianceRecords(channelId);
    res.json(records);
  });

  app.post(api.compliance.run.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allChannels = await storage.getChannelsByUser(userId);
      const targetChannels = channelId
        ? allChannels.filter(c => c.id === channelId)
        : allChannels;

      if (targetChannels.length === 0) {
        return res.json({ success: true, checks: [], overallScore: 100 });
      }

      const recentLogs = await storage.getAuditLogs();
      const channel = targetChannels[0];

      const result = await runComplianceCheck({
        channelName: channel.channelName,
        platform: channel.platform,
        recentActions: recentLogs.map(l => ({
          action: l.action,
          target: l.target,
          details: l.details,
        })),
        settings: channel.settings,
      });

      if (channelId) await storage.clearComplianceRecords(channelId);

      for (const check of (result.checks || [])) {
        await storage.createComplianceRecord({
          channelId: channel.id,
          platform: channel.platform,
          checkType: check.checkType,
          status: check.status,
          details: {
            rule: check.rule,
            description: check.description,
            severity: check.severity,
            recommendation: check.recommendation,
          },
        });
      }

      await storage.createAuditLog({
        userId,
        action: "compliance_check_run",
        target: channel.channelName,
        details: { overallScore: result.overallScore },
        riskLevel: "low",
      });

      res.json({ success: true, checks: result.checks, overallScore: result.overallScore || 100, summary: result.summary });
    } catch (error: any) {
      console.error("Compliance check error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === GROWTH STRATEGIES ===
  app.get(api.strategies.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const strategies = await storage.getGrowthStrategies(channelId);
    res.json(strategies);
  });

  app.post(api.strategies.generate.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allChannels = await storage.getChannelsByUser(userId);
      const allVideos = await storage.getVideosByUser(userId);

      const channel = channelId
        ? allChannels.find(c => c.id === channelId)
        : allChannels[0];

      if (!channel) {
        return res.json({ success: true, strategies: [] });
      }

      const channelVideos = allVideos.filter(v => v.channelId === channel.id || !v.channelId);

      const result = await analyzeChannelGrowth({
        channelName: channel.channelName,
        platform: channel.platform,
        videoCount: channelVideos.length,
        videos: channelVideos.map(v => ({
          title: v.title,
          type: v.type,
          status: v.status,
          metadata: v.metadata,
        })),
      });

      for (const strategy of (result.strategies || [])) {
        await storage.createGrowthStrategy({
          channelId: channel.id,
          title: strategy.title,
          description: strategy.description,
          category: strategy.category,
          priority: strategy.priority,
          actionItems: strategy.actionItems || [],
          estimatedImpact: strategy.estimatedImpact,
          status: "pending",
          aiGenerated: true,
        });
      }

      await storage.createAuditLog({
        userId,
        action: "strategies_generated",
        target: channel.channelName,
        riskLevel: "low",
      });

      res.json({ success: true, strategies: result.strategies });
    } catch (error: any) {
      console.error("Strategy generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put(api.strategies.updateStatus.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const strategy = await storage.updateGrowthStrategy(Number(req.params.id), { status: req.body.status });
    res.json(strategy);
  });

  // === AI ADVISOR ===
  app.post(api.advisor.ask.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { question } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });

      const allChannels = await storage.getChannelsByUser(userId);
      const allVideos = await storage.getVideosByUser(userId);
      const channel = allChannels[0];

      const answer = await getContentStrategyAdvice(question, {
        channelName: channel?.channelName,
        videoCount: allVideos.length,
        recentTitles: allVideos.slice(0, 10).map(v => v.title),
      }, userId);

      await storage.createAuditLog({
        userId,
        action: "advisor_consulted",
        target: question.substring(0, 100),
        riskLevel: "low",
      });

      res.json({ answer });
    } catch (error: any) {
      console.error("Advisor error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === STREAM DESTINATIONS ===
  app.get(api.streamDestinations.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const destinations = await storage.getStreamDestinations(userId);
    res.json(destinations);
  });

  app.post(api.streamDestinations.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = { ...req.body, userId: userId };
      const dest = await storage.createStreamDestination(input);
      await storage.createAuditLog({
        userId,
        action: "stream_destination_created",
        target: dest.label,
        details: { platform: dest.platform },
        riskLevel: "low",
      });
      res.status(201).json(dest);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.streamDestinations.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const dest = await storage.updateStreamDestination(Number(req.params.id), req.body);
    res.json(dest);
  });

  app.delete(api.streamDestinations.delete.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteStreamDestination(Number(req.params.id));
    res.sendStatus(204);
  });

  // === STREAMS ===
  app.get(api.streams.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamList = await storage.getStreams(userId);
    res.json(streamList);
  });

  app.get(api.streams.get.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    res.json(stream);
  });

  app.post(api.streams.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = { ...req.body, userId: userId };
      const stream = await storage.createStream(input);
      await storage.createAuditLog({
        userId,
        action: "stream_created",
        target: stream.title,
        details: { platforms: stream.platforms },
        riskLevel: "low",
      });
      res.status(201).json(stream);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.streams.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.updateStream(Number(req.params.id), req.body);
    res.json(stream);
  });

  // Stream SEO Optimization
  app.post(api.streams.optimizeSeo.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });

    try {
      const seoData = await generateStreamSeo({
        title: stream.title,
        description: stream.description,
        category: stream.category,
        platforms: (stream.platforms as string[]) || ['youtube'],
      });

      await storage.updateStream(stream.id, { seoData });
      await storage.createAuditLog({
        userId,
        action: "stream_seo_optimized",
        target: stream.title,
        riskLevel: "low",
      });

      res.json({ success: true, seoData });
    } catch (error: any) {
      console.error("Stream SEO error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === GO LIVE - Automated Stream Lifecycle ===
  app.post(api.streams.goLive.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'planned') {
      return res.status(400).json({ message: `Cannot go live from '${stream.status}' status. Stream must be in 'planned' state.` });
    }

    try {
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'live',
        startedAt: new Date(),
      });

      pivotToStream(userId, stream.id).catch(err =>
        console.error("Stream pivot error:", err)
      );

      const tasks = [
        { name: "seo_optimization", status: "pending" },
        { name: "thumbnail_generation", status: "pending" },
        { name: "compliance_check", status: "pending" },
      ];

      const job = await storage.createJob({
        type: "stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms: stream.platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_went_live",
        target: stream.title,
        details: { platforms: stream.platforms, automationJobId: job.id },
        riskLevel: "low",
      });

      (async () => {
        const platforms = (stream.platforms as string[]) || ['youtube'];

        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms: stream.platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

        // Task 1: SEO Optimization
        try {
          tasks[0].status = "running";
          await persistTasks(10);

          const seoData = await generateStreamSeo({
            title: stream.title,
            description: stream.description,
            category: stream.category,
            platforms,
          });

          await storage.updateStream(stream.id, { seoData });
          tasks[0].status = "completed";
          (tasks[0] as any).result = { platformCount: Object.keys(seoData.platformSpecific || {}).length };
          await persistTasks(40);
        } catch (err) {
          console.error("Auto SEO failed:", err);
          tasks[0].status = "failed";
          (tasks[0] as any).error = (err as Error).message;
          await persistTasks(40);
        }

        // Task 2: Thumbnail Generation
        try {
          tasks[1].status = "running";
          await persistTasks(45);

          const thumbData = await generateThumbnailPrompt({
            title: stream.title,
            description: stream.description,
            platform: platforms[0],
            type: 'stream',
          });

          await storage.createThumbnail({
            videoId: null,
            streamId: stream.id,
            prompt: thumbData.prompt,
            platform: platforms[0],
            resolution: '1280x720',
            status: 'generated',
          });
          tasks[1].status = "completed";
          (tasks[1] as any).result = { style: thumbData.style };
          await persistTasks(70);
        } catch (err) {
          console.error("Auto thumbnail failed:", err);
          tasks[1].status = "failed";
          (tasks[1] as any).error = (err as Error).message;
          await persistTasks(70);
        }

        // Task 3: Compliance Check
        try {
          tasks[2].status = "running";
          await persistTasks(75);

          const recentLogs = await storage.getAuditLogs();
          const userLogs = recentLogs
            .filter(l => l.userId === userId)
            .slice(0, 20)
            .map(l => ({ action: l.action, target: l.target, details: l.details }));

          const complianceResult = await runComplianceCheck({
            channelName: stream.title,
            platform: platforms[0],
            recentActions: userLogs,
            settings: { streamType: 'live', category: stream.category },
          });

          tasks[2].status = "completed";
          (tasks[2] as any).result = { overallScore: complianceResult.overallScore, checks: complianceResult.checks?.length || 0 };
          await persistTasks(100);
        } catch (err) {
          console.error("Auto compliance failed:", err);
          tasks[2].status = "failed";
          (tasks[2] as any).error = (err as Error).message;
          await persistTasks(100);
        }

        const anyFailed = tasks.some((t: any) => t.status === 'failed');
        await storage.updateJobStatus(
          job.id,
          anyFailed ? 'completed_with_errors' : 'completed',
          { tasks, completedAt: new Date().toISOString() }
        );
      })();

      res.json({ success: true, stream: updatedStream, automationJobId: job.id });
    } catch (error: any) {
      console.error("Go live error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === END STREAM - Triggers Post-Stream Automation ===
  app.post(api.streams.endStream.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'live') {
      return res.status(400).json({ message: `Cannot end stream from '${stream.status}' status. Stream must be 'live'.` });
    }

    try {
      const endedAt = new Date();
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'ended',
        endedAt,
      });

      resumeFromStream(userId, stream.id).catch(err =>
        console.error("Stream resume error:", err)
      );

      const tasks = [
        { name: "vod_optimization", status: "pending" },
        { name: "vod_thumbnail", status: "pending" },
      ];

      const job = await storage.createJob({
        type: "post_stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms: stream.platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_ended",
        target: stream.title,
        details: {
          platforms: stream.platforms,
          postProcessJobId: job.id,
          duration: stream.startedAt ? Math.round((endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000) : null,
        },
        riskLevel: "low",
      });

      (async () => {
        const platforms = (stream.platforms as string[]) || ['youtube'];
        const duration = stream.startedAt
          ? (endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000
          : undefined;

        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms: stream.platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

        // Task 1: VOD Optimization
        try {
          tasks[0].status = "running";
          await persistTasks(10);

          const result = await postStreamOptimize({
            title: stream.title,
            description: stream.description,
            category: stream.category,
            platforms,
            duration,
            stats: stream.streamStats,
          });

          await storage.updateStream(stream.id, {
            status: 'processed',
            seoData: {
              ...(stream.seoData as any),
              vodOptimization: result,
            },
          });

          tasks[0].status = "completed";
          (tasks[0] as any).result = { seoScore: result.seoScore };
          await persistTasks(60);
        } catch (err) {
          console.error("Auto VOD optimization failed:", err);
          tasks[0].status = "failed";
          (tasks[0] as any).error = (err as Error).message;
          await persistTasks(60);
        }

        // Task 2: VOD Thumbnail
        try {
          tasks[1].status = "running";
          await persistTasks(65);

          const thumbData = await generateThumbnailPrompt({
            title: stream.title,
            description: stream.description,
            platform: platforms[0],
            type: 'vod',
          });

          await storage.createThumbnail({
            videoId: null,
            streamId: stream.id,
            prompt: thumbData.prompt,
            platform: platforms[0],
            resolution: '1280x720',
            status: 'generated',
          });

          tasks[1].status = "completed";
          (tasks[1] as any).result = { style: thumbData.style };
          await persistTasks(100);
        } catch (err) {
          console.error("Auto VOD thumbnail failed:", err);
          tasks[1].status = "failed";
          (tasks[1] as any).error = (err as Error).message;
          await persistTasks(100);
        }

        const anyFailed = tasks.some((t: any) => t.status === 'failed');
        await storage.updateJobStatus(
          job.id,
          anyFailed ? 'completed_with_errors' : 'completed',
          { tasks, completedAt: new Date().toISOString() }
        );
      })();

      res.json({ success: true, stream: updatedStream, postProcessJobId: job.id });
    } catch (error: any) {
      console.error("End stream error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === STREAM AUTOMATION STATUS ===
  app.get(api.streams.automationStatus.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamId = Number(req.params.id);
    const allJobs = await storage.getJobs();
    const streamJobs = allJobs.filter(j =>
      (j.type === 'stream_automation' || j.type === 'post_stream_automation') &&
      (j.payload as any)?.streamId === streamId
    );

    const tasks = streamJobs.flatMap(j => {
      const payload = j.payload as any;
      return (payload?.tasks || []).map((t: any) => ({
        ...t,
        jobId: j.id,
        jobType: j.type,
        jobStatus: j.status,
        progress: j.progress,
      }));
    });

    res.json({ jobs: streamJobs, tasks });
  });

  // Post-Stream Processing (manual)
  app.post(api.streams.postStreamProcess.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });

    try {
      const duration = stream.startedAt && stream.endedAt
        ? (stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000
        : undefined;

      const result = await postStreamOptimize({
        title: stream.title,
        description: stream.description,
        category: stream.category,
        platforms: (stream.platforms as string[]) || ['youtube'],
        duration,
        stats: stream.streamStats,
      });

      await storage.updateStream(stream.id, {
        status: 'processed',
        seoData: {
          ...(stream.seoData as any),
          vodOptimization: result,
        },
      });

      await storage.createAuditLog({
        userId,
        action: "post_stream_processed",
        target: stream.title,
        details: { seoScore: result.seoScore },
        riskLevel: "low",
      });

      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Post-stream processing error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === BACKLOG OPTIMIZER ===
  app.post(api.backlog.optimize.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { channelId, videoIds } = req.body;

      let videosToOptimize;
      if (videoIds && videoIds.length > 0) {
        const allVideos = await storage.getVideosByUser(userId);
        videosToOptimize = allVideos.filter(v => videoIds.includes(v.id));
      } else if (channelId) {
        videosToOptimize = await storage.getVideosByChannel(channelId);
      } else {
        videosToOptimize = await storage.getVideosByUser(userId);
      }

      const unoptimized = videosToOptimize.filter(v => !v.metadata?.aiOptimized);

      const job = await storage.createJob({
        type: "backlog_optimize",
        status: "processing",
        priority: 1,
        payload: {
          totalVideos: unoptimized.length,
          videoIds: unoptimized.map(v => v.id),
          channelId: channelId || null,
        },
      });

      // Process videos asynchronously (but in this request for now)
      (async () => {
        let completed = 0;
        for (const video of unoptimized) {
          try {
            const suggestions = await generateVideoMetadata({
              title: video.title,
              description: video.description,
              type: video.type,
              metadata: video.metadata,
              platform: video.platform || undefined,
            });

            const newMetadata = {
              ...video.metadata,
              seoScore: suggestions.seoScore || 0,
              aiSuggestions: {
                titleHooks: suggestions.titleHooks || [],
                descriptionTemplate: suggestions.descriptionTemplate || "",
                thumbnailCritique: suggestions.thumbnailCritique || "",
                seoRecommendations: suggestions.seoRecommendations || [],
                complianceNotes: suggestions.complianceNotes || [],
              },
              tags: suggestions.suggestedTags || video.metadata?.tags || [],
              aiOptimized: true,
              aiOptimizedAt: new Date().toISOString(),
            };

            await storage.updateVideo(video.id, { metadata: newMetadata });
            completed++;
            const progress = Math.round((completed / unoptimized.length) * 100);
            await storage.updateJobProgress(job.id, progress);
          } catch (err) {
            console.error(`Failed to optimize video ${video.id}:`, err);
          }
        }
        await storage.updateJobStatus(job.id, 'completed', { optimized: completed, total: unoptimized.length });
      })();

      await storage.createAuditLog({
        userId,
        action: "backlog_optimization_started",
        target: `${unoptimized.length} videos`,
        riskLevel: "low",
      });

      res.json({ success: true, jobId: job.id });
    } catch (error: any) {
      console.error("Backlog optimization error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.status.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const allVideos = await storage.getVideosByUser(userId);
    const optimized = allVideos.filter(v => v.metadata?.aiOptimized).length;
    const allJobs = await storage.getJobs();
    const activeJob = allJobs.find(j => j.type === 'backlog_optimize' && j.status === 'processing') || null;

    res.json({
      totalVideos: allVideos.length,
      optimized,
      pending: allVideos.length - optimized,
      activeJob,
    });
  });

  app.post(api.backlog.autoStart.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const mode = req.body.mode || "deep";
      const result = await startBacklogProcessing(userId, mode);
      
      if (!result.alreadyRunning) {
        await storage.createAuditLog({
          userId,
          action: "auto_backlog_started",
          target: `${result.totalVideos} videos queued`,
          details: { mode, jobId: result.jobId },
          riskLevel: "low",
        });
      }

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Auto backlog start error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.engineStatus.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getBacklogStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(api.backlog.pause.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const success = await pauseBacklog(userId);
    res.json({ success });
  });

  app.post(api.backlog.resume.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const success = await resumeBacklog(userId);
    res.json({ success });
  });

  app.get(api.backlog.videoScores.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const scores = await getVideosWithScores(userId);
    res.json(scores);
  });

  app.post(api.backlog.bulkOptimize.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { videoIds, agentIds } = req.body;
      const result = await bulkOptimize(userId, videoIds, agentIds);
      
      await storage.createAuditLog({
        userId,
        action: "bulk_optimize_started",
        target: `${videoIds.length} videos with ${agentIds.length} agents`,
        riskLevel: "low",
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(api.backlog.autoSchedule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const scheduled = await autoScheduleOptimizedContent(userId);
      res.json({ success: true, scheduled });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.staleVideos.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stale = await getStaleVideos(userId);
    res.json(stale);
  });

  // === THUMBNAILS ===
  app.post(api.thumbnails.generate.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { videoId, streamId, platform, title, description, gameName, category, brandKeywords } = req.body;

      let resolvedGameName = gameName || null;
      let resolvedCategory = category || null;
      let resolvedBrandKeywords = brandKeywords || [];
      if (videoId) {
        const video = await storage.getVideo(videoId);
        if (video?.metadata) {
          resolvedGameName = resolvedGameName || video.metadata.gameName || null;
          resolvedCategory = resolvedCategory || video.metadata.contentCategory || null;
          resolvedBrandKeywords = resolvedBrandKeywords.length ? resolvedBrandKeywords : video.metadata.brandKeywords || [];
        }
      }

      const thumbnailData = await generateThumbnailPrompt({
        title,
        description,
        platform: platform || 'youtube',
        type: streamId ? 'stream' : 'video',
        gameName: resolvedGameName,
        category: resolvedCategory,
        brandKeywords: resolvedBrandKeywords,
      });

      const thumbnail = await storage.createThumbnail({
        videoId: videoId || null,
        streamId: streamId || null,
        prompt: thumbnailData.prompt,
        platform: platform || 'youtube',
        resolution: '1280x720',
        status: 'generated',
      });

      await storage.createAuditLog({
        userId,
        action: "thumbnail_generated",
        target: title,
        details: { platform, style: thumbnailData.style },
        riskLevel: "low",
      });

      res.json({ success: true, thumbnail: { ...thumbnail, aiData: thumbnailData } });
    } catch (error: any) {
      console.error("Thumbnail generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === AI AGENTS ===
  app.get(api.agents.activities.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const agentId = req.query.agentId as string | undefined;
    const activities = await storage.getAgentActivities(userId, agentId, 100);
    res.json(activities);
  });

  app.get(api.agents.status.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const activities = await storage.getAgentActivities(userId, undefined, 200);
    const agentStatus = AI_AGENTS.map(agent => {
      const agentActs = activities.filter(a => a.agentId === agent.id);
      const lastActivity = agentActs[0];
      const todayCount = agentActs.filter(a => {
        const d = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const today = new Date(); today.setHours(0,0,0,0);
        return d >= today;
      }).length;
      return {
        ...agent,
        status: todayCount > 0 ? 'active' : 'idle',
        lastActivity: lastActivity ? {
          action: lastActivity.action,
          target: lastActivity.target,
          time: lastActivity.createdAt,
        } : null,
        todayActions: todayCount,
        totalActions: agentActs.length,
      };
    });
    res.json(agentStatus);
  });

  app.post(api.agents.trigger.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { agentId } = req.params;
    const agent = AI_AGENTS.find(a => a.id === agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const recentVideos = videos.slice(0, 5);
      const gameName = recentVideos.find(v => v.metadata?.gameName)?.metadata?.gameName || null;
      const contentCategory = recentVideos.find(v => v.metadata?.contentCategory)?.metadata?.contentCategory || null;
      const brandKeywords = recentVideos.find(v => v.metadata?.brandKeywords?.length)?.metadata?.brandKeywords || [];
      const result = await runAgentTask(agentId, {
        channelName: channels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: recentVideos.map(v => v.title),
        gameName,
        contentCategory,
        brandKeywords,
      }, userId);

      const activity = await storage.createAgentActivity({
        userId,
        agentId,
        action: result.action,
        target: result.target,
        status: "completed",
        details: {
          description: result.description,
          impact: result.impact,
          recommendations: result.recommendations,
          humanized: true,
          delayMs: Math.floor(Math.random() * 420000) + 60000,
        },
      });

      await storage.createAuditLog({
        userId,
        action: `agent_${agentId}_task`,
        target: result.target,
        details: { agentName: agent.name, action: result.action },
        riskLevel: "low",
      });

      res.json({ success: true, activity });
    } catch (error: any) {
      console.error(`Agent ${agentId} error:`, error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === AUTOMATION RULES ===
  app.get(api.automation.rules.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rules = await storage.getAutomationRules(userId);
    res.json(rules);
  });

  app.post(api.automation.createRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = { ...req.body, userId: userId };
      const rule = await storage.createAutomationRule(input);
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.automation.updateRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rule = await storage.updateAutomationRule(Number(req.params.id), req.body);
    res.json(rule);
  });

  app.delete(api.automation.deleteRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteAutomationRule(Number(req.params.id));
    res.sendStatus(204);
  });

  // === SCHEDULE ===
  app.get(api.schedule.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const items = await storage.getScheduleItems(userId, from, to);
    res.json(items);
  });

  app.post(api.schedule.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = { ...req.body, userId: userId };
      const item = await storage.createScheduleItem(input);
      await storage.createAuditLog({
        userId,
        action: "schedule_item_created",
        target: item.title,
        riskLevel: "low",
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.schedule.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const item = await storage.updateScheduleItem(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete(api.schedule.delete.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteScheduleItem(Number(req.params.id));
    res.sendStatus(204);
  });

  // === REVENUE ===
  app.get(api.revenue.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const records = await storage.getRevenueRecords(userId, platform);
    res.json(records);
  });

  app.post(api.revenue.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const input = { ...req.body, userId: userId };
    const record = await storage.createRevenueRecord(input);
    res.status(201).json(record);
  });

  app.get(api.revenue.summary.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getRevenueSummary(userId);
    res.json(summary);
  });

  // === COMMUNITY ===
  app.get(api.community.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const posts = await storage.getCommunityPosts(userId, platform);
    res.json(posts);
  });

  app.post(api.community.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = { ...req.body, userId };
      if (req.body.aiGenerate) {
        const channels = await storage.getChannelsByUser(userId);
        const videos = await storage.getVideosByUser(userId);
        const generated = await generateCommunityPost({
          platform: input.platform,
          channelName: channels[0]?.channelName || "My Channel",
          recentTitles: videos.slice(0, 5).map(v => v.title),
          type: input.type || 'engagement',
        });
        input.content = generated.content;
        input.aiGenerated = true;
      }
      const post = await storage.createCommunityPost(input);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.community.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const post = await storage.updateCommunityPost(Number(req.params.id), req.body);
    res.json(post);
  });

  app.get("/api/youtube/auth", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      (req.session as any).youtubeOAuthUserId = userId;
      req.session.save((err) => {
        if (err) {
          console.error("Failed to save session before YouTube OAuth:", err);
          return res.status(500).json({ error: "Failed to prepare authentication" });
        }
        const authUrl = getAuthUrl(userId);
        const acceptHeader = req.headers.accept || "";
        if (acceptHeader.includes("application/json")) {
          res.json({ url: authUrl });
        } else {
          res.redirect(authUrl);
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/youtube/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    const sessionUserId = (req.session as any)?.youtubeOAuthUserId
      || (req.isAuthenticated() ? getUserId(req) : null);

    let userId: string | null = null;
    if (state) {
      userId = getPendingOAuthUser(state);
    }
    if (!userId) {
      userId = sessionUserId;
    }

    if (!code) {
      return res.redirect("/channels?error=" + encodeURIComponent("Missing authorization code from Google. Please try connecting again."));
    }
    if (!userId) {
      return res.redirect("/channels?error=" + encodeURIComponent("Session expired. Please log in and try connecting YouTube again."));
    }
    try {
      const result = await handleCallback(code, userId);
      delete (req.session as any).youtubeOAuthUserId;
      res.redirect(`/channels?connected=youtube&channel=${encodeURIComponent(result.ytChannel.title || "")}`);
    } catch (error: any) {
      console.error("YouTube OAuth callback error:", error);
      res.redirect(`/channels?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/youtube/channel/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const info = await fetchYouTubeChannelInfo(Number(req.params.channelId));
      res.json(info);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/youtube/videos/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const videos = await fetchYouTubeVideos(Number(req.params.channelId), Number(req.query.maxResults) || 50);
      res.json(videos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube/sync/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const synced = await syncYouTubeVideosToLibrary(Number(req.params.channelId), userId);
      res.json({ synced: synced.length, videos: synced });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/youtube/video/:channelId/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const result = await updateYouTubeVideo(
        Number(req.params.channelId),
        req.params.videoId,
        req.body
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube/push-optimization/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const video = await storage.getVideo(Number(req.params.videoId));
      if (!video) return res.status(404).json({ error: "Video not found" });
      if (!video.channelId) return res.status(400).json({ error: "Video has no channel" });
      if (!video.metadata?.youtubeId) return res.status(400).json({ error: "Video has no YouTube ID" });

      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });

      const updates: any = {};
      if (video.title) updates.title = video.title;
      if (video.description) updates.description = video.description;
      if (video.metadata?.tags) updates.tags = video.metadata.tags;

      const result = await updateYouTubeVideo(video.channelId, video.metadata.youtubeId, updates);
      await storage.createAuditLog({
        action: "youtube_push",
        target: video.title,
        riskLevel: "medium",
        details: { videoId: video.id, youtubeId: video.metadata.youtubeId, updates },
        userId,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === NOTIFICATIONS ===
  app.get("/api/notifications", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const notifications = await storage.getNotifications(userId);
    res.json(notifications);
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.markRead(Number(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.markAllRead(userId);
    res.json({ success: true });
  });

  // === CREATOR INTELLIGENCE ===
  app.post("/api/style-scan/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const profile = await runStyleScan(userId, Number(req.params.channelId));
      await storage.createAuditLog({
        userId,
        action: "style_scan_completed",
        target: channel.channelName,
        riskLevel: "low",
      });
      res.json({ success: true, profile });
    } catch (error: any) {
      console.error("Style scan error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/feedback", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { targetType, targetId, rating, aiFunction } = req.body;
      await recordFeedback(userId, targetType, targetId, rating, aiFunction);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/creator-memory", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const memoryType = req.query.type as string | undefined;
    const memories = await storage.getCreatorMemory(userId, memoryType);
    res.json(memories);
  });

  app.get("/api/learning-insights", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const insights = await storage.getLearningInsights(userId);
    res.json(insights);
  });

  // === CONTENT IDEAS ===
  app.get("/api/content-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const ideas = await storage.getContentIdeas(userId, status);
    res.json(ideas);
  });

  app.post("/api/content-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const idea = await storage.createContentIdea({ ...req.body, userId });
      res.status(201).json(idea);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/content-ideas/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const idea = await storage.updateContentIdea(Number(req.params.id), req.body);
    res.json(idea);
  });

  app.delete("/api/content-ideas/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteContentIdea(Number(req.params.id));
    res.sendStatus(204);
  });

  // === SUBSCRIPTIONS ===
  app.get("/api/subscription", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sub = await storage.getSubscription(userId);
    if (!sub) {
      const newSub = await storage.createSubscription({
        userId,
        tier: "free",
        status: "active",
        aiUsageCount: 0,
        aiUsageLimit: 5,
      });
      return res.json(newSub);
    }
    res.json(sub);
  });

  // === A/B TESTS ===
  app.get("/api/ab-tests", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = req.query.videoId ? Number(req.query.videoId) : undefined;
    const tests = await storage.getAbTests(userId, videoId);
    res.json(tests);
  });

  app.post("/api/ab-tests", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const test = await storage.createAbTest({ ...req.body, userId });
      res.status(201).json(test);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === SPONSORSHIP DEALS ===
  app.get("/api/sponsorship-deals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const deals = await storage.getSponsorshipDeals(userId, status);
    res.json(deals);
  });

  app.post("/api/sponsorship-deals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const deal = await storage.createSponsorshipDeal({ ...req.body, userId });
      res.status(201).json(deal);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/sponsorship-deals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const deal = await storage.updateSponsorshipDeal(Number(req.params.id), req.body);
    res.json(deal);
  });

  // === ANALYTICS SNAPSHOTS ===
  app.get("/api/analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const snapshots = await storage.getAnalyticsSnapshots(userId, from, to);
    res.json(snapshots);
  });

  // === PLATFORM HEALTH ===
  app.get("/api/platform-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const health = await storage.getPlatformHealth(userId, platform);
    res.json(health);
  });

  // === VIDEO VERSIONS ===
  app.get("/api/video-versions/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const versions = await storage.getVideoVersions(Number(req.params.videoId));
    res.json(versions);
  });

  // === CONTENT CLIPS ===
  app.get("/api/content-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sourceVideoId = req.query.sourceVideoId ? Number(req.query.sourceVideoId) : undefined;
    const clips = await storage.getContentClips(userId, sourceVideoId);
    res.json(clips);
  });

  app.post("/api/content-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const clip = await storage.createContentClip({ ...req.body, userId });
      res.status(201).json(clip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === COLLABORATION LEADS ===
  app.get("/api/collaboration-leads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const leads = await storage.getCollaborationLeads(userId);
    res.json(leads);
  });

  app.post("/api/collaboration-leads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const lead = await storage.createCollaborationLead({ ...req.body, userId });
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === COMPLIANCE RULES ===
  app.get("/api/compliance-rules", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const rules = await storage.getComplianceRules(platform);
    res.json(rules);
  });

  // === EXPENSES ===
  app.get("/api/expenses/summary", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getExpenseSummary(userId);
    res.json(summary);
  });

  app.get("/api/expenses", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const records = await storage.getExpenseRecords(userId);
    res.json(records);
  });

  app.post("/api/expenses", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const record = await storage.createExpenseRecord({ ...req.body, userId });
    res.status(201).json(record);
  });

  app.put("/api/expenses/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const record = await storage.updateExpenseRecord(Number(req.params.id), req.body);
    res.json(record);
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteExpenseRecord(Number(req.params.id));
    res.sendStatus(204);
  });

  // === TAX ANALYZE ===
  app.post("/api/tax-analyze", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateTaxStrategy(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Tax analysis failed" });
    }
  });

  app.post("/api/expense-analyze", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateExpenseAnalysis(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Expense analysis failed" });
    }
  });

  // === BUSINESS VENTURES ===
  app.get("/api/ventures", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ventures = await storage.getBusinessVentures(userId);
    res.json(ventures);
  });

  app.post("/api/ventures", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const venture = await storage.createBusinessVenture({ ...req.body, userId });
    res.status(201).json(venture);
  });

  app.put("/api/ventures/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const venture = await storage.updateBusinessVenture(Number(req.params.id), req.body);
    res.json(venture);
  });

  app.delete("/api/ventures/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBusinessVenture(Number(req.params.id));
    res.sendStatus(204);
  });

  // === BUSINESS GOALS ===
  app.get("/api/goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goals = await storage.getBusinessGoals(userId);
    res.json(goals);
  });

  app.post("/api/goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goal = await storage.createBusinessGoal({ ...req.body, userId });
    res.status(201).json(goal);
  });

  app.put("/api/goals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goal = await storage.updateBusinessGoal(Number(req.params.id), req.body);
    res.json(goal);
  });

  app.delete("/api/goals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBusinessGoal(Number(req.params.id));
    res.sendStatus(204);
  });

  // === TAX ESTIMATES ===
  app.get("/api/tax-estimates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const estimates = await storage.getTaxEstimates(userId, year);
    res.json(estimates);
  });

  app.post("/api/tax-estimates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const estimate = await storage.createTaxEstimate({ ...req.body, userId });
    res.status(201).json(estimate);
  });

  app.put("/api/tax-estimates/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const estimate = await storage.updateTaxEstimate(Number(req.params.id), req.body);
    res.json(estimate);
  });

  // === AI ENHANCED FEATURES ===
  app.post("/api/ai/categorize-expenses", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { expenses } = req.body;
      if (!expenses || !Array.isArray(expenses)) return res.status(400).json({ message: "expenses array required" });
      const result = await aiCategorizeExpenses(expenses, userId);
      res.json(result);
    } catch (error: any) {
      console.error("AI categorize error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/financial-insights", async (req, res) => {
    const userId = requireAuth(req, res);
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/stream-recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/content-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/new-creator-plan", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { niche, customIdea } = req.body;
      const topic = customIdea || niche || "general content creation";

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

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
        temperature: 0.8,
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

      const plan = JSON.parse(content);
      res.json(plan);
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

  app.post("/api/ai/dashboard-actions", async (req, res) => {
    const userId = requireAuth(req, res);
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
      res.json(result);
    } catch (error: any) {
      console.error("AI dashboard actions error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/brand-analysis", async (req, res) => {
    const userId = requireAuth(req, res);
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
      res.status(500).json({ message: error.message });
    }
  });

  // === EXPANDED AI FEATURES ===
  app.post("/api/ai/script-writer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await aiScriptWriter({ ...req.body, channelName: channels[0]?.channelName || "My Channel", recentTitles: videos.slice(0, 5).map((v: any) => v.title) }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI script error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-concepts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiThumbnailConcepts({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI thumbnail error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/chapter-markers", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChapterMarkers(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI chapters error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/keyword-research", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiKeywordResearch({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI keyword error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/repurpose", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRepurposeContent(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI repurpose error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/seo-audit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSEOAudit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI SEO error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-calendar", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiContentCalendarPlanner({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI calendar error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsorship-manager", async (req, res) => {
    const userId = requireAuth(req, res);
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
    } catch (e: any) { console.error("AI sponsorship error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/media-kit", async (req, res) => {
    const userId = requireAuth(req, res);
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
    } catch (e: any) { console.error("AI media kit error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pl-report", async (req, res) => {
    const userId = requireAuth(req, res);
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
    } catch (e: any) { console.error("AI P&L error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/chatbot-config", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiStreamChatBot({ channelName: channels[0]?.channelName || "My Channel", ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI chatbot error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-checklist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamChecklist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI checklist error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/raid-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiRaidStrategy({ channelName: channels[0]?.channelName || "My Channel", ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI raid error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/post-stream-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPostStreamReport(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI post-stream error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/team-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeamManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI team error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/automation-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiAutomationBuilder({ ...req.body, platforms: channels.map((c: any) => c.platform) }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI automation error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-academy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorAcademy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI academy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/news-feed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsFeed(userId);
      res.json(result);
    } catch (e: any) { console.error("AI news error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/milestones", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const videos = await storage.getVideosByUser(userId);
      const revenue = await storage.getRevenueRecords(userId);
      const totalRevenue = revenue.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const result = await aiMilestoneEngine({ totalVideos: videos.length, revenue: totalRevenue, ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI milestones error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crossplatform-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
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
    } catch (e: any) { console.error("AI crossplatform error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/comment-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiCommentManager({ ...req.body, channelName: channels[0]?.channelName || "My Channel" }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI comment error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-matchmaker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channels = await storage.getChannelsByUser(userId);
      const result = await aiCollabMatchmaker({ channelName: channels[0]?.channelName || "My Channel", niche: (channels[0] as any)?.category || undefined, ...req.body }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI collab error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/wellness-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWellnessAdvisor({
        hoursWorked: req.body?.hoursWorked,
        videosThisWeek: req.body?.videosThisWeek,
        streamsThisWeek: req.body?.streamsThisWeek,
        lastBreak: req.body?.lastBreak,
        mood: req.body?.mood,
      }, userId);
      res.json(result);
    } catch (e: any) { console.error("AI wellness error:", e); res.status(500).json({ message: e.message }); }
  });

  // === VIDEO PRODUCTION & THUMBNAIL AI (Batch 1) ===
  app.post("/api/ai/storyboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStoryboardGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/color-grading", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiColorGradingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/intro-outro", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIntroOutroCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sound-effects", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSoundEffectsRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pacing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPacingAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/talking-points", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTalkingPointsGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-length", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoLengthOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-format", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiFormatExporter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/watermark", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatermarkManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/green-screen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGreenScreenAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/teleprompter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeleprompterFormatter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/scene-transitions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSceneTransitionRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-quality", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoQualityEnhancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/aspect-ratio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAspectRatioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/lower-thirds", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLowerThirdGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cta-overlays", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCtaOverlayDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/split-screen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSplitScreenBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/time-lapse", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeLapseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/footage-organizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFootageOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audio-leveling", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioLevelingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/noise-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackgroundNoiseDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/jump-cuts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiJumpCutDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cinematic-shots", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCinematicShotPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/compression", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoCompressionOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-ab", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailABTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-ctr", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailCTRPredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-styles", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailStyleLibrary(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/face-expressions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFaceExpressionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-text", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailTextOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/color-psychology", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailColorPsychology(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/banner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBannerGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/social-covers", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialCoverCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/animated-thumbnails", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnimatedThumbnailCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-competitors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailCompetitorComparison(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-watermark", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandWatermarkDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/emoji-stickers", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmojiStickerCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/infographic", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfographicGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/meme-templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMemeTemplateCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/visual-consistency", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVisualConsistencyScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voice-clone", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceCloneAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === TITLES, COPY & SEO AI (Batch 2) ===
  app.post("/api/ai/hooks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHookGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/title-split-test", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTitleSplitTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/title-emotion", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTitleEmotionalScore(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/clickbait-detect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiClickbaitDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/description-templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDescriptionTemplateBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/end-screen-cta", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndScreenCTAWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pinned-comments", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPinnedCommentGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-posts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityPostWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/email-subjects", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailSubjectOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/bio-writer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBioWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-tags", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoTagsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hashtag-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHashtagOptimizer2(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/playlist-writer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaylistWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/press-release", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPressReleaseWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/testimonial-drafter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTestimonialDrafter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tag-cloud", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTagCloudGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/search-intent", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSearchIntentMapper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/algorithm-decoder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/featured-snippets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFeaturedSnippetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-platform-seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPlatformSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/backlinks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBacklinkTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-freshness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentFreshnessScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/keyword-cannibalization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKeywordCannibalization(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/long-tail-keywords", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLongTailKeywordMiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-sitemap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoSitemapGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/rich-snippets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRichSnippetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voice-search", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceSearchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/autocomplete", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutocompleteTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/google-trends", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleTrendsIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-keywords", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorKeywordSpy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/search-rankings", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSearchRankingTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ctr-benchmark", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCTRBenchmarker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/impression-analysis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiImpressionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/related-videos", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRelatedVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/browse-features", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrowseFeatureOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === CONTENT STRATEGY & SHORTS AI (Batch 3) ===
  app.post("/api/ai/content-pillars", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPillarPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/series-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeriesBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/repurpose-matrix", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentRepurposeMatrix(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viral-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralScorePredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-gaps", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentGapFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/trend-surfer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrendSurfer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/evergreen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEvergreenPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-mix", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentMixOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/seasonal-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeasonalContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/bts-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBehindTheScenesPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/reaction-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReactionContentFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/challenge-creator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChallengeCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/qna-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQnAContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tutorial-structure", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTutorialStructurer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/documentary-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDocumentaryStylePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/short-form-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortFormStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsIdeaGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-to-long", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsToLongPipeline(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/long-to-shorts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLongToShortsClipper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/vertical-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVerticalVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-audio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsAudioSelector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-captions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsCaptionStyler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-hooks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsHookFormula(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/duet-stitch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDuetStitchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsAnalyticsDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-batch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsBatchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-remix", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsRemixStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-monetization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShortsMonetization(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-audit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentAudit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-velocity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentVelocityTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/niche-research", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNicheResearcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === CAPTIONS, LOCALIZATION & ANALYTICS AI (Batch 4) ===
  app.post("/api/ai/caption-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaptionGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/caption-styler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaptionStyler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subtitle-translator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubtitleTranslator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-language-seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiLanguageSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/localization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLocalizationManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.get("/api/localization/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const rec = await storage.getLocalizationRecommendations(userId);
      res.json(rec || { recommendedLanguages: [], trafficData: {}, source: "none" });
    } catch (e: any) { console.error("Localization recommendations error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dubbing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDubbingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/transcript", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTranscriptOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/caption-compliance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiClosedCaptionCompliance(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audio-description", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioDescriptionWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/language-priority", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLanguagePriorityRanker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/retention-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRetentionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audience-demographics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceDemographics(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/watch-time", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatchTimeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/engagement-rate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEngagementRateAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subscriber-growth", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriberGrowthAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-forecast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ab-test", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiABTestAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/retention-heatmap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceRetentionHeatmap(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/traffic-sources", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrafficSourceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/device-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDeviceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/playback-location", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaybackLocationAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/end-screen-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndScreenAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/card-performance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCardPerformanceAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/impression-funnel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiImpressionFunnelAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-benchmark", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorBenchmarker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/growth-prediction", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrowthRatePredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/churn-predictor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChurnPredictor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viral-coefficient", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralCoefficientCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sentiment", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSentimentDashboard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/peak-times", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPeakTimeAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-lifecycle", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoLifecycleTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/rpm-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenuePerViewOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audience-overlap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceOverlapAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/performance-ranker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPerformanceRanker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/funnel-leaks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFunnelLeakDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/predictive-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveAnalytics(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/custom-reports", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomReportBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === LIVE STREAMING AI (Batch 5) ===
  app.post("/api/ai/stream-titles", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamTitleGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-schedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamScheduleOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-overlays", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamOverlayDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamAlertDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-moderation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamModerationRules(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-interactions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamInteractionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-revenue", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamRevenueOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamClipHighlighter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-categories", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamCategoryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-panels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamPanelDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-emotes", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamEmoteManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-sub-goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamSubGoalPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-networking", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamNetworkingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-analytics-explainer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamAnalyticsExplainer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-stream", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiStreamSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-backup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamBackupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-community", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-branding", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamBrandingKit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-content-calendar", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamContentCalendar(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-growth", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamGrowthHacker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === MONETIZATION & SPONSORSHIP AI (Batch 6) ===
  app.post("/api/ai/ad-revenue", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdRevenueOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ad-placement", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdPlacementAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cpm-maximizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCPMMaximizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsor-pricing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorPricingEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsor-outreach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorOutreachWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsor-negotiation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorNegotiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsor-deliverables", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorDeliverableTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/affiliate-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffiliateOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/merchandise", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMerchandiseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/membership-tiers", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMembershipTierBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/digital-products", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalProductCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/course-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCourseBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/patreon", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatreonOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/super-chat", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperChatOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/membership-growth", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelMembershipGrowth(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-streams", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueStreamDiversifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/invoice", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInvoiceGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/contract-review", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContractReviewer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tax-deductions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTaxDeductionFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/quarterly-tax", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuarterlyTaxEstimator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-deal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandDealEvaluator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/media-kit-enhance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaKitEnhancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/rate-card", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRateCardGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsor-roi", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorROICalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/passive-income", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPassiveIncomeBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pricing-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPricingStrategyAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-attribution", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueAttributionAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/donation-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDonationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crowdfunding", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrowdfundingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/licensing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLicensingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/book-deal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBookDealAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/speaking-fees", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSpeakingFeeCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/consulting", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConsultingPackageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/expense-tracker-ai", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExpenseTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/profit-margin", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProfitMarginAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cash-flow", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCashFlowForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/payment-gateway", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPaymentGatewayAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subscription-box", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriptionBoxBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/nft-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNFTContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueGoalTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === COMMUNITY & ENGAGEMENT AI (Batch 7) ===
  app.post("/api/ai/comment-response", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommentResponseGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/superfan-id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperfanIdentifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/discord-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordServerPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-events", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/poll-creator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPollCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/contest-runner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContestRunner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-guidelines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityGuidelinesWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/moderator-trainer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiModeratorTrainer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ama-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAMAPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/loyalty-program", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLoyaltyProgramBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ugc-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUserGeneratedContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityHealthScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fan-art", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFanArtCurator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/milestone-events", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMilestoneEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dm-templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDMResponseTemplates(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hashtag-community", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHashtagCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/live-qa", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLiveQAManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/referral-program", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReferralProgramBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ambassador-program", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityAmbassadorProgram(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/engagement-boost", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEngagementBoostStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === TEAM, WORKFLOW & BRAND AI (Batch 8) ===
  app.post("/api/ai/hiring", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHiringAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/freelancer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFreelancerFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sop-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSOPBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/project-timeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProjectTimeline(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/approval-flow", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentApprovalFlow(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/editing-checklist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditingChecklistBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/production-budget", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductionBudgetPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/equipment", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEquipmentRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/studio-setup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStudioSetupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/workflow-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkflowOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/batch-recording", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBatchRecordingScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/outsourcing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOutsourcingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tool-stack", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiToolStackOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-voice", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandVoiceCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-colors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandColorPalette(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-fonts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandFontSelector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-story", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandStoryWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-consistency", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandConsistencyAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pillar-refine", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPillarRefiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/channel-trailer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelTrailerBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/art-direction", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelArtDirector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/usp-finder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUniqueSellingPointFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/target-audience", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTargetAudienceDefiner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-partnerships", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandPartnershipMatcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crisis-comms", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisCommsPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/personal-brand", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalBrandAudit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-evolution", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandEvolutionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-diff", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorDifferentiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-brief", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollaborationBriefWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/networking-prep", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkingEventPrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mentorship", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMentorshipFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/delegation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDelegationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/time-management", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeManagementCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mastermind", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorMastermindPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/productivity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductivityTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === LEGAL, WELLNESS & INTEGRATIONS AI (Batch 9) ===
  app.post("/api/ai/copyright-check", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCopyrightChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fair-use", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFairUseAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/music-license", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicLicenseAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/privacy-policy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrivacyPolicyGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/terms-of-service", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTermsOfServiceWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ftc-compliance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFTCComplianceChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/coppa", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCOPPAAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gdpr", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGDPRComplianceChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentIDManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dispute-resolution", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDisputeResolutionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/trademark", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTrademarkAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/contract-template", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContractTemplateBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/insurance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInsuranceAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/business-entity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBusinessEntityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ip-protection", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIntellectualPropertyProtector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/burnout-risk", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBurnoutRiskAssessor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/meditation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMeditationGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/work-life-balance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkLifeBalancer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mental-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorMentalHealthMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sleep", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSleepOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/exercise", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExerciseForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/eye-strain", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEyeStrainPreventer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voice-care", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceCareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stress-management", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStressManagementCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/break-scheduler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorBreakScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/youtube-api", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeAPIIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-integration", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/discord-bot", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordBotBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ga-setup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleAnalyticsSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/social-scheduler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialMediaScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/email-marketing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailMarketingSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/podcast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/webhook-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWebhookManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/rate-limits", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAPIRateLimitManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-backup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataBackupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/notification-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNotificationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-post", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPostAutomator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/linktree", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkTreeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/qr-codes", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQRCodeGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/chatbot-integrator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChatbotIntegrator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/analytics-dashboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnalyticsDashboardBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cdn-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentDeliveryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/accessibility", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccessibilityAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/device-testing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiDeviceTester(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/performance-monitor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPerformanceMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/security-audit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSecurityAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cookie-consent", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCookieConsentManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/age-gating", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAgeGatingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-retention", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataRetentionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/incident-response", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIncidentResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === POWER USER & EMERGING TECH AI (Batch 10) ===

  app.post("/api/ai/shortcuts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomShortcutBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/advanced-search", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdvancedSearchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/bulk-upload", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBulkUploadManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/playlist-organizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlaylistAutoOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-account", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiAccountManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/custom-dashboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomDashboardBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-tagging", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoTaggingSystem(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/smart-notifications", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartNotificationSystem(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/template-library", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTemplateLibrary(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/macro-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMacroBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/vr-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVRContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ar-filters", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiARFilterCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voiceover", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAIVoiceoverGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/deepfake-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDeepfakeDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/blockchain-verify", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlockchainContentVerifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/predictive-trends", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveTrendEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-graph", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentGraphAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/psychographics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudiencePsychographer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/neuro-marketing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNeuroMarketingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gamification", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamificationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/personalization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sentiment-predict", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSentimentPredictiveModel(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentDNAAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/algorithm-sim", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmSimulator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-economy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorEconomyTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/web3-tools", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWeb3CreatorTools(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/metaverse", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMetaversePresencePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/agent-customizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAIAgentCustomizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-viz", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataVisualizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-api", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorAPIBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === BRAND ASSETS ===
  app.get("/api/brand-assets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const assets = await storage.getBrandAssets(userId);
    res.json(assets);
  });

  app.post("/api/brand-assets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const asset = await storage.createBrandAsset({ ...req.body, userId });
    res.status(201).json(asset);
  });

  app.put("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const asset = await storage.updateBrandAsset(Number(req.params.id), req.body);
    res.json(asset);
  });

  app.delete("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBrandAsset(Number(req.params.id));
    res.sendStatus(204);
  });

  // === WELLNESS ===
  app.get("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const checks = await storage.getWellnessChecks(userId, limit);
    res.json(checks);
  });

  app.post("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const check = await storage.createWellnessCheck({ ...req.body, userId });
    res.status(201).json(check);
  });

  // === COMPETITORS ===
  app.get("/api/competitors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const competitors = await storage.getCompetitorTracks(userId);
    res.json(competitors);
  });

  app.post("/api/competitors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const competitor = await storage.createCompetitorTrack({ ...req.body, userId });
    res.status(201).json(competitor);
  });

  app.put("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const competitor = await storage.updateCompetitorTrack(Number(req.params.id), req.body);
    res.json(competitor);
  });

  app.delete("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteCompetitorTrack(Number(req.params.id));
    res.sendStatus(204);
  });

  // === KNOWLEDGE ===
  app.get("/api/knowledge", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestones = await storage.getKnowledgeMilestones(userId);
    res.json(milestones);
  });

  app.post("/api/knowledge", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestone = await storage.createKnowledgeMilestone({ ...req.body, userId });
    res.status(201).json(milestone);
  });

  app.put("/api/knowledge/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestone = await storage.updateKnowledgeMilestone(Number(req.params.id), req.body);
    res.json(milestone);
  });

  // === STRIPE PAYMENTS ===
  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error("Stripe key error:", error);
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  app.post("/api/stripe/create-payment-link", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const { amount, description, customerEmail } = req.body;

      if (!amount || amount < 100) {
        return res.status(400).json({ error: "Amount must be at least $1.00 (100 cents)" });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || 'Payment',
              metadata: { creatorUserId: userId },
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: customerEmail || undefined,
        success_url: `${req.protocol}://${req.get('host')}/money?payment=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/money?payment=cancelled`,
        metadata: { creatorUserId: userId },
      });

      await storage.createAuditLog({
        userId,
        action: "payment_link_created",
        target: description || "Payment",
        details: { amount, sessionId: session.id },
        riskLevel: "low",
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Create payment link error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stripe/payments", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await db.execute(
        sql`SELECT * FROM stripe.payment_intents ORDER BY created DESC LIMIT 50`
      );
      res.json(result.rows || []);
    } catch (error: any) {
      if (error.message?.includes('relation "stripe.payment_intents" does not exist')) {
        return res.json([]);
      }
      console.error("Fetch payments error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stripe/balance", async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const balance = await stripe.balance.retrieve();
      res.json(balance);
    } catch (error: any) {
      console.error("Balance error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === CSV IMPORT FOR CHASE ===
  app.post("/api/expenses/import-csv", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No rows provided" });
      }

      const imported = [];
      for (const row of rows) {
        const record = await storage.createExpenseRecord({
          userId,
          description: row.description || "Imported expense",
          amount: Math.abs(parseFloat(row.amount) || 0),
          category: row.category || "other",
          expenseDate: row.date ? new Date(row.date) : new Date(),
          vendor: row.vendor || row.description || "",
          taxDeductible: true,
          metadata: { notes: "Imported from Chase CSV" },
        });
        imported.push(record);
      }

      await storage.createAuditLog({
        userId,
        action: "csv_imported",
        target: "Chase CSV",
        details: { count: imported.length },
        riskLevel: "low",
      });

      res.json({ imported: imported.length, records: imported });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === LEARNING ENGINE ===
  app.get("/api/learning/briefing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateDailyBriefing(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/learning/health-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getHealthScore(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/learning/action-items", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await processActionItems(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/learning/agent-scorecard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await updateAgentScorecard(userId, req.body.agentId, req.body.taskResult);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/learning/growth-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateGrowthPrediction(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/learning/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getContentDnaProfile(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === SHORTS PIPELINE ===
  app.post("/api/shorts/start", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await startShortsPipeline(userId, req.body.mode);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/shorts/status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getShortsPipelineStatus(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/pause", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await pauseShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/resume", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await resumeShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/extract/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await extractClipsFromVideo(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/hook/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateClipHook(userId, Number(req.params.clipId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/virality/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await predictClipVirality(userId, Number(req.params.clipId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/shorts/clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getClipsByVideo(userId, req.query.videoId ? Number(req.query.videoId) : undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/auto-reel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await compileAutoReel(userId, req.body.theme);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/track-performance/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackClipPerformance(userId, Number(req.params.clipId), req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === OPTIMIZATION ENGINE ===
  app.get("/api/optimization/health-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getOptimizationHealthScore(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/sub-engines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getSubEngineStatuses(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/metadata/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await runMetadataOptimizer(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/ab-test/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await runAbTestEngine(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/inject-trend", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await injectTrendingTopic(userId, req.body.videoId, req.body.topicId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/decay-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getDecayAlerts(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/viral-score/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await predictViralScore(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/hashtag-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await analyzeHashtagHealth(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/sentiment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await analyzeSentiment(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/algorithm-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await detectAlgorithmChanges(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/lifecycle/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await manageContentLifecycle(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/evergreen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await detectEvergreenContent(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/cannibalization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await detectContentCannibalization(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/trend-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await predictTrends(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await buildContentDna(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/ctr/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await optimizeCtr(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/trending-topics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getTrendingTopics(userId, req.query.platform as string | undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/viral-leaderboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getViralLeaderboard(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/content-gaps", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getContentGaps(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/algorithm-cheatsheet/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getAlgorithmCheatSheet(userId, req.params.platform);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/optimization/full-pass/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await runFullOptimizationPass(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === YOUTUBE MANAGER ===
  app.post("/api/youtube-manager/playlist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await createManagedPlaylist(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/youtube-manager/playlists", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getPlaylists(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/youtube-manager/auto-organize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await autoOrganizePlaylists(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/youtube-manager/playlist/:playlistId/add", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await addToPlaylist(Number(req.params.playlistId), req.body.videoId, req.body.position);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/youtube-manager/playlist/:playlistId/seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getPlaylistSeoScore(Number(req.params.playlistId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/youtube-manager/pinned-comment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generatePinnedComment(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/youtube-manager/description-links", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await buildDescriptionLinks(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/youtube-manager/multi-language/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateMultiLanguageMetadata(userId, Number(req.params.videoId), req.body.languages);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/youtube-manager/batch-push", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await batchPushOptimizations(userId, req.body.videoIds);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === REPURPOSE ENGINE ===
  app.post("/api/repurpose/generate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await repurposeVideo(userId, req.body.videoId, req.body.formats);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repurpose/content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getRepurposedContent(userId, req.query.videoId ? Number(req.query.videoId) : undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/repurpose/template", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await createScriptTemplate(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repurpose/templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getScriptTemplates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/repurpose/b-roll/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await suggestBRoll(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repurpose/formats", async (_req, res) => {
    try {
      const result = getRepurposeFormats();
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === SMART SCHEDULER ===
  app.get("/api/scheduler/optimal-times/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getOptimalPostingTimes(userId, req.params.platform);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/scheduler/activity-patterns", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await updateActivityPatterns(userId, req.body.platform, req.body.data);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/scheduler/cadence", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getUploadCadence(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/scheduler/auto-schedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await autoScheduleContent(userId, req.body.videoId, req.body.platforms);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/scheduler/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getScheduleRecommendations(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === MONETIZATION ENGINE ===
  app.post("/api/monetization/ad-breaks/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await suggestAdBreaks(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/revenue-forecast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateRevenueForecast(userId, req.body.period || "monthly");
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/fan-funnel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackFanFunnel(userId, req.body.eventType, req.body.platform, req.body.count);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/fan-funnel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getFanFunnelData(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/sponsor-rates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await calculateSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/sponsor-rates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/equipment-roi", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackEquipmentRoi(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/equipment-roi", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getEquipmentRoi(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/invoice/:dealId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateInvoice(userId, Number(req.params.dealId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/invoices", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getInvoices(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/analyze-deal/:dealId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await analyzeDeal(userId, Number(req.params.dealId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === WELLNESS & COMPLIANCE ===
  app.post("/api/wellness/workload", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await logWorkload(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/workload", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getWorkloadSummary(userId, req.query.days ? Number(req.query.days) : undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/burnout-check", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await checkBurnoutRisk(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/burnout-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getBurnoutAlerts(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/burnout-acknowledge/:alertId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await acknowledgeBurnoutAlert(userId, Number(req.params.alertId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/delegation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await suggestDelegation(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/team-task", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await createTeamTask(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/team-tasks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getTeamTasks(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/wellness/team-task/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await updateTeamTask(Number(req.params.id), req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/creative-block", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getCreativeBlockSuggestions(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/compliance-scan/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await scanCompliance(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/legal-document", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await storeLegalDocument(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/legal-documents", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getLegalDocuments(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/crm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await manageCrm(userId, req.body.action, req.body.data);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/crm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await manageCrm(userId, "get", {});
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === GENERIC OAUTH FOR ALL PLATFORMS ===
  const { OAUTH_CONFIGS, getOAuthRedirectUri, isPlatformOAuthConfigured, getAllOAuthPlatforms } = await import("./oauth-config");
  const { fetchPlatformData } = await import("./platform-data-fetcher");
  const crypto = await import("crypto");

  const pendingOAuthStates = new Map<string, { userId: string; platform: string; timestamp: number; codeVerifier?: string }>();

  function cleanupOAuthStates() {
    const now = Date.now();
    for (const [key, val] of pendingOAuthStates.entries()) {
      if (now - val.timestamp > 10 * 60 * 1000) pendingOAuthStates.delete(key);
    }
  }

  app.get("/api/oauth/status", async (_req, res) => {
    const allOAuth = getAllOAuthPlatforms();
    const status: Record<string, { hasOAuth: boolean; configured: boolean }> = {};
    for (const p of allOAuth) {
      status[p] = { hasOAuth: true, configured: isPlatformOAuthConfigured(p) };
    }
    status["youtube"] = { hasOAuth: true, configured: true };
    status["youtubeshorts"] = { hasOAuth: true, configured: true };
    res.json(status);
  });

  app.get("/api/oauth/:platform/auth", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.params.platform as Platform;
    const config = OAUTH_CONFIGS[platform];
    if (!config) return res.status(400).json({ error: `No OAuth config for platform: ${platform}` });

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: `OAuth not configured for ${config.label}. Missing ${config.clientIdEnv} and/or ${config.clientSecretEnv}.` });
    }

    cleanupOAuthStates();
    const state = crypto.randomBytes(32).toString("hex");
    let codeVerifier: string | undefined;

    if (config.requiresPKCE) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
    }

    pendingOAuthStates.set(state, { userId, platform, timestamp: Date.now(), codeVerifier });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getOAuthRedirectUri(platform),
      response_type: config.responseType || "code",
      scope: config.scopes.join(" "),
      state,
      ...(config.additionalAuthParams || {}),
    });

    if (config.usesClientKey) {
      params.set("client_key", clientId);
    }
    if (config.requiresPKCE && codeVerifier) {
      params.set("code_challenge", codeVerifier);
      params.set("code_challenge_method", "plain");
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("application/json")) {
      res.json({ url: authUrl });
    } else {
      res.redirect(authUrl);
    }
  });

  app.get("/api/oauth/:platform/callback", async (req, res) => {
    const platform = req.params.platform as Platform;
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      return res.redirect(`/channels?error=${encodeURIComponent("Missing authorization code. Please try again.")}`);
    }

    let userId: string | null = null;
    let codeVerifier: string | undefined;
    if (state && pendingOAuthStates.has(state)) {
      const entry = pendingOAuthStates.get(state)!;
      userId = entry.userId;
      codeVerifier = entry.codeVerifier;
      pendingOAuthStates.delete(state);
    }

    if (!userId) {
      userId = req.isAuthenticated() ? getUserId(req) : null;
    }

    if (!userId) {
      return res.redirect(`/channels?error=${encodeURIComponent("Session expired. Please log in and try again.")}`);
    }

    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return res.redirect(`/channels?error=${encodeURIComponent(`Unknown platform: ${platform}`)}`);
    }

    const clientId = process.env[config.clientIdEnv]!;
    const clientSecret = process.env[config.clientSecretEnv]!;

    try {
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: getOAuthRedirectUri(platform),
        client_id: clientId,
        client_secret: clientSecret,
      };

      if (config.requiresPKCE && codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (config.tokenAuthMethod === "header") {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        delete tokenBody.client_id;
        delete tokenBody.client_secret;
      }

      const tokenRes = await fetch(config.tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error(`[OAuth ${platform}] Token exchange failed:`, errText);
        return res.redirect(`/channels?error=${encodeURIComponent(`Failed to connect ${config.label}. Please try again.`)}`);
      }

      const tokenData = await tokenRes.json() as any;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const expiresIn = tokenData.expires_in;
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      let channelName = `${config.label} Account`;
      let channelId = accessToken.substring(0, 20);
      let profileUrl: string | undefined;

      if (config.userInfoUrl && config.userInfoHeaders && config.parseUserId) {
        try {
          const userRes = await fetch(config.userInfoUrl, {
            headers: config.userInfoHeaders(accessToken),
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            const parsed = config.parseUserId(userData);
            channelId = parsed.id;
            channelName = parsed.displayName || parsed.username;
            profileUrl = parsed.profileUrl;
          }
        } catch (e) {
          console.error(`[OAuth ${platform}] User info fetch failed:`, e);
        }
      }

      let streamKey: string | undefined;
      let rtmpUrl: string | undefined;
      let platformDataObj: Record<string, any> = {};
      let fetchedFollowerCount: number | undefined;

      try {
        const fetched = await fetchPlatformData(platform as Platform, accessToken, channelId);
        if (fetched.streamKey) streamKey = fetched.streamKey;
        if (fetched.rtmpUrl) rtmpUrl = fetched.rtmpUrl;
        if (fetched.channelName) channelName = fetched.channelName;
        if (fetched.channelId) channelId = fetched.channelId;
        if (fetched.profileUrl) profileUrl = fetched.profileUrl;
        if (fetched.followerCount !== undefined) fetchedFollowerCount = fetched.followerCount;
        if (fetched.platformData) platformDataObj = fetched.platformData;
      } catch (e) {
        console.error(`[OAuth ${platform}] Platform data fetch failed:`, e);
      }

      const existingChannels = await storage.getChannelsByUser(userId);
      const existing = existingChannels.find(c => c.platform === platform);

      if (existing) {
        await storage.updateChannel(existing.id, {
          accessToken,
          refreshToken,
          tokenExpiresAt,
          channelName,
          channelId,
          streamKey: streamKey || existing.streamKey || null,
          rtmpUrl: rtmpUrl || existing.rtmpUrl || null,
          platformData: { ...((existing.platformData as any) || {}), ...platformDataObj, lastFetchedAt: new Date().toISOString() },
        });
      } else {
        await storage.createChannel({
          userId,
          platform,
          channelName,
          channelId,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          streamKey: streamKey || null,
          rtmpUrl: rtmpUrl || null,
          platformData: { ...platformDataObj, lastFetchedAt: new Date().toISOString() },
          settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
        });
      }

      if (streamKey || rtmpUrl) {
        const platformInfo = (await import("@shared/schema")).PLATFORM_INFO;
        const info = platformInfo[platform as Platform];
        const finalRtmpUrl = rtmpUrl || info?.rtmpUrlTemplate || "";

        const existingDest = await db.select().from(streamDestinations).where(
          and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform))
        );

        if (existingDest.length === 0) {
          await db.insert(streamDestinations).values({
            userId,
            platform,
            label: `${channelName} (${config.label})`,
            rtmpUrl: finalRtmpUrl,
            streamKey: streamKey || null,
            enabled: true,
            settings: { resolution: "1080p", bitrate: "6000", fps: 60, autoStart: true },
          });
        } else {
          await db.update(streamDestinations)
            .set({ rtmpUrl: finalRtmpUrl, streamKey: streamKey || existingDest[0].streamKey, label: `${channelName} (${config.label})` })
            .where(and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform)));
        }
      }

      const existingLinked = await db.select().from(linkedChannels).where(
        and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform))
      );
      if (existingLinked.length === 0) {
        await db.insert(linkedChannels).values({
          userId,
          platform,
          username: channelName,
          profileUrl: profileUrl || null,
          isConnected: true,
          connectionType: "oauth",
          followerCount: fetchedFollowerCount || null,
        });
      } else {
        await db.update(linkedChannels)
          .set({
            isConnected: true,
            username: channelName,
            profileUrl: profileUrl || null,
            connectionType: "oauth",
            followerCount: fetchedFollowerCount || existingLinked[0].followerCount,
            lastVerifiedAt: new Date(),
          })
          .where(and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform)));
      }

      res.redirect(`/channels?connected=${platform}&channel=${encodeURIComponent(channelName)}`);
    } catch (error: any) {
      console.error(`[OAuth ${platform}] Callback error:`, error);
      res.redirect(`/channels?error=${encodeURIComponent(`Failed to connect ${config.label}: ${error.message}`)}`);
    }
  });

  // === LINKED CHANNELS ===
  app.post("/api/linked-channels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [result] = await db.insert(linkedChannels).values({
        userId,
        platform: req.body.platform,
        username: req.body.username || null,
        profileUrl: req.body.profileUrl || null,
        isConnected: req.body.isConnected ?? true,
        connectionType: req.body.connectionType || "manual",
        credentials: req.body.credentials || null,
        followerCount: req.body.followerCount || null,
      }).returning();

      const creds = req.body.credentials || {};
      const tokenValue = creds.streamKey || creds.apiKey || req.body.username || "";
      const platformName = req.body.platform;
      const existingChannels = await storage.getChannelsByUser(userId);
      const existingForPlatform = existingChannels.find(c => c.platform === platformName);
      if (!existingForPlatform && tokenValue) {
        const platformInfo = PLATFORM_INFO[platformName as Platform];
        await storage.createChannel({
          userId,
          platform: platformName,
          channelName: req.body.username || `${platformInfo?.label || platformName} Account`,
          channelId: tokenValue,
          accessToken: tokenValue,
          refreshToken: null,
          tokenExpiresAt: null,
          settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/linked-channels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await db.select().from(linkedChannels)
        .where(eq(linkedChannels.userId, userId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [result] = await db.update(linkedChannels)
        .set(req.body)
        .where(and(eq(linkedChannels.id, Number(req.params.id)), eq(linkedChannels.userId, userId)))
        .returning();
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await db.delete(linkedChannels)
        .where(and(eq(linkedChannels.id, Number(req.params.id)), eq(linkedChannels.userId, userId)));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // === AUDIO, EMAIL & EVENTS AI (Batch 11) ===
  app.post("/api/ai/podcast-launch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastLaunchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/podcast-episode", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastEpisodePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/podcast-seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPodcastSEO(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audio-branding", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioBrandingKit(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/music-composer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicComposerAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/asmr", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiASMRContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voice-training", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVoiceTrainingCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audio-mixing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudioMixingGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/newsletter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsletterBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/email-sequence", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailSequenceWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/lead-magnet", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLeadMagnetCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/email-list", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailListGrower(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/email-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmailAnalyticsAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/webinar", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWebinarPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/virtual-event", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVirtualEventOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/meetup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMeetupOrganizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/conference-prep", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConferencePrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/award-submission", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAwardSubmissionWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/panel-prep", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPanelDiscussionPrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-retreat", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorRetreePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/live-workshop", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLiveWorkshopBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/course-launch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOnlineCourseLauncher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/masterclass", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMasterclassDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/media-appearance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaAppearancePrep(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/guest-post", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGuestPostWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/influencer-event", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/product-launch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductLaunchPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/charity-event", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCharityEventAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/anniversary", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnniversaryCelebrationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/seasonal-campaign", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSeasonalCampaignPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/holiday-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHolidayContentCalendar(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/year-review", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEndOfYearReview(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === EDUCATION, SOCIAL PROOF & ECOMMERCE AI (Batch 12) ===
  app.post("/api/ai/skill-assessment", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSkillAssessment(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/learning-path", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLearningPathBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/certification", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCertificationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/book-recommend", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBookRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tool-tutorial", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiToolTutorialCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/industry-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIndustryReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/case-study", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaseStudyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/portfolio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPortfolioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/social-proof", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialProofCollector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/testimonial-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTestimonialVideoPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/case-study-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaseStudyVideoCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/before-after", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBeforeAfterShowcase(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/influencer-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerScorecard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/credibility", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCredibilityBooster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/review-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUserReviewManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/reference-page", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReferencePageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ecommerce-store", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEcommerceStoreBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dropshipping", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDropshippingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/print-on-demand", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrintOnDemandOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/digital-download", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalDownloadCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/affiliate-page", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffiliatePageBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/upsell", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUpsellStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cart-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCartAbandonmentRecovery(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/customer-journey", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCustomerJourneyMapper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/product-bundle", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductBundleCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/flash-sale", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFlashSalePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/loyalty-rewards", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLoyaltyRewardDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subscription-model", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubscriptionModelBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pricing-page", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPricingPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/checkout", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCheckoutOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/inventory", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInventoryForecaster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shipping", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiShippingOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === ADS, DATA SCIENCE & ACCESSIBILITY AI (Batch 13) ===
  app.post("/api/ai/youtube-ads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeAdsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/facebook-ads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookAdsCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/google-ads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGoogleAdsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-ads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokAdsAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/influencer-ads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerAdsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/retargeting", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRetargetingStrategist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ad-copy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdCopyWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ad-budget", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAdBudgetAllocator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/landing-page", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLandingPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/conversion-rate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiConversionRateOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-cleaning", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataCleaningAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataPipelineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/anomaly-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnomalyDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cohort-analysis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCohortAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/attribution-model", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAttributionModeler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/predictive-churn", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPredictiveChurnModeler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ltv-calculator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLifetimeValueCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/accessibility-text", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccessibilityTextChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/alt-text", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAltTextGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/color-contrast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiColorContrastChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/screen-reader", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiScreenReaderOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/keyboard-nav", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKeyboardNavChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/caption-quality", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCaptionQualityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/inclusive-language", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInclusiveLanguageChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dyslexia-format", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDyslexiaFriendlyFormatter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/motion-sensitivity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMotionSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cognitive-load", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCognitiveLoadReducer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-modal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiModalContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === SECURITY, COMPETITORS & MOBILE AI (Batch 14) ===
  app.post("/api/ai/password-security", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPasswordSecurityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/phishing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPhishingDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/account-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccountRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/privacy-settings", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPrivacySettingsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-breach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataBreachResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/vpn", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVPNAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-analysis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorContentTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-pricing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorPricingMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/market-share", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMarketShareAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/swot", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSWOTAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-social", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorSocialTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/blue-ocean", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlueOceanFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mobile-optimize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/deep-links", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAppDeepLinkBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/push-notifications", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPushNotificationOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mobile-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/responsive-check", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiResponsiveDesignChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mobile-payment", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobilePaymentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/offline-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOfflineContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mobile-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileAnalyticsSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/app-store", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAppStoreOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/widget-design", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWidgetDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gesture-optimize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGestureOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mobile-first", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMobileFirstContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/wearable", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWearableContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-sync", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPlatformSyncManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/smart-tv", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartTVOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === GAMIFICATION, REPORTS & NICHE AI (Batch 15) ===
  app.post("/api/ai/achievements", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAchievementSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/leaderboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLeaderboardDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/points-economy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPointsEconomyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/badge-system", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBadgeSystemCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/streak-system", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreakSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/progress-viz", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProgressVisualizationEngine(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/challenge-system", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChallengeSystemBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/monthly-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMonthlyReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/weekly-digest", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWeeklyDigestBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/quarterly-review", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuarterlyBusinessReview(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/annual-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAnnualStrategyPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCompetitorReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audience-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAudienceReportBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentReportCard(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/roi-report", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiROIReportGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gaming-niche", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamingNicheOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/beauty-niche", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBeautyNicheAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tech-review", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTechReviewOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/food-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFoodContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fitness-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFitnessContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/travel-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTravelContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/education-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEducationContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/finance-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinanceContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/parenting-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiParentingContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pet-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPetContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/diy-craft", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDIYCraftPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/musician-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicianContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/comedy-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiComedyContentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sports-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSportsContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/news-commentary", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewsCommentaryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/lifestyle-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLifestyleContentOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === REPURPOSING, COLLABS & SUBSCRIBER GROWTH AI (Batch 16) ===
  app.post("/api/ai/video-to-book", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToBookConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-to-podcast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToPodcastConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/video-to-course", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVideoToCourseConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/blog-to-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlogToVideoConverter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitter-thread", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitterThreadCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/linkedin-adapter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInContentAdapter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pinterest-pins", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPinterestPinCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/reddit-post", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRedditPostOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/quora-answer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiQuoraAnswerWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/medium-article", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediumArticleAdapter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/slidedeck", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSlidedeckCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/infographic-repurpose", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfographicRepurposer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-match", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabMatchScorer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-contract", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContractWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-revenue", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabRevenueCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabContentIdeator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-outreach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabOutreachWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/collab-performance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCollabPerformanceTracker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/network-effect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkEffectCalculator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sub-milestone", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubMilestoneStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sub-retention", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubRetentionOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/bell-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNotificationBellOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/first-video", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFirstVideoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/membership-perks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChannelMembershipPerks(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sub-countdown", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubCountdownPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/unsub-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiUnsubscribeAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sub-quality", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubQualityAnalyzer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/growth-playbook", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrowthHackingPlaybook(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viral-engine", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiViralGrowthEngineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-promo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrossPromotionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === WATCH TIME, YOUTUBE & TWITCH/KICK AI (Batch 17) ===
  app.post("/api/ai/watch-time-boost", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWatchTimeBooster(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/open-loops", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOpenLoopCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pattern-interrupts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatternInterruptDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/re-engagement", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReEngagementHookBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/binge-watch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBingeWatchOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-studio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeStudioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-shorts-algo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeShortsAlgorithm(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-comments", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeCommentsManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-playlists", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubePlaylistStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-premiere", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubePremierePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-membership", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeMembeshipStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-super-thanks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeSuperThanksOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-handle", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeHandleOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-channel-page", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeChannelPageOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/yt-hashtags", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiYouTubeHashtagStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-emotes", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchEmoteStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-bits", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchBitsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-raids", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchRaidOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-points", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchChannelPointsDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchPredictionsCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-hype-train", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchHypeTrainMaximizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchClipStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-vods", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchVODOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/twitch-panels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTwitchPanelDesigner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/kick-stream", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickStreamOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/kick-monetization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickMonetizationAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/kick-community", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/kick-differentiator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickContentDifferentiator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/kick-discovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiKickDiscoveryOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-router", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMultiPlatformStreamRouter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-deck", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamDeckConfigurer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/obs-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOBSOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/streamlabs", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamLabsConfigurator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-elements", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStreamElementsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/chaturbate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChaturbateStreamAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === TIKTOK, INSTAGRAM & OTHER PLATFORMS AI (Batch 18) ===
  app.post("/api/ai/tiktok-algorithm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokAlgorithmDecoder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-sounds", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokSoundStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-duet", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokDuetStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-live", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokLiveOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-shop", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokShopAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-fund", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokCreatorFundOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-hashtags", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokHashtagResearcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tiktok-profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTikTokProfileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-reels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramReelsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-stories", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramStoriesPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-carousel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramCarouselCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-bio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramBioOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-shopping", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramShoppingSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-collabs", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramCollabManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-growth", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramGrowthHacker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ig-aesthetic", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInstagramAestheticPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/x-growth", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiXTwitterGrowthStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/x-thread", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiXTwitterThreadWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/linkedin-creator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInCreatorStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/linkedin-article", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInArticleWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fb-groups", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookGroupManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fb-reels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFacebookReelsOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/snapchat", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSnapchatSpotlightAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/threads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThreadsStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/discord-optimize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiscordServerOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/patreon-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPatreonContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/substack", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSubstackOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gumroad", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGumroadProductOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/teachable", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeachableCoursePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/buymeacoffee", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBuyMeCoffeeOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === FINANCIAL PLANNING & EQUIPMENT AI (Batch 19) ===
  app.post("/api/ai/retirement", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRetirementPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/emergency-fund", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEmergencyFundAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/investment", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInvestmentAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/debt-payoff", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDebtPayoffPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/insurance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInsuranceAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/real-estate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRealEstateInvestor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crypto-portfolio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCryptoPortfolioAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/passive-income", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPassiveIncomeBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/freelance-pricing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFreelancePricingGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/grant-finder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGrantFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crowdfunding", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrowdfundingAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-diversify", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueStreamDiversifier(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/budget-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBudgetTrackerSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/financial-goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinancialGoalSetter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/camera-recommend", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCameraRecommender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/microphone", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMicrophoneAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/lighting-setup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLightingSetupPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/editing-software", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditingSoftwareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/studio-design", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStudioDesignPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/green-screen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGreenScreenSetup(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/teleprompter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeleprompterAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/backup-storage", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackupStoragePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/internet-optimize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInternetOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hiring", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHiringAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/va-tasks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVATaskDelegator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/editor-hiring", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEditorHiringGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-designer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThumbnailDesignerFinder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/outsourcing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOutsourcingStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === CONTENT SAFETY & PERSONAL BRAND AI (Batch 20) ===
  app.post("/api/ai/content-moderation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentModerationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/copyright-claim", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCopyrightClaimResolver(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsorship-disclosure", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSponsorshipDisclosureChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/age-restriction", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAgeRestrictionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/defamation-risk", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDefamationRiskChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/plagiarism", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPlagiarismDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/coppa", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCOPPAComplianceChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gdpr", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGDPRComplianceAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-guidelines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityGuidelinesWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hate-speech", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHateSpeechDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/misinformation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMisinformationChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/trigger-warning", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTriggerWarningAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/child-safety", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChildSafetyChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-retention", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDataRetentionPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-audit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalBrandAuditor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/elevator-pitch", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiElevatorPitchWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/press-kit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPressKitBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/speaker-bio", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSpeakerBioWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/linkedin-profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLinkedInProfileOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/personal-website", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPersonalWebsiteBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thought-leadership", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiThoughtLeadershipPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/public-speaking", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPublicSpeakingCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/networking-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNetworkingStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/reputation-monitor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReputationMonitor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crisis-response", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/apology-script", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiApologyScriptWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/controversy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiControversyNavigator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cancel-culture", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCancelCultureDefender(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/diversity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDiversityInclusionAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mental-health-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMentalHealthContentGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/political-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPoliticalContentNavigator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/religious-sensitivity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiReligiousSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cultural-sensitivity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCulturalSensitivityAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/body-image", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBodyImageSensitivityChecker(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/addiction-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAddictionContentGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/financial-disclaimer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiFinancialDisclaimerWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === AUTOMATION & CRISIS MANAGEMENT AI (Batch 21) ===
  app.post("/api/ai/workflow-automation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkflowAutomationBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/zapier", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiZapierIntegrationPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ifttt", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiIFTTTRecipeCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/make-scenario", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMakeScenarioBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-scheduler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoScheduler(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-responder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoResponder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-moderator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoModerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-backup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoBackupper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-reporter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoReporter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/batch-processor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBatchProcessor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/smart-queue", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSmartQueueManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContentPipelineBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/training-data", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAITrainingDataCollector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crisis-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCrisisDetector(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/damage-control", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDamageControlPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pr-statement", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPRStatementWriter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stakeholder-comm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStakeholderCommunicator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/recovery-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRecoveryStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/media-response", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMediaResponsePlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/legal-risk", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLegalRiskAssessor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/social-crisis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSocialMediaCrisisManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/influencer-crisis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInfluencerCrisisAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBrandRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/trust-rebuild", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCommunityTrustRebuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/algo-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAlgorithmRecoveryAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiRevenueRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/team-crisis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTeamCrisisManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/legal-defense", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiLegalDefensePrepper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/insurance-claim", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiInsuranceClaimHelper(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/contingency", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiContingencyPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/disaster-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDisasterRecoveryPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/business-continuity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBusinessContinuityPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/exit-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExitStrategyBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  // === SEASONAL & HEALTH CONTENT AI (Batch 22) ===
  app.post("/api/ai/summer-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSummerContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/winter-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWinterContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/back-to-school", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBackToSchoolPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/halloween-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHalloweenContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/black-friday", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiBlackFridayStrategist(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/christmas-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiChristmasContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/new-year-goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNewYearGoalSetter(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/valentines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiValentinesDayPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/easter-content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEasterContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/super-bowl", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSuperBowlContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/parents-day", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiParentsDayPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/graduation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGraduationContentCreator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/world-cup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorldCupContentPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/olympics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiOlympicsContentStrategy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/awards-season", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAwardsSeasonPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/music-festival", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMusicFestivalContentGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gaming-event", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGamingEventPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/product-hunt", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiProductHuntLaunchGuide(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ergonomic-setup", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiErgonomicSetupAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/eye-care", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEyeCareAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/vocal-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiVocalHealthCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sleep-optimize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiSleepOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/nutrition", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiNutritionForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/exercise", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiExerciseForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stress-management", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiStressManagementCoach(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/work-life-balance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiWorkLifeBalanceOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/burnout-recovery", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorBurnoutRecovery(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/meditation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMeditationGuideForCreators(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/time-blocking", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiTimeBlockingOptimizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pomodoro", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiPomodoroCustomizer(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/digital-detox", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiDigitalDetoxPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gratitude-journal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiGratitudeJournalPrompts(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/affirmations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAffirmationGenerator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/habit-stack", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiHabitStackBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/energy-management", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiEnergyManagementAdvisor(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-community", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorCommunityBuilder(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/mastermind-group", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiMastermindGroupFacilitator(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/accountability", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAccountabilityPartnerMatcher(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sabbatical", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreatorSabbaticalPlanner(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-onboarding", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoOnboarding(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-onboarding error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-approve-sponsorship", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoApproveSponsorship(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-approve error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creative-autonomy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiCreativeAutonomy(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI creative-autonomy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/auto-payment-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await aiAutoPaymentManager(req.body, userId);
      res.json(result);
    } catch (e: any) { console.error("AI auto-payment error:", e); res.status(500).json({ message: e.message }); }
  });

  // ====== MULTI-LANGUAGE & LOCALIZATION AI ROUTES ======

  app.post("/api/ai/video-translator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVideoTranslator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI video-translator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subtitle-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubtitleGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subtitle-generator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/localization-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLocalizationAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI localization-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-lang-seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangSeo(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-seo error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dubbing-script", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDubbingScriptGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI dubbing-script error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cultural-adaptation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCulturalAdaptation(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cultural-adaptation error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-localizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiThumbnailLocalizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI thumbnail-localizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-lang-hashtags", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangHashtags(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-hashtags error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/translation-checker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTranslationChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI translation-checker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audience-language-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudienceLanguageAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audience-language error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/regional-trends", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRegionalTrendScanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI regional-trends error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-lang-comments", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossLangCommentManager(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-lang-comments error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/localized-calendar", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLocalizedContentCalendar(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI localized-calendar error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-lang-ab-test", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangAbTesting(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-ab-test error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/voice-over-formatter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVoiceOverFormatter(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI voice-over-formatter error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/regional-compliance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRegionalComplianceChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI regional-compliance error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-lang-media-kit", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiLangMediaKit(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-lang-media-kit error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-tracker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-gap-analysis", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorGapAnalysis(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-gap-analysis error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorAlerts(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-alerts error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-content-scorer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorContentScorer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-content-scorer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/niche-domination-map", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiNicheDominationMap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI niche-domination-map error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/competitor-audience-overlap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCompetitorAudienceOverlap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI competitor-audience-overlap error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viral-predictor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiViralPredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI viral-predictor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/optimal-schedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiOptimalSchedule(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI optimal-schedule error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audience-persona-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudiencePersonaBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audience-persona-builder error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subscriber-magnet", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubscriberMagnet(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subscriber-magnet error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/shorts-clips-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiShortsClipsStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI shorts-clips-strategy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hook-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiHookGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI hook-generator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/end-screen-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEndScreenOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI end-screen-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/deal-negotiation-coach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDealNegotiationCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI deal-negotiation-coach error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/merch-demand-predictor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMerchDemandPredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI merch-demand-predictor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-stream-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRevenueStreamOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI revenue-stream-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/revenue-forecaster", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRevenueForecaster(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI revenue-forecaster error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sponsorship-rate-calculator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSponsorshipRateCalculator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sponsorship-rate-calculator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/membership-tier-designer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMembershipTierDesigner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI membership-tier-designer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/super-chat-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSuperChatOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI super-chat-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/affiliate-link-manager", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAffiliateLinkManager(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI affiliate-link-manager error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/script-coach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiScriptCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI script-coach error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/thumbnail-ctr-predictor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiThumbnailCTRPredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI thumbnail-ctr-predictor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/watch-time-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiWatchTimeOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI watch-time-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/platform-repurposer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformRepurposer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-repurposer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-decay-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentDecayDetector(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-decay-detector error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/title-ab-tester", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTitleAbTester(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI title-ab-tester error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/description-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDescriptionOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI description-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/pacing-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPacingAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI pacing-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fan-loyalty-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanLoyaltyTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-loyalty-tracker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/comment-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCommentStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI comment-strategy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/community-poll-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCommunityPollGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI community-poll-generator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/live-chat-moderator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiLiveChatModerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI live-chat-moderator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fan-milestone-celebrator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanMilestoneCelebrator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-milestone-celebrator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/engagement-booster", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEngagementBooster(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI engagement-booster error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-platform-unifier", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossPlatformUnifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-platform-unifier error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/platform-priority-ranker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformPriorityRanker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-priority-ranker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/cross-post-scheduler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrossPostScheduler(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI cross-post-scheduler error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/platform-specific-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPlatformSpecificOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI platform-specific-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-auditor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandAuditor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-auditor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/media-kit-auto-updater", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMediaKitAutoUpdater(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI media-kit-auto-updater error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-voice-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandVoiceAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-voice-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/visual-identity-checker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiVisualIdentityChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI visual-identity-checker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-partnership-scorer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandPartnershipScorer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-partnership-scorer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/copyright-shield", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCopyrightShield(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI copyright-shield error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/contract-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContractAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI contract-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-insurance-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentInsuranceAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-insurance-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fair-use-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFairUseAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fair-use-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/dmca-defense-assistant", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDMCADefenseAssistant(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI dmca-defense-assistant error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/subscriber-milestone-predictor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSubscriberMilestonePredictor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI subscriber-milestone-predictor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/retention-heatmap-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRetentionHeatmapAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI retention-heatmap-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/best-video-formula-detector", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBestVideoFormulaDetector(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI best-video-formula-detector error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/growth-trajectory-modeler", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiGrowthTrajectoryModeler(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI growth-trajectory-modeler error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/ab-testing-dashboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAbTestingDashboard(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI ab-testing-dashboard error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-decay-refresher", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentDecayRefresher(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-decay-refresher error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/burnout-prevention", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBurnoutPrevention(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI burnout-prevention error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-batching-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentBatchingPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-batching-planner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creative-block-solver", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreativeBlockSolver(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI creative-block-solver error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/work-life-balance-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiWorkLifeBalanceTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI work-life-balance-tracker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/motivation-engine", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMotivationEngine(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI motivation-engine error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/gear-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiGearAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI gear-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/editing-style-coach", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEditingStyleCoach(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI editing-style-coach error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/public-speaking-trainer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPublicSpeakingTrainer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI public-speaking-trainer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/niche-expert-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiNicheExpertBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI niche-expert-builder error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/hiring-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiHiringAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI hiring-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/task-delegator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTaskDelegator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI task-delegator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/team-performance-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTeamPerformanceTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI team-performance-tracker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sops-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSOPsGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sops-generator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/crisis-response-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCrisisResponsePlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI crisis-response-planner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/statement-drafter", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStatementDrafter(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI statement-drafter error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/survey-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSurveyBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI survey-builder error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viewer-journey-mapper", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiViewerJourneyMapper(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI viewer-journey-mapper error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/demographic-deep-dive", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDemographicDeepDive(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI demographic-deep-dive error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/viewer-intent-analyzer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiViewerIntentAnalyzer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI viewer-intent-analyzer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/course-product-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCourseProductPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI course-product-planner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/membership-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMembershipStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI membership-strategy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/speaking-engagement-finder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSpeakingEngagementFinder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI speaking-engagement-finder error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-roadmap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentRoadmap(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-roadmap error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-pillar-architect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentPillarArchitect(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-pillar-architect error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/seasonal-content-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSeasonalContentPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI seasonal-content-planner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/evergreen-content-identifier", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiEvergreenContentIdentifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI evergreen-content-identifier error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/industry-event-tracker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiIndustryEventTracker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI industry-event-tracker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/talent-agent-simulator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiTalentAgentSimulator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI talent-agent-simulator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/creator-economy-news-feed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiCreatorEconomyNewsFeed(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI creator-economy-news-feed error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-overlay-designer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStreamOverlayDesigner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI stream-overlay-designer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/raid-target-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiRaidTargetOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI raid-target-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/stream-highlight-clipper", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiStreamHighlightClipper(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI stream-highlight-clipper error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/donation-goal-strategist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDonationGoalStrategist(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI donation-goal-strategist error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/multi-stream-chat-unifier", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiMultiStreamChatUnifier(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI multi-stream-chat-unifier error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/background-music-matcher", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBackgroundMusicMatcher(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI background-music-matcher error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/audio-quality-enhancer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAudioQualityEnhancer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI audio-quality-enhancer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sound-effect-recommender", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSoundEffectRecommender(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sound-effect-recommender error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/accessibility-checker", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAccessibilityChecker(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI accessibility-checker error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/alt-text-generator", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAltTextGenerator(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI alt-text-generator error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/sign-language-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiSignLanguageAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI sign-language-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/privacy-scanner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiPrivacyScanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI privacy-scanner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/account-security-auditor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiAccountSecurityAuditor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI account-security-auditor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/data-backup-strategist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDataBackupStrategist(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI data-backup-strategist error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/digital-collectible-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDigitalCollectibleAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI digital-collectible-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/exclusive-content-planner", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiExclusiveContentPlanner(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI exclusive-content-planner error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/fan-marketplace-builder", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiFanMarketplaceBuilder(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI fan-marketplace-builder error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/channel-exit-strategy", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiChannelExitStrategy(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI channel-exit-strategy error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/content-archive-optimizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiContentArchiveOptimizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI content-archive-optimizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/brand-licensing-advisor", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiBrandLicensingAdvisor(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI brand-licensing-advisor error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/inbox-prioritizer", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiInboxPrioritizer(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI inbox-prioritizer error:", e); res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/daily-action-plan", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await aiDailyActionPlan(req.body, userId); res.json(result); }
    catch (e: any) { console.error("AI daily-action-plan error:", e); res.status(500).json({ message: e.message }); }
  });

  // ====== AUTOMATION ENGINE ROUTES ======
  const { initAutomationEngine, processWebhookEvent, runChainManually, evaluateRules,
    AI_FEATURE_CATEGORIES, SCHEDULE_PRESETS, DEFAULT_CHAIN_TEMPLATES,
    WEBHOOK_SOURCES, RULE_TRIGGER_TYPES, RULE_ACTION_TYPES } = await import("./automation-engine");

  app.get("/api/automation/status", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const [cronJobsList, chainsList, notifs, rules, webhookEvts] = await Promise.all([
        storage.getCronJobs(userId),
        storage.getAiChains(userId),
        storage.getNotifications(userId),
        storage.getAutomationRules(userId),
        storage.getWebhookEvents(userId),
      ]);
      const unreadCount = await storage.getUnreadCount(userId);
      res.json({
        cronJobs: cronJobsList.length,
        activeChains: chainsList.filter((c: any) => c.enabled).length,
        totalNotifications: notifs.length,
        unreadNotifications: unreadCount,
        activeRules: rules.filter((r: any) => r.enabled !== false).length,
        webhookEvents: webhookEvts.length,
        automationLevel: Math.min(100, 96 + Math.floor(
          (cronJobsList.filter((j: any) => j.enabled).length * 2) +
          (chainsList.filter((c: any) => c.enabled).length * 3) +
          (rules.filter((r: any) => r.enabled !== false).length)
        )),
        categories: AI_FEATURE_CATEGORIES,
        schedulePresets: SCHEDULE_PRESETS,
        chainTemplates: DEFAULT_CHAIN_TEMPLATES,
        webhookSources: WEBHOOK_SOURCES,
        ruleTriggerTypes: RULE_TRIGGER_TYPES,
        ruleActionTypes: RULE_ACTION_TYPES,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get automation status" });
    }
  });

  app.get("/api/automation/cron-jobs", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const jobs = await storage.getCronJobs(userId);
      res.json(jobs);
    } catch (err) { res.status(500).json({ error: "Failed to get cron jobs" }); }
  });

  app.post("/api/automation/cron-jobs", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const { featureKey, schedule, enabled } = req.body;
      const job = await storage.createCronJob({
        userId,
        featureKey,
        schedule: schedule || "0 */6 * * *",
        enabled: enabled !== false,
        status: "idle",
      });
      res.json(job);
    } catch (err) { res.status(500).json({ error: "Failed to create cron job" }); }
  });

  app.patch("/api/automation/cron-jobs/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const job = await storage.updateCronJob(parseInt(req.params.id), req.body);
      res.json(job);
    } catch (err) { res.status(500).json({ error: "Failed to update cron job" }); }
  });

  app.delete("/api/automation/cron-jobs/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteCronJob(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete cron job" }); }
  });

  app.get("/api/automation/chains", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const chains = await storage.getAiChains(userId);
      res.json({ chains, templates: DEFAULT_CHAIN_TEMPLATES });
    } catch (err) { res.status(500).json({ error: "Failed to get chains" }); }
  });

  app.post("/api/automation/chains", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const { name, steps, enabled } = req.body;
      const chain = await storage.createAiChain({
        userId,
        name,
        steps: steps || [],
        enabled: enabled !== false,
        status: "idle",
      });
      res.json(chain);
    } catch (err) { res.status(500).json({ error: "Failed to create chain" }); }
  });

  app.post("/api/automation/chains/:id/run", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const result = await runChainManually(parseInt(req.params.id));
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message || "Failed to run chain" }); }
  });

  app.patch("/api/automation/chains/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const chain = await storage.updateAiChain(parseInt(req.params.id), req.body);
      res.json(chain);
    } catch (err) { res.status(500).json({ error: "Failed to update chain" }); }
  });

  app.delete("/api/automation/chains/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteAiChain(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete chain" }); }
  });

  app.get("/api/automation/notifications", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const notifs = await storage.getNotifications(userId);
      const unread = await storage.getUnreadCount(userId);
      res.json({ notifications: notifs, unreadCount: unread });
    } catch (err) { res.status(500).json({ error: "Failed to get notifications" }); }
  });

  app.post("/api/automation/notifications/:id/read", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const notif = await storage.markRead(parseInt(req.params.id));
      res.json(notif);
    } catch (err) { res.status(500).json({ error: "Failed to mark read" }); }
  });

  app.post("/api/automation/notifications/read-all", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.markAllRead(userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to mark all read" }); }
  });

  app.get("/api/automation/webhook-events", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const events = await storage.getWebhookEvents(userId, req.query.source as string);
      res.json(events);
    } catch (err) { res.status(500).json({ error: "Failed to get webhook events" }); }
  });

  app.post("/api/automation/webhooks/:source", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const event = await processWebhookEvent(userId, req.params.source, req.body.eventType || "unknown", req.body.payload || req.body);
      const triggered = await evaluateRules(userId, req.body.eventType || req.params.source, req.body);
      res.json({ event, triggeredRules: triggered });
    } catch (err) { res.status(500).json({ error: "Failed to process webhook" }); }
  });

  app.get("/api/automation/rules", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rules = await storage.getAutomationRules(userId);
      res.json({ rules, triggerTypes: RULE_TRIGGER_TYPES, actionTypes: RULE_ACTION_TYPES });
    } catch (err) { res.status(500).json({ error: "Failed to get rules" }); }
  });

  app.post("/api/automation/rules", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rule = await storage.createAutomationRule({
        userId,
        name: req.body.name,
        trigger: req.body.trigger || req.body.triggerType,
        agentId: req.body.agentId || req.body.actionType || "system",
        actions: req.body.actions || [{ type: req.body.actionType, config: req.body.actionConfig || {} }],
        enabled: req.body.enabled !== false,
      });
      res.json(rule);
    } catch (err) { res.status(500).json({ error: "Failed to create rule" }); }
  });

  app.patch("/api/automation/rules/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rule = await storage.updateAutomationRule(parseInt(req.params.id), req.body);
      res.json(rule);
    } catch (err) { res.status(500).json({ error: "Failed to update rule" }); }
  });

  app.delete("/api/automation/rules/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteAutomationRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete rule" }); }
  });

  app.get("/api/automation/ai-results", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const results = await storage.getAiResults(userId, req.query.featureKey as string);
      res.json(results);
    } catch (err) { res.status(500).json({ error: "Failed to get AI results" }); }
  });

  app.get("/api/automation/ai-results/:featureKey/latest", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await storage.getLatestAiResult(userId, req.params.featureKey);
      res.json(result || null);
    } catch (err) { res.status(500).json({ error: "Failed to get latest result" }); }
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /settings\nSitemap: https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "creatoros.replit.app") + "/sitemap.xml"
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    const domain = "https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "creatoros.replit.app");
    const urls = ["/", "/pricing", "/content", "/stream", "/money"].map(
      (path) => `<url><loc>${domain}${path}</loc><changefreq>weekly</changefreq></url>`
    ).join("");
    res.type("application/xml").send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>'
    );
  });

  app.get("/api/user/export", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [user, channels, videos, goals, deals, expenses, aiResults] = await Promise.all([
        storage.getUser(userId),
        storage.getChannels(userId),
        storage.getVideos(userId),
        storage.getGoals(userId),
        storage.getDeals(userId),
        storage.getExpenses(userId),
        storage.getAiResults(userId),
      ]);
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: user ? { id: user.id, role: user.role, tier: user.tier, contentNiche: user.contentNiche } : null,
        channels,
        videos,
        goals,
        deals,
        expenses,
        aiResults,
      };
      res.setHeader("Content-Disposition", "attachment; filename=creatoros-export.json");
      res.setHeader("Content-Type", "application/json");
      res.json(exportData);
    } catch (e: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  initAutomationEngine().catch(console.error);

  return httpServer;
}
