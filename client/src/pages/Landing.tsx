import {
  Zap, ArrowRight, Bot, DollarSign, BarChart3,
  Monitor, CheckCircle2, Link2, Cpu, TrendingUp,
  Brain, Calendar, Shield, Sparkles, Play,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";

const FEATURES = [
  {
    icon: Brain,
    title: "AI-Powered Content",
    description: "832 AI features handle everything from thumbnails to SEO optimization across every platform.",
  },
  {
    icon: Monitor,
    title: "Multi-Platform Streaming",
    description: "Stream to 25 platforms simultaneously from a single dashboard with real-time analytics.",
  },
  {
    icon: DollarSign,
    title: "Revenue Intelligence",
    description: "AI-optimized monetization with P&L reports, tax planning, and sponsorship management.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "AI plans, schedules, and publishes content across all platforms at optimal times.",
  },
  {
    icon: BarChart3,
    title: "Predictive Analytics",
    description: "Cross-platform analytics with audience insights and predictive growth modeling.",
  },
  {
    icon: Bot,
    title: "Autonomous Agents",
    description: "11 AI agents work in the background handling content, engagement, and growth 24/7.",
  },
];

const PLATFORM_NAMES = [
  "YouTube", "TikTok", "Twitch", "Instagram", "X", "Discord", "Facebook",
  "LinkedIn", "Kick", "Rumble", "Reddit", "Pinterest", "Snapchat", "Spotify",
  "Patreon", "Ko-fi", "Substack", "Threads", "Bluesky", "Mastodon",
  "DLive", "Trovo", "WhatsApp", "Apple Podcasts", "YouTube Shorts",
];

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: Link2,
    title: "Connect Your Channels",
    description: "Link your platforms in seconds with one-click OAuth. No API keys needed.",
  },
  {
    step: 2,
    icon: Cpu,
    title: "AI Takes Over",
    description: "832 AI features analyze, optimize, and automate your entire workflow.",
  },
  {
    step: 3,
    icon: TrendingUp,
    title: "Watch Your Growth",
    description: "AI handles publishing, engagement, revenue, and growth on autopilot.",
  },
];

const TIERS = [
  { name: "Free", price: "$0", period: "", platforms: "Dashboard access", features: ["Basic analytics", "AI advisor", "Content overview"] },
  { name: "YouTube", price: "$9.99", period: "/mo", platforms: "1 platform", features: ["YouTube automation", "SEO optimizer", "Thumbnail AI", "Stream center"] },
  { name: "Starter", price: "$29.99", period: "/mo", platforms: "3 platforms", features: ["Multi-platform tools", "Content calendar", "Revenue tracking", "AI content suite"], popular: true },
  { name: "Pro", price: "$79.99", period: "/mo", platforms: "10 platforms", features: ["Full Autopilot", "Team collaboration", "Competitor intel", "Priority support"] },
  { name: "Ultimate", price: "$149.99", period: "/mo", platforms: "25 platforms", features: ["Full automation", "All 832 AI features", "Creator Intelligence", "6 AI systems"] },
];

const TRUST_NUMBERS = [
  { value: "832", label: "AI Features" },
  { value: "25", label: "Platforms" },
  { value: "11", label: "AI Agents" },
  { value: "12", label: "Languages" },
];

export default function Landing() {
  usePageTitle("AI-Powered Creator Management Platform", "CreatorOS replaces your entire creator team with 832 AI features. Manage content, streaming, revenue, and growth across 25 platforms on full autopilot. Start free today.");
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
              <Button data-testid="button-nav-pricing" variant="ghost" size="sm">
                Pricing
              </Button>
            </a>
            <Button
              data-testid="button-sign-in-nav"
              size="sm"
              onClick={() => { window.location.href = "/api/auth/google"; }}
            >
              <SiGoogle className="h-3.5 w-3.5 mr-1.5" />
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden" data-testid="section-hero">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-blue-500/[0.05]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="relative py-20 sm:py-28 lg:py-36">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-3xl fade-in">
              <Badge variant="secondary" className="mb-6 text-xs tracking-wide" data-testid="badge-hero">
                <Sparkles className="w-3 h-3 mr-1.5" />
                AI-Powered Creator Management
              </Badge>

              <h1 data-testid="text-hero-heading" className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-extrabold leading-[1.1] tracking-tight">
                Your Entire
                <br />
                <span className="gradient-text">YouTube Team</span>
                <br />
                In A Box
              </h1>

              <p data-testid="text-hero-subtitle" className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl font-light">
                832 AI features manage your content, streaming, revenue, and growth across 25 platforms — all on autopilot.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Button
                  data-testid="button-hero-get-started"
                  size="lg"
                  className="text-base glow"
                  onClick={() => { window.location.href = "/api/auth/google"; }}
                >
                  <SiGoogle className="h-4 w-4 mr-2" />
                  Get Started Free
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <a href="/pricing">
                  <Button
                    data-testid="button-hero-view-pricing"
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto text-base"
                  >
                    <Play className="h-3.5 w-3.5 mr-2" />
                    View Plans
                  </Button>
                </a>
              </div>

              <div className="flex items-center gap-4 mt-6 flex-wrap">
                {["Free to start", "Auto-connects YouTube", "No credit card"].map((text) => (
                  <span key={text} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-lg slide-up">
              {TRUST_NUMBERS.map((stat, i) => (
                <div key={stat.label} className={`text-center stagger-${i + 1}`} data-testid={`stat-hero-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <p className="text-3xl sm:text-4xl font-extrabold font-display text-primary">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-features">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3" data-testid="badge-features">Core Features</p>
            <h2 data-testid="text-features-heading" className="text-3xl sm:text-4xl font-display font-bold">
              Everything You Need, Automated
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Six core systems powered by AI handle your entire content business end-to-end.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature, i) => (
              <Card key={feature.title} className={`hover-elevate stagger-${i + 1}`} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50 relative overflow-hidden" data-testid="section-platforms">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/[0.03] rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3" data-testid="badge-platforms">Integrations</p>
            <h2 data-testid="text-platforms-heading" className="text-3xl sm:text-4xl font-display font-bold">
              One Dashboard, 25+ Platforms
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Connect once. CreatorOS manages content, analytics, and growth across all of them.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto" data-testid="container-platforms">
            {PLATFORM_NAMES.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs py-1.5 px-3">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-how-it-works">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3" data-testid="badge-how-it-works">How It Works</p>
            <h2 data-testid="text-how-it-works-heading" className="text-3xl sm:text-4xl font-display font-bold">
              Three Steps to Autopilot
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Get started in minutes. Let AI handle the rest.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center space-y-5" data-testid={`step-${step.step}`}>
                <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-7 w-7 text-primary" />
                </div>
                <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {step.step}
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-trust">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3" data-testid="badge-trust">Platform Capabilities</p>
            <h2 data-testid="text-trust-heading" className="text-3xl sm:text-4xl font-display font-bold">
              Built for Scale
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { value: "832", label: "AI Features", icon: Sparkles },
              { value: "25", label: "Platforms", icon: Monitor },
              { value: "11", label: "AI Agents", icon: Bot },
              { value: "99.9%", label: "Uptime", icon: Shield },
            ].map((item) => (
              <Card key={item.label} className="shine" data-testid={`card-trust-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6 text-center">
                  <item.icon className="w-5 h-5 text-primary mx-auto mb-3" />
                  <p className="text-3xl font-extrabold font-display text-primary">{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 font-medium">{item.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border/50" data-testid="section-pricing">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3" data-testid="badge-pricing">Pricing</p>
            <h2 data-testid="text-pricing-heading" className="text-3xl sm:text-4xl font-display font-bold">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
              Start free. Upgrade when you need more platforms and automation.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={`${tier.popular ? "ring-2 ring-primary glow-sm" : ""}`}
                data-testid={`card-pricing-${tier.name.toLowerCase()}`}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{tier.name}</h3>
                    {tier.popular && <Badge variant="default">Popular</Badge>}
                  </div>
                  <p className="text-3xl font-extrabold font-display">
                    {tier.price}
                    {tier.period && <span className="text-sm font-normal text-muted-foreground">{tier.period}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">{tier.platforms}</p>
                  <ul className="space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="/pricing">
                    <Button
                      variant={tier.popular ? "default" : "outline"}
                      size="sm"
                      className="w-full mt-2"
                      data-testid={`button-pricing-${tier.name.toLowerCase()}`}
                    >
                      {tier.price === "$0" ? "Get Started" : "Upgrade"}
                    </Button>
                  </a>
                </CardContent>
              </Card>
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

      <section className="py-24 sm:py-32 border-t border-border/50 relative overflow-hidden" data-testid="section-cta">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/[0.05] via-transparent to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/[0.06] rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2 data-testid="text-cta-heading" className="text-3xl sm:text-4xl font-display font-bold">
            Start Creating Smarter Today
          </h2>
          <p className="mt-4 text-base text-muted-foreground max-w-md mx-auto">
            Join creators who let AI handle the heavy lifting while they focus on what they love.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              data-testid="button-cta-get-started"
              size="lg"
              className="text-base glow"
              onClick={() => { window.location.href = "/api/auth/google"; }}
            >
              <SiGoogle className="h-4 w-4 mr-2" />
              Get Started Free
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              data-testid="button-cta-sign-in-replit"
              variant="outline"
              size="lg"
              className="text-base"
              onClick={() => { window.location.href = "/api/login"; }}
            >
              Sign in with Replit
            </Button>
          </div>
          <div className="flex items-center justify-center gap-8 mt-8 flex-wrap">
            {TRUST_NUMBERS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{stat.value}</span>
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
            <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">
              Pricing
            </a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">
              Privacy
            </a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">
              Terms
            </a>
            <a href="/data-disclosure" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-data">
              Data Disclosure
            </a>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} CreatorOS
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
