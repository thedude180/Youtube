import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { AuthForm } from "@/components/AuthForm";
import { useTranslation } from "react-i18next";

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

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; opacity: number; hue: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || 600;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      const count = Math.min(Math.floor((width * height) / 12000), 80);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        hue: 260 + Math.random() * 40,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist / 200);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + influence * 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.opacity + influence * 0.3})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const ddx = p.x - p2.x;
          const ddy = p.y - p2.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(265, 70%, 60%, ${0.08 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    resize();
    initParticles();
    draw();

    window.addEventListener("resize", () => { resize(); initParticles(); });
    const parent = canvas.parentElement;
    if (parent) parent.addEventListener("mousemove", handleMouse);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      if (parent) parent.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
      aria-hidden="true"
    />
  );
}

function FloatingOrb({ delay, size, x, y }: { delay: number; size: number; x: string; y: string }) {
  return (
    <div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        background: `radial-gradient(circle, hsla(265, 80%, 60%, 0.15), hsla(220, 80%, 60%, 0.05), transparent)`,
        animation: `float ${6 + delay}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
      aria-hidden="true"
    />
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  usePageTitle("AI-Powered Creator Management Platform", "CreatorOS replaces your entire creator team with 832 AI features. Manage content, streaming, revenue, and growth across 25 platforms on full autopilot.");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      const errorMessages: Record<string, string> = {
        "true": "Sign in failed. Please try again.",
        "no_user": "Could not retrieve your account. Please try again.",
        "login_failed": "Sign in failed. Please try again.",
        "token_failed": "Could not connect to platform. Please try again.",
        "no_token": "Platform authentication failed. Please try again.",
        "missing_code": "OAuth authorization was cancelled or failed.",
        "invalid_state": "Session expired. Please try signing in again.",
        "state_expired": "Session expired. Please try signing in again.",
        "user_info_failed": "Could not retrieve platform profile. Please try again.",
        "no_user_id": "Could not retrieve your platform ID. Please try again.",
        "platform_not_supported": "This platform is not yet supported.",
      };
      const message = errorMessages[authError] || `Authentication error: ${authError.replace(/_/g, " ")}`;
      toast({ title: t('errors.error'), description: message, variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, [t, toast]);

  const PIPELINE_STEPS = useMemo(() => [
    { icon: Radio, label: t('landing.goLive'), desc: t('landing.goLiveDesc') },
    { icon: Cpu, label: t('landing.aiDetects'), desc: t('landing.aiDetectsDesc') },
    { icon: Video, label: t('landing.clipsCreated'), desc: t('landing.clipsCreatedDesc') },
    { icon: Brain, label: t('landing.seoOptimized'), desc: t('landing.seoOptimizedDesc') },
    { icon: Layers, label: t('landing.crossPosted'), desc: t('landing.crossPostedDesc') },
    { icon: TrendingUp, label: t('landing.growth'), desc: t('landing.growthDesc') },
  ], [t]);

  const FEATURES = useMemo(() => [
    {
      icon: Brain,
      title: t('landing.aiContentEngine'),
      description: t('landing.aiContentEngineDesc'),
      metric: "832 AI features",
      gradient: "from-violet-500/20 to-purple-500/10",
    },
    {
      icon: Radio,
      title: t('landing.multiPlatformLive'),
      description: t('landing.multiPlatformLiveDesc'),
      metric: "25+ platforms",
      gradient: "from-blue-500/20 to-cyan-500/10",
    },
    {
      icon: Target,
      title: t('landing.retentionScience'),
      description: t('landing.retentionScienceDesc'),
      metric: "95% retention",
      gradient: "from-emerald-500/20 to-green-500/10",
    },
    {
      icon: Eye,
      title: t('landing.seoDomination'),
      description: t('landing.seoDominationDesc'),
      metric: "3x more views",
      gradient: "from-amber-500/20 to-orange-500/10",
    },
    {
      icon: DollarSign,
      title: t('landing.revenueIntelligence'),
      description: t('landing.revenueIntelligenceDesc'),
      metric: "Full P&L",
      gradient: "from-rose-500/20 to-pink-500/10",
    },
    {
      icon: Shield,
      title: t('landing.selfHealingSystem'),
      description: t('landing.selfHealingSystemDesc'),
      metric: "Always on",
      gradient: "from-indigo-500/20 to-blue-500/10",
    },
  ], [t]);

  const TESTIMONIALS = useMemo(() => [
    {
      name: t('landing.gamingCreator'),
      role: t('landing.youtubeAndTwitch'),
      quote: t('landing.gamingQuote'),
      avatar: "🎮",
    },
    {
      name: t('landing.techReviewer'),
      role: t('landing.multiPlatformCreator'),
      quote: t('landing.techQuote'),
      avatar: "💻",
    },
    {
      name: t('landing.varietyStreamer'),
      role: t('landing.fullTimeCreator'),
      quote: t('landing.varietyQuote'),
      avatar: "🎙️",
    },
  ], [t]);

  const TIERS = useMemo(() => [
    { name: t('landing.free'), price: "$0", period: "", desc: t('landing.getStarted'), features: [t('landing.dashboardAccess'), t('landing.basicAnalytics'), t('landing.aiAdvisor'), t('landing.contentOverview')], platforms: "1 platform" },
    { name: "YouTube", price: "$9.99", period: t('landing.perMonth'), desc: t('landing.singlePlatform'), features: [t('landing.youtubeAutomation'), t('landing.seoOptimizer'), t('landing.thumbnailAi'), t('landing.streamCenter'), t('landing.contentCalendar')], platforms: "1 platform" },
    { name: "Starter", price: "$49.99", period: t('landing.perMonth'), desc: t('landing.multiPlatform'), features: [t('landing.threePlatformAutomation'), t('landing.contentCalendar'), t('landing.revenueTracking'), t('landing.aiContentSuite'), t('landing.crossPosting')], platforms: "3 platforms", popular: true },
    { name: "Pro", price: "$99.99", period: t('landing.perMonth'), desc: t('landing.fullAutopilot'), features: [t('landing.tenPlatformAutomation'), t('landing.fullAutopilotMode'), t('landing.competitorIntel'), t('landing.prioritySupport'), t('landing.teamAccess'), t('landing.abTesting')], platforms: "10 platforms" },
    { name: "Ultimate", price: "$149.99", period: t('landing.perMonth'), desc: t('landing.everything'), features: [t('landing.twentyFivePlatforms'), t('landing.allAiFeatures'), t('landing.creatorIntelligence'), t('landing.sixAiAgentSystems'), t('landing.customWorkflows'), t('landing.dedicatedSupport')], platforms: "Unlimited" },
  ], [t]);

  const HOW_IT_WORKS = useMemo(() => [
    { step: 1, icon: Link2, title: t('landing.connect'), description: t('landing.connectDesc'), time: "60 sec" },
    { step: 2, icon: Cpu, title: t('landing.aiActivates'), description: t('landing.aiActivatesDesc'), time: "5 min" },
    { step: 3, icon: RefreshCw, title: t('landing.autopilot'), description: t('landing.autopilotDesc'), time: "Forever" },
  ], [t]);

  const STATS = useMemo(() => [
    { value: 832, label: t('landing.aiFeatures'), suffix: "" },
    { value: 25, label: t('landing.platforms'), suffix: "+" },
    { value: 11, label: t('landing.aiAgents'), suffix: "" },
    { value: 99, label: t('landing.uptime'), suffix: ".9%" },
  ], [t]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePipelineStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [PIPELINE_STEPS.length]);

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
  const howItWorksView = useInView(0.1);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border/30 sticky top-0 z-50 bg-background/60 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center glow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              <Zap className="h-4 w-4 text-primary-foreground relative z-10" />
            </div>
            <span data-testid="text-landing-logo" className="font-display font-bold text-base tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/pricing">
              <Button data-testid="button-nav-pricing" variant="ghost" size="sm">{t('landing.pricing')}</Button>
            </a>
            <Button data-testid="button-sign-in-nav" size="sm" className="glow-sm" onClick={() => setShowAuthForm(true)}>
              {t('landing.signIn')}
            </Button>
          </div>
        </div>
      </nav>

      {showAuthForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md"
          data-testid="modal-auth"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthForm(false); }}
        >
          <div className="relative scale-in">
            <button data-testid="button-close-auth" onClick={() => setShowAuthForm(false)} className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">&times;</button>
            <AuthForm />
          </div>
        </div>
      )}

      <section className="relative overflow-hidden" data-testid="section-hero" ref={heroRef}>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-background" aria-hidden="true" />
        <FloatingOrb delay={0} size={400} x="10%" y="10%" />
        <FloatingOrb delay={2} size={300} x="70%" y="20%" />
        <FloatingOrb delay={4} size={250} x="40%" y="60%" />
        <ParticleCanvas />

        <div className="relative py-24 sm:py-32 lg:py-44">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-3xl">
              <div className="slide-up-stagger" style={{ animationDelay: '0s' }}>
                <Badge variant="secondary" className="mb-6 text-xs tracking-wide border-primary/20 bg-primary/5 backdrop-blur-sm" data-testid="badge-hero">
                  <Sparkles className="w-3 h-3 mr-1.5 text-primary" />
                  {t('landing.badge')}
                </Badge>
              </div>

              <h1 data-testid="text-hero-heading" className="slide-up-stagger font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight" style={{ animationDelay: '0.1s' }}>
                {t('landing.heroTitle1')}
                <br />
                <span className="gradient-text-vivid text-glow">{t('landing.heroTitle2')}</span>
                <br />
                {t('landing.heroTitle3')}
              </h1>

              <p data-testid="text-hero-subtitle" className="slide-up-stagger mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl" style={{ animationDelay: '0.2s' }}>
                {t('landing.heroSubtitle')}
              </p>

              <div className="slide-up-stagger mt-10 flex flex-col sm:flex-row gap-3" style={{ animationDelay: '0.3s' }}>
                <Button data-testid="button-hero-get-started" size="lg" className="text-base glow border-glow-animated group" onClick={() => setShowAuthForm(true)}>
                  {t('landing.getStartedFree')}
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
                <a href="/pricing">
                  <Button data-testid="button-hero-view-pricing" variant="outline" size="lg" className="w-full sm:w-auto text-base backdrop-blur-sm">
                    <Play className="h-3.5 w-3.5 mr-2" />
                    {t('landing.seePlans')}
                  </Button>
                </a>
              </div>

              <div className="slide-up-stagger flex items-center gap-5 mt-8 flex-wrap" style={{ animationDelay: '0.4s' }}>
                {[t('landing.fiveMinSetup'), t('landing.noCreditCard'), t('landing.cancelAnytime')].map((text) => (
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

      <section className="py-20 sm:py-28 border-t border-border/30 relative overflow-hidden" data-testid="section-pipeline" ref={pipelineView.ref}>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.thePipeline')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.streamOnceForever').split(', ')[0]}, <span className="gradient-text">{t('landing.streamOnceForever').split(', ')[1]}</span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              {t('landing.pipelineSubtitle')}
            </p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 transition-all duration-700 ${pipelineView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {PIPELINE_STEPS.map((step, i) => {
              const isActive = i === activePipelineStep;
              const isPast = i < activePipelineStep;
              return (
                <div
                  key={step.label}
                  className={`relative text-center p-4 sm:p-5 rounded-xl border transition-all duration-500 group ${
                    isActive
                      ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/10 scale-105"
                      : isPast
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border/50 bg-card/50 hover:border-primary/20 hover:bg-primary/[0.02]"
                  }`}
                  data-testid={`pipeline-step-${i}`}
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  <div className={`mx-auto h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-all duration-300 ${
                    isActive ? "bg-primary/20 text-primary scale-110" : isPast ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  }`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className={`text-sm font-semibold mb-1 transition-colors ${isActive ? "text-primary" : ""}`}>{step.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{step.desc}</p>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className={`hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${isActive ? "text-primary/60" : "text-muted-foreground/40"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/30 spotlight" data-testid="section-features" onMouseMove={handleSpotlight} ref={featuresView.ref}>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.coreSystems')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.sixEngines')}
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              {t('landing.sixEnginesSubtitle')}
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-700 ${featuresView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className="card-premium p-6 space-y-4 group"
                data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono">{feature.metric}</Badge>
                  </div>
                  <h3 className="text-base font-semibold mt-4">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/30 relative overflow-hidden" data-testid="section-how-it-works" ref={howItWorksView.ref}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-blue-500/[0.02]" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.howItWorks')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.threeSteps').replace('Autopilot', '').trim()} <span className="gradient-text">{t('landing.autopilot')}</span>
            </h2>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 transition-all duration-700 ${howItWorksView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative text-center space-y-5" data-testid={`step-${step.step}`} style={{ transitionDelay: `${i * 150}ms` }}>
                <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group hover:bg-primary/15 transition-colors">
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
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 -right-4 lg:-right-8">
                    <ArrowRight className="h-5 w-5 text-primary/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/30" data-testid="section-testimonials" ref={testimonialsView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.creatorResults')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.realGrowth')}
            </h2>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 transition-all duration-700 ${testimonialsView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {TESTIMONIALS.map((testimonial, i) => (
              <Card key={testimonial.name} className="shine group hover:shadow-lg hover:shadow-primary/5 transition-shadow duration-500" data-testid={`card-testimonial-${i}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-lg ring-2 ring-primary/10">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{testimonial.name}</p>
                      <p className="text-[11px] text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic">"{testimonial.quote}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/30 relative" data-testid="section-trust">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.platformCapabilities')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.builtForScale')}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { value: "832", label: t('landing.aiFeatures'), icon: Sparkles },
              { value: "25+", label: t('landing.platforms'), icon: Monitor },
              { value: "11", label: t('landing.aiAgents'), icon: Bot },
              { value: "99.9%", label: t('landing.uptime'), icon: Shield },
            ].map((item) => (
              <div key={item.label} className="card-premium p-6 text-center group" data-testid={`card-trust-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <item.icon className="w-5 h-5 text-primary mx-auto mb-3 group-hover:scale-110 transition-transform" />
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
                  {["YouTube", "TikTok", "Twitch", "X", "Discord", "Kick", "Rumble", "LinkedIn", "Reddit", "Pinterest", "Snapchat", "Spotify", "Patreon", "Ko-fi", "Substack", "Threads", "Bluesky", "DLive", "Trovo", "WhatsApp", "YouTube Shorts", "Apple Podcasts", "Mastodon"].map((p) => (
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

      <section className="py-20 sm:py-28 border-t border-border/30" data-testid="section-pricing" ref={pricingView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('landing.pricing')}</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.simplePricing')}
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              {t('landing.pricingSubtitle')}
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 transition-all duration-700 ${pricingView.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {TIERS.map((tier, i) => (
              <div
                key={tier.name}
                className={`card-premium p-5 space-y-4 ${tier.popular ? "ring-2 ring-primary border-glow-animated scale-[1.02]" : ""}`}
                data-testid={`card-pricing-${tier.name.toLowerCase()}`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{tier.name}</h3>
                  {tier.popular && <Badge variant="default" className="text-[10px]">{t('landing.mostPopular')}</Badge>}
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
                  <Button variant={tier.popular ? "default" : "outline"} size="sm" className={`w-full mt-2 ${tier.popular ? "glow-sm" : ""}`} data-testid={`button-pricing-${tier.name.toLowerCase()}`}>
                    {tier.price === "$0" ? t('landing.getStarted') : t('landing.upgrade')}
                  </Button>
                </a>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <a href="/pricing">
              <Button variant="outline" size="lg" data-testid="button-view-full-pricing" className="group">
                {t('landing.viewFullPricing')}
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32 border-t border-border/30 relative overflow-hidden aurora-bg" data-testid="section-cta">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <Award className="h-12 w-12 text-primary mx-auto mb-6 float" />
          <h2 data-testid="text-cta-heading" className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold">
            {t('landing.stopManaging')} <span className="gradient-text-vivid">{t('landing.creating')}</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-md mx-auto">
            {t('landing.ctaSubtitle')}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button data-testid="button-cta-get-started" size="lg" className="text-base glow border-glow-animated group" onClick={() => setShowAuthForm(true)}>
              {t('landing.getStartedFreeCta')}
              <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
            <a href="/pricing">
              <Button data-testid="button-cta-view-pricing" variant="outline" size="lg" className="text-base">
                <Play className="h-3.5 w-3.5 mr-2" />
                {t('landing.viewPlans')}
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

      <footer className="border-t border-border/30 py-8">
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
            <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">{t('landing.pricing')}</a>
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
