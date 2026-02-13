import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = Record<string, unknown> | null;

export default function MoneyAIToolSuites() {
  const { toast } = useToast();

  const [aiMoneyToolsOpen, setAiMoneyToolsOpen] = useState(false);
  const [showMonetizationAI, setShowMonetizationAI] = useState(false);
  const [showBusinessAI, setShowBusinessAI] = useState(false);
  const [aiAdRevenue, setAiAdRevenue] = useState<AIResponse>(null);
  const [aiAdRevenueLoading, setAiAdRevenueLoading] = useState(false);
  const [aiAdPlace, setAiAdPlace] = useState<AIResponse>(null);
  const [aiAdPlaceLoading, setAiAdPlaceLoading] = useState(false);
  const [aiCPM, setAiCPM] = useState<AIResponse>(null);
  const [aiCPMLoading, setAiCPMLoading] = useState(false);
  const [aiSponsorPrice, setAiSponsorPrice] = useState<AIResponse>(null);
  const [aiSponsorPriceLoading, setAiSponsorPriceLoading] = useState(false);
  const [aiSponsorOutreach, setAiSponsorOutreach] = useState<AIResponse>(null);
  const [aiSponsorOutreachLoading, setAiSponsorOutreachLoading] = useState(false);
  const [aiSponsorNeg, setAiSponsorNeg] = useState<AIResponse>(null);
  const [aiSponsorNegLoading, setAiSponsorNegLoading] = useState(false);
  const [aiSponsorDeliv, setAiSponsorDeliv] = useState<AIResponse>(null);
  const [aiSponsorDelivLoading, setAiSponsorDelivLoading] = useState(false);
  const [aiAffiliate, setAiAffiliate] = useState<AIResponse>(null);
  const [aiAffiliateLoading, setAiAffiliateLoading] = useState(false);
  const [aiMerch, setAiMerch] = useState<AIResponse>(null);
  const [aiMerchLoading, setAiMerchLoading] = useState(false);
  const [aiMemberTiers, setAiMemberTiers] = useState<AIResponse>(null);
  const [aiMemberTiersLoading, setAiMemberTiersLoading] = useState(false);
  const [aiDigitalProd, setAiDigitalProd] = useState<AIResponse>(null);
  const [aiDigitalProdLoading, setAiDigitalProdLoading] = useState(false);
  const [aiCourse, setAiCourse] = useState<AIResponse>(null);
  const [aiCourseLoading, setAiCourseLoading] = useState(false);
  const [aiPatreon, setAiPatreon] = useState<AIResponse>(null);
  const [aiPatreonLoading, setAiPatreonLoading] = useState(false);
  const [aiSuperChat, setAiSuperChat] = useState<AIResponse>(null);
  const [aiSuperChatLoading, setAiSuperChatLoading] = useState(false);
  const [aiMemberGrowth, setAiMemberGrowth] = useState<AIResponse>(null);
  const [aiMemberGrowthLoading, setAiMemberGrowthLoading] = useState(false);
  const [aiRevStreams, setAiRevStreams] = useState<AIResponse>(null);
  const [aiRevStreamsLoading, setAiRevStreamsLoading] = useState(false);
  const [aiInvoice, setAiInvoice] = useState<AIResponse>(null);
  const [aiInvoiceLoading, setAiInvoiceLoading] = useState(false);
  const [aiContract, setAiContract] = useState<AIResponse>(null);
  const [aiContractLoading, setAiContractLoading] = useState(false);
  const [aiTaxDeduct, setAiTaxDeduct] = useState<AIResponse>(null);
  const [aiTaxDeductLoading, setAiTaxDeductLoading] = useState(false);
  const [aiQuarterlyTax, setAiQuarterlyTax] = useState<AIResponse>(null);
  const [aiQuarterlyTaxLoading, setAiQuarterlyTaxLoading] = useState(false);
  const [aiBrandDeal, setAiBrandDeal] = useState<AIResponse>(null);
  const [aiBrandDealLoading, setAiBrandDealLoading] = useState(false);
  const [aiMediaKitEnh, setAiMediaKitEnh] = useState<AIResponse>(null);
  const [aiMediaKitEnhLoading, setAiMediaKitEnhLoading] = useState(false);
  const [aiRateCard, setAiRateCard] = useState<AIResponse>(null);
  const [aiRateCardLoading, setAiRateCardLoading] = useState(false);
  const [aiSponsorROI, setAiSponsorROI] = useState<AIResponse>(null);
  const [aiSponsorROILoading, setAiSponsorROILoading] = useState(false);
  const [aiPassiveIncome, setAiPassiveIncome] = useState<AIResponse>(null);
  const [aiPassiveIncomeLoading, setAiPassiveIncomeLoading] = useState(false);
  const [aiPricing, setAiPricing] = useState<AIResponse>(null);
  const [aiPricingLoading, setAiPricingLoading] = useState(false);
  const [aiRevAttrib, setAiRevAttrib] = useState<AIResponse>(null);
  const [aiRevAttribLoading, setAiRevAttribLoading] = useState(false);
  const [aiDonation, setAiDonation] = useState<AIResponse>(null);
  const [aiDonationLoading, setAiDonationLoading] = useState(false);
  const [aiCrowdfund, setAiCrowdfund] = useState<AIResponse>(null);
  const [aiCrowdfundLoading, setAiCrowdfundLoading] = useState(false);
  const [aiLicensing, setAiLicensing] = useState<AIResponse>(null);
  const [aiLicensingLoading, setAiLicensingLoading] = useState(false);
  const [aiBookDeal, setAiBookDeal] = useState<AIResponse>(null);
  const [aiBookDealLoading, setAiBookDealLoading] = useState(false);
  const [aiSpeakFees, setAiSpeakFees] = useState<AIResponse>(null);
  const [aiSpeakFeesLoading, setAiSpeakFeesLoading] = useState(false);
  const [aiConsulting, setAiConsulting] = useState<AIResponse>(null);
  const [aiConsultingLoading, setAiConsultingLoading] = useState(false);
  const [aiExpenseAI, setAiExpenseAI] = useState<AIResponse>(null);
  const [aiExpenseAILoading, setAiExpenseAILoading] = useState(false);
  const [aiProfitMargin, setAiProfitMargin] = useState<AIResponse>(null);
  const [aiProfitMarginLoading, setAiProfitMarginLoading] = useState(false);
  const [aiCashFlow, setAiCashFlow] = useState<AIResponse>(null);
  const [aiCashFlowLoading, setAiCashFlowLoading] = useState(false);
  const [aiPayGateway, setAiPayGateway] = useState<AIResponse>(null);
  const [aiPayGatewayLoading, setAiPayGatewayLoading] = useState(false);
  const [aiSubBox, setAiSubBox] = useState<AIResponse>(null);
  const [aiSubBoxLoading, setAiSubBoxLoading] = useState(false);
  const [aiNFT, setAiNFT] = useState<AIResponse>(null);
  const [aiNFTLoading, setAiNFTLoading] = useState(false);
  const [aiRevGoals, setAiRevGoals] = useState<AIResponse>(null);
  const [aiRevGoalsLoading, setAiRevGoalsLoading] = useState(false);

  const [showEcommerceAI, setShowEcommerceAI] = useState(false);
  const [aiSocProof, setAiSocProof] = useState<AIResponse>(null);
  const [aiSocProofLoading, setAiSocProofLoading] = useState(false);
  const [aiTestVid, setAiTestVid] = useState<AIResponse>(null);
  const [aiTestVidLoading, setAiTestVidLoading] = useState(false);
  const [aiCaseVid, setAiCaseVid] = useState<AIResponse>(null);
  const [aiCaseVidLoading, setAiCaseVidLoading] = useState(false);
  const [aiBeforeAfter, setAiBeforeAfter] = useState<AIResponse>(null);
  const [aiBeforeAfterLoading, setAiBeforeAfterLoading] = useState(false);
  const [aiInflScore, setAiInflScore] = useState<AIResponse>(null);
  const [aiInflScoreLoading, setAiInflScoreLoading] = useState(false);
  const [aiCredibility, setAiCredibility] = useState<AIResponse>(null);
  const [aiCredibilityLoading, setAiCredibilityLoading] = useState(false);
  const [aiReviewMgr, setAiReviewMgr] = useState<AIResponse>(null);
  const [aiReviewMgrLoading, setAiReviewMgrLoading] = useState(false);
  const [aiRefPage, setAiRefPage] = useState<AIResponse>(null);
  const [aiRefPageLoading, setAiRefPageLoading] = useState(false);
  const [aiEcomStore, setAiEcomStore] = useState<AIResponse>(null);
  const [aiEcomStoreLoading, setAiEcomStoreLoading] = useState(false);
  const [aiDropship, setAiDropship] = useState<AIResponse>(null);
  const [aiDropshipLoading, setAiDropshipLoading] = useState(false);
  const [aiPOD, setAiPOD] = useState<AIResponse>(null);
  const [aiPODLoading, setAiPODLoading] = useState(false);
  const [aiDigDownload, setAiDigDownload] = useState<AIResponse>(null);
  const [aiDigDownloadLoading, setAiDigDownloadLoading] = useState(false);
  const [aiAffPage, setAiAffPage] = useState<AIResponse>(null);
  const [aiAffPageLoading, setAiAffPageLoading] = useState(false);
  const [aiUpsell, setAiUpsell] = useState<AIResponse>(null);
  const [aiUpsellLoading, setAiUpsellLoading] = useState(false);
  const [aiCartRecov, setAiCartRecov] = useState<AIResponse>(null);
  const [aiCartRecovLoading, setAiCartRecovLoading] = useState(false);
  const [aiCustJourney, setAiCustJourney] = useState<AIResponse>(null);
  const [aiCustJourneyLoading, setAiCustJourneyLoading] = useState(false);
  const [aiProdBundle, setAiProdBundle] = useState<AIResponse>(null);
  const [aiProdBundleLoading, setAiProdBundleLoading] = useState(false);
  const [aiFlashSale, setAiFlashSale] = useState<AIResponse>(null);
  const [aiFlashSaleLoading, setAiFlashSaleLoading] = useState(false);
  const [aiLoyaltyRew, setAiLoyaltyRew] = useState<AIResponse>(null);
  const [aiLoyaltyRewLoading, setAiLoyaltyRewLoading] = useState(false);
  const [aiSubModel, setAiSubModel] = useState<AIResponse>(null);
  const [aiSubModelLoading, setAiSubModelLoading] = useState(false);
  const [aiPricePg, setAiPricePg] = useState<AIResponse>(null);
  const [aiPricePgLoading, setAiPricePgLoading] = useState(false);
  const [aiCheckout, setAiCheckout] = useState<AIResponse>(null);
  const [aiCheckoutLoading, setAiCheckoutLoading] = useState(false);
  const [aiInventory, setAiInventory] = useState<AIResponse>(null);
  const [aiInventoryLoading, setAiInventoryLoading] = useState(false);
  const [aiShipping, setAiShipping] = useState<AIResponse>(null);
  const [aiShippingLoading, setAiShippingLoading] = useState(false);

  const [showFinPlanAI, setShowFinPlanAI] = useState(false);
  const [aiRetirementFP, setAiRetirementFP] = useState<AIResponse>(null);
  const [aiRetirementFPLoading, setAiRetirementFPLoading] = useState(false);
  const [aiEmergFund, setAiEmergFund] = useState<AIResponse>(null);
  const [aiEmergFundLoading, setAiEmergFundLoading] = useState(false);
  const [aiInvestmentFP, setAiInvestmentFP] = useState<AIResponse>(null);
  const [aiInvestmentFPLoading, setAiInvestmentFPLoading] = useState(false);
  const [aiDebtPayoff, setAiDebtPayoff] = useState<AIResponse>(null);
  const [aiDebtPayoffLoading, setAiDebtPayoffLoading] = useState(false);
  const [aiInsuranceFP, setAiInsuranceFP] = useState<AIResponse>(null);
  const [aiInsuranceFPLoading, setAiInsuranceFPLoading] = useState(false);
  const [aiRealEstate, setAiRealEstate] = useState<AIResponse>(null);
  const [aiRealEstateLoading, setAiRealEstateLoading] = useState(false);
  const [aiCryptoFP, setAiCryptoFP] = useState<AIResponse>(null);
  const [aiCryptoFPLoading, setAiCryptoFPLoading] = useState(false);
  const [aiPassiveIncFP, setAiPassiveIncFP] = useState<AIResponse>(null);
  const [aiPassiveIncFPLoading, setAiPassiveIncFPLoading] = useState(false);
  const [aiFreelancePrice, setAiFreelancePrice] = useState<AIResponse>(null);
  const [aiFreelancePriceLoading, setAiFreelancePriceLoading] = useState(false);
  const [aiGrantFind, setAiGrantFind] = useState<AIResponse>(null);
  const [aiGrantFindLoading, setAiGrantFindLoading] = useState(false);
  const [aiCrowdfundFP, setAiCrowdfundFP] = useState<AIResponse>(null);
  const [aiCrowdfundFPLoading, setAiCrowdfundFPLoading] = useState(false);
  const [aiRevDiversify, setAiRevDiversify] = useState<AIResponse>(null);
  const [aiRevDiversifyLoading, setAiRevDiversifyLoading] = useState(false);
  const [aiBudgetTrack, setAiBudgetTrack] = useState<AIResponse>(null);
  const [aiBudgetTrackLoading, setAiBudgetTrackLoading] = useState(false);
  const [aiFinGoals, setAiFinGoals] = useState<AIResponse>(null);
  const [aiFinGoalsLoading, setAiFinGoalsLoading] = useState(false);

  const [showRevIntelAI, setShowRevIntelAI] = useState(false);
  const [aiDealNegCoach, setAiDealNegCoach] = useState<AIResponse>(null);
  const [aiDealNegCoachLoading, setAiDealNegCoachLoading] = useState(false);
  const [aiMerchDemand, setAiMerchDemand] = useState<AIResponse>(null);
  const [aiMerchDemandLoading, setAiMerchDemandLoading] = useState(false);
  const [aiRevStreamOpt, setAiRevStreamOpt] = useState<AIResponse>(null);
  const [aiRevStreamOptLoading, setAiRevStreamOptLoading] = useState(false);
  const [aiMemberTierDesign, setAiMemberTierDesign] = useState<AIResponse>(null);
  const [aiMemberTierDesignLoading, setAiMemberTierDesignLoading] = useState(false);
  const [aiAffLinkMgr, setAiAffLinkMgr] = useState<AIResponse>(null);
  const [aiAffLinkMgrLoading, setAiAffLinkMgrLoading] = useState(false);
  const [aiSponsorRateCalc, setAiSponsorRateCalc] = useState<AIResponse>(null);
  const [aiSponsorRateCalcLoading, setAiSponsorRateCalcLoading] = useState(false);

  const [showBrandGrowthAI, setShowBrandGrowthAI] = useState(false);
  const [aiBrandAuditor, setAiBrandAuditor] = useState<AIResponse>(null);
  const [aiBrandAuditorLoading, setAiBrandAuditorLoading] = useState(false);
  const [aiBrandVoice, setAiBrandVoice] = useState<AIResponse>(null);
  const [aiBrandVoiceLoading, setAiBrandVoiceLoading] = useState(false);
  const [aiBrandPartnership, setAiBrandPartnership] = useState<AIResponse>(null);
  const [aiBrandPartnershipLoading, setAiBrandPartnershipLoading] = useState(false);
  const [aiMediaKitUpdate, setAiMediaKitUpdate] = useState<AIResponse>(null);
  const [aiMediaKitUpdateLoading, setAiMediaKitUpdateLoading] = useState(false);
  const [aiCourseProdPlan, setAiCourseProdPlan] = useState<AIResponse>(null);
  const [aiCourseProdPlanLoading, setAiCourseProdPlanLoading] = useState(false);


  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_ad_revenue");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAdRevenue(e.data); return; } else { sessionStorage.removeItem("ai_ad_revenue"); } } catch {} }
    setAiAdRevenueLoading(true);
    apiRequest("POST", "/api/ai/ad-revenue", {}).then(r => r.json()).then(d => { setAiAdRevenue(d); sessionStorage.setItem("ai_ad_revenue", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAdRevenueLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_ad_place");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAdPlace(e.data); return; } else { sessionStorage.removeItem("ai_ad_place"); } } catch {} }
    setAiAdPlaceLoading(true);
    apiRequest("POST", "/api/ai/ad-placement", {}).then(r => r.json()).then(d => { setAiAdPlace(d); sessionStorage.setItem("ai_ad_place", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAdPlaceLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_cpm");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCPM(e.data); return; } else { sessionStorage.removeItem("ai_cpm"); } } catch {} }
    setAiCPMLoading(true);
    apiRequest("POST", "/api/ai/cpm-maximizer", {}).then(r => r.json()).then(d => { setAiCPM(d); sessionStorage.setItem("ai_cpm", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCPMLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_price");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorPrice(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_price"); } } catch {} }
    setAiSponsorPriceLoading(true);
    apiRequest("POST", "/api/ai/sponsor-pricing", {}).then(r => r.json()).then(d => { setAiSponsorPrice(d); sessionStorage.setItem("ai_sponsor_price", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorPriceLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_outreach");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorOutreach(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_outreach"); } } catch {} }
    setAiSponsorOutreachLoading(true);
    apiRequest("POST", "/api/ai/sponsor-outreach", {}).then(r => r.json()).then(d => { setAiSponsorOutreach(d); sessionStorage.setItem("ai_sponsor_outreach", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorOutreachLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_neg");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorNeg(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_neg"); } } catch {} }
    setAiSponsorNegLoading(true);
    apiRequest("POST", "/api/ai/sponsor-negotiation", {}).then(r => r.json()).then(d => { setAiSponsorNeg(d); sessionStorage.setItem("ai_sponsor_neg", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorNegLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_deliv");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorDeliv(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_deliv"); } } catch {} }
    setAiSponsorDelivLoading(true);
    apiRequest("POST", "/api/ai/sponsor-deliverables", {}).then(r => r.json()).then(d => { setAiSponsorDeliv(d); sessionStorage.setItem("ai_sponsor_deliv", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorDelivLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_affiliate");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAffiliate(e.data); return; } else { sessionStorage.removeItem("ai_affiliate"); } } catch {} }
    setAiAffiliateLoading(true);
    apiRequest("POST", "/api/ai/affiliate-optimizer", {}).then(r => r.json()).then(d => { setAiAffiliate(d); sessionStorage.setItem("ai_affiliate", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAffiliateLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_merch");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMerch(e.data); return; } else { sessionStorage.removeItem("ai_merch"); } } catch {} }
    setAiMerchLoading(true);
    apiRequest("POST", "/api/ai/merchandise", {}).then(r => r.json()).then(d => { setAiMerch(d); sessionStorage.setItem("ai_merch", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMerchLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_member_tiers");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMemberTiers(e.data); return; } else { sessionStorage.removeItem("ai_member_tiers"); } } catch {} }
    setAiMemberTiersLoading(true);
    apiRequest("POST", "/api/ai/membership-tiers", {}).then(r => r.json()).then(d => { setAiMemberTiers(d); sessionStorage.setItem("ai_member_tiers", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMemberTiersLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_digital_prod");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDigitalProd(e.data); return; } else { sessionStorage.removeItem("ai_digital_prod"); } } catch {} }
    setAiDigitalProdLoading(true);
    apiRequest("POST", "/api/ai/digital-products", {}).then(r => r.json()).then(d => { setAiDigitalProd(d); sessionStorage.setItem("ai_digital_prod", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDigitalProdLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_course");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCourse(e.data); return; } else { sessionStorage.removeItem("ai_course"); } } catch {} }
    setAiCourseLoading(true);
    apiRequest("POST", "/api/ai/course-builder", {}).then(r => r.json()).then(d => { setAiCourse(d); sessionStorage.setItem("ai_course", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCourseLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_patreon");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPatreon(e.data); return; } else { sessionStorage.removeItem("ai_patreon"); } } catch {} }
    setAiPatreonLoading(true);
    apiRequest("POST", "/api/ai/patreon", {}).then(r => r.json()).then(d => { setAiPatreon(d); sessionStorage.setItem("ai_patreon", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPatreonLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_super_chat");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSuperChat(e.data); return; } else { sessionStorage.removeItem("ai_super_chat"); } } catch {} }
    setAiSuperChatLoading(true);
    apiRequest("POST", "/api/ai/super-chat", {}).then(r => r.json()).then(d => { setAiSuperChat(d); sessionStorage.setItem("ai_super_chat", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSuperChatLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_member_growth");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMemberGrowth(e.data); return; } else { sessionStorage.removeItem("ai_member_growth"); } } catch {} }
    setAiMemberGrowthLoading(true);
    apiRequest("POST", "/api/ai/membership-growth", {}).then(r => r.json()).then(d => { setAiMemberGrowth(d); sessionStorage.setItem("ai_member_growth", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMemberGrowthLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rev_streams");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevStreams(e.data); return; } else { sessionStorage.removeItem("ai_rev_streams"); } } catch {} }
    setAiRevStreamsLoading(true);
    apiRequest("POST", "/api/ai/revenue-streams", {}).then(r => r.json()).then(d => { setAiRevStreams(d); sessionStorage.setItem("ai_rev_streams", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRevStreamsLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_invoice");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInvoice(e.data); return; } else { sessionStorage.removeItem("ai_invoice"); } } catch {} }
    setAiInvoiceLoading(true);
    apiRequest("POST", "/api/ai/invoice", {}).then(r => r.json()).then(d => { setAiInvoice(d); sessionStorage.setItem("ai_invoice", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInvoiceLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_contract");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContract(e.data); return; } else { sessionStorage.removeItem("ai_contract"); } } catch {} }
    setAiContractLoading(true);
    apiRequest("POST", "/api/ai/contract-review", {}).then(r => r.json()).then(d => { setAiContract(d); sessionStorage.setItem("ai_contract", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiContractLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_tax_deduct");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTaxDeduct(e.data); return; } else { sessionStorage.removeItem("ai_tax_deduct"); } } catch {} }
    setAiTaxDeductLoading(true);
    apiRequest("POST", "/api/ai/tax-deductions", {}).then(r => r.json()).then(d => { setAiTaxDeduct(d); sessionStorage.setItem("ai_tax_deduct", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTaxDeductLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_quarterly_tax");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiQuarterlyTax(e.data); return; } else { sessionStorage.removeItem("ai_quarterly_tax"); } } catch {} }
    setAiQuarterlyTaxLoading(true);
    apiRequest("POST", "/api/ai/quarterly-tax", {}).then(r => r.json()).then(d => { setAiQuarterlyTax(d); sessionStorage.setItem("ai_quarterly_tax", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiQuarterlyTaxLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_brand_deal");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandDeal(e.data); return; } else { sessionStorage.removeItem("ai_brand_deal"); } } catch {} }
    setAiBrandDealLoading(true);
    apiRequest("POST", "/api/ai/brand-deal", {}).then(r => r.json()).then(d => { setAiBrandDeal(d); sessionStorage.setItem("ai_brand_deal", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBrandDealLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_media_kit_enh");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMediaKitEnh(e.data); return; } else { sessionStorage.removeItem("ai_media_kit_enh"); } } catch {} }
    setAiMediaKitEnhLoading(true);
    apiRequest("POST", "/api/ai/media-kit-enhance", {}).then(r => r.json()).then(d => { setAiMediaKitEnh(d); sessionStorage.setItem("ai_media_kit_enh", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMediaKitEnhLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rate_card");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRateCard(e.data); return; } else { sessionStorage.removeItem("ai_rate_card"); } } catch {} }
    setAiRateCardLoading(true);
    apiRequest("POST", "/api/ai/rate-card", {}).then(r => r.json()).then(d => { setAiRateCard(d); sessionStorage.setItem("ai_rate_card", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRateCardLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_roi");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorROI(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_roi"); } } catch {} }
    setAiSponsorROILoading(true);
    apiRequest("POST", "/api/ai/sponsor-roi", {}).then(r => r.json()).then(d => { setAiSponsorROI(d); sessionStorage.setItem("ai_sponsor_roi", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorROILoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_passive_income");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPassiveIncome(e.data); return; } else { sessionStorage.removeItem("ai_passive_income"); } } catch {} }
    setAiPassiveIncomeLoading(true);
    apiRequest("POST", "/api/ai/passive-income", {}).then(r => r.json()).then(d => { setAiPassiveIncome(d); sessionStorage.setItem("ai_passive_income", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPassiveIncomeLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_pricing");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPricing(e.data); return; } else { sessionStorage.removeItem("ai_pricing"); } } catch {} }
    setAiPricingLoading(true);
    apiRequest("POST", "/api/ai/pricing-strategy", {}).then(r => r.json()).then(d => { setAiPricing(d); sessionStorage.setItem("ai_pricing", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPricingLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rev_attrib");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevAttrib(e.data); return; } else { sessionStorage.removeItem("ai_rev_attrib"); } } catch {} }
    setAiRevAttribLoading(true);
    apiRequest("POST", "/api/ai/revenue-attribution", {}).then(r => r.json()).then(d => { setAiRevAttrib(d); sessionStorage.setItem("ai_rev_attrib", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRevAttribLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_donation");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDonation(e.data); return; } else { sessionStorage.removeItem("ai_donation"); } } catch {} }
    setAiDonationLoading(true);
    apiRequest("POST", "/api/ai/donation-optimizer", {}).then(r => r.json()).then(d => { setAiDonation(d); sessionStorage.setItem("ai_donation", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDonationLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_crowdfund");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrowdfund(e.data); return; } else { sessionStorage.removeItem("ai_crowdfund"); } } catch {} }
    setAiCrowdfundLoading(true);
    apiRequest("POST", "/api/ai/crowdfunding", {}).then(r => r.json()).then(d => { setAiCrowdfund(d); sessionStorage.setItem("ai_crowdfund", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCrowdfundLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_licensing");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLicensing(e.data); return; } else { sessionStorage.removeItem("ai_licensing"); } } catch {} }
    setAiLicensingLoading(true);
    apiRequest("POST", "/api/ai/licensing", {}).then(r => r.json()).then(d => { setAiLicensing(d); sessionStorage.setItem("ai_licensing", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiLicensingLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_book_deal");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBookDeal(e.data); return; } else { sessionStorage.removeItem("ai_book_deal"); } } catch {} }
    setAiBookDealLoading(true);
    apiRequest("POST", "/api/ai/book-deal", {}).then(r => r.json()).then(d => { setAiBookDeal(d); sessionStorage.setItem("ai_book_deal", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBookDealLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_speak_fees");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSpeakFees(e.data); return; } else { sessionStorage.removeItem("ai_speak_fees"); } } catch {} }
    setAiSpeakFeesLoading(true);
    apiRequest("POST", "/api/ai/speaking-fees", {}).then(r => r.json()).then(d => { setAiSpeakFees(d); sessionStorage.setItem("ai_speak_fees", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSpeakFeesLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_consulting");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiConsulting(e.data); return; } else { sessionStorage.removeItem("ai_consulting"); } } catch {} }
    setAiConsultingLoading(true);
    apiRequest("POST", "/api/ai/consulting", {}).then(r => r.json()).then(d => { setAiConsulting(d); sessionStorage.setItem("ai_consulting", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiConsultingLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_expense_ai");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiExpenseAI(e.data); return; } else { sessionStorage.removeItem("ai_expense_ai"); } } catch {} }
    setAiExpenseAILoading(true);
    apiRequest("POST", "/api/ai/expense-tracker-ai", {}).then(r => r.json()).then(d => { setAiExpenseAI(d); sessionStorage.setItem("ai_expense_ai", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiExpenseAILoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_profit_margin");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiProfitMargin(e.data); return; } else { sessionStorage.removeItem("ai_profit_margin"); } } catch {} }
    setAiProfitMarginLoading(true);
    apiRequest("POST", "/api/ai/profit-margin", {}).then(r => r.json()).then(d => { setAiProfitMargin(d); sessionStorage.setItem("ai_profit_margin", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiProfitMarginLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_cash_flow");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCashFlow(e.data); return; } else { sessionStorage.removeItem("ai_cash_flow"); } } catch {} }
    setAiCashFlowLoading(true);
    apiRequest("POST", "/api/ai/cash-flow", {}).then(r => r.json()).then(d => { setAiCashFlow(d); sessionStorage.setItem("ai_cash_flow", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCashFlowLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_pay_gateway");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPayGateway(e.data); return; } else { sessionStorage.removeItem("ai_pay_gateway"); } } catch {} }
    setAiPayGatewayLoading(true);
    apiRequest("POST", "/api/ai/payment-gateway", {}).then(r => r.json()).then(d => { setAiPayGateway(d); sessionStorage.setItem("ai_pay_gateway", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPayGatewayLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sub_box");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSubBox(e.data); return; } else { sessionStorage.removeItem("ai_sub_box"); } } catch {} }
    setAiSubBoxLoading(true);
    apiRequest("POST", "/api/ai/subscription-box", {}).then(r => r.json()).then(d => { setAiSubBox(d); sessionStorage.setItem("ai_sub_box", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSubBoxLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_nft");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNFT(e.data); return; } else { sessionStorage.removeItem("ai_nft"); } } catch {} }
    setAiNFTLoading(true);
    apiRequest("POST", "/api/ai/nft-advisor", {}).then(r => r.json()).then(d => { setAiNFT(d); sessionStorage.setItem("ai_nft", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiNFTLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rev_goals");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevGoals(e.data); return; } else { sessionStorage.removeItem("ai_rev_goals"); } } catch {} }
    setAiRevGoalsLoading(true);
    apiRequest("POST", "/api/ai/revenue-goals", {}).then(r => r.json()).then(d => { setAiRevGoals(d); sessionStorage.setItem("ai_rev_goals", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRevGoalsLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_soc_proof");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSocProof(e.data); return; } else { sessionStorage.removeItem("ai_soc_proof"); } } catch {} }
    setAiSocProofLoading(true);
    apiRequest("POST", "/api/ai/social-proof", {}).then(r => r.json()).then(d => { setAiSocProof(d); sessionStorage.setItem("ai_soc_proof", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSocProofLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_test_vid");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTestVid(e.data); return; } else { sessionStorage.removeItem("ai_test_vid"); } } catch {} }
    setAiTestVidLoading(true);
    apiRequest("POST", "/api/ai/testimonial-video", {}).then(r => r.json()).then(d => { setAiTestVid(d); sessionStorage.setItem("ai_test_vid", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTestVidLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_case_vid");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCaseVid(e.data); return; } else { sessionStorage.removeItem("ai_case_vid"); } } catch {} }
    setAiCaseVidLoading(true);
    apiRequest("POST", "/api/ai/case-study-video", {}).then(r => r.json()).then(d => { setAiCaseVid(d); sessionStorage.setItem("ai_case_vid", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCaseVidLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_before_after");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBeforeAfter(e.data); return; } else { sessionStorage.removeItem("ai_before_after"); } } catch {} }
    setAiBeforeAfterLoading(true);
    apiRequest("POST", "/api/ai/before-after", {}).then(r => r.json()).then(d => { setAiBeforeAfter(d); sessionStorage.setItem("ai_before_after", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBeforeAfterLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_infl_score");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInflScore(e.data); return; } else { sessionStorage.removeItem("ai_infl_score"); } } catch {} }
    setAiInflScoreLoading(true);
    apiRequest("POST", "/api/ai/influencer-score", {}).then(r => r.json()).then(d => { setAiInflScore(d); sessionStorage.setItem("ai_infl_score", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInflScoreLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_credibility");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCredibility(e.data); return; } else { sessionStorage.removeItem("ai_credibility"); } } catch {} }
    setAiCredibilityLoading(true);
    apiRequest("POST", "/api/ai/credibility", {}).then(r => r.json()).then(d => { setAiCredibility(d); sessionStorage.setItem("ai_credibility", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCredibilityLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_review_mgr");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiReviewMgr(e.data); return; } else { sessionStorage.removeItem("ai_review_mgr"); } } catch {} }
    setAiReviewMgrLoading(true);
    apiRequest("POST", "/api/ai/review-manager", {}).then(r => r.json()).then(d => { setAiReviewMgr(d); sessionStorage.setItem("ai_review_mgr", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiReviewMgrLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_ref_page");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRefPage(e.data); return; } else { sessionStorage.removeItem("ai_ref_page"); } } catch {} }
    setAiRefPageLoading(true);
    apiRequest("POST", "/api/ai/reference-page", {}).then(r => r.json()).then(d => { setAiRefPage(d); sessionStorage.setItem("ai_ref_page", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRefPageLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_ecom_store");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEcomStore(e.data); return; } else { sessionStorage.removeItem("ai_ecom_store"); } } catch {} }
    setAiEcomStoreLoading(true);
    apiRequest("POST", "/api/ai/ecommerce-store", {}).then(r => r.json()).then(d => { setAiEcomStore(d); sessionStorage.setItem("ai_ecom_store", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiEcomStoreLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_dropship");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDropship(e.data); return; } else { sessionStorage.removeItem("ai_dropship"); } } catch {} }
    setAiDropshipLoading(true);
    apiRequest("POST", "/api/ai/dropshipping", {}).then(r => r.json()).then(d => { setAiDropship(d); sessionStorage.setItem("ai_dropship", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDropshipLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_pod");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPOD(e.data); return; } else { sessionStorage.removeItem("ai_pod"); } } catch {} }
    setAiPODLoading(true);
    apiRequest("POST", "/api/ai/print-on-demand", {}).then(r => r.json()).then(d => { setAiPOD(d); sessionStorage.setItem("ai_pod", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPODLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_dig_download");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDigDownload(e.data); return; } else { sessionStorage.removeItem("ai_dig_download"); } } catch {} }
    setAiDigDownloadLoading(true);
    apiRequest("POST", "/api/ai/digital-download", {}).then(r => r.json()).then(d => { setAiDigDownload(d); sessionStorage.setItem("ai_dig_download", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDigDownloadLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_aff_page");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAffPage(e.data); return; } else { sessionStorage.removeItem("ai_aff_page"); } } catch {} }
    setAiAffPageLoading(true);
    apiRequest("POST", "/api/ai/affiliate-page", {}).then(r => r.json()).then(d => { setAiAffPage(d); sessionStorage.setItem("ai_aff_page", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAffPageLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_upsell");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiUpsell(e.data); return; } else { sessionStorage.removeItem("ai_upsell"); } } catch {} }
    setAiUpsellLoading(true);
    apiRequest("POST", "/api/ai/upsell", {}).then(r => r.json()).then(d => { setAiUpsell(d); sessionStorage.setItem("ai_upsell", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiUpsellLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_cart_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCartRecov(e.data); return; } else { sessionStorage.removeItem("ai_cart_recov"); } } catch {} }
    setAiCartRecovLoading(true);
    apiRequest("POST", "/api/ai/cart-recovery", {}).then(r => r.json()).then(d => { setAiCartRecov(d); sessionStorage.setItem("ai_cart_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCartRecovLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_cust_journey");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCustJourney(e.data); return; } else { sessionStorage.removeItem("ai_cust_journey"); } } catch {} }
    setAiCustJourneyLoading(true);
    apiRequest("POST", "/api/ai/customer-journey", {}).then(r => r.json()).then(d => { setAiCustJourney(d); sessionStorage.setItem("ai_cust_journey", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCustJourneyLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_prod_bundle");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiProdBundle(e.data); return; } else { sessionStorage.removeItem("ai_prod_bundle"); } } catch {} }
    setAiProdBundleLoading(true);
    apiRequest("POST", "/api/ai/product-bundle", {}).then(r => r.json()).then(d => { setAiProdBundle(d); sessionStorage.setItem("ai_prod_bundle", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiProdBundleLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_flash_sale");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFlashSale(e.data); return; } else { sessionStorage.removeItem("ai_flash_sale"); } } catch {} }
    setAiFlashSaleLoading(true);
    apiRequest("POST", "/api/ai/flash-sale", {}).then(r => r.json()).then(d => { setAiFlashSale(d); sessionStorage.setItem("ai_flash_sale", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFlashSaleLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_loyalty_rew");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLoyaltyRew(e.data); return; } else { sessionStorage.removeItem("ai_loyalty_rew"); } } catch {} }
    setAiLoyaltyRewLoading(true);
    apiRequest("POST", "/api/ai/loyalty-rewards", {}).then(r => r.json()).then(d => { setAiLoyaltyRew(d); sessionStorage.setItem("ai_loyalty_rew", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiLoyaltyRewLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sub_model");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSubModel(e.data); return; } else { sessionStorage.removeItem("ai_sub_model"); } } catch {} }
    setAiSubModelLoading(true);
    apiRequest("POST", "/api/ai/subscription-model", {}).then(r => r.json()).then(d => { setAiSubModel(d); sessionStorage.setItem("ai_sub_model", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSubModelLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_price_pg");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPricePg(e.data); return; } else { sessionStorage.removeItem("ai_price_pg"); } } catch {} }
    setAiPricePgLoading(true);
    apiRequest("POST", "/api/ai/pricing-page", {}).then(r => r.json()).then(d => { setAiPricePg(d); sessionStorage.setItem("ai_price_pg", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPricePgLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_checkout");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCheckout(e.data); return; } else { sessionStorage.removeItem("ai_checkout"); } } catch {} }
    setAiCheckoutLoading(true);
    apiRequest("POST", "/api/ai/checkout", {}).then(r => r.json()).then(d => { setAiCheckout(d); sessionStorage.setItem("ai_checkout", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCheckoutLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_inventory");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInventory(e.data); return; } else { sessionStorage.removeItem("ai_inventory"); } } catch {} }
    setAiInventoryLoading(true);
    apiRequest("POST", "/api/ai/inventory", {}).then(r => r.json()).then(d => { setAiInventory(d); sessionStorage.setItem("ai_inventory", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInventoryLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_shipping");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiShipping(e.data); return; } else { sessionStorage.removeItem("ai_shipping"); } } catch {} }
    setAiShippingLoading(true);
    apiRequest("POST", "/api/ai/shipping", {}).then(r => r.json()).then(d => { setAiShipping(d); sessionStorage.setItem("ai_shipping", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiShippingLoading(false));
  }, [aiMoneyToolsOpen]);


  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_retirement");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRetirementFP(e.data); return; } else { sessionStorage.removeItem("ai_retirement"); } } catch {} }
    setAiRetirementFPLoading(true);
    apiRequest("POST", "/api/ai/retirement", {}).then(r => r.json()).then(d => { setAiRetirementFP(d); sessionStorage.setItem("ai_retirement", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRetirementFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_emerg_fund");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEmergFund(e.data); return; } else { sessionStorage.removeItem("ai_emerg_fund"); } } catch {} }
    setAiEmergFundLoading(true);
    apiRequest("POST", "/api/ai/emergency-fund", {}).then(r => r.json()).then(d => { setAiEmergFund(d); sessionStorage.setItem("ai_emerg_fund", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiEmergFundLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_investment");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInvestmentFP(e.data); return; } else { sessionStorage.removeItem("ai_investment"); } } catch {} }
    setAiInvestmentFPLoading(true);
    apiRequest("POST", "/api/ai/investment", {}).then(r => r.json()).then(d => { setAiInvestmentFP(d); sessionStorage.setItem("ai_investment", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInvestmentFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_debt_payoff");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDebtPayoff(e.data); return; } else { sessionStorage.removeItem("ai_debt_payoff"); } } catch {} }
    setAiDebtPayoffLoading(true);
    apiRequest("POST", "/api/ai/debt-payoff", {}).then(r => r.json()).then(d => { setAiDebtPayoff(d); sessionStorage.setItem("ai_debt_payoff", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDebtPayoffLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_insurance_fp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInsuranceFP(e.data); return; } else { sessionStorage.removeItem("ai_insurance_fp"); } } catch {} }
    setAiInsuranceFPLoading(true);
    apiRequest("POST", "/api/ai/insurance", {}).then(r => r.json()).then(d => { setAiInsuranceFP(d); sessionStorage.setItem("ai_insurance_fp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInsuranceFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_real_estate");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRealEstate(e.data); return; } else { sessionStorage.removeItem("ai_real_estate"); } } catch {} }
    setAiRealEstateLoading(true);
    apiRequest("POST", "/api/ai/real-estate", {}).then(r => r.json()).then(d => { setAiRealEstate(d); sessionStorage.setItem("ai_real_estate", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRealEstateLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_crypto");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCryptoFP(e.data); return; } else { sessionStorage.removeItem("ai_crypto"); } } catch {} }
    setAiCryptoFPLoading(true);
    apiRequest("POST", "/api/ai/crypto-portfolio", {}).then(r => r.json()).then(d => { setAiCryptoFP(d); sessionStorage.setItem("ai_crypto", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCryptoFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_passive_inc_fp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPassiveIncFP(e.data); return; } else { sessionStorage.removeItem("ai_passive_inc_fp"); } } catch {} }
    setAiPassiveIncFPLoading(true);
    apiRequest("POST", "/api/ai/passive-income", {}).then(r => r.json()).then(d => { setAiPassiveIncFP(d); sessionStorage.setItem("ai_passive_inc_fp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPassiveIncFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_freelance_price");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFreelancePrice(e.data); return; } else { sessionStorage.removeItem("ai_freelance_price"); } } catch {} }
    setAiFreelancePriceLoading(true);
    apiRequest("POST", "/api/ai/freelance-pricing", {}).then(r => r.json()).then(d => { setAiFreelancePrice(d); sessionStorage.setItem("ai_freelance_price", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFreelancePriceLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_grant_find");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGrantFind(e.data); return; } else { sessionStorage.removeItem("ai_grant_find"); } } catch {} }
    setAiGrantFindLoading(true);
    apiRequest("POST", "/api/ai/grant-finder", {}).then(r => r.json()).then(d => { setAiGrantFind(d); sessionStorage.setItem("ai_grant_find", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiGrantFindLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_crowdfund_fp");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrowdfundFP(e.data); return; } else { sessionStorage.removeItem("ai_crowdfund_fp"); } } catch {} }
    setAiCrowdfundFPLoading(true);
    apiRequest("POST", "/api/ai/crowdfunding", {}).then(r => r.json()).then(d => { setAiCrowdfundFP(d); sessionStorage.setItem("ai_crowdfund_fp", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCrowdfundFPLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rev_diversify");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevDiversify(e.data); return; } else { sessionStorage.removeItem("ai_rev_diversify"); } } catch {} }
    setAiRevDiversifyLoading(true);
    apiRequest("POST", "/api/ai/revenue-diversify", {}).then(r => r.json()).then(d => { setAiRevDiversify(d); sessionStorage.setItem("ai_rev_diversify", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRevDiversifyLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_budget_track");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBudgetTrack(e.data); return; } else { sessionStorage.removeItem("ai_budget_track"); } } catch {} }
    setAiBudgetTrackLoading(true);
    apiRequest("POST", "/api/ai/budget-tracker", {}).then(r => r.json()).then(d => { setAiBudgetTrack(d); sessionStorage.setItem("ai_budget_track", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBudgetTrackLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_fin_goals");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFinGoals(e.data); return; } else { sessionStorage.removeItem("ai_fin_goals"); } } catch {} }
    setAiFinGoalsLoading(true);
    apiRequest("POST", "/api/ai/financial-goals", {}).then(r => r.json()).then(d => { setAiFinGoals(d); sessionStorage.setItem("ai_fin_goals", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFinGoalsLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_deal_neg_coach");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDealNegCoach(e.data); return; } else { sessionStorage.removeItem("ai_deal_neg_coach"); } } catch {} }
    setAiDealNegCoachLoading(true);
    apiRequest("POST", "/api/ai/deal-negotiation-coach", {}).then(r => r.json()).then(d => { setAiDealNegCoach(d); sessionStorage.setItem("ai_deal_neg_coach", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDealNegCoachLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_merch_demand");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMerchDemand(e.data); return; } else { sessionStorage.removeItem("ai_merch_demand"); } } catch {} }
    setAiMerchDemandLoading(true);
    apiRequest("POST", "/api/ai/merch-demand-predictor", {}).then(r => r.json()).then(d => { setAiMerchDemand(d); sessionStorage.setItem("ai_merch_demand", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMerchDemandLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_rev_stream_opt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRevStreamOpt(e.data); return; } else { sessionStorage.removeItem("ai_rev_stream_opt"); } } catch {} }
    setAiRevStreamOptLoading(true);
    apiRequest("POST", "/api/ai/revenue-stream-optimizer", {}).then(r => r.json()).then(d => { setAiRevStreamOpt(d); sessionStorage.setItem("ai_rev_stream_opt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRevStreamOptLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_member_tier_design");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMemberTierDesign(e.data); return; } else { sessionStorage.removeItem("ai_member_tier_design"); } } catch {} }
    setAiMemberTierDesignLoading(true);
    apiRequest("POST", "/api/ai/membership-tier-designer", {}).then(r => r.json()).then(d => { setAiMemberTierDesign(d); sessionStorage.setItem("ai_member_tier_design", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMemberTierDesignLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_aff_link_mgr");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAffLinkMgr(e.data); return; } else { sessionStorage.removeItem("ai_aff_link_mgr"); } } catch {} }
    setAiAffLinkMgrLoading(true);
    apiRequest("POST", "/api/ai/affiliate-link-manager", {}).then(r => r.json()).then(d => { setAiAffLinkMgr(d); sessionStorage.setItem("ai_aff_link_mgr", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAffLinkMgrLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_sponsor_rate_calc");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorRateCalc(e.data); return; } else { sessionStorage.removeItem("ai_sponsor_rate_calc"); } } catch {} }
    setAiSponsorRateCalcLoading(true);
    apiRequest("POST", "/api/ai/sponsorship-rate-calculator", {}).then(r => r.json()).then(d => { setAiSponsorRateCalc(d); sessionStorage.setItem("ai_sponsor_rate_calc", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSponsorRateCalcLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_brand_auditor");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandAuditor(e.data); return; } else { sessionStorage.removeItem("ai_brand_auditor"); } } catch {} }
    setAiBrandAuditorLoading(true);
    apiRequest("POST", "/api/ai/brand-auditor", {}).then(r => r.json()).then(d => { setAiBrandAuditor(d); sessionStorage.setItem("ai_brand_auditor", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBrandAuditorLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_brand_voice");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandVoice(e.data); return; } else { sessionStorage.removeItem("ai_brand_voice"); } } catch {} }
    setAiBrandVoiceLoading(true);
    apiRequest("POST", "/api/ai/brand-voice-analyzer", {}).then(r => r.json()).then(d => { setAiBrandVoice(d); sessionStorage.setItem("ai_brand_voice", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBrandVoiceLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_brand_partnership");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandPartnership(e.data); return; } else { sessionStorage.removeItem("ai_brand_partnership"); } } catch {} }
    setAiBrandPartnershipLoading(true);
    apiRequest("POST", "/api/ai/brand-partnership-scorer", {}).then(r => r.json()).then(d => { setAiBrandPartnership(d); sessionStorage.setItem("ai_brand_partnership", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBrandPartnershipLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_media_kit_update");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMediaKitUpdate(e.data); return; } else { sessionStorage.removeItem("ai_media_kit_update"); } } catch {} }
    setAiMediaKitUpdateLoading(true);
    apiRequest("POST", "/api/ai/media-kit-auto-updater", {}).then(r => r.json()).then(d => { setAiMediaKitUpdate(d); sessionStorage.setItem("ai_media_kit_update", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMediaKitUpdateLoading(false));
  }, [aiMoneyToolsOpen]);
  useEffect(() => {
    if (!aiMoneyToolsOpen) return;
    const cached = sessionStorage.getItem("ai_course_prod_plan");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCourseProdPlan(e.data); return; } else { sessionStorage.removeItem("ai_course_prod_plan"); } } catch {} }
    setAiCourseProdPlanLoading(true);
    apiRequest("POST", "/api/ai/course-product-planner", {}).then(r => r.json()).then(d => { setAiCourseProdPlan(d); sessionStorage.setItem("ai_course_prod_plan", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCourseProdPlanLoading(false));
  }, [aiMoneyToolsOpen]);

  const renderMoneyAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <CollapsibleToolbox title="AI Money Tools" toolCount={40} open={aiMoneyToolsOpen} onOpenChange={setAiMoneyToolsOpen}>
      <div className="space-y-3">
      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowMonetizationAI(!showMonetizationAI)}
          data-testid="button-toggle-monetization-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Monetization Engine</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showMonetizationAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showMonetizationAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiAdRevenueLoading || aiAdRevenue) && (
              <Card data-testid="card-ai-ad-revenue">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ad Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdRevenueLoading ? <Skeleton className="h-24 w-full" /> : aiAdRevenue && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAdRevenue.strategies || aiAdRevenue.tips || aiAdRevenue.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAdPlaceLoading || aiAdPlace) && (
              <Card data-testid="card-ai-ad-place">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ad Placement</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdPlaceLoading ? <Skeleton className="h-24 w-full" /> : aiAdPlace && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAdPlace.placements || aiAdPlace.tips || aiAdPlace.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCPMLoading || aiCPM) && (
              <Card data-testid="card-ai-cpm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI CPM Maximizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCPMLoading ? <Skeleton className="h-24 w-full" /> : aiCPM && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCPM.strategies || aiCPM.tips || aiCPM.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorPriceLoading || aiSponsorPrice) && (
              <Card data-testid="card-ai-sponsor-price">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Pricing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorPriceLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorPrice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorPrice.pricing || aiSponsorPrice.rates || aiSponsorPrice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorOutreachLoading || aiSponsorOutreach) && (
              <Card data-testid="card-ai-sponsor-outreach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Outreach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorOutreachLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorOutreach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorOutreach.templates || aiSponsorOutreach.emails || aiSponsorOutreach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorNegLoading || aiSponsorNeg) && (
              <Card data-testid="card-ai-sponsor-neg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Negotiation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorNegLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorNeg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorNeg.tactics || aiSponsorNeg.tips || aiSponsorNeg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorDelivLoading || aiSponsorDeliv) && (
              <Card data-testid="card-ai-sponsor-deliv">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Deliverables</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorDelivLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorDeliv && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorDeliv.deliverables || aiSponsorDeliv.checklist || aiSponsorDeliv.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffiliateLoading || aiAffiliate) && (
              <Card data-testid="card-ai-affiliate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Affiliate Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffiliateLoading ? <Skeleton className="h-24 w-full" /> : aiAffiliate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAffiliate.programs || aiAffiliate.strategies || aiAffiliate.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMerchLoading || aiMerch) && (
              <Card data-testid="card-ai-merch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Merchandise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMerchLoading ? <Skeleton className="h-24 w-full" /> : aiMerch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMerch.products || aiMerch.ideas || aiMerch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberTiersLoading || aiMemberTiers) && (
              <Card data-testid="card-ai-member-tiers">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Membership Tiers</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberTiersLoading ? <Skeleton className="h-24 w-full" /> : aiMemberTiers && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMemberTiers.tiers || aiMemberTiers.plans || aiMemberTiers.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigitalProdLoading || aiDigitalProd) && (
              <Card data-testid="card-ai-digital-prod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Digital Products</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigitalProdLoading ? <Skeleton className="h-24 w-full" /> : aiDigitalProd && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDigitalProd.products || aiDigitalProd.ideas || aiDigitalProd.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCourseLoading || aiCourse) && (
              <Card data-testid="card-ai-course">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Course Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCourseLoading ? <Skeleton className="h-24 w-full" /> : aiCourse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCourse.modules || aiCourse.outline || aiCourse.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPatreonLoading || aiPatreon) && (
              <Card data-testid="card-ai-patreon">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Patreon Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPatreonLoading ? <Skeleton className="h-24 w-full" /> : aiPatreon && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPatreon.tiers || aiPatreon.strategies || aiPatreon.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSuperChatLoading || aiSuperChat) && (
              <Card data-testid="card-ai-super-chat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Super Chat</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSuperChatLoading ? <Skeleton className="h-24 w-full" /> : aiSuperChat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSuperChat.strategies || aiSuperChat.tips || aiSuperChat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberGrowthLoading || aiMemberGrowth) && (
              <Card data-testid="card-ai-member-growth">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Membership Growth</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiMemberGrowth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMemberGrowth.strategies || aiMemberGrowth.tactics || aiMemberGrowth.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevStreamsLoading || aiRevStreams) && (
              <Card data-testid="card-ai-rev-streams">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Streams</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevStreamsLoading ? <Skeleton className="h-24 w-full" /> : aiRevStreams && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevStreams.streams || aiRevStreams.ideas || aiRevStreams.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInvoiceLoading || aiInvoice) && (
              <Card data-testid="card-ai-invoice">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Invoice Generator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInvoiceLoading ? <Skeleton className="h-24 w-full" /> : aiInvoice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInvoice.templates || aiInvoice.tips || aiInvoice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContractLoading || aiContract) && (
              <Card data-testid="card-ai-contract">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Contract Review</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContractLoading ? <Skeleton className="h-24 w-full" /> : aiContract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiContract.clauses || aiContract.flags || aiContract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTaxDeductLoading || aiTaxDeduct) && (
              <Card data-testid="card-ai-tax-deduct">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Tax Deductions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTaxDeductLoading ? <Skeleton className="h-24 w-full" /> : aiTaxDeduct && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiTaxDeduct.deductions || aiTaxDeduct.categories || aiTaxDeduct.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQuarterlyTaxLoading || aiQuarterlyTax) && (
              <Card data-testid="card-ai-quarterly-tax">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Quarterly Tax</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQuarterlyTaxLoading ? <Skeleton className="h-24 w-full" /> : aiQuarterlyTax && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiQuarterlyTax.estimates || aiQuarterlyTax.schedule || aiQuarterlyTax.recommendations)}
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
          onClick={() => setShowBusinessAI(!showBusinessAI)}
          data-testid="button-toggle-business-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Business & Revenue Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showBusinessAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showBusinessAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandDealLoading || aiBrandDeal) && (
              <Card data-testid="card-ai-brand-deal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Brand Deal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandDealLoading ? <Skeleton className="h-24 w-full" /> : aiBrandDeal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBrandDeal.evaluation || aiBrandDeal.deals || aiBrandDeal.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediaKitEnhLoading || aiMediaKitEnh) && (
              <Card data-testid="card-ai-media-kit-enh">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Media Kit Enhance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediaKitEnhLoading ? <Skeleton className="h-24 w-full" /> : aiMediaKitEnh && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMediaKitEnh.sections || aiMediaKitEnh.improvements || aiMediaKitEnh.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRateCardLoading || aiRateCard) && (
              <Card data-testid="card-ai-rate-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Rate Card</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRateCardLoading ? <Skeleton className="h-24 w-full" /> : aiRateCard && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRateCard.rates || aiRateCard.packages || aiRateCard.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorROILoading || aiSponsorROI) && (
              <Card data-testid="card-ai-sponsor-roi">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor ROI</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorROILoading ? <Skeleton className="h-24 w-full" /> : aiSponsorROI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorROI.metrics || aiSponsorROI.analysis || aiSponsorROI.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPassiveIncomeLoading || aiPassiveIncome) && (
              <Card data-testid="card-ai-passive-income">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Passive Income</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPassiveIncomeLoading ? <Skeleton className="h-24 w-full" /> : aiPassiveIncome && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPassiveIncome.streams || aiPassiveIncome.ideas || aiPassiveIncome.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPricingLoading || aiPricing) && (
              <Card data-testid="card-ai-pricing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Pricing Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPricingLoading ? <Skeleton className="h-24 w-full" /> : aiPricing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPricing.strategies || aiPricing.models || aiPricing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevAttribLoading || aiRevAttrib) && (
              <Card data-testid="card-ai-rev-attrib">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Attribution</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevAttribLoading ? <Skeleton className="h-24 w-full" /> : aiRevAttrib && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevAttrib.sources || aiRevAttrib.attribution || aiRevAttrib.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDonationLoading || aiDonation) && (
              <Card data-testid="card-ai-donation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Donation Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDonationLoading ? <Skeleton className="h-24 w-full" /> : aiDonation && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDonation.strategies || aiDonation.platforms || aiDonation.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrowdfundLoading || aiCrowdfund) && (
              <Card data-testid="card-ai-crowdfund">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Crowdfunding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrowdfundLoading ? <Skeleton className="h-24 w-full" /> : aiCrowdfund && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCrowdfund.campaigns || aiCrowdfund.strategies || aiCrowdfund.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLicensingLoading || aiLicensing) && (
              <Card data-testid="card-ai-licensing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Licensing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLicensingLoading ? <Skeleton className="h-24 w-full" /> : aiLicensing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiLicensing.opportunities || aiLicensing.deals || aiLicensing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBookDealLoading || aiBookDeal) && (
              <Card data-testid="card-ai-book-deal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Book Deal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBookDealLoading ? <Skeleton className="h-24 w-full" /> : aiBookDeal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBookDeal.proposals || aiBookDeal.publishers || aiBookDeal.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSpeakFeesLoading || aiSpeakFees) && (
              <Card data-testid="card-ai-speak-fees">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Speaking Fees</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSpeakFeesLoading ? <Skeleton className="h-24 w-full" /> : aiSpeakFees && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSpeakFees.rates || aiSpeakFees.tiers || aiSpeakFees.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiConsultingLoading || aiConsulting) && (
              <Card data-testid="card-ai-consulting">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Consulting</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiConsultingLoading ? <Skeleton className="h-24 w-full" /> : aiConsulting && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiConsulting.packages || aiConsulting.services || aiConsulting.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExpenseAILoading || aiExpenseAI) && (
              <Card data-testid="card-ai-expense-ai">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Expense Tracker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExpenseAILoading ? <Skeleton className="h-24 w-full" /> : aiExpenseAI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiExpenseAI.insights || aiExpenseAI.categories || aiExpenseAI.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProfitMarginLoading || aiProfitMargin) && (
              <Card data-testid="card-ai-profit-margin">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Profit Margin</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProfitMarginLoading ? <Skeleton className="h-24 w-full" /> : aiProfitMargin && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiProfitMargin.analysis || aiProfitMargin.margins || aiProfitMargin.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCashFlowLoading || aiCashFlow) && (
              <Card data-testid="card-ai-cash-flow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Cash Flow</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCashFlowLoading ? <Skeleton className="h-24 w-full" /> : aiCashFlow && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCashFlow.forecast || aiCashFlow.projections || aiCashFlow.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPayGatewayLoading || aiPayGateway) && (
              <Card data-testid="card-ai-pay-gateway">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Payment Gateway</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPayGatewayLoading ? <Skeleton className="h-24 w-full" /> : aiPayGateway && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPayGateway.gateways || aiPayGateway.comparison || aiPayGateway.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubBoxLoading || aiSubBox) && (
              <Card data-testid="card-ai-sub-box">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Subscription Box</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubBoxLoading ? <Skeleton className="h-24 w-full" /> : aiSubBox && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSubBox.concepts || aiSubBox.items || aiSubBox.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNFTLoading || aiNFT) && (
              <Card data-testid="card-ai-nft">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI NFT Advisor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNFTLoading ? <Skeleton className="h-24 w-full" /> : aiNFT && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiNFT.strategies || aiNFT.collections || aiNFT.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevGoalsLoading || aiRevGoals) && (
              <Card data-testid="card-ai-rev-goals">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Goals</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevGoalsLoading ? <Skeleton className="h-24 w-full" /> : aiRevGoals && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevGoals.goals || aiRevGoals.milestones || aiRevGoals.recommendations)}
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
          onClick={() => setShowEcommerceAI(!showEcommerceAI)}
          data-testid="button-toggle-ecommerce-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Social Proof & Ecommerce Suite</span>
          <Badge variant="outline" className="text-[10px]">24 tools</Badge>
          {showEcommerceAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showEcommerceAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiSocProofLoading || aiSocProof) && (
              <Card data-testid="card-ai-soc-proof">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Social Proof</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSocProofLoading ? <Skeleton className="h-24 w-full" /> : aiSocProof && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSocProof.elements || aiSocProof.strategies || aiSocProof.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTestVidLoading || aiTestVid) && (
              <Card data-testid="card-ai-test-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Testimonial Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTestVidLoading ? <Skeleton className="h-24 w-full" /> : aiTestVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiTestVid.scripts || aiTestVid.templates || aiTestVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCaseVidLoading || aiCaseVid) && (
              <Card data-testid="card-ai-case-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Case Study Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaseVidLoading ? <Skeleton className="h-24 w-full" /> : aiCaseVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCaseVid.studies || aiCaseVid.templates || aiCaseVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBeforeAfterLoading || aiBeforeAfter) && (
              <Card data-testid="card-ai-before-after">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Before & After</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBeforeAfterLoading ? <Skeleton className="h-24 w-full" /> : aiBeforeAfter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBeforeAfter.comparisons || aiBeforeAfter.templates || aiBeforeAfter.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInflScoreLoading || aiInflScore) && (
              <Card data-testid="card-ai-infl-score">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Influencer Score</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInflScoreLoading ? <Skeleton className="h-24 w-full" /> : aiInflScore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInflScore.scores || aiInflScore.metrics || aiInflScore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCredibilityLoading || aiCredibility) && (
              <Card data-testid="card-ai-credibility">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Credibility</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCredibilityLoading ? <Skeleton className="h-24 w-full" /> : aiCredibility && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCredibility.factors || aiCredibility.tips || aiCredibility.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReviewMgrLoading || aiReviewMgr) && (
              <Card data-testid="card-ai-review-mgr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Review Manager</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReviewMgrLoading ? <Skeleton className="h-24 w-full" /> : aiReviewMgr && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiReviewMgr.reviews || aiReviewMgr.responses || aiReviewMgr.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRefPageLoading || aiRefPage) && (
              <Card data-testid="card-ai-ref-page">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Reference Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRefPageLoading ? <Skeleton className="h-24 w-full" /> : aiRefPage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRefPage.references || aiRefPage.layout || aiRefPage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEcomStoreLoading || aiEcomStore) && (
              <Card data-testid="card-ai-ecom-store">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ecommerce Store</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEcomStoreLoading ? <Skeleton className="h-24 w-full" /> : aiEcomStore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiEcomStore.setup || aiEcomStore.products || aiEcomStore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDropshipLoading || aiDropship) && (
              <Card data-testid="card-ai-dropship">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Dropshipping</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDropshipLoading ? <Skeleton className="h-24 w-full" /> : aiDropship && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDropship.products || aiDropship.suppliers || aiDropship.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPODLoading || aiPOD) && (
              <Card data-testid="card-ai-pod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Print on Demand</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPODLoading ? <Skeleton className="h-24 w-full" /> : aiPOD && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPOD.designs || aiPOD.products || aiPOD.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigDownloadLoading || aiDigDownload) && (
              <Card data-testid="card-ai-dig-download">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Digital Download</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigDownloadLoading ? <Skeleton className="h-24 w-full" /> : aiDigDownload && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDigDownload.products || aiDigDownload.ideas || aiDigDownload.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffPageLoading || aiAffPage) && (
              <Card data-testid="card-ai-aff-page">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Affiliate Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffPageLoading ? <Skeleton className="h-24 w-full" /> : aiAffPage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAffPage.programs || aiAffPage.links || aiAffPage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiUpsellLoading || aiUpsell) && (
              <Card data-testid="card-ai-upsell">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Upsell</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiUpsellLoading ? <Skeleton className="h-24 w-full" /> : aiUpsell && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiUpsell.strategies || aiUpsell.offers || aiUpsell.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCartRecovLoading || aiCartRecov) && (
              <Card data-testid="card-ai-cart-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Cart Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCartRecovLoading ? <Skeleton className="h-24 w-full" /> : aiCartRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCartRecov.emails || aiCartRecov.strategies || aiCartRecov.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCustJourneyLoading || aiCustJourney) && (
              <Card data-testid="card-ai-cust-journey">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Customer Journey</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCustJourneyLoading ? <Skeleton className="h-24 w-full" /> : aiCustJourney && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCustJourney.stages || aiCustJourney.touchpoints || aiCustJourney.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProdBundleLoading || aiProdBundle) && (
              <Card data-testid="card-ai-prod-bundle">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Product Bundle</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProdBundleLoading ? <Skeleton className="h-24 w-full" /> : aiProdBundle && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiProdBundle.bundles || aiProdBundle.combos || aiProdBundle.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFlashSaleLoading || aiFlashSale) && (
              <Card data-testid="card-ai-flash-sale">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Flash Sale</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFlashSaleLoading ? <Skeleton className="h-24 w-full" /> : aiFlashSale && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiFlashSale.campaigns || aiFlashSale.deals || aiFlashSale.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLoyaltyRewLoading || aiLoyaltyRew) && (
              <Card data-testid="card-ai-loyalty-rew">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Loyalty Rewards</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLoyaltyRewLoading ? <Skeleton className="h-24 w-full" /> : aiLoyaltyRew && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiLoyaltyRew.programs || aiLoyaltyRew.tiers || aiLoyaltyRew.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubModelLoading || aiSubModel) && (
              <Card data-testid="card-ai-sub-model">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Subscription Model</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubModelLoading ? <Skeleton className="h-24 w-full" /> : aiSubModel && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSubModel.models || aiSubModel.tiers || aiSubModel.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPricePgLoading || aiPricePg) && (
              <Card data-testid="card-ai-price-pg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Pricing Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPricePgLoading ? <Skeleton className="h-24 w-full" /> : aiPricePg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPricePg.strategies || aiPricePg.tiers || aiPricePg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCheckoutLoading || aiCheckout) && (
              <Card data-testid="card-ai-checkout">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Checkout</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCheckoutLoading ? <Skeleton className="h-24 w-full" /> : aiCheckout && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCheckout.optimizations || aiCheckout.flow || aiCheckout.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInventoryLoading || aiInventory) && (
              <Card data-testid="card-ai-inventory">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Inventory</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInventoryLoading ? <Skeleton className="h-24 w-full" /> : aiInventory && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInventory.tracking || aiInventory.alerts || aiInventory.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShippingLoading || aiShipping) && (
              <Card data-testid="card-ai-shipping">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Shipping</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShippingLoading ? <Skeleton className="h-24 w-full" /> : aiShipping && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiShipping.options || aiShipping.rates || aiShipping.recommendations)}
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
          onClick={() => setShowFinPlanAI(!showFinPlanAI)}
          data-testid="button-toggle-fin-plan-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Financial Planning Suite</span>
          <Badge variant="outline" className="text-[10px]">14 tools</Badge>
          {showFinPlanAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showFinPlanAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiRetirementFPLoading || aiRetirementFP) && (
              <Card data-testid="card-ai-retirement">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Retirement Planning</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRetirementFPLoading ? <Skeleton className="h-24 w-full" /> : aiRetirementFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRetirementFP.strategies || aiRetirementFP.tips || aiRetirementFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEmergFundLoading || aiEmergFund) && (
              <Card data-testid="card-ai-emerg-fund">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Emergency Fund</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEmergFundLoading ? <Skeleton className="h-24 w-full" /> : aiEmergFund && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiEmergFund.strategies || aiEmergFund.tips || aiEmergFund.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInvestmentFPLoading || aiInvestmentFP) && (
              <Card data-testid="card-ai-investment">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Investment Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInvestmentFPLoading ? <Skeleton className="h-24 w-full" /> : aiInvestmentFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInvestmentFP.strategies || aiInvestmentFP.tips || aiInvestmentFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDebtPayoffLoading || aiDebtPayoff) && (
              <Card data-testid="card-ai-debt-payoff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Debt Payoff</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDebtPayoffLoading ? <Skeleton className="h-24 w-full" /> : aiDebtPayoff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDebtPayoff.strategies || aiDebtPayoff.tips || aiDebtPayoff.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInsuranceFPLoading || aiInsuranceFP) && (
              <Card data-testid="card-ai-insurance-fp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Insurance Advisor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInsuranceFPLoading ? <Skeleton className="h-24 w-full" /> : aiInsuranceFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInsuranceFP.strategies || aiInsuranceFP.tips || aiInsuranceFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRealEstateLoading || aiRealEstate) && (
              <Card data-testid="card-ai-real-estate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Real Estate</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRealEstateLoading ? <Skeleton className="h-24 w-full" /> : aiRealEstate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRealEstate.strategies || aiRealEstate.tips || aiRealEstate.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCryptoFPLoading || aiCryptoFP) && (
              <Card data-testid="card-ai-crypto">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Crypto Portfolio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCryptoFPLoading ? <Skeleton className="h-24 w-full" /> : aiCryptoFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCryptoFP.strategies || aiCryptoFP.tips || aiCryptoFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPassiveIncFPLoading || aiPassiveIncFP) && (
              <Card data-testid="card-ai-passive-inc-fp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Passive Income</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPassiveIncFPLoading ? <Skeleton className="h-24 w-full" /> : aiPassiveIncFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPassiveIncFP.strategies || aiPassiveIncFP.tips || aiPassiveIncFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFreelancePriceLoading || aiFreelancePrice) && (
              <Card data-testid="card-ai-freelance-price">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Freelance Pricing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFreelancePriceLoading ? <Skeleton className="h-24 w-full" /> : aiFreelancePrice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiFreelancePrice.strategies || aiFreelancePrice.tips || aiFreelancePrice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGrantFindLoading || aiGrantFind) && (
              <Card data-testid="card-ai-grant-find">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Grant Finder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGrantFindLoading ? <Skeleton className="h-24 w-full" /> : aiGrantFind && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiGrantFind.strategies || aiGrantFind.tips || aiGrantFind.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrowdfundFPLoading || aiCrowdfundFP) && (
              <Card data-testid="card-ai-crowdfund-fp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Crowdfunding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrowdfundFPLoading ? <Skeleton className="h-24 w-full" /> : aiCrowdfundFP && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCrowdfundFP.strategies || aiCrowdfundFP.tips || aiCrowdfundFP.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevDiversifyLoading || aiRevDiversify) && (
              <Card data-testid="card-ai-rev-diversify">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Diversify</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevDiversifyLoading ? <Skeleton className="h-24 w-full" /> : aiRevDiversify && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevDiversify.strategies || aiRevDiversify.tips || aiRevDiversify.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBudgetTrackLoading || aiBudgetTrack) && (
              <Card data-testid="card-ai-budget-track">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Budget Tracker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBudgetTrackLoading ? <Skeleton className="h-24 w-full" /> : aiBudgetTrack && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBudgetTrack.strategies || aiBudgetTrack.tips || aiBudgetTrack.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFinGoalsLoading || aiFinGoals) && (
              <Card data-testid="card-ai-fin-goals">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Financial Goals</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFinGoalsLoading ? <Skeleton className="h-24 w-full" /> : aiFinGoals && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiFinGoals.strategies || aiFinGoals.tips || aiFinGoals.recommendations)}
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
          onClick={() => setShowRevIntelAI(!showRevIntelAI)}
          data-testid="button-toggle-rev-intel-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Revenue Intelligence</span>
          <Badge variant="outline" className="text-[10px]">6 tools</Badge>
          {showRevIntelAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showRevIntelAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiDealNegCoachLoading || aiDealNegCoach) && (
              <Card data-testid="card-ai-deal-neg-coach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Deal Negotiation Coach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDealNegCoachLoading ? <Skeleton className="h-24 w-full" /> : aiDealNegCoach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDealNegCoach.strategies || aiDealNegCoach.tips || aiDealNegCoach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMerchDemandLoading || aiMerchDemand) && (
              <Card data-testid="card-ai-merch-demand">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Merch Demand Predictor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMerchDemandLoading ? <Skeleton className="h-24 w-full" /> : aiMerchDemand && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMerchDemand.predictions || aiMerchDemand.products || aiMerchDemand.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevStreamOptLoading || aiRevStreamOpt) && (
              <Card data-testid="card-ai-rev-stream-opt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Stream Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevStreamOptLoading ? <Skeleton className="h-24 w-full" /> : aiRevStreamOpt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevStreamOpt.streams || aiRevStreamOpt.strategies || aiRevStreamOpt.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberTierDesignLoading || aiMemberTierDesign) && (
              <Card data-testid="card-ai-member-tier-design">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Membership Tier Designer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberTierDesignLoading ? <Skeleton className="h-24 w-full" /> : aiMemberTierDesign && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMemberTierDesign.tiers || aiMemberTierDesign.plans || aiMemberTierDesign.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffLinkMgrLoading || aiAffLinkMgr) && (
              <Card data-testid="card-ai-aff-link-mgr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Affiliate Link Manager</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffLinkMgrLoading ? <Skeleton className="h-24 w-full" /> : aiAffLinkMgr && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAffLinkMgr.links || aiAffLinkMgr.programs || aiAffLinkMgr.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorRateCalcLoading || aiSponsorRateCalc) && (
              <Card data-testid="card-ai-sponsor-rate-calc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsorship Rate Calculator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorRateCalcLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorRateCalc && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorRateCalc.rates || aiSponsorRateCalc.calculations || aiSponsorRateCalc.recommendations)}
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
          onClick={() => setShowBrandGrowthAI(!showBrandGrowthAI)}
          data-testid="button-toggle-brand-growth-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Brand & Growth</span>
          <Badge variant="outline" className="text-[10px]">5 tools</Badge>
          {showBrandGrowthAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showBrandGrowthAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandAuditorLoading || aiBrandAuditor) && (
              <Card data-testid="card-ai-brand-auditor">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Brand Auditor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandAuditorLoading ? <Skeleton className="h-24 w-full" /> : aiBrandAuditor && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBrandAuditor.findings || aiBrandAuditor.analysis || aiBrandAuditor.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandVoiceLoading || aiBrandVoice) && (
              <Card data-testid="card-ai-brand-voice">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Brand Voice Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandVoiceLoading ? <Skeleton className="h-24 w-full" /> : aiBrandVoice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBrandVoice.analysis || aiBrandVoice.tone || aiBrandVoice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBrandPartnershipLoading || aiBrandPartnership) && (
              <Card data-testid="card-ai-brand-partnership">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Brand Partnership Scorer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandPartnershipLoading ? <Skeleton className="h-24 w-full" /> : aiBrandPartnership && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBrandPartnership.scores || aiBrandPartnership.partners || aiBrandPartnership.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediaKitUpdateLoading || aiMediaKitUpdate) && (
              <Card data-testid="card-ai-media-kit-update">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Media Kit Auto-Updater</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediaKitUpdateLoading ? <Skeleton className="h-24 w-full" /> : aiMediaKitUpdate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMediaKitUpdate.updates || aiMediaKitUpdate.sections || aiMediaKitUpdate.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCourseProdPlanLoading || aiCourseProdPlan) && (
              <Card data-testid="card-ai-course-prod-plan">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Course/Product Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCourseProdPlanLoading ? <Skeleton className="h-24 w-full" /> : aiCourseProdPlan && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCourseProdPlan.products || aiCourseProdPlan.courses || aiCourseProdPlan.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
      </div>
    </CollapsibleToolbox>
  );
}
