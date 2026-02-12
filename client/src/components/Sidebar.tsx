import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTranslation } from "react-i18next";
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
  { href: "/", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/content", labelKey: "nav.content", icon: Video },
  { href: "/stream", labelKey: "nav.goLive", icon: Radio },
  { href: "/autopilot", labelKey: "Autopilot", icon: Rocket },
  { href: "/money", labelKey: "nav.money", icon: DollarSign },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isLoading, logout } = useAuth();
  const { isAdvanced } = useAdvancedMode();
  const { tier, isPaidUser } = useUserProfile();
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
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span data-testid="text-app-name" className="font-display font-bold text-sm">
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
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={active} data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Link href={link.href}>
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {isLoading ? (
          <div className="flex items-center gap-3 p-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-8 w-8">
              {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={userName} />}
              <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p data-testid="text-user-name" className="text-sm font-medium truncate">{userName}</p>
              {isPaidUser && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid="badge-user-tier">
                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </Badge>
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
