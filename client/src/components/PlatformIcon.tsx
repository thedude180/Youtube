
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SiYoutube,
  SiTwitch,
  SiKick,
  SiTiktok,
  SiDiscord,
  SiStripe,
} from "react-icons/si";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube,
  twitch: SiTwitch,
  kick: SiKick,
  tiktok: SiTiktok,
  discord: SiDiscord,
  stripe: SiStripe,
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  tiktok: "TikTok",
  x: "X",
  discord: "Discord",
  stripe: "Stripe",
};

export function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] || Globe;
  return <Icon className={className} />;
}

export function PlatformBadge({
  platform,
  variant = "secondary",
  className = "",
  "data-testid": testId,
}: {
  platform: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
  "data-testid"?: string;
}) {
  const key = platform.toLowerCase().replace(/\s+/g, "");
  const Icon = PLATFORM_ICONS[key] || Globe;
  const label = PLATFORM_LABELS[key] || platform;
  return (
    <Badge variant={variant} className={`capitalize ${className}`} data-testid={testId}>
      <Icon className="h-3 w-3 mr-1 shrink-0" />
      {label}
    </Badge>
  );
}
