import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Scale, DollarSign, MessageSquare, Send, Loader2,
  Shield, FileText, Globe, Building2, Lock, Users, Music, AlertTriangle,
  Calculator, Receipt, PiggyBank, MapPin, Bitcoin,
  Briefcase, X, Search, Star, Zap, CheckCircle2, TrendingUp,
  Clock, Award, ChevronRight,
} from "lucide-react";

const LEGAL_ADVISORS = [
  {
    id: "copyright-ip",
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
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-base"
              style={{ background: `linear-gradient(135deg, ${advisor.color}, ${advisor.glow}cc)`, boxShadow: `0 0 20px ${advisor.glow}60` }}>
              {advisor.initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black"
              style={{ boxShadow: "0 0 6px hsl(142 70% 50%)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white" data-testid="chat-advisor-name">{advisor.name}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: `${advisor.color}20`, color: advisor.color, border: `1px solid ${advisor.color}40` }}>
                {advisor.credentials?.[0] ?? "Expert"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{advisor.title}</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3" fill={i < Math.floor(advisor.rating) ? advisor.color : "transparent"} stroke={advisor.color} strokeWidth="1.5" />
              ))}
            </div>
            <button
              onClick={onClose}
              className="ml-2 w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              data-testid="button-close-advisor-chat"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 280 }} data-testid="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`} data-testid={`chat-message-${i}`}>
              {msg.role === "advisor" && (
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${advisor.color}cc, ${advisor.glow}88)`, boxShadow: `0 0 10px ${advisor.glow}40` }}>
                  {advisor.initials}
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-[80%]">
                <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-2xl rounded-tr-sm text-white"
                    : "rounded-2xl rounded-tl-sm text-foreground"
                }`} style={msg.role === "user" ? {
                  background: "linear-gradient(135deg, hsl(265 80% 40%), hsl(265 80% 30%))",
                  border: "1px solid hsl(265 80% 60% / 0.3)",
                  boxShadow: "0 0 20px hsl(265 80% 60% / 0.15)",
                } : {
                  background: "hsl(230 22% 14%)",
                  border: "1px solid hsl(265 80% 60% / 0.1)",
                }}>
                  {msg.content}
                </div>
                <span className={`text-[10px] text-muted-foreground/50 font-mono ${msg.role === "user" ? "text-right" : "text-left"}`}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-2.5 items-start" data-testid="chat-typing-indicator">
              <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${advisor.color}cc, ${advisor.glow}88)` }}>
                {advisor.initials}
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 items-center"
                style={{ background: "hsl(230 22% 14%)", border: "1px solid hsl(265 80% 60% / 0.1)" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full"
                    style={{ background: advisor.color, animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.8 }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && suggestions.length > 0 && (
          <div className="relative z-10 px-4 pb-2" data-testid="chat-suggestions">
            <div className="text-[10px] text-muted-foreground/50 font-mono uppercase mb-1.5">Suggested questions</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-3 py-1.5 rounded-full border text-left transition-all hover:scale-105"
                  style={{ borderColor: `${advisor.color}40`, color: advisor.color, background: `${advisor.color}10` }}
                  data-testid={`suggestion-${i}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative z-10 p-3 border-t flex gap-2 items-end flex-shrink-0" style={{ borderColor: `${advisor.color}20` }}>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${advisor.name.split(" ")[0]} anything... (Enter to send)`}
            className="resize-none text-sm min-h-[44px] max-h-32 flex-1 bg-white/5 border-white/10 focus:border-primary/50"
            rows={1}
            data-testid="input-advisor-question"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || chatMutation.isPending}
            size="icon"
            className="h-11 w-11 flex-shrink-0 rounded-xl transition-all"
            style={{
              background: `linear-gradient(135deg, ${advisor.color}, ${advisor.glow}cc)`,
              boxShadow: input.trim() ? `0 0 20px ${advisor.glow}60` : "none",
            }}
            data-testid="button-send-message"
          >
            {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="relative z-10 px-4 pb-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground/40 font-mono flex-shrink-0">
          <span className="flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Confidential</span>
          <span>•</span>
          <span>Educational guidance only — not legal/tax advice</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> 256-bit encrypted</span>
        </div>
      </div>
    </div>
  );
}

function AdvisorCard({ advisor, type, onSelect }: { advisor: any; type: "legal" | "tax"; onSelect: (a: any, t: "legal" | "tax") => void }) {
  const Icon = advisor.icon;
  const stars = Math.floor(advisor.rating);
  return (
    <div
      className="group relative rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden"
      style={{ background: "linear-gradient(135deg, hsl(230 22% 9%), hsl(260 25% 11%))", border: `1px solid ${advisor.border}` }}
      onClick={() => onSelect(advisor, type)}
      data-testid={`card-advisor-${advisor.id}`}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 40px ${advisor.glow}35, 0 0 0 1px ${advisor.glow}20`; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
    >
      <div className="data-grid-bg absolute inset-0 opacity-[0.03] pointer-events-none" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 50% 0%, ${advisor.glow}12, transparent 70%)` }} />

      <div className="relative p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-sm transition-all group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${advisor.color}30, ${advisor.glow}15)`,
                border: `1.5px solid ${advisor.color}50`,
                boxShadow: `0 0 15px ${advisor.glow}30`,
              }}>
              <Icon className="w-5 h-5" style={{ color: advisor.color }} />
            </div>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black"
              style={{ boxShadow: "0 0 6px hsl(142 70% 50%)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm leading-tight" data-testid={`advisor-name-${advisor.id}`}>{advisor.name}</div>
            <div className="text-[11px] mt-0.5 font-medium" style={{ color: advisor.color }}>{advisor.title}</div>
            <div className="flex items-center gap-1 mt-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-2.5 h-2.5" fill={i < stars ? advisor.color : "transparent"} stroke={advisor.color} strokeWidth="1.5" />
              ))}
              <span className="text-[10px] font-mono ml-0.5" style={{ color: advisor.color }}>{advisor.rating}</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <div className="px-2 py-1.5 rounded-lg text-center" style={{ background: `${advisor.color}08`, border: `1px solid ${advisor.color}15` }}>
            <div className="text-[11px] font-bold font-mono" style={{ color: advisor.color }}>{advisor.experience}</div>
            <div className="text-[9px] text-muted-foreground/60">Experience</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg text-center" style={{ background: `${advisor.color}08`, border: `1px solid ${advisor.color}15` }}>
            <div className="text-[11px] font-bold font-mono truncate" style={{ color: advisor.color }}>{advisor.cases}</div>
            <div className="text-[9px] text-muted-foreground/60">Track Record</div>
          </div>
        </div>

        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase">Expertise</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: advisor.color }}>{advisor.expertise}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: `${advisor.color}18` }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${advisor.expertise}%`, background: `linear-gradient(90deg, ${advisor.color}80, ${advisor.color})`, boxShadow: `0 0 6px ${advisor.glow}` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {advisor.tags.map((tag: string) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-mono transition-all"
              style={{ background: `${advisor.color}12`, color: advisor.color, border: `1px solid ${advisor.color}25` }}>
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2.5 border-t" style={{ borderColor: `${advisor.color}15` }}>
          <span className="text-[11px] text-muted-foreground/50">{advisor.credentials?.[0]}</span>
          <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: advisor.color }}>
            <MessageSquare className="w-3 h-3" />
            Consult Now
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBanner({ activeTab }: { activeTab: "legal" | "tax" }) {
  const [consultations, setConsultations] = useState(14847);
  const [liveNow, setLiveNow] = useState(3);
  useEffect(() => {
    const t = setInterval(() => {
      setConsultations(p => p + Math.floor(Math.random() * 3));
      setLiveNow(Math.floor(Math.random() * 4) + 2);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const isLegal = activeTab === "legal";
  const primaryColor = isLegal ? "hsl(265 80% 65%)" : "hsl(45 90% 55%)";
  const glowColor = isLegal ? "hsl(265 80% 65% / 0.4)" : "hsl(45 90% 55% / 0.4)";

  return (
    <div className="card-empire rounded-2xl relative overflow-hidden mb-4" data-testid="hero-banner">
      <div className="data-grid-bg absolute inset-0 opacity-[0.04] pointer-events-none" />
      <div className="scan-overlay absolute inset-0 pointer-events-none rounded-2xl" />
      <div className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse at 70% 50%, ${glowColor}15, transparent 70%)` }} />

      <div className="relative p-5 md:p-7">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full"
                style={{ background: `${primaryColor}15`, color: primaryColor, border: `1px solid ${primaryColor}30` }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: primaryColor }} />
                {liveNow} advisors online now
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/60 bg-muted/30 px-2 py-0.5 rounded-full">
                24/7 Available
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 holographic-text leading-tight" data-testid="page-title">
              {isLegal ? "World-Class Legal Team" : "World-Class Tax Advisory Team"}
            </h1>
            <p className="text-sm text-muted-foreground mb-4 max-w-xl leading-relaxed">
              {isLegal
                ? "Elite AI-powered attorneys covering every area of creator law. Get instant legal guidance from specialists who know the creator economy inside out."
                : "Elite AI-powered CPAs and tax advisors covering every creator tax scenario. Stop overpaying — get strategies that actually work for your income structure."}
            </p>
            <div className="flex flex-wrap gap-3">
              {(isLegal ? [
                { icon: Lock, label: "Confidential", color: "hsl(265 80% 65%)" },
                { icon: CheckCircle2, label: "Creator-Specialized", color: "hsl(142 70% 50%)" },
                { icon: Zap, label: "Instant Answers", color: "hsl(45 90% 55%)" },
                { icon: Award, label: "Top 1% Experts", color: "hsl(200 80% 60%)" },
              ] : [
                { icon: Shield, label: "IRS-Ready", color: "hsl(265 80% 65%)" },
                { icon: TrendingUp, label: "Tax Minimization", color: "hsl(142 70% 50%)" },
                { icon: CheckCircle2, label: "All 50 States", color: "hsl(45 90% 55%)" },
                { icon: Award, label: "Avg $12K Saved", color: "hsl(200 80% 60%)" },
              ]).map(({ icon: Icon, label, color }) => (
                <span key={label} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-medium"
                  style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}>
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:flex md:flex-col md:items-end">
            {[
              { value: consultations.toLocaleString(), label: "Consultations", color: primaryColor, testid: "stat-consultations" },
              { value: isLegal ? "9" : "9", label: "Expert Advisors", color: "hsl(142 70% 50%)", testid: "stat-advisor-count" },
              { value: "98%", label: "Satisfaction", color: "hsl(45 90% 55%)", testid: "stat-satisfaction" },
            ].map(({ value, label, color, testid }) => (
              <div key={label} className="text-center md:text-right" data-testid={testid}>
                <div className="text-xl md:text-2xl font-bold font-mono" style={{ color, textShadow: `0 0 20px ${color}60` }}>{value}</div>
                <div className="text-[10px] text-muted-foreground/60">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchBar({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  return (
    <div className="relative mb-4" data-testid="search-bar">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
      <Input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search advisors by name, specialty, or expertise..."
        className="pl-9 bg-muted/20 border-border/20 focus:border-primary/40 text-sm h-10"
        data-testid="input-search-advisors"
      />
      {query && (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2">
          <X className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function TrustStrip() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4" data-testid="trust-strip">
      {[
        { icon: Lock, label: "Attorney-Client Style Confidentiality", sub: "All sessions private" },
        { icon: Shield, label: "256-bit Encryption", sub: "Enterprise-grade security" },
        { icon: Award, label: "Top 1% Experts", sub: "Vetted & specialized" },
        { icon: Clock, label: "24/7 Availability", sub: "No appointments needed" },
      ].map(({ icon: Icon, label, sub }, i) => (
        <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/10 border border-border/15" data-testid={`trust-badge-${i}`}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-white/80 leading-tight">{label}</div>
            <div className="text-[10px] text-muted-foreground/50">{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LegalTaxTeam() {
  const [activeChat, setActiveChat] = useState<{ advisor: any; type: "legal" | "tax" } | null>(null);
  const [activeTab, setActiveTab] = useState<"legal" | "tax">("legal");
  const [search, setSearch] = useState("");

  const currentAdvisors = activeTab === "legal" ? LEGAL_ADVISORS : TAX_ADVISORS;
  const filteredAdvisors = search
    ? currentAdvisors.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.specialty.toLowerCase().includes(search.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : currentAdvisors;

  return (
    <div className="p-3 lg:p-4 space-y-0 max-w-6xl mx-auto page-enter" data-testid="page-legal-tax-team">
      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/20 mb-4" data-testid="tab-switcher">
        {(["legal", "tax"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const isLegal = tab === "legal";
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSearch(""); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={isActive ? {
                background: isLegal ? "hsl(265 80% 60% / 0.2)" : "hsl(45 90% 55% / 0.15)",
                color: isLegal ? "hsl(265 80% 70%)" : "hsl(45 90% 65%)",
                border: `1px solid ${isLegal ? "hsl(265 80% 60% / 0.4)" : "hsl(45 90% 55% / 0.4)"}`,
                boxShadow: `0 0 20px ${isLegal ? "hsl(265 80% 60% / 0.2)" : "hsl(45 90% 55% / 0.2)"}`,
              } : { color: "hsl(0 0% 50%)" }}
              data-testid={`tab-${tab}`}
            >
              {isLegal ? <Scale className="w-4 h-4" /> : <Calculator className="w-4 h-4" />}
              {isLegal ? "Legal Team" : "Tax Team"}
              <Badge variant="secondary" className="text-[10px] ml-0.5 h-5 px-1.5">
                {isLegal ? LEGAL_ADVISORS.length : TAX_ADVISORS.length}
              </Badge>
            </button>
          );
        })}
      </div>

      <HeroBanner activeTab={activeTab} />
      <TrustStrip />
      <SearchBar query={search} onChange={setSearch} />

      {filteredAdvisors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="no-results">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>No advisors match "{search}"</p>
          <button onClick={() => setSearch("")} className="text-primary text-sm mt-2 hover:underline">Clear search</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4" data-testid={`section-${activeTab}-team`}>
          {filteredAdvisors.map((advisor) => (
            <AdvisorCard
              key={advisor.id}
              advisor={advisor}
              type={activeTab}
              onSelect={(adv, type) => setActiveChat({ advisor: adv, type })}
            />
          ))}
        </div>
      )}

      <div className="card-empire rounded-2xl p-5 relative overflow-hidden" data-testid="section-bottom-cta">
        <div className="data-grid-bg absolute inset-0 opacity-[0.03] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-white mb-1">Need a specific specialist?</h3>
            <p className="text-sm text-muted-foreground">Every advisor is available right now — just click any card to start a consultation.</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            {[
              { value: `${LEGAL_ADVISORS.length + TAX_ADVISORS.length}`, label: "Total Advisors", color: "hsl(265 80% 65%)", testid: "stat-advisors" },
              { value: "18+", label: "Specialty Areas", color: "hsl(142 70% 50%)", testid: "stat-areas" },
              { value: "24/7", label: "Always On", color: "hsl(45 90% 55%)", testid: "stat-availability" },
            ].map(({ value, label, color, testid }) => (
              <div key={label} className="text-center px-4 py-2 rounded-xl border" style={{ borderColor: `${color}25`, background: `${color}08` }} data-testid={testid}>
                <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
                <div className="text-[10px] text-muted-foreground/60">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-muted-foreground/40 font-mono" data-testid="disclaimer-footer">
        <AlertTriangle className="w-3 h-3" />
        Educational guidance only. Not attorney-client privilege or professional advice. Consult a licensed attorney/CPA for your specific situation.
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
