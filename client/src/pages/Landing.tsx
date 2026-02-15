import {
  Zap, ArrowRight, Bot, DollarSign, BarChart3,
  Monitor, CheckCircle2, Link2, Cpu, TrendingUp,
  Brain, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import heroImage from "../assets/images/hero-landing.png";

const FEATURES = [
  {
    icon: Brain,
    title: "AI-Powered Content",
    description: "832 AI features handle everything from thumbnails to SEO",
  },
  {
    icon: Monitor,
    title: "Multi-Platform Streaming",
    description: "Stream to 25 platforms simultaneously from one dashboard",
  },
  {
    icon: DollarSign,
    title: "Smart Revenue",
    description: "AI-optimized monetization, P&L reports, and tax planning",
  },
  {
    icon: Calendar,
    title: "Content Calendar",
    description: "AI plans, schedules, and publishes across all platforms",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Cross-platform analytics with predictive growth models",
  },
  {
    icon: Bot,
    title: "Team Automation",
    description: "11 AI agents work autonomously in the background",
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
    description: "Link your YouTube, Twitch, TikTok, and other platforms in seconds. One-click OAuth — no API keys needed.",
  },
  {
    step: 2,
    icon: Cpu,
    title: "AI Takes Over",
    description: "832 AI features analyze your content, optimize your strategy, and automate your workflow across every platform.",
  },
  {
    step: 3,
    icon: TrendingUp,
    title: "Watch Your Growth",
    description: "Sit back while AI handles publishing, engagement, revenue tracking, and growth — you just create.",
  },
];

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    platforms: "0 platforms",
    features: ["Dashboard access", "AI advisor", "Content calendar"],
  },
  {
    name: "YouTube",
    price: "$9.99",
    period: "/mo",
    platforms: "1 platform",
    features: ["YouTube automation", "SEO optimizer", "Thumbnail AI", "Stream center"],
  },
  {
    name: "Starter",
    price: "$29.99",
    period: "/mo",
    platforms: "3 platforms",
    features: ["Multi-platform", "Stream tools", "Revenue tracking", "Content optimization"],
    popular: true,
  },
  {
    name: "Pro",
    price: "$79.99",
    period: "/mo",
    platforms: "10 platforms",
    features: ["Advanced AI chains", "Team collaboration", "Priority support", "Competitor intelligence"],
  },
  {
    name: "Ultimate",
    price: "$149.99",
    period: "/mo",
    platforms: "25 platforms",
    features: ["Full automation", "All 832 AI features", "White-glove setup", "6 automation systems"],
  },
];

const STATS = [
  { value: "10,000+", label: "Creators" },
  { value: "50M+", label: "Views Managed" },
  { value: "99.9%", label: "Uptime" },
];

const HERO_STATS = [
  { value: "832", label: "AI Features" },
  { value: "25", label: "Platforms" },
  { value: "12", label: "Languages" },
];

const TRUST_INDICATORS = [
  { value: "25", label: "Platforms Supported" },
  { value: "832", label: "AI Features" },
  { value: "12", label: "Languages" },
  { value: "11", label: "AI Agents" },
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
            <a href="/pricing">
              <Button
                data-testid="button-nav-pricing"
                variant="ghost"
                size="sm"
              >
                Pricing
              </Button>
            </a>
            <a href="/login">
              <Button
                data-testid="button-sign-in-nav"
                size="sm"
              >
                Sign In
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden" data-testid="section-hero">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" aria-hidden="true" />
        <div className="relative py-20 sm:py-28 lg:py-36">
          <div className="max-w-6xl mx-auto px-4">
            <div className="max-w-2xl">
              <Badge variant="secondary" className="mb-4" data-testid="badge-hero">
                AI-Powered Creator Management Platform
              </Badge>
              <h1 data-testid="text-hero-heading" className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-foreground">
                YouTube Team In A Box
              </h1>
              <p data-testid="text-hero-subtitle" className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-xl">
                832 AI-powered features manage your content, streaming, revenue, and growth across 25 platforms in 12 languages — all on autopilot.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <a href="/login">
                  <Button
                    data-testid="button-hero-get-started"
                    size="lg"
                  >
                    Get Started Free
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </a>
                <a href="/pricing">
                  <Button
                    data-testid="button-hero-view-pricing"
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    View Pricing
                  </Button>
                </a>
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

            <div className="mt-16 grid grid-cols-3 gap-6 max-w-md">
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className="text-center" data-testid={`stat-hero-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <p className="text-2xl sm:text-3xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-features">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3" data-testid="badge-features">Core Features</Badge>
            <h2 data-testid="text-features-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Everything You Need, Automated
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Six core systems powered by AI handle your entire content business end-to-end.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => (
              <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-platforms">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3" data-testid="badge-platforms">Integrations</Badge>
            <h2 data-testid="text-platforms-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Stream to 25+ Platforms
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

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-how-it-works">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3" data-testid="badge-how-it-works">How It Works</Badge>
            <h2 data-testid="text-how-it-works-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Three Steps to Autopilot
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Get started in minutes. Let AI handle the rest.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center space-y-4" data-testid={`step-${step.step}`}>
                <div className="mx-auto h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {step.step}
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-trust">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3" data-testid="badge-trust">Why CreatorOS</Badge>
            <h2 data-testid="text-trust-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Built for Scale
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TRUST_INDICATORS.map((item) => (
              <Card key={item.label} data-testid={`card-trust-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-primary">{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-pricing">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3" data-testid="badge-pricing">Pricing</Badge>
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
                  <p className="text-2xl font-bold">
                    {tier.price}
                    {tier.period && <span className="text-sm font-normal text-muted-foreground">{tier.period}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{tier.platforms}</p>
                  <ul className="space-y-1">
                    {tier.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
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
          <div className="text-center mt-8">
            <a href="/pricing">
              <Button variant="outline" data-testid="button-view-full-pricing">
                View Full Pricing Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 border-t border-border" data-testid="section-social-proof">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 data-testid="text-social-proof-heading" className="text-2xl sm:text-3xl font-display font-bold">
              Trusted by Creators Worldwide
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center space-y-1" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <p className="text-3xl sm:text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24 border-t border-border" data-testid="section-cta">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 data-testid="text-cta-heading" className="text-2xl sm:text-3xl font-display font-bold">
            Start Creating Smarter Today
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Join thousands of creators who let AI handle the heavy lifting while they focus on what they love.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/login">
              <Button
                data-testid="button-cta-get-started"
                size="lg"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
          <div className="flex items-center justify-center gap-6 mt-6 flex-wrap">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-primary">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
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
          <div className="flex items-center gap-4 flex-wrap">
            <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">
              Pricing
            </a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">
              Privacy Policy
            </a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">
              Terms of Service
            </a>
            <p className="text-xs text-muted-foreground">
              CreatorOS &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
