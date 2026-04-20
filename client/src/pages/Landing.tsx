import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Zap, ArrowRight, Bot, DollarSign, BarChart3,
  CheckCircle2, Link2, Cpu, TrendingUp,
  Brain, Calendar, Shield, Sparkles, Play,
  Radio, Video, Layers, Target, Eye, Users, Globe,
  RefreshCw, Clock, Award, ChevronRight, Upload, Tv2,
} from "lucide-react";
import {
  SiYoutube, SiTwitch, SiTiktok, SiDiscord,
  SiInstagram, SiKick, SiRumble,
} from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { AuthForm } from "@/components/AuthForm";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

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
    let width = 0, height = 0;

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
      const count = Math.min(Math.floor((width * height) / 14000), 60);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.08,
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
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = width; if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height; if (p.y > height) p.y = 0;
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist / 180);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + influence * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.opacity + influence * 0.25})`;
        ctx.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const ddx = p.x - p2.x, ddy = p.y - p2.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < 100) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(265, 70%, 60%, ${0.06 * (1 - d / 100)})`;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    resize(); initParticles(); draw();
    const handleResize = () => { resize(); initParticles(); };
    window.addEventListener("resize", handleResize);
    const parent = canvas.parentElement;
    if (parent) parent.addEventListener("mousemove", handleMouse);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      if (parent) parent.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: "screen" }} aria-hidden="true" />
  );
}

const PLATFORMS = [
  { icon: SiYoutube, name: "YouTube", color: "#FF0000" },
  { icon: SiTwitch, name: "Twitch", color: "#9146FF" },
  { icon: SiTiktok, name: "TikTok", color: "#00F2EA" },
  { icon: SiDiscord, name: "Discord", color: "#5865F2" },
  { icon: SiInstagram, name: "Instagram", color: "#E1306C" },
  { icon: SiKick, name: "Kick", color: "#53FC18" },
  { icon: SiRumble, name: "Rumble", color: "#85C742" },
];

function PlatformStrip() {
  return (
    <div className="flex items-center justify-center gap-8 md:gap-12 py-6 flex-wrap" data-testid="section-platform-logos">
      {PLATFORMS.map((P, i) => (
        <div key={i} className="flex items-center gap-1.5 opacity-40 hover:opacity-80 transition-all duration-300 group" data-testid={`logo-platform-${i}`}>
          <P.icon className="w-4 h-4 group-hover:scale-110 transition-transform" style={{ color: P.color }} />
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">{P.name}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ value, label, suffix = "", icon: Icon }: { value: string | number; label: string; suffix?: string; icon: any }) {
  return (
    <div className="flex flex-col items-center p-5 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon className="w-4 h-4 text-primary mb-2 opacity-70" />
      <div className="text-2xl font-bold font-mono text-foreground">{value}{suffix}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, metric, gradient }: {
  icon: any; title: string; description: string; metric: string; gradient: string;
}) {
  return (
    <div className={`relative p-6 rounded-2xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card/80 transition-all duration-300 group overflow-hidden`}
      data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <Badge variant="secondary" className="text-[10px] font-mono tabular-nums">{metric}</Badge>
        </div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StepCard({ step, icon: Icon, title, description, time, isLast }: {
  step: number; icon: any; title: string; description: string; time: string; isLast: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center text-center space-y-4" data-testid={`step-${step}`}>
      <div className="relative">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
          {step}
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px] mx-auto">{description}</p>
      <Badge variant="secondary" className="text-[10px]">
        <Clock className="h-2.5 w-2.5 mr-1" />{time}
      </Badge>
      {!isLast && (
        <div className="hidden md:block absolute top-7 left-[calc(50%+3rem)] right-0 h-px border-t border-dashed border-border/50" aria-hidden="true" />
      )}
    </div>
  );
}

function PricingCard({
  name, price, period, description, features, platforms, popular, onGetStarted,
}: {
  name: string; price: string; period: string; description: string;
  features: string[]; platforms: string; popular?: boolean; onGetStarted: () => void;
}) {
  return (
    <div className={`relative flex flex-col p-6 rounded-2xl border transition-all duration-300 ${popular
      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]"
      : "border-border/40 bg-card/50 hover:border-primary/30"
    }`} data-testid={`card-pricing-${name.toLowerCase()}`}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="text-[10px] px-3 shadow-sm">Most Popular</Badge>
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-1">{name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold font-mono">{price}</span>
          {period && <span className="text-xs text-muted-foreground">{period}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
      </div>
      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-3 flex items-center gap-1">
        <Globe className="h-3 w-3" />{platforms}
      </p>
      <ul className="space-y-2 flex-1 mb-5">
        {features.map((f) => (
          <li key={f} className="text-xs text-muted-foreground flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        variant={popular ? "default" : "outline"}
        size="sm"
        className={`w-full ${popular ? "shadow-md" : ""}`}
        onClick={onGetStarted}
        data-testid={`button-pricing-${name.toLowerCase()}`}
      >
        {price === "$0" ? "Get Started Free" : "Start Now"}
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [showAuthForm, setShowAuthForm] = useState(false);
  const { toast } = useToast();

  const { data: authConfig } = useQuery<{ mode: "replit" | "oauth" }>({
    queryKey: ["/api/auth/mode"],
    staleTime: Infinity,
  });
  const isReplitMode = authConfig?.mode === "replit";

  const handleSignIn = useCallback(() => {
    if (isReplitMode) {
      window.location.href = "/api/login";
    } else {
      setShowAuthForm(true);
    }
  }, [isReplitMode]);

  usePageTitle(
    "AI-Powered YouTube Channel OS for Gaming Creators",
    "CreatorOS gives gaming channels an autonomous AI team — Shorts pipeline, upload scheduling, SEO, revenue tracking, and live stream management on full autopilot.",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      const reason = params.get("reason");
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
      let message: string;
      if (authError.endsWith("_denied")) {
        const platform = authError.replace("_denied", "");
        const reasonText = reason ? `: ${reason.replace(/_/g, " ")}` : "";
        message = `${platform.charAt(0).toUpperCase() + platform.slice(1)} denied access${reasonText}. Check your app's redirect URI settings.`;
      } else {
        message = errorMessages[authError] || `Authentication error: ${authError.replace(/_/g, " ")}`;
      }
      toast({ title: "Error", description: message, variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, [toast]);

  const FEATURES = useMemo(() => [
    { icon: Video, title: "Shorts Pipeline", description: "Automatically clips your VODs and streams into short-form content, adds hooks, captions, and queues them for upload.", metric: "Daily automation", gradient: "from-violet-500/10 to-purple-500/5" },
    { icon: Upload, title: "Smart Scheduling", description: "AI picks the best time to upload based on your audience analytics and YouTube's algorithm windows.", metric: "Optimal timing", gradient: "from-blue-500/10 to-cyan-500/5" },
    { icon: Brain, title: "SEO Optimizer", description: "Generates titles, descriptions, tags, and chapters for every upload — tuned to rank on YouTube search.", metric: "3× more discovery", gradient: "from-emerald-500/10 to-green-500/5" },
    { icon: Eye, title: "Thumbnail Intelligence", description: "Researches top-performing thumbnails in your niche and generates A/B variants with click-worthy compositions.", metric: "CTR boost", gradient: "from-amber-500/10 to-orange-500/5" },
    { icon: DollarSign, title: "Revenue Dashboard", description: "Tracks AdSense, sponsorships, Twitch subs, and Kick earnings in one P&L view with expense tracking.", metric: "Full P&L", gradient: "from-rose-500/10 to-pink-500/5" },
    { icon: Radio, title: "Live Stream Hub", description: "Detects when you go live, monitors your stream, and fires up the post-stream Shorts pipeline automatically.", metric: "Auto-detect", gradient: "from-indigo-500/10 to-blue-500/5" },
  ], []);

  const HOW_IT_WORKS = useMemo(() => [
    { step: 1, icon: Link2, title: "Connect Your Channel", description: "Link your YouTube account and any other platforms in under 60 seconds.", time: "60 sec" },
    { step: 2, icon: Cpu, title: "AI Takes Over", description: "Your AI team indexes your content, learns your style, and sets up the automation stack.", time: "5 min" },
    { step: 3, icon: RefreshCw, title: "Watch It Run", description: "Uploads go out, analytics update, revenue is tracked — all while you focus on playing.", time: "24/7" },
  ], []);

  const TIERS = useMemo(() => [
    {
      name: "Free",
      price: "$0",
      period: "",
      description: "Get started, no card required",
      features: ["Dashboard access", "Basic analytics", "AI advisor", "Content overview"],
      platforms: "1 platform",
    },
    {
      name: "YouTube",
      price: "$9.99",
      period: "/mo",
      description: "Single channel automation",
      features: ["YouTube Shorts pipeline", "SEO optimizer", "Thumbnail AI", "Smart scheduler", "Content calendar"],
      platforms: "1 platform",
    },
    {
      name: "Starter",
      price: "$49.99",
      period: "/mo",
      description: "Multi-platform creator",
      features: ["3-platform automation", "Content calendar", "Revenue tracking", "AI content suite", "Cross-posting"],
      platforms: "3 platforms",
      popular: true,
    },
    {
      name: "Pro",
      price: "$99.99",
      period: "/mo",
      description: "Full autopilot",
      features: ["10-platform automation", "Full autopilot mode", "Competitor intel", "Priority support", "Team access"],
      platforms: "10 platforms",
    },
    {
      name: "Ultimate",
      price: "$149.99",
      period: "/mo",
      description: "Unlimited everything",
      features: ["Unlimited platforms", "All AI features", "Creator intelligence", "6 AI agent systems", "Custom workflows"],
      platforms: "Unlimited",
    },
  ], []);

  const featuresView = useInView(0.1);
  const howItWorksView = useInView(0.1);
  const pricingView = useInView(0.1);
  const ctaView = useInView(0.1);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-landing">

      {/* Auth modal */}
      {!isReplitMode && showAuthForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md"
          data-testid="modal-auth"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthForm(false); }}
        >
          <div className="relative scale-in">
            <button
              data-testid="button-close-auth"
              onClick={() => setShowAuthForm(false)}
              className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              &times;
            </button>
            <AuthForm />
          </div>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/30 bg-background/70 backdrop-blur-2xl" data-testid="nav-landing">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              <Zap className="h-4 w-4 text-primary-foreground relative z-10" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight" data-testid="text-landing-logo">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              data-testid="link-nav-features"
            >
              Features
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              data-testid="link-nav-how-it-works"
            >
              How it works
            </button>
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              data-testid="link-nav-pricing"
            >
              Pricing
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignIn}
              data-testid="button-sign-in-nav"
            >
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={handleSignIn}
              className="shadow-sm shadow-primary/20"
              data-testid="button-get-started-nav"
            >
              Get Started Free
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center" data-testid="section-hero">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-transparent to-background" aria-hidden="true" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <ParticleCanvas />

        <div className="relative w-full py-20 lg:py-28">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-6" data-testid="badge-hero-tag">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">Built for gaming channels</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-display font-bold tracking-tight leading-[1.1] mb-6" data-testid="text-hero-headline">
              <span className="block text-foreground">Your YouTube channel,</span>
              <span className="gradient-text">on full autopilot.</span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed" data-testid="text-hero-subheadline">
              CreatorOS gives your gaming channel an AI team that handles Shorts, scheduling,
              SEO, thumbnails, and revenue — so you can just focus on playing.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14" data-testid="container-hero-ctas">
              <Button
                size="lg"
                className="h-13 px-8 text-base font-semibold rounded-xl shadow-lg shadow-primary/25 group"
                onClick={handleSignIn}
                data-testid="button-hero-primary"
              >
                Start for Free
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-13 px-8 text-base font-semibold rounded-xl border-border/60 hover:bg-muted/40"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                data-testid="button-hero-secondary"
              >
                <Play className="w-3.5 h-3.5 mr-2" />
                See What It Does
              </Button>
            </div>

            {/* Platform logos */}
            <div className="border-t border-border/30 pt-8">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-4">
                Works with your platforms
              </p>
              <PlatformStrip />
            </div>
          </div>
        </div>
      </section>

      {/* ── Key metrics bar ───────────────────────────── */}
      <section className="border-y border-border/30 bg-card/30 py-10" data-testid="section-metrics">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard value={11} label="AI Agents" icon={Bot} />
          <MetricCard value="25" suffix="+" label="Platforms" icon={Globe} />
          <MetricCard value="99" suffix=".9%" label="Uptime" icon={Shield} />
          <MetricCard value="24/7" label="Automation" icon={RefreshCw} />
        </div>
      </section>

      {/* ── App Preview Mockup ────────────────────────── */}
      <section className="py-20 sm:py-28" data-testid="section-app-preview">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">The Dashboard</p>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Everything in one place</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Your complete creator OS — AI team, content queue, live stream hub, and revenue tracker, all connected.
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/20 overflow-hidden">
            {/* Browser chrome */}
            <div className="h-9 bg-muted/40 border-b border-border/50 flex items-center px-4 gap-2 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <div className="mx-auto flex items-center gap-1.5 bg-background/50 border border-border/40 rounded px-3 h-5 text-[10px] text-muted-foreground font-mono">
                <Zap className="w-2.5 h-2.5 text-primary" />
                creatoros.app
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="bg-background p-0 flex" style={{ minHeight: 320 }}>
              {/* Sidebar */}
              <div className="w-36 shrink-0 border-r border-border/40 p-4 space-y-1.5 bg-card/60">
                <div className="flex items-center gap-2 mb-5 px-1">
                  <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
                    <Zap className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-[11px] font-bold">CreatorOS</span>
                </div>
                {[
                  { icon: Users, label: "Team", active: true },
                  { icon: Video, label: "Content" },
                  { icon: Radio, label: "Live" },
                  { icon: DollarSign, label: "Revenue" },
                  { icon: BarChart3, label: "Analytics" },
                ].map((item) => (
                  <div key={item.label} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium ${item.active ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                    <item.icon className="w-3 h-3" />
                    {item.label}
                  </div>
                ))}
              </div>
              {/* Main area */}
              <div className="flex-1 p-5 space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-4 w-28 bg-muted/70 rounded mb-1" />
                    <div className="h-3 w-40 bg-muted/40 rounded" />
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 rounded text-[9px] font-mono text-emerald-400">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    AI Active
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Shorts queued", value: "12", color: "text-primary" },
                    { label: "Scheduled", value: "5", color: "text-blue-400" },
                    { label: "This week", value: "$428", color: "text-emerald-400" },
                    { label: "Subscribers", value: "↑ 2.1%", color: "text-violet-400" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-muted/30 border border-border/30 p-3">
                      <div className={`text-sm font-bold font-mono ${stat.color}`}>{stat.value}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Team Activity</span>
                    <div className="text-[9px] font-mono text-primary">LIVE</div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { agent: "Shorts Specialist", task: "Clipping VOD from last night's stream", status: "running" },
                      { agent: "SEO Director", task: "Generating tags for 3 new uploads", status: "done" },
                      { agent: "Thumbnail AI", task: "A/B variant generated — pending review", status: "waiting" },
                    ].map((row) => (
                      <div key={row.agent} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.status === "running" ? "bg-primary animate-pulse" : row.status === "done" ? "bg-emerald-400" : "bg-yellow-400"}`} />
                        <span className="text-[10px] font-medium text-muted-foreground w-24 shrink-0 truncate">{row.agent}</span>
                        <span className="text-[9px] text-muted-foreground/60 truncate">{row.task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28 border-t border-border/30" data-testid="section-features" ref={featuresView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Core Systems</p>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Six engines running your channel</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Each AI system handles one part of the creator workflow — completely autonomously.
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-700 ${featuresView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{ transitionDelay: `${i * 60}ms` }}>
                <FeatureCard {...f} />
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button
              variant="outline"
              onClick={handleSignIn}
              className="group"
              data-testid="button-features-get-started"
            >
              Start using all 6 systems free
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────── */}
      <section id="how-it-works" className="py-20 sm:py-28 border-t border-border/30 bg-muted/10" data-testid="section-how-it-works" ref={howItWorksView.ref}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Setup</p>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Up and running in minutes</h2>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 transition-all duration-700 ${howItWorksView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} style={{ transitionDelay: `${i * 120}ms` }}>
                <StepCard {...step} isLast={i === HOW_IT_WORKS.length - 1} />
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Button
              size="lg"
              onClick={handleSignIn}
              className="shadow-md shadow-primary/20 group"
              data-testid="button-how-it-works-cta"
            >
              Connect My Channel Now
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
            </Button>
            <p className="text-[11px] text-muted-foreground mt-3">Free plan • No credit card required</p>
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────── */}
      <section id="pricing" className="py-20 sm:py-28 border-t border-border/30" data-testid="section-pricing" ref={pricingView.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Pricing</p>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Simple, transparent pricing</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Start free. Upgrade when your channel needs more automation.
            </p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 transition-all duration-700 ${pricingView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {TIERS.map((tier, i) => (
              <div key={tier.name} style={{ transitionDelay: `${i * 60}ms` }}>
                <PricingCard {...tier} onGetStarted={handleSignIn} />
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <a href="/pricing" data-testid="link-full-pricing">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                See full pricing details
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────── */}
      <section className="py-24 sm:py-32 border-t border-border/30 bg-card/20" data-testid="section-cta" ref={ctaView.ref}>
        <div className={`max-w-2xl mx-auto px-4 text-center transition-all duration-700 ${ctaView.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/30">
            <Zap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h2 className="text-2xl sm:text-4xl font-display font-bold mb-4" data-testid="text-cta-heading">
            Stop managing. Start creating.
          </h2>
          <p className="text-base text-muted-foreground mb-8 max-w-md mx-auto">
            Your AI team is ready to handle the hard parts. Connect your channel and let CreatorOS run the operation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              className="h-12 px-8 text-base font-semibold shadow-lg shadow-primary/20 group"
              onClick={handleSignIn}
              data-testid="button-cta-get-started"
            >
              Get Started — It's Free
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base font-semibold"
              onClick={handleSignIn}
              data-testid="button-cta-sign-in"
            >
              Already have an account? Sign in
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-5">
            Free plan forever • No credit card • Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-border/30 py-8 bg-background" data-testid="footer-landing">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xs tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              &copy; {new Date().getFullYear()} All rights reserved
            </span>
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms</a>
            <a href="/data-disclosure" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-data">Data Disclosure</a>
            <button
              onClick={handleSignIn}
              className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              data-testid="button-footer-sign-in"
            >
              Sign In →
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
