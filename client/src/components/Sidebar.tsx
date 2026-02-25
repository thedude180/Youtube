import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTranslation } from "react-i18next";
import { prefetchForRoute } from "@/lib/prefetch";
import {
  LayoutDashboard,
  Video,
  Radio,
  Settings,
  LogOut,
  DollarSign,
  Zap,
  Crown,
  Bot,
  Rocket,
  KeyRound,
  Users,
  Lock,
  ArrowRight,
  Sparkles,
  Globe,
  Check,
  TrendingUp,
  Repeat,
  Film,
  Satellite,
  Brain,
  Clapperboard,
  FlaskConical,
  Network,
  Siren,
  KanbanSquare,
  Heart,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supportedLanguages } from "@/i18n";
import i18n from "@/i18n";

const navLinks = [
  { href: "/", labelKey: "nav.home", icon: LayoutDashboard, minTier: "free", advancedOnly: false },
  { href: "/mission-control", labelKey: "nav.missionControl", icon: Satellite, minTier: "free", advancedOnly: false },
  { href: "/intelligence", labelKey: "nav.intelligence", icon: Brain, minTier: "free", advancedOnly: false },
  { href: "/content-command", labelKey: "nav.contentCommand", icon: Clapperboard, minTier: "free", advancedOnly: false },
  { href: "/growth", labelKey: "nav.zeroToOne", icon: TrendingUp, minTier: "free", advancedOnly: false },
  { href: "/content", labelKey: "nav.content", icon: Video, minTier: "free", advancedOnly: false },
  { href: "/stream", labelKey: "nav.goLive", icon: Radio, minTier: "youtube", advancedOnly: false },
  { href: "/autopilot", labelKey: "nav.autopilot", icon: Rocket, minTier: "pro", advancedOnly: false },
  { href: "/simulator", labelKey: "nav.simulator", icon: FlaskConical, minTier: "free", advancedOnly: false },
  { href: "/ai-command", labelKey: "nav.aiCommand", icon: Sparkles, minTier: "free", advancedOnly: false },
  { href: "/war-room", labelKey: "nav.warRoom", icon: Siren, minTier: "pro", advancedOnly: false },
  { href: "/creator-hub", labelKey: "nav.creatorHub", icon: Network, minTier: "free", advancedOnly: false },
  { href: "/workspace", labelKey: "nav.workspace", icon: KanbanSquare, minTier: "free", advancedOnly: false },
  { href: "/heartbeat", labelKey: "nav.heartbeat", icon: Heart, minTier: "free", advancedOnly: false },
  { href: "/edge", labelKey: "nav.competitiveEdge", icon: Crown, minTier: "free", advancedOnly: true },
  { href: "/stream-loop", labelKey: "nav.streamLoop", icon: Repeat, minTier: "pro", advancedOnly: true },
  { href: "/vod-shorts-loop", labelKey: "nav.vodShorts", icon: Film, minTier: "pro", advancedOnly: true },
  { href: "/empire", labelKey: "nav.empireLauncher", icon: Rocket, minTier: "free", advancedOnly: false },
  { href: "/stealth", labelKey: "nav.aiStealth", icon: Bot, minTier: "free", advancedOnly: true },
  { href: "/community", labelKey: "nav.community", icon: Users, minTier: "starter", advancedOnly: true },
  { href: "/money", labelKey: "nav.money", icon: DollarSign, minTier: "free", advancedOnly: true },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, minTier: "free", advancedOnly: false },
];

const TIER_BADGE_LABELS: Record<string, string> = {
  youtube: "YT",
  starter: "STR",
  pro: "PRO",
  ultimate: "ULT",
};

const TIER_BADGE_COLORS: Record<string, string> = {
  youtube: "text-red-400",
  starter: "text-blue-400",
  pro: "text-purple-400",
  ultimate: "text-yellow-400",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isLoading, logout } = useAuth();
  const { isAdvanced } = useAdvancedMode();
  const { tier, isPaidUser, isAdmin, hasTierAccess } = useUserProfile();
  const { t } = useTranslation();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const userInitials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "U";

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  return (
    <Sidebar>
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 glow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent opacity-80" />
            <Zap className="h-4 w-4 text-primary-foreground relative z-10 transition-transform group-hover:scale-110" />
          </div>
          <div className="flex flex-col">
            <span data-testid="text-app-name" className="font-display font-bold text-sm tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
            {isAdvanced && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-fit border-primary/30 text-primary/80">
                {t("common.advanced")}
              </Badge>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Main navigation">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navLinks.filter(link => !link.advancedOnly || isAdvanced).map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                const label = t(link.labelKey);
                const locked = !hasTierAccess(link.minTier);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={active} data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Link href={locked ? "/pricing" : link.href} onMouseEnter={() => !locked && prefetchForRoute(link.href)} aria-label={locked ? `${label} (locked)` : label} aria-current={active ? "page" : undefined}>
                        <Icon className={`h-4 w-4 ${locked ? "opacity-30" : ""} ${active ? "text-primary" : ""}`} />
                        <span className={locked ? "opacity-30" : ""}>{label}</span>
                        {locked && (
                          <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-semibold ${TIER_BADGE_COLORS[link.minTier] || "text-muted-foreground"}`}>
                            <Lock className="w-2.5 h-2.5" />
                            {TIER_BADGE_LABELS[link.minTier] || link.minTier}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/access-codes")} data-testid="link-access-codes">
                    <Link href="/access-codes" aria-label={t("nav.accessCodes")} aria-current={isActive("/access-codes") ? "page" : undefined}>
                      <KeyRound className="h-4 w-4" />
                      <span>{t("nav.accessCodes")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user && !isPaidUser && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="mx-2 p-3 rounded-lg border-glow-animated bg-primary/[0.03] relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t("common.unlockEverything")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                    {t("common.unlockDescription")}
                  </p>
                  <Link href="/pricing">
                    <Button variant="default" size="sm" className="w-full gap-1.5 glow-sm group/btn" data-testid="button-sidebar-upgrade" aria-label={t("common.viewPlans")}>
                      {t("common.viewPlans")}
                      <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="px-1 mb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-foreground" data-testid="button-language-switcher">
                <Globe className="h-3.5 w-3.5" />
                <span>{supportedLanguages.find(l => l.code === (i18n.language || "en"))?.nativeName || "English"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-48 max-h-64 overflow-y-auto">
              {supportedLanguages.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  data-testid={`lang-option-${lang.code}`}
                  className="flex items-center justify-between text-xs cursor-pointer"
                  onClick={() => i18n.changeLanguage(lang.code)}
                >
                  <span>{lang.nativeName} <span className="text-muted-foreground ml-1">({lang.name})</span></span>
                  {i18n.language === lang.code && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 p-1.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors">
            <Avatar className="h-8 w-8 ring-2 ring-primary/10">
              {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={userName} />}
              <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-primary/20 to-purple-500/20">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p data-testid="text-user-name" className="text-sm font-medium truncate">{userName}</p>
              {isPaidUser ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30" data-testid="badge-user-tier">
                  <Crown className="w-2.5 h-2.5 mr-0.5 text-primary" />
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </Badge>
              ) : (
                <Link href="/pricing">
                  <span className="text-[10px] text-primary font-medium cursor-pointer hover:underline" data-testid="link-upgrade-tier">
                    {t("common.upgradePlan")}
                  </span>
                </Link>
              )}
            </div>
            <Button data-testid="button-logout" size="icon" variant="ghost" onClick={() => logout()} className="transition-colors" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-2">
            <Button data-testid="button-login" variant="default" className="w-full glow-sm" onClick={() => { window.location.href = "/api/login"; }} aria-label="Sign in to your account">
              <Zap className="h-4 w-4 mr-1.5" />
              {t("auth.signIn")}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
