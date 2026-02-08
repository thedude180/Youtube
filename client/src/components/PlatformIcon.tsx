import { Globe } from "lucide-react";
import { SiYoutube, SiTwitch, SiKick, SiFacebook, SiTiktok, SiX, SiLinkedin, SiInstagram } from "react-icons/si";

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
};

export function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] || Globe;
  return <Icon className={className} />;
}
