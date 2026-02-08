import { Zap, Video, Bot, Radio, BarChart3, Shield, Sparkles, ArrowRight } from "lucide-react";
import { SiYoutube, SiTwitch, SiTiktok } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import heroImage from "@/assets/images/hero-landing.png";

const features = [
  {
    icon: Bot,
    title: "10 AI Agents",
    description: "An autonomous team that handles editing, SEO, thumbnails, social media, and growth strategy around the clock.",
  },
  {
    icon: Radio,
    title: "9-Platform Streaming",
    description: "Go live to YouTube, Twitch, Kick, TikTok, Facebook, X, Rumble, LinkedIn, and Instagram simultaneously.",
  },
  {
    icon: Sparkles,
    title: "Gaming-Aware AI",
    description: "Detects your game automatically and tailors thumbnails, SEO, and metadata to match that game's community.",
  },
  {
    icon: Video,
    title: "Auto Backlog Optimizer",
    description: "Your entire video library gets optimized by 6 AI agents working in collaboration chains, scoring 0-100.",
  },
  {
    icon: BarChart3,
    title: "Revenue Tracking",
    description: "Track monetization across every platform and revenue source with detailed breakdowns and trends.",
  },
  {
    icon: Shield,
    title: "Compliance Monitor",
    description: "AI checks every piece of content against platform rules before it goes live. No strikes, no surprises.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 h-14 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span data-testid="text-landing-logo" className="font-display font-bold text-lg">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <Button
            data-testid="button-sign-in-nav"
            onClick={() => { window.location.href = "/api/login"; }}
          >
            Sign In with Google
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </nav>

      <section className="relative pt-14 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <SiYoutube className="h-5 w-5 text-red-500" />
              <SiTwitch className="h-5 w-5 text-purple-400" />
              <SiTiktok className="h-5 w-5 text-foreground" />
              <span className="text-sm text-muted-foreground ml-1">+ 6 more platforms</span>
            </div>
            <h1 data-testid="text-hero-heading" className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              Your Entire YouTube Team,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
                Powered by AI
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
              10 autonomous AI agents handle your content, SEO, thumbnails, compliance, and growth strategy. You just hit "Go Live."
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                data-testid="button-sign-in-hero"
                size="lg"
                onClick={() => { window.location.href = "/api/login"; }}
                className="text-base"
              >
                Get Started with Google
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <p className="text-sm text-muted-foreground">Free to use &middot; No credit card required</p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 data-testid="text-features-heading" className="font-display text-3xl font-bold">
            Everything Automated, Nothing Missed
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            A full production team that never sleeps, never quits, and learns your brand over time.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="p-5" data-testid={`card-feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Ready to Automate Your Content?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Sign in with your Google account and your YouTube channel connects automatically.
          </p>
          <Button
            data-testid="button-sign-in-bottom"
            size="lg"
            onClick={() => { window.location.href = "/api/login"; }}
            className="text-base"
          >
            Sign In with Google
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>CreatorOS &copy; {new Date().getFullYear()}</span>
          <span>YouTube Team In A Box</span>
        </div>
      </footer>
    </div>
  );
}
