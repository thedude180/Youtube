import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Shield, Zap, Bug } from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";

const CHANGELOG = [
  {
    version: "2.8.0",
    date: "2026-02-21",
    items: [
      { type: "feature", icon: Sparkles, text: "Real-time SEO scoring based on actual content analysis" },
      { type: "feature", icon: Sparkles, text: "Engine heartbeat monitoring with real status tracking" },
      { type: "feature", icon: Sparkles, text: "Usage metering with tier-based limits" },
      { type: "feature", icon: Sparkles, text: "A/B test result tracking for titles and thumbnails" },
      { type: "feature", icon: Sparkles, text: "Content approval workflow for review before publishing" },
      { type: "feature", icon: Sparkles, text: "Bulk content editing for videos" },
      { type: "security", icon: Shield, text: "CSRF origin validation on all state-changing requests" },
      { type: "security", icon: Shield, text: "Cryptographically secure backup codes for 2FA" },
      { type: "security", icon: Shield, text: "Webhook signature enforcement (reject if unconfigured)" },
      { type: "improvement", icon: Zap, text: "Cookie consent banner for GDPR compliance" },
      { type: "improvement", icon: Zap, text: "System status page with live engine monitoring" },
      { type: "improvement", icon: Zap, text: "Billing history and subscription management" },
      { type: "improvement", icon: Zap, text: "Notification preferences per channel and category" },
      { type: "improvement", icon: Zap, text: "PWA support with offline capability" },
    ],
  },
  {
    version: "2.7.0",
    date: "2026-02-20",
    items: [
      { type: "feature", icon: Sparkles, text: "Connection Guardian with 15-minute live API verification" },
      { type: "feature", icon: Sparkles, text: "One-click reconnect for expired platform connections" },
      { type: "feature", icon: Sparkles, text: "Pinned comments system with auto-posting and bulk backfill" },
      { type: "improvement", icon: Zap, text: "Enhanced AI content engine with retention briefs" },
      { type: "improvement", icon: Zap, text: "Real-time Command Center dashboard" },
      { type: "fix", icon: Bug, text: "Auto-reconnect now works for all connected platforms" },
    ],
  },
  {
    version: "2.6.0",
    date: "2026-02-18",
    items: [
      { type: "feature", icon: Sparkles, text: "Autonomous Marketer Engine with 15 organic strategies" },
      { type: "feature", icon: Sparkles, text: "Content Verification Engine with live stream health checks" },
      { type: "feature", icon: Sparkles, text: "Auto-Playlist Manager for game-specific playlists" },
      { type: "security", icon: Shield, text: "Self-Healing Core wrapping all 25+ subsystems" },
    ],
  },
];

const typeColors: Record<string, string> = { feature: "default", security: "destructive", improvement: "secondary", fix: "outline" };

export default function ChangelogPage() {
  usePageTitle("Changelog");
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-changelog-title">Changelog</h1>
      <p className="text-muted-foreground">Latest updates and improvements to CreatorOS.</p>
      {CHANGELOG.map(release => (
        <Card key={release.version}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="default">v{release.version}</Badge>
              <span className="text-sm text-muted-foreground">{release.date}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {release.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <item.icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{item.text}</span>
                  <Badge variant={typeColors[item.type] as any} className="text-xs ml-auto shrink-0">{item.type}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}