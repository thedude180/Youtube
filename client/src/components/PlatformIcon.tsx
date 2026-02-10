import { Globe } from "lucide-react";
import {
  SiYoutube,
  SiTwitch,
  SiKick,
  SiFacebook,
  SiTiktok,
  SiX,
  SiLinkedin,
  SiInstagram,
  SiDiscord,
  SiSnapchat,
  SiPinterest,
  SiReddit,
  SiThreads,
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
  facebook: SiFacebook,
  tiktok: SiTiktok,
  x: SiX,
  linkedin: SiLinkedin,
  instagram: SiInstagram,
  rumble: Globe,
  discord: SiDiscord,
  snapchat: SiSnapchat,
  pinterest: SiPinterest,
  reddit: SiReddit,
  threads: SiThreads,
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

export function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] || Globe;
  return <Icon className={className} />;
}
