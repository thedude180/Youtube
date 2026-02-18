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
  Rocket,
  KeyRound,
  Users,
  Lock,
  ArrowRight,
  Sparkles,
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

const navLinks = [
  { href: "/", labelKey: "nav.home", icon: LayoutDashboard, minTier: "free" },
  { href: "/content", labelKey: "nav.content", icon: Video, minTier: "free" },
  { href: "/stream", labelKey: "nav.goLive", icon: Radio, minTier: "youtube" },
  { href: "/autopilot", labelKey: "Autopilot", icon: Rocket, minTier: "pro" },
  { href: "/community", labelKey: "Community", icon: Users, minTier: "starter" },
  { href: "/money", labelKey: "nav.money", icon: DollarSign, minTier: "free" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, minTier: "free" },
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
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 glow-sm">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span data-testid="text-app-name" className="font-display font-bold text-sm tracking-tight">
              Creator<span className="text-primary">OS</span>
            </span>
            {isAdvanced && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-fit">
                Advanced
              </Badge>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                const label = t(link.labelKey);
                const locked = !hasTierAccess(link.minTier);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={active} data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Link href={locked ? "/pricing" : link.href} onMouseEnter={() => !locked && prefetchForRoute(link.href)}>
                        <Icon className={`h-4 w-4 ${locked ? "opacity-30" : ""}`} />
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
                    <Link href="/access-codes">
                      <KeyRound className="h-4 w-4" />
                      <span>Access Codes</span>
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
              <div className="mx-2 p-3 rounded-lg gradient-border bg-primary/[0.03]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">Unlock Everything</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                  AI automation, multi-platform tools, and more.
                </p>
                <Link href="/pricing">
                  <Button variant="default" size="sm" className="w-full gap-1.5" data-testid="button-sidebar-upgrade">
                    View Plans
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        {isLoading ? (
          <div className="flex items-center gap-2 p-1.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-2.5 p-2">
            <Avatar className="h-8 w-8">
              {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={userName} />}
              <AvatarFallback className="text-xs font-medium">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p data-testid="text-user-name" className="text-sm font-medium truncate">{userName}</p>
              {isPaidUser ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid="badge-user-tier">
                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </Badge>
              ) : (
                <Link href="/pricing">
                  <span className="text-[10px] text-primary font-medium cursor-pointer" data-testid="link-upgrade-tier">
                    Upgrade plan
                  </span>
                </Link>
              )}
            </div>
            <Button data-testid="button-logout" size="icon" variant="ghost" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-2">
            <Button data-testid="button-login" variant="default" className="w-full" onClick={() => { window.location.href = "/api/login"; }}>
              <Zap className="h-4 w-4 mr-1.5" />
              {t("auth.signIn")}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
