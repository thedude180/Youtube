import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Video,
  Radio,
  Settings,
  Activity,
  Zap,
  LogOut,
  User,
  Lightbulb,
  Shield,
  Rocket,
  MessageSquare,
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const mainLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/videos", label: "Library", icon: Video },
    { href: "/jobs", label: "Operations", icon: Activity },
    { href: "/channels", label: "Channels", icon: Radio },
  ];

  const aiLinks = [
    { href: "/insights", label: "Insights", icon: Lightbulb },
    { href: "/strategy", label: "Strategy", icon: Rocket },
    { href: "/compliance", label: "Compliance", icon: Shield },
    { href: "/advisor", label: "Advisor", icon: MessageSquare },
  ];

  const settingsLinks = [
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const renderLink = (link: typeof mainLinks[0]) => {
    const Icon = link.icon;
    const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
    return (
      <Link key={link.href} href={link.href} className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
        isActive
          ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}>
        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
        {link.label}
      </Link>
    );
  };

  return (
    <div className="w-64 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-screen fixed left-0 top-0 z-50">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/25">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 data-testid="text-app-name" className="font-display font-bold text-lg leading-none">Creator<span className="text-primary">OS</span></h1>
            <p className="text-xs text-muted-foreground mt-1">YouTube Team In A Box</p>
          </div>
        </div>

        <nav className="space-y-5">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-semibold tracking-widest text-muted-foreground/50 px-4 mb-1.5">Content</p>
            {mainLinks.map(renderLink)}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase font-semibold tracking-widest text-muted-foreground/50 px-4 mb-1.5">AI Tools</p>
            {aiLinks.map(renderLink)}
          </div>

          <div className="space-y-1">
            {settingsLinks.map(renderLink)}
          </div>
        </nav>
      </div>

      <div className="mt-auto p-5 border-t border-border">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p data-testid="text-user-name" className="text-sm font-medium truncate">Admin User</p>
            <p className="text-xs text-muted-foreground truncate">Creator Studio</p>
          </div>
          <button data-testid="button-logout" className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
