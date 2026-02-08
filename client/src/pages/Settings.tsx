import { Shield, Zap, AlertTriangle, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Settings() {
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global application behavior and risk tolerance.</p>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-bold font-display mb-4">Risk Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <RiskCard
              type="safe"
              active={activePreset === "safe"}
              onClick={() => setActivePreset("safe")}
              icon={Shield}
              title="Safe Mode"
              description="Conservative growth. Minimal metadata changes. Strictly follows rate limits."
            />
            <RiskCard
              type="normal"
              active={activePreset === "normal"}
              onClick={() => setActivePreset("normal")}
              icon={Zap}
              title="Normal Mode"
              description="Balanced optimization. Daily updates and regular A/B testing."
            />
            <RiskCard
              type="aggressive"
              active={activePreset === "aggressive"}
              onClick={() => setActivePreset("aggressive")}
              icon={AlertTriangle}
              title="Aggressive Mode"
              description="Maximum growth. High frequency updates. Experimental features enabled."
            />
          </div>
        </section>

        <Card className="max-w-2xl">
          <CardContent className="p-8">
            <h2 className="text-lg font-bold font-display mb-6">Automation Rules</h2>
            <div className="space-y-6">
              <ToggleItem
                id="auto-upload"
                title="Auto-Upload Shorts"
                description="Automatically publish processed shorts to YouTube"
              />
              <ToggleItem
                id="ai-rewrites"
                title="AI Title Rewrites"
                description="Allow AI to optimize titles without manual approval"
              />
              <ToggleItem
                id="delete-source"
                title="Delete Source Files"
                description="Remove local VOD files after successful upload"
              />
            </div>

            <div className="pt-8 mt-8 border-t border-border/50 flex justify-end">
              <Button data-testid="button-save-settings">
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RiskCard({
  type,
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  type: string;
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card
      data-testid={`card-risk-${type}`}
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-all duration-300",
        active
          ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
          : "hover-elevate"
      )}
    >
      <CardContent className="p-6 relative">
        <div
          className={cn(
            "h-12 w-12 rounded-lg flex items-center justify-center mb-4 transition-colors",
            active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h3
          className={cn(
            "text-lg font-bold font-display mb-2",
            active ? "text-primary" : "text-foreground"
          )}
        >
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

        {active && <div className="absolute top-4 right-4 h-3 w-3 rounded-full bg-primary animate-pulse" />}
      </CardContent>
    </Card>
  );
}

function ToggleItem({ id, title, description }: { id: string; title: string; description: string }) {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        data-testid={`switch-${id}`}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
    </div>
  );
}
