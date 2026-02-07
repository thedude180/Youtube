import { Shield, Zap, AlertTriangle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Settings() {
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global application behavior and risk tolerance.</p>
      </div>

      <div className="space-y-8">
        {/* Risk Profiles */}
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

        {/* Global Toggles */}
        <section className="bg-card border border-border/50 rounded-2xl p-8 shadow-sm max-w-2xl">
            <h2 className="text-lg font-bold font-display mb-6">Automation Rules</h2>
            <div className="space-y-6">
                <ToggleItem 
                    title="Auto-Upload Shorts" 
                    description="Automatically publish processed shorts to YouTube"
                />
                <ToggleItem 
                    title="AI Title Rewrites" 
                    description="Allow AI to optimize titles without manual approval"
                />
                <ToggleItem 
                    title="Delete Source Files" 
                    description="Remove local VOD files after successful upload"
                />
            </div>

            <div className="pt-8 mt-8 border-t border-border/50 flex justify-end">
                 <button className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save Configuration
                </button>
            </div>
        </section>
      </div>
    </div>
  );
}

function RiskCard({ type, active, onClick, icon: Icon, title, description }: any) {
    return (
        <div 
            onClick={onClick}
            className={cn(
                "relative p-6 rounded-2xl border cursor-pointer transition-all duration-300",
                active 
                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/10 scale-[1.02]" 
                    : "bg-card border-border/50 hover:border-border hover:bg-secondary/30"
            )}
        >
            <div className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
                active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
            )}>
                <Icon className="h-6 w-6" />
            </div>
            <h3 className={cn("text-lg font-bold font-display mb-2", active ? "text-primary" : "text-foreground")}>{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            
            {active && (
                <div className="absolute top-4 right-4 h-3 w-3 rounded-full bg-primary animate-pulse" />
            )}
        </div>
    );
}

function ToggleItem({ title, description }: { title: string, description: string }) {
    const [enabled, setEnabled] = useState(false);
    
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="font-medium text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <button 
                onClick={() => setEnabled(!enabled)}
                className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    enabled ? "bg-primary" : "bg-secondary"
                )}
            >
                <div className={cn(
                    "absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                    enabled ? "translate-x-6" : "translate-x-0"
                )} />
            </button>
        </div>
    );
}
