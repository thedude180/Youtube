import {
  Zap, ArrowRight, Globe, Bot, Send, DollarSign, Shield, BarChart3,
  Tv, Users, Clock, Sparkles, Target, Layers, Play, CheckCircle2,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";

const HERO_FEATURES = [
  { icon: Globe, label: "25 Platforms", description: "Distribute everywhere at once" },
  { icon: Bot, label: "832 AI Features", description: "Fully autonomous operations" },
  { icon: Send, label: "Auto-Publish", description: "Schedule and forget" },
  { icon: DollarSign, label: "Revenue Tracking", description: "Monitor all income streams" },
];

const CAPABILITIES = [
  {
    icon: Sparkles,
    title: "AI Content Engine",
    description: "Script writing, thumbnail concepts, SEO optimization, title A/B testing, description generation, and content roadmapping — all AI-driven.",
  },
  {
    icon: Tv,
    title: "Multi-Platform Streaming",
    description: "Stream from PS5 to 25 platforms simultaneously. Auto-configured RTMP, stream keys, and platform-specific overlays.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Growth",
    description: "Cross-platform analytics, viral predictions, algorithm decoding, growth trajectory modeling, and daily AI action plans.",
  },
  {
    icon: Shield,
    title: "Legal & Compliance",
    description: "Copyright shield, contract analyzer, fair use checker, DMCA defense, and content insurance — automated protection.",
  },
  {
    icon: DollarSign,
    title: "Revenue Intelligence",
    description: "Deal negotiation coaching, sponsorship rate calculator, revenue forecasting, P&L reports, and payment automation.",
  },
  {
    icon: Users,
    title: "Community Management",
    description: "Fan loyalty tracking, comment strategy, community polls, milestone celebrations, and audience persona building.",
  },
];

const AUTOMATION_FEATURES = [
  { icon: Clock, label: "Cron Scheduler", description: "AI runs on configurable intervals — 15min to monthly" },
  { icon: Layers, label: "Chain Orchestrator", description: "Connect AI agents into pipelines that execute sequentially" },
  { icon: Target, label: "Rules Engine", description: "Threshold-based auto-actions triggered by metrics" },
  { icon: Play, label: "Webhook Listeners", description: "Real-time event processing from YouTube, Stripe, Twitch" },
];

const PLATFORM_NAMES = [
  "YouTube", "TikTok", "Twitch", "Instagram", "X", "Discord", "Facebook",
  "LinkedIn", "Kick", "Rumble", "Reddit", "Pinterest", "Snapchat", "Spotify",
  "Patreon", "Ko-fi", "Substack", "Threads", "Bluesky", "Mastodon",
  "DLive", "Trovo", "WhatsApp", "Apple Podcasts", "YouTube Shorts",
];

const TIERS = [
  { name: "Free", price: "$0", platforms: "0 platforms", features: ["Dashboard access", "AI advisor", "Content calendar"] },
  { name: "YouTube", price: "$9.99/mo", platforms: "1 platform", features: ["YouTube automation", "SEO optimizer", "Thumbnail AI"] },
  { name: "Starter", price: "$29.99/mo", platforms: "3 platforms", features: ["Multi-platform", "Stream tools", "Revenue tracking"], popular: true },
  { name: "Pro", price: "$79.99/mo", platforms: "10 platforms", features: ["Advanced AI chains", "Team collaboration", "Priority support"] },
  { name: "Ultimate", price: "$149.99/mo", platforms: "25 platforms", features: ["Full automation", "All 832 AI features", "White-glove setup"] },
];

export default function Landing() {
  usePageTitle("AI-Powered Creator Management");
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span data-testid="text-landing-logo" className="font-display font-bold text-sm">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
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

      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4" data-testid="badge-hero">
              832 AI Features Across 25 Platforms
            </Badge>
            <h1 data-testid="text-hero-heading" className="font-display text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
              Your Entire Creator Business, On Autopilot
            </h1>
            <p data-testid="text-hero-subtitle" className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-xl">
              CreatorOS is an AI-powered team that runs your content, streaming, revenue, community, and growth — across every platform — so you can focus on creating.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                data-testid="button-sign-in-google"
                size="lg"
                onClick={() => { window.location.href = "/api/auth/google"; }}
              >
                <SiGoogle className="h-4 w-4 mr-2" />
                Get Started Free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                data-testid="button-sign-in-replit"
                variant="secondary"
                size="lg"
                onClick={() => { window.location.href = "/api/login"; }}
              >
                Sign in with Replit
              </Button>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Free to start
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> YouTube auto-connects
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> No credit card required
              </span>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {HERO_FEATURES.map((feature) => (
              <div key={feature.label} className="space-y-2" data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <feature.icon className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold">{feature.label}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 data-testid="text-capabilities-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Everything You Need, Automated
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Six core systems powered by AI handle your entire content business end-to-end.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((cap) => (
              <Card key={cap.title} data-testid={`card-capability-${cap.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <cap.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">{cap.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{cap.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 data-testid="text-automation-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Zero-Touch Automation
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Six autonomous systems run in the background. You only hear from AI when something needs your attention.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AUTOMATION_FEATURES.map((feat) => (
              <Card key={feat.label} data-testid={`card-auto-${feat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-4 space-y-2">
                  <feat.icon className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-semibold">{feat.label}</h3>
                  <p className="text-xs text-muted-foreground">{feat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 data-testid="text-platforms-heading" className="text-2xl sm:text-3xl font-display font-bold">
              25 Platforms, One Dashboard
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Connect once. CreatorOS manages content, analytics, and growth across all of them.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2" data-testid="container-platforms">
            {PLATFORM_NAMES.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 data-testid="text-pricing-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Start free. Upgrade when you need more platforms.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={tier.popular ? "ring-2 ring-primary" : ""}
                data-testid={`card-pricing-${tier.name.toLowerCase()}`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{tier.name}</h3>
                    {tier.popular && <Badge variant="default" className="text-xs">Popular</Badge>}
                  </div>
                  <p className="text-2xl font-bold">{tier.price}</p>
                  <p className="text-xs text-muted-foreground">{tier.platforms}</p>
                  <ul className="space-y-1">
                    {tier.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 data-testid="text-cta-heading" className="text-2xl sm:text-3xl font-display font-bold">
            Ready to Put Your Content on Autopilot?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Join creators who let AI handle the heavy lifting while they focus on what they love.
          </p>
          <Button
            data-testid="button-cta-sign-in"
            size="lg"
            className="mt-8"
            onClick={() => { window.location.href = "/api/auth/google"; }}
          >
            <SiGoogle className="h-4 w-4 mr-2" />
            Start Free with Google
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xs">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            CreatorOS &copy; {new Date().getFullYear()}. AI-powered creator management.
          </p>
        </div>
      </footer>
    </div>
  );
}
