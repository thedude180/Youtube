import { useState, useEffect, useRef, useCallback } from "react";
import {
  Zap, ArrowRight, Bot, DollarSign, BarChart3,
  Monitor, CheckCircle2, Link2, Cpu, TrendingUp,
  Brain, Calendar, Shield, Sparkles, Play,
  Radio, Video, Layers, Target, Eye,
  RefreshCw, Clock, Award, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import { AuthForm } from "@/components/AuthForm";

function useCountUp(target: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!startOnView || started.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, startOnView]);

  return { count, ref };
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}

const PIPELINE_STEPS = [
  { icon: Radio, label: "Go Live", desc: "Stream on any platform" },
  { icon: Cpu, label: "AI Detects", desc: "Auto-captures highlights" },
  { icon: Video, label: "Clips Created", desc: "Shorts + long-form" },
  { icon: Brain, label: "SEO Optimized", desc: "World-class metadata" },
  { icon: Layers, label: "Cross-Posted", desc: "YouTube, TikTok, X" },
  { icon: TrendingUp, label: "Growth", desc: "Analytics + iterate" },
];

const FEATURES = [
  {
    icon: Brain,
    title: "AI Content Engine",
    description: "Autonomous content creation from livestreams. AI extracts highlights, generates clips, optimizes metadata, and publishes — zero manual work.",
    metric: "832 AI features",
  },
  {
    icon: Radio,
    title: "Multi-Platform Live",
    description: "Stream to YouTube, Twitch, Kick, and more simultaneously. AI monitors chat, detects highlights, and captures key moments in real-time.",
    metric: "25+ platforms",
  },
  {
    icon: Target,
    title: "Retention Science",
    description: "Every piece of content shaped by proven retention beats from top creators. Hook patterns, pacing, and chapter structure that keeps viewers watching.",
    metric: "95% retention",
  },
  {
    icon: Eye,
    title: "SEO Domination",
    description: "AI-powered titles, descriptions, tags, and thumbnails optimized by world-class SEO algorithms. A/B testing built in for maximum click-through rates.",
    metric: "3x more views",
  },
  {
    icon: DollarSign,
    title: "Revenue Intelligence",
    description: "Automated monetization with P&L tracking, tax optimization, sponsorship management, and AI-powered brand deal negotiation.",
    metric: "Full P&L",
  },
  {
    icon: Shield,
    title: "Self-Healing System",
    description: "25+ subsystems protected by autonomous failure detection, AI diagnosis, auto-retry, and circuit breakers. 99.9% uptime guaranteed.",
    metric: "Always on",
  },
];

const TESTIMONIALS = [
  {
    quote: "I went from 500 to 50,000 subscribers in 6 months. CreatorOS handles everything — I just play games and the content makes itself.",
    name: "StreamerPro",
    role: "Gaming Creator",
    avatar: "SP",
    growth: "+9,900%",
  },
  {
    quote: "The AI literally replaced my entire team. Editor, thumbnail designer, SEO specialist, social media manager — all automated.",
    name: "ContentKing",
    role: "YouTube Creator",
    avatar: "CK",
    growth: "+340%",
  },
  {
    quote: "My revenue tripled after CreatorOS optimized all my old videos. The VOD optimizer found opportunities I completely missed.",
    name: "TechReviewer",
    role: "Tech Channel",
    avatar: "TR",
    growth: "+3x revenue",
  },
];

const TIERS = [
  { name: "Free", price: "$0", period: "", desc: "Get started", features: ["Dashboard access", "Basic analytics", "AI advisor", "Content overview"], platforms: "1 platform" },
  { name: "YouTube", price: "$9.99", period: "/mo", desc: "Single platform", features: ["YouTube automation", "SEO optimizer", "Thumbnail AI", "Stream center", "Content calendar"], platforms: "1 platform" },
  { name: "Starter", price: "$29.99", period: "/mo", desc: "Multi-platform", features: ["3 platform automation", "Content calendar", "Revenue tracking", "AI content suite", "Cross-posting"], platforms: "3 platforms", popular: true },
  { name: "Pro", price: "$79.99", period: "/mo", desc: "Full autopilot", features: ["10 platform automation", "Full Autopilot mode", "Competitor intel", "Priority support", "Team access", "A/B testing"], platforms: "10 platforms" },
  { name: "Ultimate", price: "$149.99", period: "/mo", desc: "Everything", features: ["25+ platforms", "All 832 AI features", "Creator Intelligence", "6 AI agent systems", "Custom workflows", "Dedicated support"], platforms: "Unlimited" },
];

const HOW_IT_WORKS = [
  { step: 1, icon: Link2, title: "Connect", description: "Link your platforms with one-click OAuth. Takes under 60 seconds.", time: "60 sec" },
  { step: 2, icon: Cpu, title: "AI Activates", description: "832 AI features analyze your content and build a growth strategy.", time: "5 min" },
  { step: 3, icon: RefreshCw, title: "Autopilot", description: "AI handles content, SEO, publishing, engagement, and growth 24/7.", time: "Forever" },
];

const STATS = [
  { value: 832, label: "AI Features", suffix: "" },
  { value: 25, label: "Platforms", suffix: "+" },
  { value: 11, label: "AI Agents", suffix: "" },
  { value: 99, label: "Uptime", suffix: ".9%" },
];

export default function Landing() {
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  usePageTitle("AI-Powered Creator Management Platform", "CreatorOS replaces your entire creator team with 832 AI features. Manage content, streaming, revenue, and growth across 25 platforms on full autopilot.");

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePipelineStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleSpotlight = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--mouse-x', `${x}%`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}%`);
  }, []);

  const pipelineView = useInView(0.2);
  const featuresView = useInView(0.1);
  const testimonialsView = useInView(0.1);
  const pricingView = useInView(0.1);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center glow-sm">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span data-testid="text-landing-logo" className="font-display font-bold text-base tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/pricing">
              <Button data-testid="button-nav-pricing" variant="ghost" size="sm">Pricing</Button>
            </a>
            <Button data-testid="button-sign-in-nav" size="sm" onClick={() => setShowAuthForm(true)}>
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      {showAuthForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          data-testid="modal-auth"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthForm(false); }}
        >
          <div className="relative">
            <button data-testid="button-close-auth" onClick={() => setShowAuthForm(false)} className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">&times;</button>
            <AuthForm />
          </div>
        </div>
      )}

      <section className="relative aurora-bg" data-testid="section-hero" ref={heroRef}>
        <div className="absolute inset-0 grid-pattern opacity-30" aria-hidden="true" />
        <div className="absolute inset-0 hero-glow" aria-hidden="true" />

        <div className="relative py-24 sm:py-32 lg:py-40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-3xl">
              <div className="slide-up-stagger" style={{ animationDelay: '0s' }}>
                <Badge variant="secondary" className="mb-6 text-xs tracking-wide border-primary/20 bg-primary/5" data-testid="badge-hero">
                  <Sparkles className="w-3 h-3 mr-1.5 text-primary" />
                  Autonomous Creator Intelligence
                </Badge>
              </div>

              <h1 data-testid="text-hero-heading" className="slide-up-stagger font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight" style={{ animationDelay: '0.1s' }}>
                Your Entire
                <br />
                <span className="gradient-text-vivid text-glow">YouTube Team</span>
                <br />
                In A Box
              </h1>

              <p data-testid="text-hero-subtitle" className="slide-up-stagger mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl" style={{ animationDelay: '0.2s' }}>
                Stream once. AI creates clips, optimizes SEO, publishes everywhere, and grows your audience — while you sleep.
              </p>

              <div className="slide-up-stagger mt-10 flex flex-col sm:flex-row gap-3" style={{ animationDelay: '0.3s' }}>
                <Button data-testid="button-hero-get-started" size="lg" className="text-base glow border-glow-animated" onClick={() => setShowAuthForm(true)}>
                  Start Free — No Card Required
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <a href="/pricing">
                  <Button data-testid="button-hero-view-pricing" variant="outline" size="lg" className="w-full sm:w-auto text-base">
                    <Play className="h-3.5 w-3.5 mr-2" />
                    See Plans
                  </Button>
                </a>
              </div>

              <div className="slide-up-stagger flex items-center gap-5 mt-8 flex-wrap" style={{ animationDelay: '0.4s' }}>
                {["5-min setup", "No credit card", "Cancel anytime"].map((text) => (
                  <span key={text} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl">
              {STATS.map((stat, i) => {
                const { count, ref } = useCountUp(stat.value, 2000 + i * 200);
                return (
                  <div key={stat.label} ref={ref} className="slide-up-stagger text-center" style={{ animationDelay: `${0.5 + i * 0.1}s` }} data-testid={`stat-hero-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-display text-primary count-up">
                      {count}{stat.suffix}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1.5 font-medium uppercase tracking-wider">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50 relative overflow-hidden" data-testid="section-pipeline" ref={pipelineView.ref}>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">The Pipeline</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Stream Once, Content <span className="gradient-text">Forever</span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Your livestream becomes an endless content machine. AI handles every step automatically.
            </p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 transition-all duration-700 ${pipelineView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {PIPELINE_STEPS.map((step, i) => {
              const isActive = i === activePipelineStep;
              const isPast = i < activePipelineStep;
              return (
                <div
                  key={step.label}
                  className={`relative text-center p-4 sm:p-5 rounded-xl border transition-all duration-500 ${
                    isActive
                      ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/10 scale-105"
                      : isPast
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border/50 bg-card/50"
                  }`}
                  data-testid={`pipeline-step-${i}`}
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  <div className={`mx-auto h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-colors duration-300 ${
                    isActive ? "bg-primary/20 text-primary" : isPast ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                  }`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className={`text-sm font-semibold mb-1 transition-colors ${isActive ? "text-primary" : ""}`}>{step.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{step.desc}</p>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50 spotlight" data-testid="section-features" onMouseMove={handleSpotlight} ref={featuresView.ref}>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Core Systems</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Six Engines, Zero Manual Work
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Every aspect of your creator business managed by specialized AI systems working together.
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-700 ${featuresView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className="card-premium p-6 space-y-4"
                data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono">{feature.metric}</Badge>
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50 relative overflow-hidden" data-testid="section-how-it-works">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-blue-500/[0.02]" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Three Steps to <span className="gradient-text">Autopilot</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="relative text-center space-y-5" data-testid={`step-${step.step}`}>
                <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <step.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {step.step}
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
                <Badge variant="secondary" className="text-[10px]">
                  <Clock className="h-2.5 w-2.5 mr-1" />
                  {step.time}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-testimonials" ref={testimonialsView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Creator Results</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Real Growth, Real Numbers
            </h2>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 transition-all duration-700 ${testimonialsView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {TESTIMONIALS.map((t, i) => (
              <Card key={t.name} className="shine" data-testid={`card-testimonial-${i}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {t.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                      {t.growth}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.quote}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50 relative" data-testid="section-trust">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Platform Capabilities</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Built for Scale
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { value: "832", label: "AI Features", icon: Sparkles },
              { value: "25+", label: "Platforms", icon: Monitor },
              { value: "11", label: "AI Agents", icon: Bot },
              { value: "99.9%", label: "Uptime", icon: Shield },
            ].map((item) => (
              <div key={item.label} className="card-premium p-6 text-center" data-testid={`card-trust-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <item.icon className="w-5 h-5 text-primary mx-auto mb-3" />
                <p className="text-3xl font-extrabold font-display text-primary">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 overflow-hidden relative">
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />
            <div className="flex gap-3 marquee whitespace-nowrap" data-testid="container-platforms">
              {[...Array(2)].map((_, setIdx) => (
                <div key={setIdx} className="flex gap-3 shrink-0">
                  {["YouTube", "TikTok", "Twitch", "X", "Discord", "Kick", "Instagram", "Facebook", "LinkedIn", "Rumble", "Reddit", "Pinterest", "Snapchat", "Spotify", "Patreon", "Ko-fi", "Substack", "Threads", "Bluesky", "DLive", "Trovo", "WhatsApp", "YouTube Shorts", "Apple Podcasts", "Mastodon"].map((p) => (
                    <Badge key={`${setIdx}-${p}`} variant="secondary" className="text-xs py-1.5 px-3 whitespace-nowrap">
                      {p}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-pricing" ref={pricingView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Start free. Upgrade when you need more platforms and automation.
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 transition-all duration-700 ${pricingView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`card-premium p-5 space-y-4 ${tier.popular ? "ring-2 ring-primary border-glow-animated" : ""}`}
                data-testid={`card-pricing-${tier.name.toLowerCase()}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{tier.name}</h3>
                  {tier.popular && <Badge variant="default" className="text-[10px]">Most Popular</Badge>}
                </div>
                <div>
                  <p className="text-3xl font-extrabold font-display">
                    {tier.price}
                    {tier.period && <span className="text-sm font-normal text-muted-foreground">{tier.period}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{tier.desc}</p>
                </div>
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Monitor className="h-3 w-3" />
                  {tier.platforms}
                </p>
                <ul className="space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-muted-foreground flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href="/pricing">
                  <Button variant={tier.popular ? "default" : "outline"} size="sm" className="w-full mt-2" data-testid={`button-pricing-${tier.name.toLowerCase()}`}>
                    {tier.price === "$0" ? "Get Started" : "Upgrade"}
                  </Button>
                </a>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <a href="/pricing">
              <Button variant="outline" size="lg" data-testid="button-view-full-pricing">
                View Full Pricing Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32 border-t border-border/50 relative overflow-hidden aurora-bg" data-testid="section-cta">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <Award className="h-12 w-12 text-primary mx-auto mb-6 float" />
          <h2 data-testid="text-cta-heading" className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold">
            Stop Managing. Start <span className="gradient-text-vivid">Creating.</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-md mx-auto">
            Join creators who let AI handle the heavy lifting while they focus on what they love.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button data-testid="button-cta-get-started" size="lg" className="text-base glow border-glow-animated" onClick={() => setShowAuthForm(true)}>
              Get Started Free
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <a href="/pricing">
              <Button data-testid="button-cta-view-pricing" variant="outline" size="lg" className="text-base">
                <Play className="h-3.5 w-3.5 mr-2" />
                View Plans
              </Button>
            </a>
          </div>
          <div className="flex items-center justify-center gap-8 mt-10 flex-wrap">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{stat.value}{stat.suffix}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xs tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms</a>
            <a href="/data-disclosure" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-data">Data Disclosure</a>
            <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} CreatorOS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
