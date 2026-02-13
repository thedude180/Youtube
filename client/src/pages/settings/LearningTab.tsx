import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = any;

const insightCategoryColors: Record<string, string> = {
  content: "bg-purple-500/10 text-purple-500",
  audience: "bg-blue-500/10 text-blue-500",
  growth: "bg-emerald-500/10 text-emerald-500",
  revenue: "bg-amber-500/10 text-amber-500",
  seo: "bg-cyan-500/10 text-cyan-500",
  engagement: "bg-pink-500/10 text-pink-500",
};

function LearningTab() {
  const [aiAcademy, setAiAcademy] = useState<AIResponse>(null);
  const [aiAcademyLoading, setAiAcademyLoading] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);

  useEffect(() => {
    if (!aiToolsOpen) return;
    setAiAcademyLoading(true);
    const cached = sessionStorage.getItem("aiCreatorAcademy");
    if (cached) {
      try { setAiAcademy(JSON.parse(cached)); setAiAcademyLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/creator-academy")
      .then((res) => res.json())
      .then((data) => { setAiAcademy(data); sessionStorage.setItem("aiCreatorAcademy", JSON.stringify({ data: data, ts: Date.now() })); })
      .catch(() => {})
      .finally(() => setAiAcademyLoading(false));
  }, [aiToolsOpen]);

  const [showEducationAI, setShowEducationAI] = useState(false);
  const [aiSkillAssess, setAiSkillAssess] = useState<AIResponse>(null);
  const [aiSkillAssessLoading, setAiSkillAssessLoading] = useState(false);
  const [aiLearnPath, setAiLearnPath] = useState<AIResponse>(null);
  const [aiLearnPathLoading, setAiLearnPathLoading] = useState(false);
  const [aiCerts, setAiCerts] = useState<AIResponse>(null);
  const [aiCertsLoading, setAiCertsLoading] = useState(false);
  const [aiBooks, setAiBooks] = useState<AIResponse>(null);
  const [aiBooksLoading, setAiBooksLoading] = useState(false);
  const [aiToolTut, setAiToolTut] = useState<AIResponse>(null);
  const [aiToolTutLoading, setAiToolTutLoading] = useState(false);
  const [aiIndustryReport, setAiIndustryReport] = useState<AIResponse>(null);
  const [aiIndustryReportLoading, setAiIndustryReportLoading] = useState(false);
  const [aiCaseStudy, setAiCaseStudy] = useState<AIResponse>(null);
  const [aiCaseStudyLoading, setAiCaseStudyLoading] = useState(false);
  const [aiPortfolio, setAiPortfolio] = useState<AIResponse>(null);
  const [aiPortfolioLoading, setAiPortfolioLoading] = useState(false);

  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_skill_assess");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSkillAssess(e.data); return; } else { sessionStorage.removeItem("ai_skill_assess"); } } catch {} }
    setAiSkillAssessLoading(true);
    apiRequest("POST", "/api/ai/skill-assessment", {}).then(r => r.json()).then(d => { setAiSkillAssess(d); sessionStorage.setItem("ai_skill_assess", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSkillAssessLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_learn_path");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLearnPath(e.data); return; } else { sessionStorage.removeItem("ai_learn_path"); } } catch {} }
    setAiLearnPathLoading(true);
    apiRequest("POST", "/api/ai/learning-path", {}).then(r => r.json()).then(d => { setAiLearnPath(d); sessionStorage.setItem("ai_learn_path", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiLearnPathLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_certs");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCerts(e.data); return; } else { sessionStorage.removeItem("ai_certs"); } } catch {} }
    setAiCertsLoading(true);
    apiRequest("POST", "/api/ai/certification", {}).then(r => r.json()).then(d => { setAiCerts(d); sessionStorage.setItem("ai_certs", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCertsLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_books");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBooks(e.data); return; } else { sessionStorage.removeItem("ai_books"); } } catch {} }
    setAiBooksLoading(true);
    apiRequest("POST", "/api/ai/book-recommend", {}).then(r => r.json()).then(d => { setAiBooks(d); sessionStorage.setItem("ai_books", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBooksLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_tool_tut");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiToolTut(e.data); return; } else { sessionStorage.removeItem("ai_tool_tut"); } } catch {} }
    setAiToolTutLoading(true);
    apiRequest("POST", "/api/ai/tool-tutorial", {}).then(r => r.json()).then(d => { setAiToolTut(d); sessionStorage.setItem("ai_tool_tut", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiToolTutLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_industry_report");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIndustryReport(e.data); return; } else { sessionStorage.removeItem("ai_industry_report"); } } catch {} }
    setAiIndustryReportLoading(true);
    apiRequest("POST", "/api/ai/industry-report", {}).then(r => r.json()).then(d => { setAiIndustryReport(d); sessionStorage.setItem("ai_industry_report", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiIndustryReportLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_case_study");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCaseStudy(e.data); return; } else { sessionStorage.removeItem("ai_case_study"); } } catch {} }
    setAiCaseStudyLoading(true);
    apiRequest("POST", "/api/ai/case-study", {}).then(r => r.json()).then(d => { setAiCaseStudy(d); sessionStorage.setItem("ai_case_study", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCaseStudyLoading(false));
  }, [showEducationAI]);
  useEffect(() => {
    if (!showEducationAI) return;
    const cached = sessionStorage.getItem("ai_portfolio");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPortfolio(e.data); return; } else { sessionStorage.removeItem("ai_portfolio"); } } catch {} }
    setAiPortfolioLoading(true);
    apiRequest("POST", "/api/ai/portfolio", {}).then(r => r.json()).then(d => { setAiPortfolio(d); sessionStorage.setItem("ai_portfolio", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPortfolioLoading(false));
  }, [showEducationAI]);

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

      <CollapsibleToolbox title="AI Learning Tools" toolCount={15} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      <div className="space-y-3">
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
      </CollapsibleToolbox>
    </div>
  );
}

export default LearningTab;
