import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  LayoutDashboard,
  Video,
  Radio,
  DollarSign,
  Settings,
  Search,
  Sun,
  Gauge,
  Bot,
  Users,
  Shield,
  Receipt,
  Calculator,
  FileText,
  Crown,
  Rocket,
  Download,
  Maximize,
  Keyboard,
  Bell,
  Calendar,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface CommandItem {
  label: string;
  icon: LucideIcon;
  group: string;
  path?: string;
  action?: string;
  shortcut?: string;
  keywords?: string[];
}

const items: CommandItem[] = [
  { label: "Home", icon: LayoutDashboard, group: "Navigation", path: "/", shortcut: "Alt+1", keywords: ["dashboard", "overview", "main"] },
  { label: "Content", icon: Video, group: "Navigation", path: "/content", shortcut: "Alt+2", keywords: ["videos", "library", "media"] },
  { label: "Go Live", icon: Radio, group: "Navigation", path: "/stream", shortcut: "Alt+3", keywords: ["stream", "broadcast", "live"] },
  { label: "Money", icon: DollarSign, group: "Navigation", path: "/money", shortcut: "Alt+4", keywords: ["revenue", "income", "earnings"] },
  { label: "Settings", icon: Settings, group: "Navigation", path: "/settings", shortcut: "Alt+5", keywords: ["preferences", "config", "options"] },

  { label: "Videos", icon: Video, group: "Content", path: "/content", keywords: ["library", "uploads"] },
  { label: "Channels", icon: Users, group: "Content", path: "/content/channels", keywords: ["connected", "platforms"] },
  { label: "Calendar", icon: Calendar, group: "Content", path: "/content/calendar", keywords: ["schedule", "planned"] },
  { label: "Updated Videos", icon: FileText, group: "Content", path: "/content/updated", keywords: ["optimized", "changes"] },

  { label: "Autopilot", icon: Rocket, group: "Automation", path: "/autopilot", keywords: ["auto", "queue", "scheduled"] },
  { label: "Community", icon: Users, group: "Automation", path: "/community", keywords: ["audience", "engagement"] },
  { label: "Notifications", icon: Bell, group: "Automation", path: "/notifications", keywords: ["alerts", "messages"] },

  { label: "Revenue", icon: Receipt, group: "Money", path: "/money/revenue", keywords: ["income", "earnings"] },
  { label: "Expenses", icon: Calculator, group: "Money", path: "/money/expenses", keywords: ["costs", "spending"] },
  { label: "Tax Center", icon: FileText, group: "Money", path: "/money/taxes", keywords: ["tax", "deductions"] },

  { label: "General Settings", icon: Settings, group: "Settings", path: "/settings", keywords: ["preferences"] },
  { label: "Security", icon: Shield, group: "Settings", path: "/settings/security", keywords: ["password", "2fa"] },
  { label: "Subscription", icon: Crown, group: "Settings", path: "/settings/subscription", keywords: ["plan", "billing", "upgrade"] },

  { label: "Toggle Theme", icon: Sun, group: "Quick Actions", action: "toggleTheme", shortcut: "Ctrl+Shift+T", keywords: ["dark", "light", "mode"] },
  { label: "Toggle Advanced Mode", icon: Gauge, group: "Quick Actions", action: "toggleAdvanced", keywords: ["expert", "power"] },
  { label: "Open AI Chat", icon: Bot, group: "Quick Actions", action: "openChat", keywords: ["assistant", "help", "ai"] },
  { label: "Focus Mode", icon: Maximize, group: "Quick Actions", action: "focusMode", shortcut: "Ctrl+Shift+F", keywords: ["zen", "distraction", "fullscreen"] },
  { label: "Export Queue CSV", icon: Download, group: "Quick Actions", action: "exportQueue", keywords: ["download", "csv", "data"] },
  { label: "Keyboard Shortcuts", icon: Keyboard, group: "Quick Actions", action: "shortcuts", shortcut: "?", keywords: ["hotkeys", "keys"] },
];

function fuzzyMatch(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  let score = 0;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem("cmd-recent");
    return stored ? JSON.parse(stored).slice(0, 5) : [];
  } catch { return []; }
}

function addRecentSearch(label: string) {
  try {
    const recent = getRecentSearches().filter(r => r !== label);
    recent.unshift(label);
    localStorage.setItem("cmd-recent", JSON.stringify(recent.slice(0, 5)));
  } catch {}
}

function toKebab(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "-");
}

export default function CommandPalette({
  onNavigate,
  onToggleTheme,
  onToggleAdvanced,
  onOpenChat,
  onFocusMode,
  onShowShortcuts,
}: {
  onNavigate: (path: string) => void;
  onToggleTheme: () => void;
  onToggleAdvanced: () => void;
  onOpenChat: () => void;
  onFocusMode?: () => void;
  onShowShortcuts?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recentSearches, setRecentSearches] = useState(getRecentSearches);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      const recentItems = recentSearches
        .map(label => items.find(i => i.label === label))
        .filter(Boolean) as CommandItem[];
      if (recentItems.length > 0) {
        return [...recentItems, ...items.filter(i => !recentSearches.includes(i.label))];
      }
      return items;
    }
    const q = query.toLowerCase();
    const scored = items.map(item => {
      const labelScore = fuzzyMatch(item.label, q);
      const keywordScore = (item.keywords || []).reduce((max, kw) => Math.max(max, fuzzyMatch(kw, q)), 0);
      const groupScore = fuzzyMatch(item.group, q) * 0.3;
      return { item, score: Math.max(labelScore, keywordScore, groupScore) };
    }).filter(({ score }) => score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map(({ item }) => item);
  }, [query, recentSearches]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    if (!query.trim() && recentSearches.length > 0) {
      const recentItems = recentSearches
        .map(label => items.find(i => i.label === label))
        .filter(Boolean) as CommandItem[];
      if (recentItems.length > 0) {
        map.set("Recent", recentItems);
      }
    }
    for (const item of filtered) {
      if (!query.trim() && recentSearches.includes(item.label)) continue;
      const groupName = query.trim() ? item.group : item.group;
      const existing = map.get(groupName);
      if (existing) {
        existing.push(item);
      } else {
        map.set(groupName, [item]);
      }
    }
    return map;
  }, [filtered, query, recentSearches]);

  const flatItems = useMemo(() => {
    const result: CommandItem[] = [];
    for (const groupItems of Array.from(groups.values())) {
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
      addRecentSearch(item.label);
      setRecentSearches(getRecentSearches());
      close();
      if (item.path) {
        onNavigate(item.path);
      } else if (item.action === "toggleTheme") {
        onToggleTheme();
      } else if (item.action === "toggleAdvanced") {
        onToggleAdvanced();
      } else if (item.action === "openChat") {
        onOpenChat();
      } else if (item.action === "focusMode" && onFocusMode) {
        onFocusMode();
      } else if (item.action === "exportQueue") {
        window.open("/api/autopilot/queue/export", "_blank");
      } else if (item.action === "shortcuts" && onShowShortcuts) {
        onShowShortcuts();
      }
    },
    [close, onNavigate, onToggleTheme, onToggleAdvanced, onOpenChat, onFocusMode, onShowShortcuts],
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
      if (flatItems.length === 0) return;
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
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
      onClick={close}
      onKeyDown={handleKeyDown}
    >
      <div
        data-testid="panel-command-palette"
        aria-modal="true"
        className="w-full max-w-lg rounded-md border border-border bg-card shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            data-testid="input-command-search"
            aria-label="Search commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 shadow-none"
          />
          <kbd className="text-[10px] text-muted-foreground bg-background border border-border rounded px-1 py-0.5 whitespace-nowrap shrink-0">
            ESC
          </kbd>
        </div>
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-2">
          {flatItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No results found.</p>
          )}
          {Array.from(groups.entries()).map(([groupName, groupItems]) => (
            <div key={groupName} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 px-2 py-1">
                <p className="text-xs font-medium text-muted-foreground">{groupName}</p>
                {groupName === "Recent" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />recent
                  </Badge>
                )}
              </div>
              {groupItems.map((item) => {
                const currentIndex = itemIndex++;
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.group}-${item.label}`}
                    role="option"
                    aria-selected={currentIndex === selectedIndex}
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
        <div className="border-t border-border px-3 py-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="bg-background border border-border rounded px-1">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-background border border-border rounded px-1">↵</kbd> select</span>
          </div>
          <span>{flatItems.length} command{flatItems.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
