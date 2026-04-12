import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Eye, Type, Move, Mic, Keyboard, Globe, ScanEye, Minimize2, Save,
} from "lucide-react";

const FONT_SIZES = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Espa\u00f1ol" },
  { value: "fr", label: "Fran\u00e7ais" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Portugu\u00eas" },
  { value: "ja", label: "\u65e5\u672c\u8a9e" },
  { value: "ko", label: "\ud55c\uad6d\uc5b4" },
  { value: "zh", label: "\u4e2d\u6587" },
  { value: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
  { value: "hi", label: "\u0939\u093f\u0928\u094d\u0926\u0940" },
  { value: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" },
];

interface AccessibilityPrefs {
  highContrast: boolean;
  dyslexiaFont: boolean;
  fontSize: string;
  reducedMotion: boolean;
  voiceNavigation: boolean;
  keyboardShortcuts: Record<string, string>;
  language: string;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  highContrast: false,
  dyslexiaFont: false,
  fontSize: "normal",
  reducedMotion: false,
  voiceNavigation: false,
  keyboardShortcuts: {
    search: "Ctrl+K",
    dashboard: "Ctrl+D",
    content: "Ctrl+C",
    settings: "Ctrl+,",
  },
  language: "en",
};

const DEFAULT_SHORTCUTS: Record<string, string> = {
  search: "Ctrl+K",
  dashboard: "Ctrl+D",
  content: "Ctrl+C",
  settings: "Ctrl+,",
};

export default function AccessibilityTab() {
  const { toast } = useToast();
  const { data: prefs, isLoading } = useQuery<AccessibilityPrefs>({ queryKey: ["/api/settings/accessibility"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });

  const [local, setLocal] = useState<AccessibilityPrefs>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prefs) {
      setLocal({
        highContrast: prefs.highContrast ?? false,
        dyslexiaFont: prefs.dyslexiaFont ?? false,
        fontSize: prefs.fontSize ?? "normal",
        reducedMotion: prefs.reducedMotion ?? false,
        voiceNavigation: prefs.voiceNavigation ?? false,
        keyboardShortcuts: prefs.keyboardShortcuts ?? DEFAULT_SHORTCUTS,
        language: prefs.language ?? "en",
      });
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async (data: AccessibilityPrefs) => {
      const res = await apiRequest("POST", "/api/settings/accessibility", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/accessibility"] });
      toast({ title: "Accessibility preferences saved" });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Failed to save preferences", description: e.message, variant: "destructive" }),
  });

  const update = (key: keyof AccessibilityPrefs, value: any) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateShortcut = (action: string, shortcut: string) => {
    setLocal((prev) => ({
      ...prev,
      keyboardShortcuts: { ...prev.keyboardShortcuts, [action]: shortcut },
    }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="skeleton-accessibility">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="accessibility-tab">
      <Card data-testid="card-visual-settings">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-primary" />
            Visual Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="flex items-center justify-between gap-2" data-testid="setting-high-contrast">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <ScanEye className="w-3 h-3 text-muted-foreground" />
                High Contrast Mode
              </p>
              <p className="text-xs text-muted-foreground ml-4.5">Increase contrast for better visibility</p>
            </div>
            <Switch
              checked={local.highContrast}
              onCheckedChange={(v) => update("highContrast", v)}
              data-testid="switch-high-contrast"
            />
          </div>

          <div className="flex items-center justify-between gap-2" data-testid="setting-dyslexia-font">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Type className="w-3 h-3 text-muted-foreground" />
                Dyslexia-Friendly Font
              </p>
              <p className="text-xs text-muted-foreground ml-4.5">Use OpenDyslexic font for easier reading</p>
            </div>
            <Switch
              checked={local.dyslexiaFont}
              onCheckedChange={(v) => update("dyslexiaFont", v)}
              data-testid="switch-dyslexia-font"
            />
          </div>

          <div className="flex items-center justify-between gap-2" data-testid="setting-font-size">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Type className="w-3 h-3 text-muted-foreground" />
                Font Size
              </p>
              <p className="text-xs text-muted-foreground ml-4.5">Adjust the base font size</p>
            </div>
            <Select value={local.fontSize} onValueChange={(v) => update("fontSize", v)}>
              <SelectTrigger className="w-[120px]" data-testid="select-font-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2" data-testid="setting-reduced-motion">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Minimize2 className="w-3 h-3 text-muted-foreground" />
                Reduced Motion
              </p>
              <p className="text-xs text-muted-foreground ml-4.5">Minimize animations and transitions</p>
            </div>
            <Switch
              checked={local.reducedMotion}
              onCheckedChange={(v) => update("reducedMotion", v)}
              data-testid="switch-reduced-motion"
            />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-navigation-settings">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5 text-primary" />
            Navigation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="flex items-center justify-between gap-2" data-testid="setting-voice-nav">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Mic className="w-3 h-3 text-muted-foreground" />
                Voice Navigation
              </p>
              <p className="text-xs text-muted-foreground ml-4.5">Navigate using voice commands</p>
            </div>
            <Switch
              checked={local.voiceNavigation}
              onCheckedChange={(v) => update("voiceNavigation", v)}
              data-testid="switch-voice-nav"
            />
          </div>

          <div data-testid="setting-keyboard-shortcuts">
            <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Keyboard className="w-3 h-3 text-muted-foreground" />
              Keyboard Shortcuts
            </p>
            <div className="space-y-1.5">
              {Object.entries(local.keyboardShortcuts).map(([action, shortcut]) => (
                <div key={action} className="flex items-center justify-between gap-2 p-1.5 rounded bg-secondary/30" data-testid={`shortcut-${action}`}>
                  <span className="text-xs font-medium capitalize">{action}</span>
                  <Input
                    value={shortcut}
                    onChange={(e) => updateShortcut(action, e.target.value)}
                    className="w-[120px] text-xs text-center"
                    data-testid={`input-shortcut-${action}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-language">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-primary" />
            Language
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-center justify-between gap-2" data-testid="setting-language">
            <p className="text-xs text-muted-foreground">Select your preferred language</p>
            <Select value={local.language} onValueChange={(v) => update("language", v)}>
              <SelectTrigger className="w-[160px]" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate(local)}
            disabled={saveMutation.isPending}
            data-testid="button-save-accessibility"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      )}
    </div>
  );
}
