import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Video,
  Radio,
  DollarSign,
  Settings,
  LogOut,
  Zap,
  Building2,
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
  { href: "/stream",  label: "Live",     icon: Radio },
  { href: "/money",   label: "Revenue",  icon: DollarSign },
  { href: "/founder", label: "Founder",  icon: Building2 },
  { href: "/settings",label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: agentStatus } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const activeAgents = agentStatus?.filter((a: any) => a.status === "active").length ?? 0;
  const totalAgents = agentStatus?.length ?? 14;

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <Sidebar className="border-r border-border/50" data-testid="sidebar">
      <SidebarHeader className="px-4 py-4 border-b border-border/30">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer" data-testid="link-sidebar-logo">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground leading-none">CreatorOS</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">AI YouTube Team</div>
            </div>
          </div>
        </Link>

        {activeAgents > 0 && (
          <div className="mt-3 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20" data-testid="badge-agents-active">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-[11px] text-emerald-400 font-medium">
              {activeAgents}/{totalAgents} agents working
            </span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarMenu className="gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} data-testid={`nav-${item.label.toLowerCase()}`}>
                  <Link href={item.href}>
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                    {item.href === "/stream" && stats?.isLive && (
                      <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded-full">LIVE</span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-border/30">
        {stats && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/20 border border-border/20" data-testid="stat-subscribers">
              <div className="text-xs font-bold text-foreground font-mono">
                {stats.subscriberCount >= 1000
                  ? `${(stats.subscriberCount / 1000).toFixed(1)}K`
                  : stats.subscriberCount ?? "—"}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Subs</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/20 border border-border/20" data-testid="stat-revenue">
              <div className="text-xs font-bold text-foreground font-mono">
                ${stats.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">This month</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarImage src={(user as any)?.profileImageUrl} />
            <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
              {(user as any)?.firstName?.[0] ?? (user as any)?.username?.[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate" data-testid="text-sidebar-username">
              {(user as any)?.firstName ?? (user as any)?.username ?? "Creator"}
            </div>
            <div className="text-[10px] text-muted-foreground">YouTube Creator</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
