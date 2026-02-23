import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";

const routeLabels: Record<string, string> = {
  "": "Dashboard",
  "content": "Content",
  "stream": "Go Live",
  "money": "Money",
  "settings": "Settings",
  "autopilot": "Autopilot",
  "edge": "Competitive Edge",
  "stealth": "AI Stealth",
  "growth": "Growth Journey",
  "community": "Community",
  "pricing": "Pricing",
  "notifications": "Notifications",
  "status": "System Status",
  "changelog": "Changelog",
  "empire": "Empire Builder",
  "access-codes": "Access Codes",
  "onboarding": "Onboarding",
};

export function Breadcrumbs() {
  const [location] = useLocation();
  const segments = location.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground mb-3" data-testid="breadcrumbs">
      <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1" data-testid="breadcrumb-home">
        <Home className="h-3 w-3" />
      </Link>
      {segments.map((segment, i) => {
        const path = "/" + segments.slice(0, i + 1).join("/");
        const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            {isLast ? (
              <span className="text-foreground font-medium" data-testid={`breadcrumb-${segment}`}>{label}</span>
            ) : (
              <Link href={path} className="hover:text-foreground transition-colors" data-testid={`breadcrumb-${segment}`}>
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
