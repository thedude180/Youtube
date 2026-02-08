import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Video,
  Radio,
  Settings,
  Activity,
  Zap,
  LogOut,
  Lightbulb,
  Shield,
  Rocket,
  MessageSquare,
  Sparkles,
  MonitorPlay,
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

const contentLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos", label: "Library", icon: Video },
  { href: "/stream", label: "Stream Center", icon: MonitorPlay },
  { href: "/jobs", label: "Operations", icon: Activity },
  { href: "/channels", label: "Channels", icon: Radio },
];

const aiLinks = [
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/strategy", label: "Strategy", icon: Rocket },
  { href: "/compliance", label: "Compliance", icon: Shield },
  { href: "/advisor", label: "Advisor", icon: MessageSquare },
  { href: "/backlog", label: "Backlog Optimizer", icon: Sparkles },
];

const settingsLinks = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isLoading, logout } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const renderGroup = (links: typeof contentLinks) => (
    <SidebarMenu>
      {links.map((link) => {
        const Icon = link.icon;
        const active = isActive(link.href);
        return (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton asChild isActive={active} data-testid={`link-${link.label.toLowerCase()}`}>
              <Link href={link.href}>
                <Icon className="h-4 w-4" />
                <span>{link.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

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
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 data-testid="text-app-name" className="font-display font-bold text-base leading-none">
              Creator<span className="text-primary">OS</span>
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">YouTube Team In A Box</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>{renderGroup(contentLinks)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>AI Tools</SidebarGroupLabel>
          <SidebarGroupContent>{renderGroup(aiLinks)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>{renderGroup(settingsLinks)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {isLoading ? (
          <div className="flex items-center gap-3 p-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : user ? (
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-8 w-8">
              {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={userName} />}
              <AvatarFallback className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p data-testid="text-user-name" className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email || "Creator Studio"}</p>
            </div>
            <Button
              data-testid="button-logout"
              size="icon"
              variant="ghost"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-2">
            <Button
              data-testid="button-login"
              variant="default"
              className="w-full"
              onClick={() => { window.location.href = "/api/login"; }}
            >
              Sign In
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
