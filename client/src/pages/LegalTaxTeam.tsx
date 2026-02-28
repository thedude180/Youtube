import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Scale, DollarSign, MessageSquare, Send, Loader2, ChevronDown, ChevronUp,
  Shield, FileText, Globe, Building2, Lock, Users, Music, AlertTriangle,
  Calculator, Receipt, BarChart3, TrendingUp, PiggyBank, MapPin, Bitcoin,
  BookOpen, Briefcase, Star, X, ArrowLeft,
} from "lucide-react";

const LEGAL_ADVISORS = [
  {
    id: "copyright-ip",
    name: "Victoria Chen",
    title: "Copyright & IP Attorney",
    specialty: "Copyright registration, fair use, DMCA, licensing",
    icon: FileText,
    color: "hsl(265 80% 65%)",
    bg: "hsl(265 80% 65% / 0.1)",
    border: "hsl(265 80% 65% / 0.3)",
    tags: ["Copyright", "Fair Use", "DMCA", "Licensing"],
    intro: "I protect creators' intellectual property across all platforms. Whether it's registering your work, fighting wrongful takedowns, or licensing your content — I've got you covered.",
  },
  {
    id: "contract-deals",
    name: "Marcus Webb",
    title: "Contract & Deal Attorney",
    specialty: "Brand deals, sponsorships, revenue share, talent contracts",
    icon: Briefcase,
    color: "hsl(200 80% 60%)",
    bg: "hsl(200 80% 60% / 0.1)",
    border: "hsl(200 80% 60% / 0.3)",
    tags: ["Brand Deals", "Sponsorships", "Contracts", "FTC"],
    intro: "I've negotiated hundreds of millions in creator deals. I'll help you spot red flags, negotiate better terms, and never get locked into a bad contract again.",
  },
  {
    id: "dmca-platform",
    name: "Dr. Aisha Okonkwo",
    title: "DMCA & Platform Law Expert",
    specialty: "Platform bans, content disputes, TOS violations, appeals",
    icon: Shield,
    color: "hsl(142 70% 50%)",
    bg: "hsl(142 70% 50% / 0.1)",
    border: "hsl(142 70% 50% / 0.3)",
    tags: ["DMCA", "Appeals", "Platform TOS", "Bans"],
    intro: "I know every platform's rules inside out. From YouTube content ID to Twitch strikes — I fight wrongful takedowns and help you navigate platform disputes successfully.",
  },
  {
    id: "business-corporate",
    name: "James Thornton",
    title: "Business & Corporate Attorney",
    specialty: "LLC formation, operating agreements, liability protection",
    icon: Building2,
    color: "hsl(45 90% 55%)",
    bg: "hsl(45 90% 55% / 0.1)",
    border: "hsl(45 90% 55% / 0.3)",
    tags: ["LLC", "S-Corp", "Liability", "Agreements"],
    intro: "I turn solo creators into protected business entities. Proper structure means lower taxes, less liability, and a real business you can scale and eventually sell.",
  },
  {
    id: "privacy-data",
    name: "Sofia Reyes",
    title: "Privacy & Data Law Attorney",
    specialty: "GDPR, CCPA, COPPA, data collection, privacy policies",
    icon: Lock,
    color: "hsl(320 70% 60%)",
    bg: "hsl(320 70% 60% / 0.1)",
    border: "hsl(320 70% 60% / 0.3)",
    tags: ["GDPR", "CCPA", "Privacy", "Data"],
    intro: "Privacy law affects every creator who collects emails, runs memberships, or sells products globally. I make compliance straightforward without killing your user experience.",
  },
  {
    id: "employment-creator",
    name: "Derek Morgan",
    title: "Employment & Creator Economy Attorney",
    specialty: "Worker classification, NDAs, team contracts, non-competes",
    icon: Users,
    color: "hsl(25 90% 55%)",
    bg: "hsl(25 90% 55% / 0.1)",
    border: "hsl(25 90% 55% / 0.3)",
    tags: ["Employment", "Contractors", "NDAs", "Team"],
    intro: "When you hire your first editor or build a team, you need the right contracts. I specialize in creator teams — employees, contractors, and everyone in between.",
  },
  {
    id: "defamation-reputation",
    name: "Claire Fontaine",
    title: "Defamation & Reputation Attorney",
    specialty: "Libel, slander, cease-and-desist, doxxing response",
    icon: AlertTriangle,
    color: "hsl(0 80% 55%)",
    bg: "hsl(0 80% 55% / 0.1)",
    border: "hsl(0 80% 55% / 0.3)",
    tags: ["Defamation", "Libel", "Reputation", "C&D"],
    intro: "Online reputation attacks can destroy careers. I defend creators against false accusations, coordinate C&D responses, and know exactly when to fight back legally.",
  },
  {
    id: "music-licensing",
    name: "Andre Baptiste",
    title: "Music Licensing & Publishing Attorney",
    specialty: "Sync licenses, music rights, royalties, copyright claims",
    icon: Music,
    color: "hsl(330 80% 60%)",
    bg: "hsl(330 80% 60% / 0.1)",
    border: "hsl(330 80% 60% / 0.3)",
    tags: ["Music Rights", "Sync", "Royalties", "Claims"],
    intro: "Music is the #1 cause of creator content claims. I'll show you exactly what you can use, how to clear music legally, and how to fight bogus music copyright claims.",
  },
  {
    id: "international-law",
    name: "Yuki Tanaka",
    title: "International & Cross-Border Attorney",
    specialty: "Global compliance, international contracts, multi-jurisdiction",
    icon: Globe,
    color: "hsl(180 70% 50%)",
    bg: "hsl(180 70% 50% / 0.1)",
    border: "hsl(180 70% 50% / 0.3)",
    tags: ["International", "Cross-Border", "Global", "Treaties"],
    intro: "Creators with global audiences face global legal obligations. I navigate multi-jurisdiction compliance so you can operate anywhere without legal surprises.",
  },
];

const TAX_ADVISORS = [
  {
    id: "self-employment",
    name: "Robert Kaufman, CPA",
    title: "Self-Employment Tax Specialist",
    specialty: "SE tax, quarterly estimates, Schedule C, deductions",
    icon: Calculator,
    color: "hsl(265 80% 65%)",
    bg: "hsl(265 80% 65% / 0.1)",
    border: "hsl(265 80% 65% / 0.3)",
    tags: ["SE Tax", "Schedule C", "Estimates", "Deductions"],
    intro: "Self-employment tax hits creators hard if you're not prepared. I'll show you exactly how to calculate it, when to pay it, and every legal way to reduce it.",
  },
  {
    id: "business-deductions",
    name: "Patricia Hollis, CPA",
    title: "Business Deductions Expert",
    specialty: "Home office, equipment, software, travel, all creator deductions",
    icon: Receipt,
    color: "hsl(142 70% 50%)",
    bg: "hsl(142 70% 50% / 0.1)",
    border: "hsl(142 70% 50% / 0.3)",
    tags: ["Deductions", "Home Office", "Equipment", "Software"],
    intro: "Most creators leave thousands on the table. I know every legitimate deduction — cameras, computers, internet, subscriptions, travel, home studio — and how to document them properly.",
  },
  {
    id: "business-structure-tax",
    name: "Nathan Cross, CPA, JD",
    title: "Business Structure & Entity Tax Advisor",
    specialty: "LLC vs S-Corp, QBI deduction, salary optimization",
    icon: Building2,
    color: "hsl(45 90% 55%)",
    bg: "hsl(45 90% 55% / 0.1)",
    border: "hsl(45 90% 55% / 0.3)",
    tags: ["S-Corp", "LLC", "QBI", "Entity Tax"],
    intro: "The right business structure can save you $10K-$50K+ per year in taxes. I calculate the exact crossover point where an S-Corp makes sense for your income level.",
  },
  {
    id: "creator-income",
    name: "Michelle Tran, CPA",
    title: "Creator Income & Revenue Tax Advisor",
    specialty: "AdSense, brand deals, merch, 1099s, all revenue streams",
    icon: DollarSign,
    color: "hsl(200 80% 60%)",
    bg: "hsl(200 80% 60% / 0.1)",
    border: "hsl(200 80% 60% / 0.3)",
    tags: ["Revenue Streams", "1099s", "AdSense", "Merch"],
    intro: "Creator income comes from 10+ sources and each is taxed differently. I organize your entire financial picture and make sure every stream is handled correctly.",
  },
  {
    id: "international-tax",
    name: "Dr. Ivan Petrov, CPA",
    title: "International Tax Advisor",
    specialty: "Foreign income, tax treaties, FBAR, FATCA, withholding",
    icon: Globe,
    color: "hsl(180 70% 50%)",
    bg: "hsl(180 70% 50% / 0.1)",
    border: "hsl(180 70% 50% / 0.3)",
    tags: ["International", "FBAR", "Tax Treaties", "Withholding"],
    intro: "Earning from global platforms means dealing with international tax complexity. I navigate tax treaties, foreign withholding, and FBAR requirements so you stay fully compliant.",
  },
  {
    id: "crypto-digital",
    name: "Zara Kim, CPA",
    title: "Crypto & Digital Asset Tax Advisor",
    specialty: "NFTs, crypto payments, DeFi income, staking rewards",
    icon: Bitcoin,
    color: "hsl(330 80% 60%)",
    bg: "hsl(330 80% 60% / 0.1)",
    border: "hsl(330 80% 60% / 0.3)",
    tags: ["Crypto", "NFTs", "DeFi", "Digital Assets"],
    intro: "Crypto and NFT income is heavily scrutinized by the IRS. I stay on top of every ruling and help creators properly track, report, and minimize crypto tax liability.",
  },
  {
    id: "state-local",
    name: "Thomas Briggs, CPA",
    title: "State & Local Tax Advisor",
    specialty: "Multi-state filing, sales tax on digital products, nexus",
    icon: MapPin,
    color: "hsl(25 90% 55%)",
    bg: "hsl(25 90% 55% / 0.1)",
    border: "hsl(25 90% 55% / 0.3)",
    tags: ["State Tax", "Sales Tax", "Multi-State", "Nexus"],
    intro: "Selling courses or digital products nationwide creates unexpected state tax obligations. I handle all 50 states and know exactly where you have nexus and where you don't.",
  },
  {
    id: "retirement-planning",
    name: "Sandra Osei, CFP, CPA",
    title: "Retirement & Tax Planning Advisor",
    specialty: "Solo 401k, SEP-IRA, Roth conversions, wealth building",
    icon: PiggyBank,
    color: "hsl(142 70% 60%)",
    bg: "hsl(142 70% 60% / 0.1)",
    border: "hsl(142 70% 60% / 0.3)",
    tags: ["Solo 401k", "SEP-IRA", "Roth", "Retirement"],
    intro: "A Solo 401(k) can shelter $66K+ per year from taxes. I design retirement strategies that slash your tax bill today while building serious long-term wealth.",
  },
  {
    id: "audit-defense",
    name: "Frank Delgado, EA, CPA",
    title: "Audit Defense & IRS Representation",
    specialty: "IRS audits, CP2000 notices, penalty abatement, appeals",
    icon: Shield,
    color: "hsl(0 80% 55%)",
    bg: "hsl(0 80% 55% / 0.1)",
    border: "hsl(0 80% 55% / 0.3)",
    tags: ["IRS Audit", "Penalty", "Appeals", "Representation"],
    intro: "If the IRS comes knocking, you want me in your corner. I've defended hundreds of creators in audits and I know exactly how to document creative business expenses.",
  },
];

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  "copyright-ip": ["Can I use that YouTube clip in my video under fair use?", "How do I register copyright on my content?", "Someone stole my video — what do I do?"],
  "contract-deals": ["Is this brand deal contract fair?", "What's a reasonable kill fee?", "Can they use my likeness forever?"],
  "dmca-platform": ["How do I fight a false DMCA claim?", "YouTube suspended my channel — what are my options?", "They claimed my stream under Content ID — is it valid?"],
  "business-corporate": ["Should I form an LLC or S-Corp?", "How do I separate my personal and business finances?", "Can I get sued personally if my LLC is sued?"],
  "privacy-data": ["Do I need a privacy policy?", "Am I GDPR compliant if I collect email addresses?", "Can I use my audience's data for ads?"],
  "employment-creator": ["Should my editor be a contractor or employee?", "What should be in my NDA for my team?", "Can I add a non-compete to my manager agreement?"],
  "defamation-reputation": ["Someone is spreading lies about me online — can I sue?", "When should I send a cease-and-desist letter?", "Can I counter-sue someone who doxxed me?"],
  "music-licensing": ["Can I use copyrighted music in my Twitch stream?", "What's the difference between a sync license and a master use license?", "Can I dispute a music copyright claim that I believe is wrong?"],
  "international-law": ["Do I need to comply with EU regulations if I have European subscribers?", "Can I operate my creator business from another country?", "What's the legal risk of selling digital products globally?"],
  "self-employment": ["How do I calculate my quarterly estimated taxes?", "What happens if I underpay my estimated taxes?", "How does the QBI deduction work for me?"],
  "business-deductions": ["Can I deduct my home office?", "Is my new camera 100% deductible?", "Can I write off my gaming setup?"],
  "business-structure-tax": ["At what income should I switch from LLC to S-Corp?", "How much can I save with an S-Corp election?", "What's the optimal salary to pay myself through my S-Corp?"],
  "creator-income": ["How is AdSense revenue taxed?", "How do I handle 1099s from multiple platforms?", "Are Super Chats considered income?"],
  "international-tax": ["Do I owe taxes on income from foreign viewers?", "What is FBAR and do I need to file it?", "How do tax treaties affect my creator income?"],
  "crypto-digital": ["How are NFT sales taxed?", "Do I owe taxes on crypto I received as payment?", "How do I track my crypto cost basis?"],
  "state-local": ["Do I need to collect sales tax on my online course?", "I moved states mid-year — how does that affect my taxes?", "Do I have tax nexus in states I've never been to?"],
  "retirement-planning": ["How much can I contribute to a Solo 401k?", "Should I do Traditional or Roth contributions?", "Can I use a defined benefit plan to shelter more income?"],
  "audit-defense": ["I got a CP2000 notice — what do I do?", "The IRS is auditing my home office deduction — how do I prove it?", "How do I request penalty abatement?"],
};

interface Message {
  role: "user" | "advisor";
  content: string;
  timestamp: Date;
}

interface AdvisorChatProps {
  advisor: (typeof LEGAL_ADVISORS)[0] | (typeof TAX_ADVISORS)[0];
  type: "legal" | "tax";
  onClose: () => void;
}

function AdvisorChat({ advisor, type, onClose }: AdvisorChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "advisor",
      content: advisor.intro,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", "/api/legal-tax/chat", {
        advisorId: advisor.id,
        message,
        type,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "advisor", content: data.reply, timestamp: new Date() },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: "advisor",
          content: "I'm experiencing a technical issue right now. Please try again in a moment.",
          timestamp: new Date(),
        },
      ]);
    },
  });

  const sendMessage = (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", content: msg, timestamp: new Date() }]);
    setInput("");
    chatMutation.mutate(msg);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const suggestions = SUGGESTED_QUESTIONS[advisor.id] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" data-testid="advisor-chat-overlay">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "hsl(230 22% 9%)", border: `1px solid ${advisor.border}`, boxShadow: `0 0 60px ${advisor.color}22` }}>
        <div className="flex items-center gap-3 p-4 border-b border-border/20" style={{ background: advisor.bg }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
            style={{ background: advisor.color }}>
            {advisor.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white" data-testid="chat-advisor-name">{advisor.name}</div>
            <div className="text-xs text-muted-foreground">{advisor.title}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-chat" className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]" data-testid="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`} data-testid={`chat-message-${i}`}>
              {msg.role === "advisor" && (
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: advisor.color }}>
                  {advisor.name[0]}
                </div>
              )}
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary/20 text-white border border-primary/30 rounded-tr-sm"
                  : "bg-muted/30 text-foreground border border-border/20 rounded-tl-sm"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-2 items-start" data-testid="chat-typing-indicator">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: advisor.color }}>
                {advisor.name[0]}
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted/30 border border-border/20 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && suggestions.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5" data-testid="chat-suggestions">
            {suggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="text-[11px] px-2.5 py-1 rounded-full border text-left transition-all hover:opacity-80"
                style={{ borderColor: advisor.border, color: advisor.color, background: advisor.bg }}
                data-testid={`suggestion-${i}`}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-border/20 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${advisor.name.split(" ")[0]} anything...`}
            className="resize-none text-sm min-h-[44px] max-h-24 flex-1"
            rows={1}
            data-testid="input-advisor-question"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || chatMutation.isPending}
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            style={{ background: advisor.color }}
            data-testid="button-send-message"
          >
            {chatMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="px-4 pb-3 text-[10px] text-muted-foreground/50 text-center">
          AI-generated legal and tax guidance is for educational purposes. Always consult a licensed professional for your specific situation.
        </div>
      </div>
    </div>
  );
}

interface AdvisorCardProps {
  advisor: (typeof LEGAL_ADVISORS)[0] | (typeof TAX_ADVISORS)[0];
  type: "legal" | "tax";
  onSelect: (advisor: any, type: "legal" | "tax") => void;
}

function AdvisorCard({ advisor, type, onSelect }: AdvisorCardProps) {
  const Icon = advisor.icon;
  return (
    <div
      className="rounded-xl p-4 border transition-all duration-200 cursor-pointer hover-lift group relative overflow-hidden"
      style={{ borderColor: advisor.border, background: advisor.bg }}
      onClick={() => onSelect(advisor, type)}
      data-testid={`card-advisor-${advisor.id}`}
    >
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
            style={{ background: `${advisor.color}22`, border: `1px solid ${advisor.color}44` }}>
            <Icon className="w-5 h-5" style={{ color: advisor.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white text-sm leading-tight" data-testid={`advisor-name-${advisor.id}`}>{advisor.name}</div>
            <div className="text-[11px] mt-0.5" style={{ color: advisor.color }}>{advisor.title}</div>
          </div>
          <MessageSquare className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
            style={{ color: advisor.color }} />
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">{advisor.specialty}</p>

        <div className="flex flex-wrap gap-1">
          {advisor.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: `${advisor.color}15`, color: advisor.color, border: `1px solid ${advisor.color}25` }}>
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: advisor.color }}>
          <MessageSquare className="w-3 h-3" />
          <span>Ask a question</span>
          <span className="ml-auto text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Click to consult →</span>
        </div>
      </div>
    </div>
  );
}

function TeamHeader({ type, count }: { type: "legal" | "tax"; count: number }) {
  const isLegal = type === "legal";
  return (
    <div className="card-empire rounded-2xl p-5 relative overflow-hidden mb-4"
      style={{ borderColor: isLegal ? "hsl(265 80% 60% / 0.3)" : "hsl(45 90% 55% / 0.3)" }}
      data-testid={`header-${type}-team`}>
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="flex items-center gap-4 relative">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: isLegal ? "hsl(265 80% 60% / 0.15)" : "hsl(45 90% 55% / 0.15)",
            border: `1px solid ${isLegal ? "hsl(265 80% 60% / 0.4)" : "hsl(45 90% 55% / 0.4)"}`,
            boxShadow: `0 0 20px ${isLegal ? "hsl(265 80% 60% / 0.2)" : "hsl(45 90% 55% / 0.2)"}`,
          }}>
          {isLegal ? (
            <Scale className="w-7 h-7" style={{ color: isLegal ? "hsl(265 80% 70%)" : "hsl(45 90% 65%)" }} />
          ) : (
            <Calculator className="w-7 h-7" style={{ color: "hsl(45 90% 65%)" }} />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-white holographic-text" data-testid={`title-${type}-team`}>
              {isLegal ? "World-Class Legal Team" : "World-Class Tax Advisory Team"}
            </h2>
            <Badge variant="secondary" className="text-[10px] font-mono" data-testid={`badge-${type}-count`}>
              {count} Advisors
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLegal
              ? "Elite attorneys covering every area of creator law. Click any advisor to get confidential AI-powered legal guidance."
              : "World-class tax professionals across all creator tax scenarios. Get AI-powered tax strategy and answers instantly."}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-400 font-mono">All advisors available 24/7</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mb-4 flex items-start gap-3" data-testid="banner-disclaimer">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xs text-amber-200/80">
          <strong className="text-amber-400">Educational guidance only.</strong>{" "}
          The AI advisors on this page provide general legal and tax information for educational purposes. This is not attorney-client privilege and does not constitute legal or tax advice for your specific situation. Always consult a licensed attorney or CPA for matters requiring professional judgment.
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-400/60 hover:text-amber-400 transition-colors text-xs ml-2" data-testid="button-dismiss-disclaimer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function LegalTaxTeam() {
  const [activeChat, setActiveChat] = useState<{ advisor: any; type: "legal" | "tax" } | null>(null);
  const [activeTab, setActiveTab] = useState<"legal" | "tax">("legal");

  return (
    <div className="p-3 lg:p-4 space-y-4 max-w-6xl mx-auto page-enter" data-testid="page-legal-tax-team">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20 border border-primary/30"
          style={{ boxShadow: "0 0 20px hsl(265 80% 60% / 0.3)" }}>
          <Scale className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold holographic-text" data-testid="page-title">Legal & Tax Advisory Team</h1>
          <p className="text-sm text-muted-foreground">Your world-class team of attorneys and tax professionals — available 24/7</p>
        </div>
      </div>

      <DisclaimerBanner />

      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/20" data-testid="tab-switcher">
        <button
          onClick={() => setActiveTab("legal")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === "legal"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-legal"
        >
          <Scale className="w-4 h-4" />
          Legal Team
          <Badge variant="secondary" className="text-[10px]">{LEGAL_ADVISORS.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("tax")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === "tax"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-tax"
        >
          <Calculator className="w-4 h-4" />
          Tax Team
          <Badge variant="secondary" className="text-[10px]">{TAX_ADVISORS.length}</Badge>
        </button>
      </div>

      {activeTab === "legal" && (
        <div data-testid="section-legal-team">
          <TeamHeader type="legal" count={LEGAL_ADVISORS.length} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LEGAL_ADVISORS.map((advisor) => (
              <AdvisorCard
                key={advisor.id}
                advisor={advisor}
                type="legal"
                onSelect={(adv, type) => setActiveChat({ advisor: adv, type })}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === "tax" && (
        <div data-testid="section-tax-team">
          <TeamHeader type="tax" count={TAX_ADVISORS.length} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TAX_ADVISORS.map((advisor) => (
              <AdvisorCard
                key={advisor.id}
                advisor={advisor}
                type="tax"
                onSelect={(adv, type) => setActiveChat({ advisor: adv, type })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 pt-2" data-testid="section-bottom-stats">
        <div className="rounded-xl p-4 bg-muted/20 border border-border/20 text-center" data-testid="stat-advisors">
          <div className="text-2xl font-bold font-mono text-white">{LEGAL_ADVISORS.length + TAX_ADVISORS.length}</div>
          <div className="text-xs text-muted-foreground mt-1">World-Class Advisors</div>
        </div>
        <div className="rounded-xl p-4 bg-muted/20 border border-border/20 text-center" data-testid="stat-areas">
          <div className="text-2xl font-bold font-mono text-white">18+</div>
          <div className="text-xs text-muted-foreground mt-1">Areas of Expertise</div>
        </div>
        <div className="rounded-xl p-4 bg-muted/20 border border-border/20 text-center" data-testid="stat-availability">
          <div className="text-2xl font-bold font-mono text-emerald-400">24/7</div>
          <div className="text-xs text-muted-foreground mt-1">Always Available</div>
        </div>
      </div>

      {activeChat && (
        <AdvisorChat
          advisor={activeChat.advisor}
          type={activeChat.type}
          onClose={() => setActiveChat(null)}
        />
      )}
    </div>
  );
}
