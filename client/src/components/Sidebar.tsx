import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { prefetchForRoute } from "@/lib/prefetch";
import {
  Users,
  Video,
  Radio,
  DollarSign,
  Settings,
  LogOut,
  Zap,
  Film,
  HardDrive,
  Scissors,
  Sparkles,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/",        label: "Team",     icon: Users },
  { href: "/content", label: "Content",  icon: Video },
  { href: "/studio",        label: "Studio",   icon: Film },
  { href: "/vault",         label: "Vault",    icon: HardDrive },
  { href: "/stream-editor", label: "Editor",   icon: Scissors },
  { href: "/stream",  label: "Live",     icon: Radio },
  { href: "/money",             label: "Revenue",  icon: DollarSign },
  { href: "/platform-features", label: "Features", icon: Sparkles },
  { href: "/settings",          label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: agentStatus } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    staleTime: 60_000,
    enabled: !!user,
  });

  const isAdmin = profile?.role === "admin";

  const { data: tokenBudget } = useQuery<Record<string, { used: number; cap: number; day: string }>>({
    queryKey: ["/api/admin/token-budget"],
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    enabled: isAdmin,
  });

  const hasTokenWarning = isAdmin && !!tokenBudget && Object.values(tokenBudget).some(
    (info) => info.cap > 0 && info.used / info.cap >= 0.8
  );

  const activeAgents = agentStatus?.filter((a: any) => a.status === "active").length ?? 0;
  const totalAgents = agentStatus?.length ?? 14;

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <Sidebar className="border-r border-border/30" data-testid="sidebar">
      <SidebarHeader className="px-4 py-4 border-b border-border/15">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer group" data-testid="link-sidebar-logo">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-purple-600/15 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:border-primary/35 group-hover:from-primary/25 group-hover:to-purple-600/20 transition-all duration-200">
              <Zap className="h-4 w-4 text-primary drop-shadow-sm transition-transform duration-200 group-hover:scale-110" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground leading-none tracking-tight">CreatorOS</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5 tracking-wide">AI YouTube Team</div>
            </div>
          </div>
        </Link>

        {activeAgents > 0 && (
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-500/12 transition-all duration-300" data-testid="badge-agents-active">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 shadow-[0_0_4px_hsl(142_70%_50%/0.4)]" />
            <span className="text-[11px] text-emerald-400/90 font-medium tracking-wide">
              {activeAgents}/{totalAgents} agents working
            </span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-2.5">
        <SidebarMenu className="gap-px">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} data-testid={`nav-${item.label.toLowerCase()}`} className="transition-all duration-150" onMouseEnter={() => prefetchForRoute(item.href)} onClick={() => prefetchForRoute(item.href)}>
                  <Link href={item.href}>
                    <Icon className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${active ? "text-primary" : ""}`} strokeWidth={active ? 2.2 : 1.8} />
                    <span className={`font-medium transition-colors duration-150 ${active ? "text-foreground" : ""}`}>{item.label}</span>
                    {item.href === "/stream" && stats?.isLive && (
                      <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-500/15 border border-red-500/25 px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
                    )}
                    {item.href === "/settings" && hasTokenWarning && (
                      <span className="ml-auto flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_5px_hsl(0_84%_60%/0.6)] animate-pulse" data-testid="badge-settings-token-warning" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-border/15">
        {stats && (
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <div className="text-center p-2 rounded-lg bg-muted/10 border border-border/10 hover:bg-muted/20 transition-colors duration-200" data-testid="stat-subscribers">
              <div className="text-xs font-bold text-foreground font-mono tabular-nums tracking-tight">
                {stats.subscriberCount >= 1000
                  ? `${(stats.subscriberCount / 1000).toFixed(1)}K`
                  : stats.subscriberCount ?? "—"}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5 tracking-wide uppercase">Subs</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/10 border border-border/10 hover:bg-muted/20 transition-colors duration-200" data-testid="stat-revenue">
              <div className="text-xs font-bold text-foreground font-mono tabular-nums tracking-tight">
                ${stats.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5 tracking-wide uppercase">This month</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 flex-shrink-0 ring-1 ring-border/20">
            <AvatarImage src={(user as any)?.profileImageUrl} />
            <AvatarFallback className="text-[10px] bg-primary/15 text-primary font-semibold">
              {(user as any)?.firstName?.[0] ?? (user as any)?.username?.[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate" data-testid="text-sidebar-username">
              {(user as any)?.firstName ?? (user as any)?.username ?? "Creator"}
            </div>
            <div className="text-[10px] text-muted-foreground/60">YouTube Creator</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground/60"
            onClick={() => logout()}
            disabled={isLoggingOut}
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
