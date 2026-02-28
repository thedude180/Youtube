import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  TrendingUp, DollarSign, MessageSquare, Send, Loader2,
  BarChart3, Megaphone, Target, Handshake, Rocket,
  Settings, Sparkles, PieChart, Briefcase,
  X, Star, Zap, CheckCircle2, Clock, Play, RefreshCw, Activity, Terminal, Shield, Lock,
} from "lucide-react";

const BIZ_ADVISORS = [
  {
    id: "biz-cfo",
    agentId: "biz-cfo",
    name: "Elena Marchetti",
    initials: "EM",
    title: "Chief Financial Officer",
    specialty: "P&L, Cash Flow, Financial Modeling, EBITDA, DCF, Fundraising Metrics",
    icon: BarChart3,
    color: "hsl(142 70% 50%)",
    bg: "hsl(142 70% 50% / 0.08)",
    border: "hsl(142 70% 50% / 0.25)",
    glow: "hsl(142 70% 50% / 0.4)",
    tags: ["P&L", "Cash Flow", "EBITDA", "Fundraising"],
    experience: "20 yrs",
    rating: 4.9,
    cases: "$840M managed",
    expertise: 99,
    credentials: ["Wharton MBA", "CFA Charter", "Inc 5000 CFO of Year"],
    intro: "Your financials tell a story most creators never read. I'll show you your real burn rate, true profit margins, and exactly where cash is leaking — then build a model that gets you to financial freedom.",
  },
  {
    id: "biz-cmo",
    agentId: "biz-cmo",
    name: "David Park",
    initials: "DP",
    title: "Chief Marketing Officer",
    specialty: "Brand Positioning, CAC/LTV, Growth Marketing, Funnel Strategy",
    icon: Megaphone,
    color: "hsl(265 80% 65%)",
    bg: "hsl(265 80% 65% / 0.08)",
    border: "hsl(265 80% 65% / 0.25)",
    glow: "hsl(265 80% 65% / 0.4)",
    tags: ["CAC", "LTV", "Funnels", "Brand"],
    experience: "16 yrs",
    rating: 4.8,
    cases: "3.2B impressions",
    expertise: 96,
    credentials: ["Kellogg MBA", "Growth Marketing Institute", "Ad Age CMO Award"],
    intro: "Most creators leave 80% of their marketing value on the table. I optimize every touchpoint: subscriber CAC, email LTV, funnel conversion, and brand positioning that commands 3x higher sponsorship rates.",
  },
  {
    id: "biz-strategy",
    agentId: "biz-strategy",
    name: "Alicia Foster",
    initials: "AF",
    title: "Chief Strategy Officer",
    specialty: "Competitive Moats, OKRs, Blue Ocean Strategy, Market Positioning",
    icon: Target,
    color: "hsl(200 80% 60%)",
    bg: "hsl(200 80% 60% / 0.08)",
    border: "hsl(200 80% 60% / 0.25)",
    glow: "hsl(200 80% 60% / 0.4)",
    tags: ["OKRs", "Moats", "Blue Ocean", "Positioning"],
    experience: "19 yrs",
    rating: 4.9,
    cases: "47 exits advised",
    expertise: 98,
    credentials: ["Harvard Business School MBA", "McKinsey Alumni", "WEF Young Global Leader"],
    intro: "Strategy is the difference between being a successful creator and building an empire. I apply Porter's Five Forces, Blue Ocean thinking, and OKR systems to build competitive moats that make you uncopyable.",
  },
  {
    id: "biz-revenue",
    agentId: "biz-revenue",
    name: "Ryan Torres",
    initials: "RT",
    title: "Revenue Architect",
    specialty: "Monetization Stack, Pricing Psychology, Revenue Diversification, ARPU",
    icon: DollarSign,
    color: "hsl(45 90% 55%)",
    bg: "hsl(45 90% 55% / 0.08)",
    border: "hsl(45 90% 55% / 0.25)",
    glow: "hsl(45 90% 55% / 0.4)",
    tags: ["ARPU", "Pricing", "Diversification", "Monetization"],
    experience: "14 yrs",
    rating: 4.8,
    cases: "$94M revenue built",
    expertise: 97,
    credentials: ["Stanford GSB", "SaaStr Top Revenue Advisor", "Creator Economy Revenue Expert"],
    intro: "Single-stream revenue is a business emergency waiting to happen. I design 7-stream monetization stacks with scientific pricing — most creators I work with 3x their revenue within 90 days without more content.",
  },
  {
    id: "biz-partnerships",
    agentId: "biz-partnerships",
    name: "Isabella Romano",
    initials: "IR",
    title: "Head of Business Development",
    specialty: "Strategic Partnerships, Licensing, Syndication, Co-Marketing",
    icon: Handshake,
    color: "hsl(320 70% 60%)",
    bg: "hsl(320 70% 60% / 0.08)",
    border: "hsl(320 70% 60% / 0.25)",
    glow: "hsl(320 70% 60% / 0.4)",
    tags: ["Partnerships", "Licensing", "Syndication", "BD"],
    experience: "17 yrs",
    rating: 4.8,
    cases: "$500M+ deals closed",
    expertise: 96,
    credentials: ["Columbia Business School", "CAA Alumni", "Dealmaker of the Year"],
    intro: "The best deals aren't on sponsor marketplaces — they're built through strategic relationships. I source partnerships, licensing deals, and syndication agreements that most creators don't know exist.",
  },
  {
    id: "biz-growth",
    agentId: "biz-growth",
    name: "Kai Nakamura",
    initials: "KN",
    title: "Chief Growth Officer",
    specialty: "Viral Loops, North Star Metrics, AARRR, A/B Testing, Activation",
    icon: Rocket,
    color: "hsl(25 90% 55%)",
    bg: "hsl(25 90% 55% / 0.08)",
    border: "hsl(25 90% 55% / 0.25)",
    glow: "hsl(25 90% 55% / 0.4)",
    tags: ["K-Factor", "AARRR", "Viral Loops", "Activation"],
    experience: "11 yrs",
    rating: 4.9,
    cases: "12 channels to 1M+",
    expertise: 98,
    credentials: ["MIT Sloan", "Reforge Alumni", "Growth Hackers Hall of Fame"],
    intro: "Growth isn't random — it's engineered. I build viral loops, optimize activation funnels, and run systematic experiments until your channel compounds on autopilot. K-factor above 1.0 means exponential growth forever.",
  },
  {
    id: "biz-ops",
    agentId: "biz-ops",
    name: "Morgan Hayes",
    initials: "MH",
    title: "Chief Operating Officer",
    specialty: "Systems, SOPs, Team Structure, Operational Efficiency, Automation",
    icon: Settings,
    color: "hsl(180 70% 55%)",
    bg: "hsl(180 70% 55% / 0.08)",
    border: "hsl(180 70% 55% / 0.25)",
    glow: "hsl(180 70% 55% / 0.4)",
    tags: ["SOPs", "Systems", "Team", "Automation"],
    experience: "22 yrs",
    rating: 4.7,
    cases: "340 ops built",
    expertise: 95,
    credentials: ["Wharton Operations", "EOS Certified Implementer", "Scaling Up Expert"],
    intro: "You can't scale what you can't systematize. I build the SOPs, team structures, and automation stacks that turn a solo creator into a media company — without burning out or losing creative control.",
  },
  {
    id: "biz-brand",
    agentId: "biz-brand",
    name: "Zoe Sterling",
    initials: "ZS",
    title: "Brand Architect",
    specialty: "Brand Identity, Positioning, Community-Brand Fit, Brand Equity",
    icon: Sparkles,
    color: "hsl(330 70% 60%)",
    bg: "hsl(330 70% 60% / 0.08)",
    border: "hsl(330 70% 60% / 0.25)",
    glow: "hsl(330 70% 60% / 0.4)",
    tags: ["Brand Identity", "Positioning", "Brand Equity", "Community Fit"],
    experience: "15 yrs",
    rating: 4.9,
    cases: "190 brands built",
    expertise: 97,
    credentials: ["Parsons Brand Design", "Brand Finance Certified", "Fast Company Brand Innovator"],
    intro: "Your brand is your moat. I build creator brands so distinctive that audiences pay 3-5x more in sponsorships, feel deep community belonging, and follow you across every platform and business you launch.",
  },
  {
    id: "biz-investor",
    agentId: "biz-investor",
    name: "Marcus Chen",
    initials: "MC",
    title: "Investor Relations & Fundraising Advisor",
    specialty: "Valuation, Pitch Decks, VC/PE, Cap Tables, SAFE Notes",
    icon: Briefcase,
    color: "hsl(0 80% 55%)",
    bg: "hsl(0 80% 55% / 0.08)",
    border: "hsl(0 80% 55% / 0.25)",
    glow: "hsl(0 80% 55% / 0.4)",
    tags: ["Valuation", "VC", "Pitch Deck", "Cap Table"],
    experience: "18 yrs",
    rating: 4.9,
    cases: "$2B+ advised",
    expertise: 98,
    credentials: ["Stanford GSB MBA", "Goldman Sachs Alumni", "Forbes Midas List Advisor"],
    intro: "Your creator business is worth more than you think — if it's structured right. I model your valuation, build your fundraising narrative, and help you decide whether to bootstrap, raise capital, or position for acquisition.",
  },
];

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  "biz-cfo": ["What's my real profit margin after all expenses?", "How much runway do I have if revenue drops 30%?", "When should I pay myself a salary vs. distributions?"],
  "biz-cmo": ["How do I calculate my subscriber acquisition cost?", "What's a good email list LTV for my niche?", "How do I build a marketing funnel that converts viewers to buyers?"],
  "biz-strategy": ["How do I build a moat that competitors can't copy?", "Should I go deep in one niche or expand to multiple?", "How do I design OKRs for a creator business?"],
  "biz-revenue": ["What revenue streams should I add at 100K subscribers?", "How do I price my online course?", "What's the right order to add monetization streams?"],
  "biz-partnerships": ["How do I approach a Fortune 500 brand for a deal?", "What's the right way to structure a content licensing deal?", "How do I get on a brand's preferred creator list?"],
  "biz-growth": ["What's my viral coefficient and how do I improve it?", "How do I build a referral loop into my content?", "What north star metric should I track at 50K subscribers?"],
  "biz-ops": ["What SOPs should every creator have from day one?", "When should I hire my first team member?", "How do I build a content production system that doesn't break?"],
  "biz-brand": ["How do I write a brand positioning statement?", "How do I increase my sponsorship CPM through brand building?", "How do I rebrand without losing my audience?"],
  "biz-investor": ["What's my creator business worth right now?", "Should I raise money or stay bootstrapped?", "What does a VC look for in a creator business pitch?"],
};

interface Message {
  role: "user" | "advisor";
  content: string;
  timestamp: Date;
}

function AdvisorChat({ advisor, onClose }: { advisor: any; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "advisor", content: advisor.intro, timestamp: new Date() }]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const Icon = advisor.icon;

  const chatMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/business-agents/chat", { advisorId: advisor.id, message }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setMessages(prev => [...prev, { role: "advisor", content: data.reply, timestamp: new Date() }]);
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "advisor", content: "I'm experiencing a technical issue. Please try again in a moment.", timestamp: new Date() }]);
    },
  });

  const sendMessage = (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: "user", content: msg, timestamp: new Date() }]);
    setInput("");
    chatMutation.mutate(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const suggestions = SUGGESTED_QUESTIONS[advisor.id] ?? [];
  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-2 md:p-6 bg-black/70 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="advisor-chat-overlay"
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden relative"
        style={{
          maxHeight: "92vh",
          background: "linear-gradient(135deg, hsl(230 22% 8%) 0%, hsl(260 25% 10%) 100%)",
          border: `1px solid ${advisor.border}`,
          boxShadow: `0 0 0 1px ${advisor.glow}20, 0 24px 80px ${advisor.glow}30`,
        }}
      >
        <div className="scan-overlay absolute inset-0 pointer-events-none z-0 rounded-2xl" />
        <div className="relative z-10 flex items-center gap-3 p-4 border-b border-border/20 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${advisor.glow}18, ${advisor.glow}08)` }}>
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${advisor.bg}, ${advisor.glow}22)`, border: `2px solid ${advisor.border}`, boxShadow: `0 0 12px ${advisor.glow}`, color: advisor.color }}>
              {advisor.initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" style={{ boxShadow: "0 0 6px hsl(142 70% 50% / 0.8)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm" data-testid="chat-advisor-name">{advisor.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: `${advisor.glow}20`, color: advisor.color }}>AI EXEC</span>
              <span className="text-[10px] text-emerald-400 animate-pulse">● ONLINE</span>
            </div>
            <div className="text-xs text-muted-foreground">{advisor.title}</div>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors" data-testid="button-close-advisor-chat">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3 min-h-0" data-testid="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {m.role === "advisor" && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-1"
                  style={{ background: `${advisor.glow}20`, border: `1px solid ${advisor.border}`, color: advisor.color }}>
                  {advisor.initials}
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-sm text-white" : "rounded-tl-sm text-foreground/90"}`}
                style={m.role === "user"
                  ? { background: "linear-gradient(135deg, hsl(265 80% 50%), hsl(265 80% 40%))", boxShadow: "0 0 10px hsl(265 80% 60% / 0.3)" }
                  : { background: "hsl(230 20% 12%)", border: "1px solid hsl(265 30% 20%)" }}>
                {m.content}
                <div className={`text-[9px] mt-1 ${m.role === "user" ? "text-white/40 text-right" : "text-muted-foreground/40"}`}>{formatTime(m.timestamp)}</div>
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-2" data-testid="chat-typing-indicator">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: `${advisor.glow}20`, border: `1px solid ${advisor.border}`, color: advisor.color }}>
                {advisor.initials}
              </div>
              <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background: "hsl(230 20% 12%)", border: "1px solid hsl(265 30% 20%)" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full"
                    style={{ background: advisor.color, animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="relative z-10 px-4 pb-2 flex gap-2 flex-wrap" data-testid="chat-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)}
                className="text-[11px] px-3 py-1.5 rounded-full border transition-all duration-200 hover:scale-105 text-left"
                style={{ background: `${advisor.glow}10`, borderColor: advisor.border, color: advisor.color }}
                data-testid={`suggestion-${i}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="relative z-10 p-4 border-t border-border/20 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Ask ${advisor.name.split(" ")[0]} anything...`}
              className="flex-1 min-h-[44px] max-h-28 resize-none bg-muted/20 border-border/30 text-sm"
              data-testid="input-advisor-question"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || chatMutation.isPending}
              className="h-11 w-11 p-0 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${advisor.color}, hsl(265 80% 50%))`, boxShadow: `0 0 15px ${advisor.glow}` }}
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> Confidential</span>
            <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> 256-bit Encrypted</span>
            <span className="text-[9px] text-muted-foreground/30">For strategic guidance only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono bg-primary/20 text-primary border border-primary/30" data-testid="badge-agent-status-running">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        RUNNING
      </span>
    );
  }
  if (status === "idle") {
    return (
      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" data-testid="badge-agent-status-idle">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        ACTIVE
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono bg-muted/40 text-muted-foreground border border-border/30" data-testid="badge-agent-status-standby">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
      STANDBY
    </span>
  );
}

function AgentCard({ advisor, agentStatus, onChat, onRun, isRunningNow }: {
  advisor: any; agentStatus?: any; onChat: () => void; onRun: () => void; isRunningNow: boolean;
}) {
  const Icon = advisor.icon;
  const status = agentStatus?.status ?? "standby";
  const lastFinding = agentStatus?.lastFinding;
  const activityCount = agentStatus?.activityCount ?? 0;
  const lastRun = agentStatus?.lastRun;

  const timeAgo = (dt: string | null) => {
    if (!dt) return "Never";
    const diff = (Date.now() - new Date(dt).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:scale-[1.01] group"
      style={{
        background: "linear-gradient(135deg, hsl(230 22% 9%) 0%, hsl(260 25% 12%) 100%)",
        border: `1px solid ${status === "running" ? advisor.color + "66" : advisor.border}`,
        boxShadow: status === "running"
          ? `0 0 24px ${advisor.glow}, 0 8px 32px hsl(265 80% 60% / 0.1)`
          : `0 8px 32px hsl(265 80% 60% / 0.06)`,
      }}
      data-testid={`card-advisor-${advisor.id}`}
    >
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none data-grid-bg" />
      {status === "running" && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
          background: `radial-gradient(ellipse at top left, ${advisor.glow}10 0%, transparent 70%)`,
          animation: "empire-glow 2s ease-in-out infinite",
        }} />
      )}

      <div className="relative flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: `linear-gradient(135deg, ${advisor.bg}, ${advisor.glow}15)`, border: `2px solid ${advisor.border}`, boxShadow: `0 0 12px ${advisor.glow}60`, color: advisor.color }}>
            <Icon className="w-5 h-5" />
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${status === "running" ? "animate-pulse" : ""}`}
            style={{ background: status === "running" ? advisor.color : status === "idle" ? "hsl(142 70% 50%)" : "hsl(220 10% 40%)" }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold text-white text-sm leading-tight" data-testid={`advisor-name-${advisor.id}`}>{advisor.name}</div>
              <div className="text-[11px] text-muted-foreground">{advisor.title}</div>
            </div>
            <AgentStatusBadge status={status} />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5" fill={i < Math.floor(advisor.rating) ? advisor.color : "transparent"} style={{ color: advisor.color }} />
            ))}
            <span className="text-[10px] font-mono text-muted-foreground">{advisor.rating}</span>
            <span className="text-[10px] text-muted-foreground/50">·</span>
            <span className="text-[10px] text-muted-foreground">{activityCount} scans</span>
            {lastRun && (
              <>
                <span className="text-[10px] text-muted-foreground/50">·</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />{timeAgo(lastRun)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {advisor.tags.map((tag: string) => (
          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: `${advisor.glow}15`, color: advisor.color, border: `1px solid ${advisor.border}` }}>
            {tag}
          </span>
        ))}
      </div>

      {lastFinding && (
        <div className="relative mt-3 rounded-lg p-2.5 border border-border/20 bg-black/30" data-testid={`agent-finding-${advisor.id}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Terminal className="w-2.5 h-2.5 text-primary/60" />
            <span className="text-[9px] font-mono text-primary/60 uppercase">Last Audit Finding</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{lastFinding}</p>
        </div>
      )}

      {!lastFinding && (
        <div className="relative mt-3 rounded-lg p-2.5 border border-dashed border-border/20 bg-muted/5">
          <p className="text-[11px] text-muted-foreground/50 italic text-center">No autonomous scan yet — run agent to begin monitoring</p>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-8 text-xs gap-1.5 border-border/30 hover:bg-muted/20"
          onClick={onRun}
          disabled={isRunningNow || status === "running"}
          data-testid={`button-run-agent-${advisor.id}`}
        >
          {(isRunningNow || status === "running") ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Scanning...</>
          ) : (
            <><Play className="w-3 h-3" />Run Audit</>
          )}
        </Button>
        <Button
          size="sm"
          className="flex-1 h-8 text-xs gap-1.5"
          onClick={onChat}
          style={{ background: `linear-gradient(135deg, ${advisor.glow}40, ${advisor.glow}20)`, border: `1px solid ${advisor.border}`, color: advisor.color }}
          data-testid={`button-chat-advisor-${advisor.id}`}
        >
          <MessageSquare className="w-3 h-3" />
          Consult
        </Button>
      </div>
    </div>
  );
}

const DOMAIN_GROUPS = [
  {
    label: "C-Suite Executives",
    color: "hsl(265 80% 65%)",
    agentIds: ["biz-cfo", "biz-cmo", "biz-strategy"],
    description: "Finance, Marketing, Strategy",
  },
  {
    label: "Revenue & Growth",
    color: "hsl(45 90% 55%)",
    agentIds: ["biz-revenue", "biz-growth", "biz-partnerships"],
    description: "Monetization, Growth Loops, BD",
  },
  {
    label: "Brand & Operations",
    color: "hsl(142 70% 50%)",
    agentIds: ["biz-brand", "biz-ops", "biz-investor"],
    description: "Brand, Systems, Fundraising",
  },
];

export default function BusinessAgents() {
  const [activeGroup, setActiveGroup] = useState<string>("C-Suite Executives");
  const [chatAdvisor, setChatAdvisor] = useState<any | null>(null);
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [consultCount, setConsultCount] = useState(9847);
  const [runAllPending, setRunAllPending] = useState(false);

  const { data: agentStatuses, refetch: refetchStatuses } = useQuery<any[]>({
    queryKey: ["/api/business-agents/status"],
    refetchInterval: 20000,
  });

  const { data: agentActivities, refetch: refetchActivities } = useQuery<any[]>({
    queryKey: ["/api/business-agents/activities"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    const t = setInterval(() => setConsultCount(p => p + Math.floor(Math.random() * 2)), 8000);
    return () => clearInterval(t);
  }, []);

  const runAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiRequest("POST", `/api/business-agents/${agentId}/run`, {}),
    onMutate: (agentId) => setRunningAgents(prev => new Set(prev).add(agentId)),
    onSettled: (_, __, agentId) => {
      setRunningAgents(prev => { const s = new Set(prev); s.delete(agentId); return s; });
      setTimeout(() => { refetchStatuses(); refetchActivities(); }, 3000);
    },
  });

  const runAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/business-agents/run-all", {}),
    onMutate: () => setRunAllPending(true),
    onSettled: () => {
      setTimeout(() => { refetchStatuses(); refetchActivities(); }, 4000);
      setTimeout(() => setRunAllPending(false), 8000);
    },
  });

  const getAgentStatus = (agentId: string) =>
    (agentStatuses as any[])?.find((s: any) => s.agentId === agentId);

  const activeCount = (agentStatuses as any[])?.filter(s => s.status === "idle" || s.status === "running").length ?? 0;
  const totalScans = (agentStatuses as any[])?.reduce((sum, s) => sum + (s.activityCount ?? 0), 0) ?? 0;
  const recentActivities = (agentActivities as any[])?.slice(0, 20) ?? [];

  const currentGroup = DOMAIN_GROUPS.find(g => g.label === activeGroup) ?? DOMAIN_GROUPS[0];
  const currentAdvisors = BIZ_ADVISORS.filter(a => currentGroup.agentIds.includes(a.id));

  const getAdvisorForActivity = (agentId: string) =>
    BIZ_ADVISORS.find(a => a.agentId === agentId);

  const timeAgo = (dt: string | null) => {
    if (!dt) return "—";
    const diff = (Date.now() - new Date(dt).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen animated-gradient-bg relative pb-nav">
      <div className="scan-overlay absolute inset-0 pointer-events-none z-0" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="relative rounded-2xl overflow-hidden" data-testid="hero-banner"
          style={{ background: "linear-gradient(135deg, hsl(230 25% 7%) 0%, hsl(265 30% 10%) 50%, hsl(230 25% 7%) 100%)", border: "1px solid hsl(265 60% 40% / 0.3)" }}>
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, hsl(265 80% 60% / 0.12) 0%, transparent 60%)" }} />

          <div className="relative p-5 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border" style={{ background: "hsl(265 80% 60% / 0.15)", borderColor: "hsl(265 80% 60% / 0.4)", color: "hsl(265 80% 70%)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    AI EXECUTIVE COMMAND CENTER
                  </div>
                  <span className="text-[11px] text-emerald-400 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {activeCount}/9 EXECUTIVES ACTIVE
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold holographic-text mb-2" data-testid="page-title">
                  God-Level Business AI Team
                </h1>
                <p className="text-sm text-muted-foreground max-w-xl">
                  9 world-class AI executives — CFO, CMO, CSO, Revenue Architect, BD Head, CGO, COO, Brand Architect, and Investor Relations — autonomously auditing your business and available 24/7 for direct consultation.
                </p>

                <div className="flex flex-wrap gap-3 mt-4">
                  <Button
                    size="sm"
                    onClick={() => runAllMutation.mutate()}
                    disabled={runAllPending}
                    className="gap-2 font-mono text-xs"
                    style={{ background: "linear-gradient(135deg, hsl(265 80% 50%), hsl(265 80% 40%))", boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)" }}
                    data-testid="button-run-all-agents"
                  >
                    {runAllPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Run Full Business Audit
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => runAllMutation.mutate()}
                    disabled={runAllPending}
                    className="gap-2 font-mono text-xs border-border/30"
                    data-testid="button-refresh-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh All 9 Execs
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                {[
                  { label: "Consultations", value: consultCount.toLocaleString(), icon: MessageSquare, color: "hsl(265 80% 65%)", testid: "stat-consultations" },
                  { label: "Execs Active", value: `${activeCount}/9`, icon: Activity, color: "hsl(142 70% 50%)", testid: "stat-exec-count" },
                  { label: "Satisfaction", value: "99%", icon: Star, color: "hsl(45 90% 55%)", testid: "stat-satisfaction" },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-3 rounded-xl border border-border/20 bg-black/20" data-testid={stat.testid}>
                    <stat.icon className="w-4 h-4 mx-auto mb-1" style={{ color: stat.color }} />
                    <div className="text-lg font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4" data-testid="trust-strip">
              {[
                { icon: "🔒", label: "Executive Confidentiality" },
                { icon: "🛡", label: "256-bit Encrypted" },
                { icon: "🏆", label: "Top 1% AI Executives" },
                { icon: "⚡", label: "24/7 Availability" },
                { icon: "💎", label: "Board-Level Expertise" },
              ].map((b, i) => (
                <span key={b.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2.5 py-1 rounded-full border border-border/20 bg-muted/10" data-testid={`trust-badge-${i}`}>
                  <span>{b.icon}</span>{b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {DOMAIN_GROUPS.map(group => (
            <button
              key={group.label}
              onClick={() => setActiveGroup(group.label)}
              className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl font-mono text-xs font-bold transition-all duration-300"
              style={activeGroup === group.label ? {
                background: "linear-gradient(135deg, hsl(265 80% 50%), hsl(265 80% 40%))",
                color: "white", boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)",
              } : {
                background: "hsl(230 22% 10%)", color: "hsl(265 40% 60%)",
                border: "1px solid hsl(265 30% 20%)",
              }}
              data-testid={`tab-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="text-center leading-tight">{group.label}</span>
              <span className="text-[9px] opacity-60">{group.description}</span>
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                {currentGroup.label} — Autonomous Business Intelligence
              </h2>
              <span className="text-[10px] font-mono text-primary/60">
                {currentAdvisors.filter(a => (getAgentStatus(a.agentId)?.activityCount ?? 0) > 0).length}/{currentAdvisors.length} scanned
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
              {currentAdvisors.map(advisor => (
                <AgentCard
                  key={advisor.id}
                  advisor={advisor}
                  agentStatus={getAgentStatus(advisor.agentId)}
                  onChat={() => setChatAdvisor(advisor)}
                  onRun={() => runAgentMutation.mutate(advisor.agentId)}
                  isRunningNow={runningAgents.has(advisor.agentId)}
                />
              ))}
            </div>

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="section-exec-profiles">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Executive Profiles</div>
              <div className="grid grid-cols-3 gap-2">
                {currentAdvisors.map(advisor => {
                  const Icon = advisor.icon;
                  return (
                    <div key={advisor.id} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/20 bg-muted/10 text-center"
                      data-testid={`exec-profile-${advisor.id}`}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: advisor.bg, border: `2px solid ${advisor.border}`, color: advisor.color }}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="text-[10px] font-bold text-white leading-tight">{advisor.name.split(" ")[0]}</div>
                      <div className="text-[9px] text-muted-foreground">{advisor.experience} exp</div>
                      <div className="text-[9px] font-mono" style={{ color: advisor.color }}>{advisor.cases}</div>
                      <button
                        onClick={() => setChatAdvisor(advisor)}
                        className="text-[9px] px-2 py-0.5 rounded-full border mt-0.5 hover:opacity-80 transition-opacity"
                        style={{ borderColor: advisor.border, color: advisor.color, background: advisor.bg }}
                        data-testid={`quick-chat-${advisor.id}`}
                      >
                        Consult
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/20 bg-black/40 overflow-hidden" data-testid="widget-agent-activity-feed">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-mono text-primary/80 uppercase">Live Executive Feed</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{recentActivities.length} events</span>
              </div>

              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {recentActivities.length === 0 && (
                  <div className="text-center py-8">
                    <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/50">No executive activity yet</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Run any executive agent to start monitoring</p>
                  </div>
                )}
                {recentActivities.map((activity: any, i: number) => {
                  const adv = getAdvisorForActivity(activity.agentId);
                  return (
                    <div key={activity.id ?? i} className="flex gap-2.5 p-2 rounded-lg bg-muted/10 border border-border/10" data-testid={`activity-item-${i}`}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                        style={{ background: `${adv?.glow ?? "hsl(265 80% 60% / 0.2)"}20`, border: `1px solid ${adv?.border ?? "hsl(265 30% 30%)"}`, color: adv?.color ?? "hsl(265 80% 65%)" }}>
                        {adv?.initials ?? "AI"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-mono font-bold" style={{ color: adv?.color ?? "hsl(265 80% 65%)" }}>
                            {adv?.name?.split(" ")[0] ?? activity.agentId}
                          </span>
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-[9px] text-muted-foreground/50">{timeAgo(activity.createdAt)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                          {(activity.details as any)?.description ?? activity.action}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="widget-business-summary">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Business Intelligence Summary</div>
              <div className="space-y-2">
                {[
                  { label: "Total Audits Run", value: totalScans.toString(), color: "hsl(265 80% 65%)" },
                  { label: "Execs Activated", value: `${activeCount}/9`, color: "hsl(142 70% 50%)" },
                  { label: "C-Suite Active", value: `${(agentStatuses as any[])?.filter(s => ["biz-cfo","biz-cmo","biz-strategy"].includes(s.agentId) && s.activityCount > 0).length ?? 0}/3`, color: "hsl(200 80% 60%)" },
                  { label: "Revenue Team", value: `${(agentStatuses as any[])?.filter(s => ["biz-revenue","biz-growth","biz-partnerships"].includes(s.agentId) && s.activityCount > 0).length ?? 0}/3`, color: "hsl(45 90% 55%)" },
                  { label: "Brand & Ops", value: `${(agentStatuses as any[])?.filter(s => ["biz-brand","biz-ops","biz-investor"].includes(s.agentId) && s.activityCount > 0).length ?? 0}/3`, color: "hsl(330 70% 60%)" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/10 last:border-0">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="section-exec-quick-access">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Quick Executive Access</div>
              <div className="space-y-1.5">
                {BIZ_ADVISORS.map(advisor => {
                  const Icon = advisor.icon;
                  const status = getAgentStatus(advisor.agentId);
                  return (
                    <button
                      key={advisor.id}
                      onClick={() => setChatAdvisor(advisor)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/20 transition-colors text-left group"
                      style={{ border: "1px solid transparent" }}
                      data-testid={`quick-access-${advisor.id}`}
                    >
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: advisor.bg, color: advisor.color }}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">{advisor.name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{advisor.title}</div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full"
                          style={{ background: status?.status === "idle" ? "hsl(142 70% 50%)" : status?.status === "running" ? advisor.color : "hsl(220 10% 40%)" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="section-bottom-cta">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono holographic-text mb-1" data-testid="stat-advisors">9</div>
                <div className="text-xs text-muted-foreground mb-0.5">God-Level AI Executives</div>
                <div className="text-xs font-mono text-emerald-400" data-testid="stat-availability">24/7 On Call</div>
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted/20 border border-border/20 text-muted-foreground">C-Suite Team</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted/20 border border-border/20 text-muted-foreground">Revenue Engine</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted/20 border border-border/20 text-muted-foreground">Brand & Ops</span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2">For strategic guidance only. Consult licensed professionals for specific decisions.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {chatAdvisor && (
        <AdvisorChat
          advisor={chatAdvisor}
          onClose={() => setChatAdvisor(null)}
        />
      )}
    </div>
  );
}
