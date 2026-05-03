import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import {
  LayoutDashboard, Film, Download, DollarSign, Bot, Radio,
  TrendingUp, Settings, LogOut, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/content", label: "Content", icon: Film },
  { to: "/video", label: "Vault", icon: Download },
  { to: "/money", label: "Revenue", icon: DollarSign },
  { to: "/autopilot", label: "Autopilot", icon: Bot },
  { to: "/stream", label: "Stream", icon: Radio },
  { to: "/growth", label: "Growth", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
];

const TIER_COLORS: Record<string, string> = {
  free: "bg-zinc-600",
  starter: "bg-blue-600",
  pro: "bg-purple-600",
  empire: "bg-amber-500",
};

export function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <aside
      className="flex flex-col w-64 min-h-screen bg-sidebar border-r border-border"
      data-testid="sidebar"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Zap className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg tracking-tight">CreatorOS</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">v2</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1" data-testid="nav-items">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`
            }
            data-testid={`nav-${label.toLowerCase()}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      {user && (
        <div className="p-4 border-t border-border" data-testid="sidebar-user">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.profileImageUrl} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName ?? user.email}</p>
              <Badge
                variant="outline"
                className={`text-xs mt-0.5 capitalize ${TIER_COLORS[user.subscriptionTier] ?? ""} text-white border-0`}
              >
                {user.subscriptionTier}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={logout}
            data-testid="btn-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      )}
    </aside>
  );
}
