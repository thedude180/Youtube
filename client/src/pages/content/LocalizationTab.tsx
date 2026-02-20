import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { safeArray } from "@/lib/safe-data";
import {
  Globe, Languages, Captions, BarChart3, Mic, Users, Image, Hash,
  CheckCircle2, Eye, MapPin, MessageSquare, Clock, FlaskConical,
  Megaphone, ShieldCheck, Briefcase, TrendingUp, Zap, Sparkles,
} from "lucide-react";

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  ru: "Russian", it: "Italian", tr: "Turkish", nl: "Dutch", pl: "Polish",
  sv: "Swedish", th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
};

function LocalizationTab() {
  const { t } = useTranslation();

  const { data: recommendations, isLoading: recsLoading, error: recsError } = useQuery<any>({
    queryKey: ["/api/localization/recommendations"],
    refetchInterval: 60_000,
    staleTime: 30_000,
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
          ) : recsError ? (
            <QueryErrorReset error={recsError} queryKey={["/api/localization/recommendations"]} label="Failed to load recommendations" />
          ) : hasRecs ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{t("localization.priorityLanguages")}:</span>
                {safeArray<string>(recLangs).map((lang: string, i: number) => (
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

export default LocalizationTab;
