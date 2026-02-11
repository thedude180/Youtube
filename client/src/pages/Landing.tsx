import { Zap, ArrowRight, Globe, Bot, Send, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Globe, label: "25 Platforms", description: "Distribute content everywhere" },
  { icon: Bot, label: "10 AI Agents", description: "Automate your workflow" },
  { icon: Send, label: "Auto-Publish", description: "Schedule and forget" },
  { icon: DollarSign, label: "Revenue Tracking", description: "Monitor all income streams" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 h-14 px-4">
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
            <Zap className="h-4 w-4 mr-1.5" />
            Sign In
          </Button>
        </div>
      </nav>

      <div className="flex-1 flex items-center">
        <div className="max-w-5xl mx-auto px-4 py-20 w-full">
          <div className="max-w-2xl">
            <h1 data-testid="text-hero-heading" className="font-display text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
              Your AI Content Team
            </h1>
            <p data-testid="text-hero-subtitle" className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-xl">
              CreatorOS runs your entire content business across 25 platforms. Upload, optimize, schedule, publish - all on autopilot.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                data-testid="button-sign-in-hero"
                onClick={() => { window.location.href = "/api/login"; }}
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Get Started
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <span className="text-xs text-muted-foreground">Free to start</span>
            </div>
          </div>

          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.label} className="space-y-2" data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <feature.icon className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{feature.label}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-4">
        <div className="max-w-5xl mx-auto px-4 text-xs text-muted-foreground">
          CreatorOS &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
