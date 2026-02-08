import { Zap, ArrowRight, Bot, Video, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span data-testid="text-landing-logo" className="font-display font-bold text-sm">
              Creator<span className="text-primary">OS</span>
            </span>
          </div>
          <Button
            data-testid="button-sign-in-nav"
            size="sm"
            onClick={() => { window.location.href = "/api/login"; }}
          >
            Sign In
          </Button>
        </div>
      </nav>

      <div className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-4 py-16 w-full">
          <div className="max-w-xl">
            <h1 data-testid="text-hero-heading" className="font-display text-3xl sm:text-4xl font-bold leading-tight">
              Your YouTube Team,{" "}
              <span className="text-primary">Powered by AI</span>
            </h1>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              10 AI agents handle your content, SEO, thumbnails, and growth strategy.
              Connect your YouTube channel and let automation do the work.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                data-testid="button-sign-in-hero"
                onClick={() => { window.location.href = "/api/login"; }}
              >
                Get Started
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <span className="text-xs text-muted-foreground">Free to use</span>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">10 AI Agents</h3>
              <p className="text-sm text-muted-foreground">Editing, SEO, thumbnails, social media, and growth - all automated.</p>
            </div>
            <div className="space-y-2">
              <Video className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Smart Optimization</h3>
              <p className="text-sm text-muted-foreground">AI optimizes your entire video library with titles, tags, and descriptions.</p>
            </div>
            <div className="space-y-2">
              <Radio className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Multi-Platform</h3>
              <p className="text-sm text-muted-foreground">Stream to YouTube, Twitch, Kick, TikTok, and 5 more platforms at once.</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-4">
        <div className="max-w-4xl mx-auto px-4 text-xs text-muted-foreground">
          CreatorOS &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
