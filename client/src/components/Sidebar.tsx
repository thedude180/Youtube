import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Video,
  Radio,
  Settings,
  LogOut,
  MessageSquare,
  MonitorPlay,
  Bot,
  Calendar,
  DollarSign,
  Zap,
  Receipt,
  Calculator,
  Building2,
  Briefcase,
  Target,
  Handshake,
  Palette,
  Users,
  Eye,
  Heart,
  GraduationCap,
  Shield,
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

const coreLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos", label: "Library", icon: Video },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/stream", label: "Stream", icon: MonitorPlay },
  { href: "/schedule", label: "Calendar", icon: Calendar },
  { href: "/team", label: "AI Team", icon: Bot },
  { href: "/advisor", label: "Advisor", icon: MessageSquare },
];

const businessLinks = [
  { href: "/monetization", label: "Revenue", icon: DollarSign },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/tax", label: "Tax Center", icon: Calculator },
  { href: "/ventures", label: "Ventures", icon: Briefcase },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/sponsorships", label: "Sponsors", icon: Handshake },
];

const growthLinks = [
  { href: "/brand-kit", label: "Brand Kit", icon: Palette },
  { href: "/collaborations", label: "Collabs", icon: Users },
  { href: "/competitors", label: "Competitors", icon: Eye },
  { href: "/formation", label: "Formation", icon: Building2 },
  { href: "/protections", label: "Protections", icon: Shield },
  { href: "/wellness", label: "Wellness", icon: Heart },
  { href: "/knowledge", label: "Knowledge", icon: GraduationCap },
];

const settingsLinks = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isLoading, logout } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const userInitials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "U";

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  const renderLinks = (links: typeof coreLinks) => (
    <SidebarMenu>
      {links.map((link) => {
        const Icon = link.icon;
        const active = isActive(link.href);
        return (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton asChild isActive={active} data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}>
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span data-testid="text-app-name" className="font-display font-bold text-sm">
            Creator<span className="text-primary">OS</span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {renderLinks(coreLinks)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderLinks(businessLinks)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Growth</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderLinks(growthLinks)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            {renderLinks(settingsLinks)}
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
            </div>
            <Button data-testid="button-logout" size="icon" variant="ghost" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-2">
            <Button data-testid="button-login" variant="default" className="w-full" onClick={() => { window.location.href = "/api/login"; }}>
              Sign In
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
