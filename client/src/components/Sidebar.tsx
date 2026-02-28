import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
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
  Brain,
  Siren,
  Heart,
  Terminal,
  Calendar,
  FileText,
  BarChart2,
  Activity,
  Scale,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

const NAV_GROUPS = [
  {
    label: "Create",
    items: [
      { href: "/", labelKey: "nav.home", icon: LayoutDashboard, minTier: "free" },
      { href: "/hub", labelKey: "nav.hub", icon: Zap, minTier: "free" },
      { href: "/content", labelKey: "nav.content", icon: Video, minTier: "free" },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, minTier: "free" },
      { href: "/stream", labelKey: "nav.goLive", icon: Radio, minTier: "youtube" },
      { href: "/money", labelKey: "nav.money", icon: DollarSign, minTier: "free" },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/autopilot", labelKey: "nav.autopilot", icon: Rocket, minTier: "pro" },
      { href: "/ai-command", labelKey: "nav.aiCommand", icon: Terminal, minTier: "free" },
      { href: "/script-studio", labelKey: "nav.scriptStudio", icon: FileText, minTier: "free" },
      { href: "/ai-factory", labelKey: "nav.aiFactory", icon: Sparkles, minTier: "free" },
      { href: "/viral-predictor", labelKey: "nav.viralPredictor", icon: TrendingUp, minTier: "free" },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/intelligence", labelKey: "nav.intelligence", icon: Brain, minTier: "free" },
      { href: "/growth", labelKey: "nav.zeroToOne", icon: BarChart2, minTier: "free" },
      { href: "/war-room", labelKey: "nav.warRoom", icon: Siren, minTier: "pro" },
      { href: "/heartbeat", labelKey: "nav.heartbeat", icon: Activity, minTier: "free" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/community", labelKey: "nav.community", icon: Users, minTier: "starter" },
      { href: "/mission-control", labelKey: "nav.missionControl", icon: Globe, minTier: "free" },
      { href: "/legal-tax", labelKey: "nav.legalTax", icon: Scale, minTier: "free" },
      { href: "/settings", labelKey: "nav.settings", icon: Settings, minTier: "free" },
    ],
  },
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
  const { tier, isPaidUser, isAdmin, hasTierAccess } = useUserProfile();
  const { t } = useTranslation();

  const { data: dashStats } = useQuery({ queryKey: ["/api/dashboard/stats"], refetchInterval: 60000, staleTime: 30000 });
  const { data: agentActivities } = useQuery({ queryKey: ["/api/agents/activities"], refetchInterval: 60000 });
  const activeAgents = (agentActivities as any[])?.filter((a: any) => a.status === "running" || a.status === "active").length ?? 0;

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
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span data-testid="text-app-name" className="font-display font-bold text-sm tracking-tight" style={{ textShadow: '0 0 20px hsl(265 80% 60% / 0.6)' }}>
            Creator<span className="text-primary">OS</span>
          </span>
        </div>

        <div className="px-3 pb-2 mt-1 border-t border-border/20 pt-2">
          <div className="flex gap-1 flex-wrap">
            <span data-testid="stat-sidebar-subscribers" className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">
              👁 {(dashStats as any)?.subscriberCount ? ((dashStats as any).subscriberCount > 1000 ? ((dashStats as any).subscriberCount/1000).toFixed(1)+'K' : (dashStats as any).subscriberCount) : '—'}
            </span>
            <span data-testid="stat-sidebar-revenue" className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">
              💰 ${(dashStats as any)?.totalRevenue?.toFixed(0) ?? '—'}
            </span>
            <span data-testid="stat-sidebar-agents" className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">
              🤖 {activeAgents}/14
            </span>
          </div>
          <div className="mt-1">
            <span className="text-[9px] text-emerald-400 animate-pulse">● LIVE</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Main navigation">
        {NAV_GROUPS.map((group, gi) => (
          <SidebarGroup key={group.label} className={gi > 0 ? "pt-0" : ""}>
            <SidebarGroupLabel className="text-[9px] uppercase tracking-widest text-muted-foreground/30 px-2 h-5 mt-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  const label = t(link.labelKey);
                  const locked = !hasTierAccess(link.minTier);
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}
                        className={active ? "border-l-2 border-primary rounded-none" : ""}
                      >
                        <Link
                          href={locked ? "/pricing" : link.href}
                          onMouseEnter={() => !locked && prefetchForRoute(link.href)}
                          aria-label={locked ? `${label} (locked)` : label}
                          aria-current={active ? "page" : undefined}
                        >
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
        ))}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/access-codes")}
                    data-testid="link-access-codes"
                    className={isActive("/access-codes") ? "border-l-2 border-primary rounded-none" : ""}
                  >
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
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <div className="mx-2 p-3 rounded-lg border border-primary/20 bg-primary/[0.03]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">{t("common.unlockEverything")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                  {t("common.unlockDescription")}
                </p>
                <Link href="/pricing">
                  <Button variant="default" size="sm" className="w-full gap-1.5" data-testid="button-sidebar-upgrade" aria-label={t("common.viewPlans")}>
                    {t("common.viewPlans")}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user && (
          <div className="px-3 py-2 border-t border-border/20" data-testid="widget-ai-performance">
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 font-mono">AI Performance</div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground">Tasks Done</span>
              <span className="text-[11px] font-mono text-primary">{(agentActivities as any[])?.filter((a:any) => a.status === "completed").length ?? 0}</span>
            </div>
            <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(100, (((agentActivities as any[])?.filter((a:any) => a.status === "completed").length ?? 0) / Math.max(1, (agentActivities as any[])?.length ?? 1)) * 100)}%` }} />
            </div>
          </div>
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
            <Button data-testid="button-login" variant="default" className="w-full gap-1.5" onClick={() => { window.location.href = "/api/login"; }} aria-label="Sign in to your account">
              <Zap className="h-4 w-4" />
              {t("auth.signIn")}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
