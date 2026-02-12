import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SiYoutube,
  SiTwitch,
  SiKick,
  SiTiktok,
  SiX,
  SiDiscord,
  SiSnapchat,
  SiPinterest,
  SiReddit,
  SiBluesky,
  SiMastodon,
  SiPatreon,
  SiKofi,
  SiSubstack,
  SiSpotify,
  SiApplepodcasts,
  SiWhatsapp,
} from "react-icons/si";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube,
  twitch: SiTwitch,
  kick: SiKick,
  tiktok: SiTiktok,
  x: SiX,
  rumble: Globe,
  discord: SiDiscord,
  snapchat: SiSnapchat,
  pinterest: SiPinterest,
  reddit: SiReddit,
  bluesky: SiBluesky,
  mastodon: SiMastodon,
  patreon: SiPatreon,
  kofi: SiKofi,
  substack: SiSubstack,
  spotify: SiSpotify,
  applepodcasts: SiApplepodcasts,
  dlive: Globe,
  trovo: Globe,
  youtubeshorts: SiYoutube,
  whatsapp: SiWhatsapp,
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  tiktok: "TikTok",
  x: "X",
  rumble: "Rumble",
  discord: "Discord",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  reddit: "Reddit",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  patreon: "Patreon",
  kofi: "Ko-fi",
  substack: "Substack",
  spotify: "Spotify",
  applepodcasts: "Apple Podcasts",
  dlive: "DLive",
  trovo: "Trovo",
  youtubeshorts: "YT Shorts",
  whatsapp: "WhatsApp",
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
