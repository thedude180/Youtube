import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import {
  LayoutDashboard, Film, Download, Scissors, Radio,
  BarChart2, Settings, LogOut, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/videos",    label: "Videos",    icon: Film },
  { to: "/vault",     label: "Vault",     icon: Download },
  { to: "/shorts",    label: "Shorts",    icon: Scissors },
  { to: "/stream",    label: "Live",      icon: Radio },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
  { to: "/settings",  label: "Settings",  icon: Settings },
];

export function AppSidebar() {
  const { user, logout } = useAuth();

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <aside
      className="flex flex-col w-60 min-h-screen bg-sidebar border-r border-border"
      data-testid="sidebar"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Youtube className="w-6 h-6 text-red-500" />
        <span className="font-bold text-lg tracking-tight">CreatorOS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5" data-testid="nav-items">
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
              <AvatarFallback className="text-xs bg-red-600 text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName ?? user.email}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
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
