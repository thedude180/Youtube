import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Zap, Copy, RefreshCw, Brain, ChevronRight,
  Sparkles, Clock, Target, TrendingUp, Mic, Hash, Download
} from "lucide-react";

const CONTENT_TYPES = [
  { value: "youtube_long", label: "YouTube Long-Form", icon: "🎬", desc: "8–20 min full script" },
  { value: "youtube_short", label: "YouTube Short / Reel", icon: "⚡", desc: "60s punchy hook" },
  { value: "twitch_intro", label: "Twitch Stream Intro", icon: "🎮", desc: "Hype opener script" },
  { value: "tiktok", label: "TikTok / Reel", icon: "🎵", desc: "15–30s viral hook" },
  { value: "podcast_episode", label: "Podcast Episode", icon: "🎙", desc: "Full episode outline + intro" },
  { value: "sponsorship_read", label: "Sponsorship Ad Read", icon: "💰", desc: "60–90s converted read" },
];

const TONES = ["Educational", "Entertaining", "Motivational", "Controversial", "Story-driven", "Comedy", "Analytical"];

function ScriptSection({ title, content, color }: { title: string; content: string; color: string }) {
  const { toast } = useToast();
  const copyText = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied!", description: `${title} copied to clipboard` });
  };
  return (
    <div className="rounded-xl border border-border/20 overflow-hidden" data-testid={`script-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20" style={{ background: `${color}10` }}>
        <span className="text-xs font-mono font-bold uppercase" style={{ color }}>{title}</span>
        <button onClick={copyText} className="text-muted-foreground hover:text-foreground transition-colors">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-4 bg-muted/10 font-mono text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{content}</div>
    </div>
  );
}

export default function ScriptStudio() {
  usePageTitle("AI Script Studio");
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("youtube_long");
  const [tone, setTone] = useState("Educational");
  const [targetAudience, setTargetAudience] = useState("");
  const [keywords, setKeywords] = useState("");
  const [result, setResult] = useState<any>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const generateScript = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/script-writer", {
        topic,
        contentType,
        tone,
        targetAudience,
        keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
        duration: contentType.includes("short") || contentType === "tiktok" ? "60s" : "10-15 minutes",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: () => toast({ title: "Error", description: "Script generation failed. Try again.", variant: "destructive" }),
  });

  const selectedType = CONTENT_TYPES.find(t => t.value === contentType);

  return (
    <div className="min-h-screen animated-gradient-bg p-4 md:p-6" data-testid="page-script-studio">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="card-empire rounded-2xl p-6 relative overflow-hidden empire-glow">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center" style={{ boxShadow: "0 0 30px hsl(265 80% 60% / 0.4)" }}>
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold holographic-text" data-testid="text-page-title">AI Script Studio</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Full scripts, hooks, B-roll notes & chapter markers — generated in seconds</p>
            </div>
            <div className="ml-auto hidden md:flex gap-2">
              {["Hook", "Intro", "Body", "CTA", "Outro"].map((s) => (
                <span key={s} className="text-[10px] px-2 py-1 rounded font-mono bg-primary/10 text-primary border border-primary/20">{s}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card className="bg-card/60 border-border/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Content Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">CONTENT TYPE</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTENT_TYPES.map((type) => (
                      <button key={type.value} onClick={() => setContentType(type.value)}
                        data-testid={`btn-content-type-${type.value}`}
                        className={`p-2.5 rounded-lg border text-left transition-all ${contentType === type.value ? "border-primary/50 bg-primary/10" : "border-border/20 bg-muted/10 hover:border-border/40"}`}>
                        <div className="text-lg mb-0.5">{type.icon}</div>
                        <div className="text-xs font-medium text-foreground">{type.label}</div>
                        <div className="text-[10px] text-muted-foreground">{type.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">VIDEO TOPIC / TITLE IDEA</label>
                  <Input
                    placeholder="e.g. How I went from 0 to 100K subscribers in 6 months"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="bg-muted/20 border-border/30"
                    data-testid="input-topic"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">TONE</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map((t) => (
                      <button key={t} onClick={() => setTone(t)}
                        data-testid={`btn-tone-${t.toLowerCase()}`}
                        className={`text-xs px-3 py-1 rounded-full border transition-all ${tone === t ? "border-primary bg-primary/10 text-primary" : "border-border/20 text-muted-foreground hover:border-border/40"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">TARGET AUDIENCE</label>
                  <Input
                    placeholder="e.g. beginner YouTube creators aged 18–34"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="bg-muted/20 border-border/30"
                    data-testid="input-target-audience"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono flex items-center gap-1"><Hash className="h-3 w-3" /> SEO KEYWORDS (comma-separated)</label>
                  <Input
                    placeholder="youtube growth, algorithm, monetization"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    className="bg-muted/20 border-border/30"
                    data-testid="input-keywords"
                  />
                </div>

                <Button
                  className="w-full h-12 text-base font-bold"
                  style={{ boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)" }}
                  onClick={() => generateScript.mutate()}
                  disabled={generateScript.isPending || !topic}
                  data-testid="button-generate-script"
                >
                  {generateScript.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Writing your script...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Generate {selectedType?.label} Script</>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border/20">
              <CardContent className="p-4">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Quick Templates</div>
                <div className="space-y-2">
                  {[
                    { label: "Viral Hook Formula", topic: "Why 99% of creators fail (and how to be the 1%)", tone: "Controversial" },
                    { label: "Tutorial Deep-Dive", topic: "Complete beginner's guide to [your niche]", tone: "Educational" },
                    { label: "Story-Driven Growth", topic: "How I built a 6-figure creator business from scratch", tone: "Story-driven" },
                    { label: "Reaction / Commentary", topic: "The creator economy is changing — here's what nobody tells you", tone: "Analytical" },
                  ].map((tpl, i) => (
                    <button key={i} onClick={() => { setTopic(tpl.topic); setTone(tpl.tone); }}
                      data-testid={`template-${i}`}
                      className="w-full text-left p-2.5 rounded-lg border border-border/20 bg-muted/10 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-foreground">{tpl.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{tpl.topic}</div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div ref={outputRef}>
            {generateScript.isPending && (
              <div className="card-empire rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
                    <Brain className="h-8 w-8 text-primary animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
                </div>
                <p className="text-foreground font-medium mb-1">Writing your script...</p>
                <p className="text-sm text-muted-foreground text-center max-w-[240px]">AI is crafting your full script with hooks, B-roll notes, and chapter markers</p>
                <div className="flex gap-1 mt-4">
                  {["Hook", "Intro", "Body", "CTA", "Outro"].map((s, i) => (
                    <div key={s} className="text-[10px] px-2 py-0.5 rounded font-mono bg-primary/10 text-primary border border-primary/20 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>{s}</div>
                  ))}
                </div>
              </div>
            )}

            {!generateScript.isPending && !result && (
              <div className="card-empire rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center" data-testid="card-script-placeholder">
                <FileText className="h-12 w-12 text-primary/30 mb-4" />
                <p className="text-foreground/60 font-medium">Your script will appear here</p>
                <p className="text-sm text-muted-foreground mt-1">Fill in the details and click Generate</p>
              </div>
            )}

            {result && !generateScript.isPending && (
              <div className="space-y-4" data-testid="card-script-output">
                <div className="card-empire rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-mono text-emerald-400">SCRIPT GENERATED</span>
                    </div>
                    <div className="flex gap-2">
                      {result.estimatedDuration && (
                        <Badge variant="outline" className="text-[10px] font-mono gap-1">
                          <Clock className="h-3 w-3" />{result.estimatedDuration}
                        </Badge>
                      )}
                      {result.viralScore && (
                        <Badge variant="outline" className="text-[10px] font-mono gap-1 border-emerald-500/30 text-emerald-400">
                          <TrendingUp className="h-3 w-3" />{result.viralScore}% viral
                        </Badge>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => generateScript.mutate()} className="h-7 text-xs">
                        <RefreshCw className="h-3 w-3 mr-1" />Regenerate
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {result.hook && <ScriptSection title="🎣 Hook (0–15s)" content={result.hook} color="hsl(0 80% 55%)" />}
                    {result.intro && <ScriptSection title="📖 Intro" content={result.intro} color="hsl(265 80% 65%)" />}
                    {result.mainContent && <ScriptSection title="📝 Main Content" content={result.mainContent} color="hsl(200 80% 60%)" />}
                    {result.script && !result.hook && <ScriptSection title="📝 Full Script" content={result.script} color="hsl(265 80% 65%)" />}
                    {result.bRollNotes && <ScriptSection title="🎥 B-Roll Notes" content={result.bRollNotes} color="hsl(45 90% 55%)" />}
                    {result.cta && <ScriptSection title="⚡ Call to Action" content={result.cta} color="hsl(142 70% 50%)" />}
                    {result.outro && <ScriptSection title="👋 Outro" content={result.outro} color="hsl(320 70% 60%)" />}
                    {result.chapterMarkers && (
                      <div className="rounded-xl border border-border/20 overflow-hidden" data-testid="script-section-chapters">
                        <div className="px-4 py-2 border-b border-border/20 bg-amber-500/10">
                          <span className="text-xs font-mono font-bold uppercase text-amber-400">📌 Chapter Markers</span>
                        </div>
                        <div className="p-4 bg-muted/10 space-y-1">
                          {(Array.isArray(result.chapterMarkers) ? result.chapterMarkers : [result.chapterMarkers]).map((ch: any, i: number) => (
                            <div key={i} className="flex gap-3 text-xs font-mono">
                              <span className="text-amber-400 shrink-0">{ch.timestamp || ch.time || `${i * 2}:00`}</span>
                              <span className="text-foreground/80">{ch.title || ch.label || ch}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {result.seoKeywords && (
                    <div className="mt-3 pt-3 border-t border-border/20">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">SEO Keywords Embedded</div>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(result.seoKeywords) ? result.seoKeywords : [result.seoKeywords]).map((kw: string, i: number) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => {
                        const fullScript = [result.hook, result.intro, result.mainContent, result.script, result.bRollNotes, result.cta, result.outro].filter(Boolean).join("\n\n---\n\n");
                        navigator.clipboard.writeText(fullScript);
                        toast({ title: "Full script copied!", description: "Ready to paste into your script doc" });
                      }}
                      data-testid="button-copy-full-script"
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copy Full Script
                    </Button>
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => {
                        const fullScript = [result.hook, result.intro, result.mainContent, result.script, result.bRollNotes, result.cta, result.outro].filter(Boolean).join("\n\n---\n\n");
                        const blob = new Blob([fullScript], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `script-${topic.slice(0, 30).replace(/\s+/g, "-") || "video"}.txt`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({ title: "Script downloaded!", description: "Your script has been saved as a .txt file" });
                      }}
                      data-testid="button-download-full-script"
                    >
                      <Download className="h-4 w-4 mr-2" /> Download .txt
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
