import { Shield, Zap, AlertTriangle, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Settings() {
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");

  const presets = [
    { type: "safe" as const, icon: Shield, title: "Safe", desc: "Conservative. Minimal changes." },
    { type: "normal" as const, icon: Zap, title: "Normal", desc: "Balanced optimization." },
    { type: "aggressive" as const, icon: AlertTriangle, title: "Aggressive", desc: "Maximum growth." },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 data-testid="text-page-title" className="text-2xl font-display font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Profile</h2>
          <div className="grid grid-cols-3 gap-3">
            {presets.map(({ type, icon: Icon, title, desc }) => (
              <Card
                key={type}
                data-testid={`card-risk-${type}`}
                onClick={() => setActivePreset(type)}
                className={cn(
                  "cursor-pointer",
                  activePreset === type ? "border-primary" : "hover-elevate"
                )}
              >
                <CardContent className="p-4">
                  <Icon className={cn("h-5 w-5 mb-2", activePreset === type ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <h2 className="text-sm font-medium text-muted-foreground">Automation</h2>
            <ToggleItem id="auto-upload" title="Auto-Upload Shorts" desc="Publish processed shorts automatically" />
            <ToggleItem id="ai-rewrites" title="AI Title Rewrites" desc="Optimize titles without manual approval" />
            <ToggleItem id="delete-source" title="Delete Source Files" desc="Remove local files after upload" />
            <div className="pt-4 flex justify-end">
              <Button data-testid="button-save-settings" size="sm">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ToggleItem({ id, title, desc }: { id: string; title: string; desc: string }) {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch data-testid={`switch-${id}`} checked={enabled} onCheckedChange={setEnabled} />
    </div>
  );
}
