import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  LayoutDashboard,
  Video,
  Radio,
  DollarSign,
  Settings,
  Search,
  Sun,
  Moon,
  Gauge,
  Bot,
  Calendar,
  Globe,
  Users,
  Shield,
  Heart,
  BookOpen,
  Zap,
  Target,
  Briefcase,
  Receipt,
  Calculator,
  FileText,
  Handshake,
  Palette,
  Link2,
  Crown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { LucideIcon } from "lucide-react";

interface CommandItem {
  label: string;
  icon: LucideIcon;
  group: string;
  path?: string;
  action?: string;
  shortcut?: string;
}

const items: CommandItem[] = [
  { label: "Home", icon: LayoutDashboard, group: "Navigation", path: "/", shortcut: "Alt+1" },
  { label: "Content", icon: Video, group: "Navigation", path: "/content", shortcut: "Alt+2" },
  { label: "Go Live", icon: Radio, group: "Navigation", path: "/stream", shortcut: "Alt+3" },
  { label: "Money", icon: DollarSign, group: "Navigation", path: "/money", shortcut: "Alt+4" },
  { label: "Settings", icon: Settings, group: "Navigation", path: "/settings", shortcut: "Alt+5" },

  { label: "New Video", icon: Video, group: "Content Actions", path: "/content" },
  { label: "Channels", icon: Users, group: "Content Actions", path: "/content/channels" },
  { label: "Calendar", icon: Calendar, group: "Content Actions", path: "/content/calendar" },
  { label: "Localization", icon: Globe, group: "Content Actions", path: "/content/localization" },

  { label: "Revenue", icon: Receipt, group: "Money Actions", path: "/money/revenue" },
  { label: "Expenses", icon: Calculator, group: "Money Actions", path: "/money/expenses" },
  { label: "Tax Center", icon: FileText, group: "Money Actions", path: "/money/taxes" },
  { label: "Ventures", icon: Briefcase, group: "Money Actions", path: "/money/ventures" },
  { label: "Goals", icon: Target, group: "Money Actions", path: "/money/goals" },
  { label: "Sponsors", icon: Handshake, group: "Money Actions", path: "/money/sponsors" },

  { label: "General", icon: Settings, group: "Settings", path: "/settings/general" },
  { label: "Brand", icon: Palette, group: "Settings", path: "/settings/brand" },
  { label: "Collabs", icon: Link2, group: "Settings", path: "/settings/collabs" },
  { label: "Competitors", icon: Shield, group: "Settings", path: "/settings/competitors" },
  { label: "Legal", icon: FileText, group: "Settings", path: "/settings/legal" },
  { label: "Wellness", icon: Heart, group: "Settings", path: "/settings/wellness" },
  { label: "Learning", icon: BookOpen, group: "Settings", path: "/settings/learning" },
  { label: "Automation Hub", icon: Zap, group: "Settings", path: "/settings/automation" },
  { label: "Subscription", icon: Crown, group: "Settings", path: "/settings/subscription" },

  { label: "Toggle Theme", icon: Sun, group: "Quick Actions", action: "toggleTheme" },
  { label: "Toggle Advanced Mode", icon: Gauge, group: "Quick Actions", action: "toggleAdvanced" },
  { label: "Open AI Chat", icon: Bot, group: "Quick Actions", action: "openChat" },
];

function toKebab(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "-");
}

export default function CommandPalette({
  onNavigate,
  onToggleTheme,
  onToggleAdvanced,
  onOpenChat,
}: {
  onNavigate: (path: string) => void;
  onToggleTheme: () => void;
  onToggleAdvanced: () => void;
  onOpenChat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.group);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.group, [item]);
      }
    }
    return map;
  }, [filtered]);

  const flatItems = useMemo(() => {
    const result: CommandItem[] = [];
    for (const groupItems of groups.values()) {
      result.push(...groupItems);
    }
    return result;
  }, [groups]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const execute = useCallback(
    (item: CommandItem) => {
      close();
      if (item.path) {
        onNavigate(item.path);
      } else if (item.action === "toggleTheme") {
        onToggleTheme();
      } else if (item.action === "toggleAdvanced") {
        onToggleAdvanced();
      } else if (item.action === "openChat") {
        onOpenChat();
      }
    },
    [close, onNavigate, onToggleTheme, onToggleAdvanced, onOpenChat],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          execute(flatItems[selectedIndex]);
        }
      }
    },
    [flatItems, selectedIndex, execute, close],
  );

  if (!open) return null;

  let itemIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
      onClick={close}
      onKeyDown={handleKeyDown}
    >
      <div
        data-testid="panel-command-palette"
        className="w-full max-w-lg rounded-md border border-border bg-card shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            data-testid="input-command-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="border-0 focus-visible:ring-0 shadow-none"
          />
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {flatItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No results found.</p>
          )}
          {Array.from(groups.entries()).map(([groupName, groupItems]) => (
            <div key={groupName} className="mb-2 last:mb-0">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">{groupName}</p>
              {groupItems.map((item) => {
                const currentIndex = itemIndex++;
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.group}-${item.label}`}
                    data-testid={`command-item-${toKebab(item.label)}`}
                    data-index={currentIndex}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-sm cursor-pointer ${
                      currentIndex === selectedIndex
                        ? "bg-accent text-foreground"
                        : "text-foreground"
                    }`}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    onClick={() => execute(item)}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="text-xs text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
