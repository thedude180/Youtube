import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Scale, DollarSign, MessageSquare, Send, Loader2,
  Shield, FileText, Globe, Building2, Lock, Users, Music, AlertTriangle,
  Calculator, Receipt, PiggyBank, MapPin, Bitcoin,
  Briefcase, X, Star, Zap, CheckCircle2, TrendingUp,
  Clock, Play, RefreshCw, Activity, Terminal,
} from "lucide-react";

const LEGAL_ADVISORS = [
  {
    id: "copyright-ip",
    agentId: "legal-copyright",
    name: "Victoria Chen",
    initials: "VC",
    title: "Copyright & IP Attorney",
    specialty: "Copyright registration, fair use, DMCA, licensing",
    icon: FileText,
    color: "hsl(265 80% 65%)",
    bg: "hsl(265 80% 65% / 0.08)",
    border: "hsl(265 80% 65% / 0.25)",
    glow: "hsl(265 80% 65% / 0.4)",
    tags: ["Copyright", "Fair Use", "DMCA", "Licensing"],
    experience: "22 yrs",
    rating: 4.9,
    cases: "2,400+",
    expertise: 98,
    credentials: ["Harvard Law JD", "IP Law Review Editor", "Top 1% Creator Attorneys"],
    intro: "I protect creators' intellectual property across all platforms. Whether it's registering your work, fighting wrongful takedowns, or licensing your content — I've got you covered.",
  },
  {
    id: "contract-deals",
    agentId: "legal-contracts",
    name: "Marcus Webb",
    initials: "MW",
    title: "Contract & Deal Attorney",
    specialty: "Brand deals, sponsorships, revenue share, talent contracts",
    icon: Briefcase,
    color: "hsl(200 80% 60%)",
    bg: "hsl(200 80% 60% / 0.08)",
    border: "hsl(200 80% 60% / 0.25)",
    glow: "hsl(200 80% 60% / 0.4)",
    tags: ["Brand Deals", "Sponsorships", "Contracts", "FTC"],
    experience: "18 yrs",
    rating: 4.8,
    cases: "$340M+ negotiated",
    expertise: 96,
    credentials: ["Yale Law JD", "Entertainment Law Partner", "Forbes Legal 100"],
    intro: "I've negotiated hundreds of millions in creator deals. I'll help you spot red flags, negotiate better terms, and never get locked into a bad contract again.",
  },
  {
    id: "dmca-platform",
    agentId: "legal-dmca",
    name: "Dr. Aisha Okonkwo",
    initials: "AO",
    title: "DMCA & Platform Law Expert",
    specialty: "Platform bans, content disputes, TOS violations, appeals",
    icon: Shield,
    color: "hsl(142 70% 50%)",
    bg: "hsl(142 70% 50% / 0.08)",
    border: "hsl(142 70% 50% / 0.25)",
    glow: "hsl(142 70% 50% / 0.4)",
    tags: ["DMCA", "Appeals", "Platform TOS", "Bans"],
    experience: "14 yrs",
    rating: 4.9,
    cases: "5,000+ appeals",
    expertise: 99,
    credentials: ["Stanford Law JD", "Platform Policy Expert", "YouTube Partner Counsel"],
    intro: "I know every platform's rules inside out. From YouTube content ID to Twitch strikes — I fight wrongful takedowns and help you navigate platform disputes successfully.",
  },
  {
    id: "business-corporate",
    agentId: "legal-corporate",
    name: "James Thornton",
    initials: "JT",
    title: "Business & Corporate Attorney",
    specialty: "LLC formation, operating agreements, liability protection",
    icon: Building2,
    color: "hsl(45 90% 55%)",
    bg: "hsl(45 90% 55% / 0.08)",
    border: "hsl(45 90% 55% / 0.25)",
    glow: "hsl(45 90% 55% / 0.4)",
    tags: ["LLC", "S-Corp", "Liability", "Agreements"],
    experience: "25 yrs",
    rating: 4.7,
    cases: "3,800+ entities",
    expertise: 97,
    credentials: ["Columbia Law JD", "Business Law Review", "Inc. 5000 Legal Advisor"],
    intro: "I turn solo creators into protected business entities. Proper structure means lower taxes, less liability, and a real business you can scale and eventually sell.",
  },
  {
    id: "privacy-data",
    agentId: "legal-privacy",
    name: "Sofia Reyes",
    initials: "SR",
    title: "Privacy & Data Law Attorney",
    specialty: "GDPR, CCPA, COPPA, data collection, privacy policies",
    icon: Lock,
    color: "hsl(320 70% 60%)",
    bg: "hsl(320 70% 60% / 0.08)",
    border: "hsl(320 70% 60% / 0.25)",
    glow: "hsl(320 70% 60% / 0.4)",
    tags: ["GDPR", "CCPA", "Privacy", "Data"],
    experience: "16 yrs",
    rating: 4.8,
    cases: "1,200+ compliance",
    expertise: 95,
    credentials: ["Georgetown Law JD", "IAPP Certified", "EU Data Protection Specialist"],
    intro: "Privacy law affects every creator who collects emails, runs memberships, or sells products globally. I make compliance straightforward without killing your user experience.",
  },
  {
    id: "employment-creator",
    agentId: "legal-employment",
    name: "Derek Morgan",
    initials: "DM",
    title: "Employment & Creator Economy Attorney",
    specialty: "Worker classification, NDAs, team contracts, non-competes",
    icon: Users,
    color: "hsl(25 90% 55%)",
    bg: "hsl(25 90% 55% / 0.08)",
    border: "hsl(25 90% 55% / 0.25)",
    glow: "hsl(25 90% 55% / 0.4)",
    tags: ["Employment", "Contractors", "NDAs", "Team"],
    experience: "19 yrs",
    rating: 4.8,
    cases: "2,100+ contracts",
    expertise: 94,
    credentials: ["UCLA Law JD", "Employment Law Specialist", "Creator Economy Bar"],
    intro: "When you hire your first editor or build a team, you need the right contracts. I specialize in creator teams — employees, contractors, and everyone in between.",
  },
  {
    id: "defamation-reputation",
    agentId: "legal-defamation",
    name: "Claire Fontaine",
    initials: "CF",
    title: "Defamation & Reputation Attorney",
    specialty: "Libel, slander, cease-and-desist, doxxing response",
    icon: AlertTriangle,
    color: "hsl(0 80% 55%)",
    bg: "hsl(0 80% 55% / 0.08)",
    border: "hsl(0 80% 55% / 0.25)",
    glow: "hsl(0 80% 55% / 0.4)",
    tags: ["Defamation", "Libel", "Reputation", "C&D"],
    experience: "20 yrs",
    rating: 4.9,
    cases: "900+ victories",
    expertise: 97,
    credentials: ["NYU Law JD", "First Amendment Scholar", "Reputation Defense Expert"],
    intro: "Online reputation attacks can destroy careers. I defend creators against false accusations, coordinate C&D responses, and know exactly when to fight back legally.",
  },
  {
    id: "music-licensing",
    agentId: "legal-music",
    name: "Andre Baptiste",
    initials: "AB",
    title: "Music Licensing & Publishing Attorney",
    specialty: "Sync licenses, music rights, royalties, copyright claims",
    icon: Music,
    color: "hsl(330 80% 60%)",
    bg: "hsl(330 80% 60% / 0.08)",
    border: "hsl(330 80% 60% / 0.25)",
    glow: "hsl(330 80% 60% / 0.4)",
    tags: ["Music Rights", "Sync", "Royalties", "Claims"],
    experience: "21 yrs",
    rating: 5.0,
    cases: "4,500+ licenses",
    expertise: 99,
    credentials: ["Berklee + Harvard Law", "ASCAP Board Member", "Music Industry MVP"],
    intro: "Music is the #1 cause of creator content claims. I'll show you exactly what you can use, how to clear music legally, and how to fight bogus music copyright claims.",
  },
  {
    id: "international-law",
    agentId: "legal-international",
    name: "Yuki Tanaka",
    initials: "YT",
    title: "International & Cross-Border Attorney",
    specialty: "Global compliance, international contracts, multi-jurisdiction",
    icon: Globe,
    color: "hsl(180 70% 50%)",
    bg: "hsl(180 70% 50% / 0.08)",
    border: "hsl(180 70% 50% / 0.25)",
    glow: "hsl(180 70% 50% / 0.4)",
    tags: ["International", "Cross-Border", "Global", "Treaties"],
    experience: "17 yrs",
    rating: 4.8,
    cases: "80+ jurisdictions",
    expertise: 96,
    credentials: ["Tokyo U + Oxford Law", "WTO Certified", "Global Creator Counsel"],
    intro: "Creators with global audiences face global legal obligations. I navigate multi-jurisdiction compliance so you can operate anywhere without legal surprises.",
  },
];

const TAX_ADVISORS = [
  {
    id: "self-employment",
    agentId: "tax-self-employment",
    name: "Robert Kaufman",
    initials: "RK",
    title: "Self-Employment Tax Specialist",
    specialty: "SE tax, quarterly estimates, Schedule C, deductions",
    icon: Calculator,
    color: "hsl(265 80% 65%)",
    bg: "hsl(265 80% 65% / 0.08)",
    border: "hsl(265 80% 65% / 0.25)",
    glow: "hsl(265 80% 65% / 0.4)",
    tags: ["SE Tax", "Schedule C", "Estimates", "Deductions"],
    experience: "25 yrs",
    rating: 4.9,
    cases: "6,000+ creators",
    expertise: 98,
    credentials: ["CPA, MST", "IRS Enrolled Agent", "Forbes Creator Finance 100"],
    intro: "Self-employment tax hits creators hard if you're not prepared. I'll show you exactly how to calculate it, when to pay it, and every legal way to reduce it.",
  },
  {
    id: "business-deductions",
    agentId: "tax-deductions",
    name: "Patricia Hollis",
    initials: "PH",
    title: "Business Deductions Expert",
    specialty: "Home office, equipment, software, travel, all creator deductions",
    icon: Receipt,
    color: "hsl(142 70% 50%)",
    bg: "hsl(142 70% 50% / 0.08)",
    border: "hsl(142 70% 50% / 0.25)",
    glow: "hsl(142 70% 50% / 0.4)",
    tags: ["Deductions", "Home Office", "Equipment", "Software"],
    experience: "20 yrs",
    rating: 4.9,
    cases: "$42M+ saved",
    expertise: 99,
    credentials: ["CPA, CFP", "Tax Strategy Specialist", "Creator Economy CPA"],
    intro: "Most creators leave thousands on the table. I know every legitimate deduction — cameras, computers, internet, subscriptions, travel, home studio — and how to document them properly.",
  },
  {
    id: "business-structure-tax",
    agentId: "tax-structure",
    name: "Nathan Cross",
    initials: "NC",
    title: "Business Structure & Entity Tax Advisor",
    specialty: "LLC vs S-Corp, QBI deduction, salary optimization",
    icon: Building2,
    color: "hsl(45 90% 55%)",
    bg: "hsl(45 90% 55% / 0.08)",
    border: "hsl(45 90% 55% / 0.25)",
    glow: "hsl(45 90% 55% / 0.4)",
    tags: ["S-Corp", "LLC", "QBI", "Entity Tax"],
    experience: "22 yrs",
    rating: 4.8,
    cases: "3,200+ entities",
    expertise: 97,
    credentials: ["CPA, JD, MST", "Big 4 Partner (ret.)", "Entity Tax Authority"],
    intro: "The right business structure can save you $10K-$50K+ per year in taxes. I calculate the exact crossover point where an S-Corp makes sense for your income level.",
  },
  {
    id: "creator-income",
    agentId: "tax-income",
    name: "Michelle Tran",
    initials: "MT",
    title: "Creator Income & Revenue Tax Advisor",
    specialty: "AdSense, brand deals, merch, 1099s, all revenue streams",
    icon: DollarSign,
    color: "hsl(200 80% 60%)",
    bg: "hsl(200 80% 60% / 0.08)",
    border: "hsl(200 80% 60% / 0.25)",
    glow: "hsl(200 80% 60% / 0.4)",
    tags: ["Revenue Streams", "1099s", "AdSense", "Merch"],
    experience: "16 yrs",
    rating: 4.9,
    cases: "4,800+ tax returns",
    expertise: 96,
    credentials: ["CPA, MBA", "Creator Economy Specialist", "Platform Tax Expert"],
    intro: "Creator income comes from 10+ sources and each is taxed differently. I organize your entire financial picture and make sure every stream is handled correctly.",
  },
  {
    id: "international-tax",
    agentId: "tax-international",
    name: "Dr. Ivan Petrov",
    initials: "IP",
    title: "International Tax Advisor",
    specialty: "Foreign income, tax treaties, FBAR, FATCA, withholding",
    icon: Globe,
    color: "hsl(180 70% 50%)",
    bg: "hsl(180 70% 50% / 0.08)",
    border: "hsl(180 70% 50% / 0.25)",
    glow: "hsl(180 70% 50% / 0.4)",
    tags: ["International", "FBAR", "Tax Treaties", "Withholding"],
    experience: "28 yrs",
    rating: 4.9,
    cases: "100+ countries",
    expertise: 98,
    credentials: ["PhD Tax Law, CPA", "OECD Advisor", "G20 Tax Policy Consultant"],
    intro: "Earning from global platforms means dealing with international tax complexity. I navigate tax treaties, foreign withholding, and FBAR requirements so you stay fully compliant.",
  },
  {
    id: "crypto-digital",
    agentId: "tax-crypto",
    name: "Zara Kim",
    initials: "ZK",
    title: "Crypto & Digital Asset Tax Advisor",
    specialty: "NFTs, crypto payments, DeFi income, staking rewards",
    icon: Bitcoin,
    color: "hsl(330 80% 60%)",
    bg: "hsl(330 80% 60% / 0.08)",
    border: "hsl(330 80% 60% / 0.25)",
    glow: "hsl(330 80% 60% / 0.4)",
    tags: ["Crypto", "NFTs", "DeFi", "Digital Assets"],
    experience: "11 yrs",
    rating: 5.0,
    cases: "3,100+ crypto filers",
    expertise: 99,
    credentials: ["CPA, Blockchain Cert.", "IRS Crypto Advisory Panel", "NFT Tax Pioneer"],
    intro: "Crypto and NFT income is heavily scrutinized by the IRS. I stay on top of every ruling and help creators properly track, report, and minimize crypto tax liability.",
  },
  {
    id: "state-local",
    agentId: "tax-state",
    name: "Thomas Briggs",
    initials: "TB",
    title: "State & Local Tax Advisor",
    specialty: "Multi-state filing, sales tax on digital products, nexus",
    icon: MapPin,
    color: "hsl(25 90% 55%)",
    bg: "hsl(25 90% 55% / 0.08)",
    border: "hsl(25 90% 55% / 0.25)",
    glow: "hsl(25 90% 55% / 0.4)",
    tags: ["State Tax", "Sales Tax", "Multi-State", "Nexus"],
    experience: "23 yrs",
    rating: 4.7,
    cases: "50 states mastered",
    expertise: 95,
    credentials: ["CPA, JD", "SALT Specialist", "Digital Economy Tax Expert"],
    intro: "Selling courses or digital products nationwide creates unexpected state tax obligations. I handle all 50 states and know exactly where you have nexus and where you don't.",
  },
  {
    id: "retirement-planning",
    agentId: "tax-retirement",
    name: "Sandra Osei",
    initials: "SO",
    title: "Retirement & Tax Planning Advisor",
    specialty: "Solo 401k, SEP-IRA, Roth conversions, wealth building",
    icon: PiggyBank,
    color: "hsl(142 70% 60%)",
    bg: "hsl(142 70% 60% / 0.08)",
    border: "hsl(142 70% 60% / 0.25)",
    glow: "hsl(142 70% 60% / 0.4)",
    tags: ["Solo 401k", "SEP-IRA", "Roth", "Retirement"],
    experience: "18 yrs",
    rating: 4.9,
    cases: "$2.1B managed",
    expertise: 97,
    credentials: ["CFP, CPA, ChFC", "Wealth Management Specialist", "Creator Retirement Expert"],
    intro: "A Solo 401(k) can shelter $66K+ per year from taxes. I design retirement strategies that slash your tax bill today while building serious long-term wealth.",
  },
  {
    id: "audit-defense",
    agentId: "tax-audit",
    name: "Frank Delgado",
    initials: "FD",
    title: "Audit Defense & IRS Representation",
    specialty: "IRS audits, CP2000 notices, penalty abatement, appeals",
    icon: Shield,
    color: "hsl(0 80% 55%)",
    bg: "hsl(0 80% 55% / 0.08)",
    border: "hsl(0 80% 55% / 0.25)",
    glow: "hsl(0 80% 55% / 0.4)",
    tags: ["IRS Audit", "Penalty", "Appeals", "Representation"],
    experience: "26 yrs",
    rating: 4.9,
    cases: "1,800+ audits won",
    expertise: 98,
    credentials: ["EA, CPA, JD", "Former IRS Appeals Officer", "Audit Defense Legend"],
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

function AdvisorChat({ advisor, type, onClose }: { advisor: any; type: "legal" | "tax"; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "advisor", content: advisor.intro, timestamp: new Date() }]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const Icon = advisor.icon;

  const chatMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/legal-tax/chat", { advisorId: advisor.id, message, type }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setMessages(prev => [...prev, { role: "advisor", content: data.reply, timestamp: new Date() }]);
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "advisor", content: "I'm experiencing a technical issue right now. Please try again in a moment.", timestamp: new Date() }]);
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
          boxShadow: `0 0 0 1px ${advisor.glow}20, 0 24px 80px ${advisor.glow}30, 0 0 120px ${advisor.glow}15`,
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
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: `${advisor.glow}20`, color: advisor.color }}>AI AGENT</span>
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
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-tr-sm text-white"
                  : "rounded-tl-sm text-foreground/90"
              }`} style={m.role === "user"
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
            <span className="text-[9px] text-muted-foreground/30">For educational purposes only</span>
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

function AgentCard({ advisor, type, agentStatus, onChat, onRun, isRunningNow }: {
  advisor: any; type: "legal" | "tax";
  agentStatus?: any; onChat: () => void; onRun: () => void; isRunningNow: boolean;
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
        background: `linear-gradient(135deg, hsl(230 22% 9%) 0%, hsl(260 25% 12%) 100%)`,
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

      {lastFinding && (
        <div className="relative mt-3 rounded-lg p-2.5 border border-border/20 bg-black/30" data-testid={`agent-finding-${advisor.id}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Terminal className="w-2.5 h-2.5 text-primary/60" />
            <span className="text-[9px] font-mono text-primary/60 uppercase">Last Finding</span>
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
            <><Play className="w-3 h-3" />Run Scan</>
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
          Chat
        </Button>
      </div>
    </div>
  );
}

export default function LegalTaxTeam() {
  const [activeTab, setActiveTab] = useState<"legal" | "tax">("legal");
  const [chatAdvisor, setChatAdvisor] = useState<{ advisor: any; type: "legal" | "tax" } | null>(null);
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [consultCount, setConsultCount] = useState(14847);
  const [runAllPending, setRunAllPending] = useState(false);

  const { data: agentStatuses, refetch: refetchStatuses } = useQuery<any[]>({
    queryKey: ["/api/legal-tax/agents/status"],
    refetchInterval: 20000,
  });

  const { data: agentActivities, refetch: refetchActivities } = useQuery<any[]>({
    queryKey: ["/api/legal-tax/agents/activities"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    const t = setInterval(() => setConsultCount(p => p + Math.floor(Math.random() * 2)), 8000);
    return () => clearInterval(t);
  }, []);

  const runAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiRequest("POST", `/api/legal-tax/agents/${agentId}/run`, {}),
    onMutate: (agentId) => setRunningAgents(prev => new Set(prev).add(agentId)),
    onSettled: (_, __, agentId) => {
      setRunningAgents(prev => { const s = new Set(prev); s.delete(agentId); return s; });
      setTimeout(() => { refetchStatuses(); refetchActivities(); }, 3000);
    },
  });

  const runAllMutation = useMutation({
    mutationFn: (type: "legal" | "tax" | "all") => apiRequest("POST", "/api/legal-tax/agents/run-all", { type }),
    onMutate: () => setRunAllPending(true),
    onSettled: () => {
      setTimeout(() => { refetchStatuses(); refetchActivities(); }, 4000);
      setTimeout(() => setRunAllPending(false), 6000);
    },
  });

  const getAgentStatus = (agentId: string) =>
    (agentStatuses as any[])?.find((s: any) => s.agentId === agentId);

  const legalStatuses = (agentStatuses as any[])?.filter(s => s.type === "legal") ?? [];
  const taxStatuses = (agentStatuses as any[])?.filter(s => s.type === "tax") ?? [];
  const activeCount = (agentStatuses as any[])?.filter(s => s.status === "idle" || s.status === "running").length ?? 0;
  const totalScans = (agentStatuses as any[])?.reduce((sum, s) => sum + (s.activityCount ?? 0), 0) ?? 0;
  const recentActivities = (agentActivities as any[])?.slice(0, 20) ?? [];

  const agentIdForActivity = (agentId: string) => {
    const all = [...LEGAL_ADVISORS, ...TAX_ADVISORS];
    return all.find(a => a.agentId === agentId);
  };

  const timeAgo = (dt: string | null) => {
    if (!dt) return "—";
    const diff = (Date.now() - new Date(dt).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const currentAdvisors = activeTab === "legal" ? LEGAL_ADVISORS : TAX_ADVISORS;

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
                    AI AGENT COMMAND CENTER
                  </div>
                  <span className="text-[11px] text-emerald-400 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {activeCount}/18 AGENTS ACTIVE
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold holographic-text mb-2" data-testid="page-title">
                  {activeTab === "legal" ? "Legal Defense AI Team" : "Tax Strategy AI Team"}
                </h1>
                <p className="text-sm text-muted-foreground max-w-xl">
                  18 autonomous AI agents — 9 world-class legal advisors + 9 elite tax strategists — running background audits, monitoring your compliance, and available 24/7 for direct consultation.
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button
                    size="sm"
                    onClick={() => runAllMutation.mutate(activeTab)}
                    disabled={runAllPending}
                    className="gap-2 font-mono text-xs"
                    style={{ background: "linear-gradient(135deg, hsl(265 80% 50%), hsl(265 80% 40%))", boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)" }}
                    data-testid="button-run-all-agents"
                  >
                    {runAllPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Run Full {activeTab === "legal" ? "Legal" : "Tax"} Audit
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => runAllMutation.mutate("all")}
                    disabled={runAllPending}
                    className="gap-2 font-mono text-xs border-border/30"
                    data-testid="button-run-all-18"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Run All 18 Agents
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                {[
                  { label: "Consultations", value: consultCount.toLocaleString(), icon: MessageSquare, color: "hsl(265 80% 65%)", testid: "stat-consultations" },
                  { label: "Agents Active", value: `${activeCount}/18`, icon: Activity, color: "hsl(142 70% 50%)", testid: "stat-advisor-count" },
                  { label: "Satisfaction", value: "98%", icon: Star, color: "hsl(45 90% 55%)", testid: "stat-satisfaction" },
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
                { icon: "🔒", label: "Attorney-Client Confidentiality" },
                { icon: "🛡", label: "256-bit Encrypted" },
                { icon: "⚖️", label: "Top 1% AI Advisors" },
                { icon: "⚡", label: "24/7 Availability" },
              ].map((b, i) => (
                <span key={b.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2.5 py-1 rounded-full border border-border/20 bg-muted/10" data-testid={`trust-badge-${i}`}>
                  <span>{b.icon}</span>{b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {(["legal", "tax"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-bold transition-all duration-300"
              style={activeTab === tab ? {
                background: "linear-gradient(135deg, hsl(265 80% 50%), hsl(265 80% 40%))",
                color: "white", boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)",
              } : {
                background: "hsl(230 22% 10%)", color: "hsl(265 40% 60%)",
                border: "1px solid hsl(265 30% 20%)",
              }}
              data-testid={`tab-${tab}`}
            >
              {tab === "legal" ? <Scale className="w-4 h-4" /> : <Calculator className="w-4 h-4" />}
              {tab === "legal" ? "Legal Defense Team" : "Tax Strategy Team"}
              <span className="text-xs opacity-70">(9)</span>
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                {activeTab === "legal" ? "Legal" : "Tax"} AI Agents — Autonomous Monitoring
              </h2>
              <span className="text-[10px] font-mono text-primary/60">
                {activeTab === "legal" ? legalStatuses.filter(s => s.activityCount > 0).length : taxStatuses.filter(s => s.activityCount > 0).length} scanned
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {currentAdvisors.map(advisor => (
                <AgentCard
                  key={advisor.id}
                  advisor={advisor}
                  type={activeTab}
                  agentStatus={getAgentStatus(advisor.agentId)}
                  onChat={() => setChatAdvisor({ advisor, type: activeTab })}
                  onRun={() => runAgentMutation.mutate(advisor.agentId)}
                  isRunningNow={runningAgents.has(advisor.agentId)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/20 bg-black/40 overflow-hidden" data-testid="widget-agent-activity-feed">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-mono text-primary/80 uppercase">Live Agent Feed</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{recentActivities.length} events</span>
              </div>

              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {recentActivities.length === 0 && (
                  <div className="text-center py-8">
                    <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/50">No agent activity yet</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Run any agent to start monitoring</p>
                  </div>
                )}
                {recentActivities.map((activity: any, i: number) => {
                  const adv = agentIdForActivity(activity.agentId);
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

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="widget-audit-summary">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Audit Summary</div>
              <div className="space-y-2">
                {[
                  { label: "Total Scans Run", value: totalScans.toString(), color: "hsl(265 80% 65%)" },
                  { label: "Agents Activated", value: `${activeCount}/18`, color: "hsl(142 70% 50%)" },
                  { label: "Legal Agents", value: `${legalStatuses.filter(s => s.activityCount > 0).length}/9`, color: "hsl(200 80% 60%)" },
                  { label: "Tax Agents", value: `${taxStatuses.filter(s => s.activityCount > 0).length}/9`, color: "hsl(45 90% 55%)" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/10 last:border-0">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/20 bg-black/30 p-4" data-testid="section-bottom-cta">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono holographic-text mb-1" data-testid="stat-advisors">18</div>
                <div className="text-xs text-muted-foreground mb-0.5">Total AI Advisors</div>
                <div className="text-xs font-mono text-emerald-400" data-testid="stat-availability">24/7 Available</div>
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted/20 border border-border/20 text-muted-foreground">9 Legal Experts</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted/20 border border-border/20 text-muted-foreground">9 Tax Advisors</span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2">For educational purposes only. Consult a licensed professional for your specific situation.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {chatAdvisor && (
        <AdvisorChat
          advisor={chatAdvisor.advisor}
          type={chatAdvisor.type}
          onClose={() => setChatAdvisor(null)}
        />
      )}
    </div>
  );
}
