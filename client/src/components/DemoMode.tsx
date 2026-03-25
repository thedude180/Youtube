import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play, Globe, Shield, Gauge, Bot, AlertTriangle,
  CheckCircle2, XCircle, Clock, DollarSign, Languages,
} from "lucide-react";

interface DemoScenario {
  id: string;
  label: string;
  description: string;
  country: string;
  locale: string;
  currency: string;
  trustBudgetUsed: number;
  capabilityStatus: Record<string, "verified" | "unavailable" | "degraded">;
  pulseState: "healthy" | "degraded" | "blocked";
  agentDecisions: { agent: string; action: string; band: "GREEN" | "YELLOW" | "RED" }[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "us-healthy",
    label: "US Creator — Healthy",
    description: "Full monetization, all systems operational, trust budget fresh",
    country: "US",
    locale: "en-US",
    currency: "USD",
    trustBudgetUsed: 12,
    capabilityStatus: { "youtube:upload": "verified", "database:read": "verified", "storage:write": "verified" },
    pulseState: "healthy",
    agentDecisions: [
      { agent: "jordan-blake", action: "Generated highlight reel for Dark Souls III", band: "GREEN" },
      { agent: "nia-okafor", action: "Approved title: 'Elden Ring — No Hit Run'", band: "GREEN" },
    ],
  },
  {
    id: "ng-restricted",
    label: "Nigeria Creator — Restricted",
    description: "Limited monetization access, currency formatting in NGN, restricted payment rails",
    country: "NG",
    locale: "en-NG",
    currency: "NGN",
    trustBudgetUsed: 45,
    capabilityStatus: { "youtube:upload": "verified", "database:read": "verified", "payment:payout": "unavailable" },
    pulseState: "degraded",
    agentDecisions: [
      { agent: "jordan-blake", action: "Queued highlight — payout rail unavailable", band: "YELLOW" },
      { agent: "nia-okafor", action: "Title approved with regional SEO adjustments", band: "GREEN" },
      { agent: "kernel", action: "Blocked sponsorship auto-accept — restricted jurisdiction", band: "RED" },
    ],
  },
  {
    id: "jp-localized",
    label: "Japan Creator — Localized",
    description: "Full monetization, JPY formatting, ja-JP locale, cultural content adaptation",
    country: "JP",
    locale: "ja-JP",
    currency: "JPY",
    trustBudgetUsed: 8,
    capabilityStatus: { "youtube:upload": "verified", "database:read": "verified", "storage:write": "verified" },
    pulseState: "healthy",
    agentDecisions: [
      { agent: "jordan-blake", action: "Highlight reel formatted for Japanese audience", band: "GREEN" },
      { agent: "nia-okafor", action: "Title localized: 'エルデンリング — ノーヒットラン'", band: "GREEN" },
    ],
  },
  {
    id: "degraded-storage",
    label: "System Degraded — Storage Down",
    description: "Storage subsystem unavailable, degradation playbook active, uploads paused",
    country: "US",
    locale: "en-US",
    currency: "USD",
    trustBudgetUsed: 30,
    capabilityStatus: { "youtube:upload": "degraded", "database:read": "verified", "storage:write": "unavailable" },
    pulseState: "degraded",
    agentDecisions: [
      { agent: "kernel", action: "Activated degradation playbook: storage_failure", band: "YELLOW" },
      { agent: "jordan-blake", action: "Paused highlight generation — storage unavailable", band: "RED" },
      { agent: "nia-okafor", action: "Queued 3 titles for review when storage recovers", band: "YELLOW" },
    ],
  },
];

const BAND_COLORS: Record<string, string> = {
  GREEN: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  YELLOW: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  RED: "bg-red-500/10 text-red-600 border-red-500/20",
};

const PULSE_COLORS: Record<string, string> = {
  healthy: "text-emerald-500",
  degraded: "text-amber-500",
  blocked: "text-red-500",
};

const CAPABILITY_ICONS: Record<string, typeof CheckCircle2> = {
  verified: CheckCircle2,
  unavailable: XCircle,
  degraded: AlertTriangle,
};

function formatDemoCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function DemoMode() {
  const [activeScenario, setActiveScenario] = useState<DemoScenario>(DEMO_SCENARIOS[0]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunScenario = useCallback((scenario: DemoScenario) => {
    setIsRunning(true);
    setActiveScenario(scenario);
    setTimeout(() => setIsRunning(false), 1500);
  }, []);

  return (
    <div className="space-y-6" data-testid="demo-mode-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Demo Mode
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Explore how CreatorOS handles different scenarios — regions, degradation, and trust boundaries
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {activeScenario.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {DEMO_SCENARIOS.map((scenario) => (
          <Button
            key={scenario.id}
            variant={activeScenario.id === scenario.id ? "default" : "outline"}
            size="sm"
            className="h-auto py-2 px-3 text-left justify-start"
            onClick={() => handleRunScenario(scenario)}
            data-testid={`demo-scenario-${scenario.id}`}
          >
            <div>
              <div className="text-xs font-medium">{scenario.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{scenario.country} · {scenario.currency}</div>
            </div>
          </Button>
        ))}
      </div>

      {isRunning ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-sm text-muted-foreground">Simulating {activeScenario.label}...</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            <TabsTrigger value="overview" data-testid="tab-demo-overview">Overview</TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-demo-agents">Agents</TabsTrigger>
            <TabsTrigger value="locale" data-testid="tab-demo-locale">Locale</TabsTrigger>
            <TabsTrigger value="trust" data-testid="tab-demo-trust">Trust</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    System Pulse
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold capitalize ${PULSE_COLORS[activeScenario.pulseState]}`} data-testid="demo-pulse-state">
                    {activeScenario.pulseState}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{activeScenario.description}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Capabilities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(activeScenario.capabilityStatus).map(([cap, status]) => {
                      const Icon = CAPABILITY_ICONS[status] || Clock;
                      return (
                        <div key={cap} className="flex items-center justify-between text-xs" data-testid={`demo-cap-${cap}`}>
                          <span className="font-mono text-muted-foreground">{cap}</span>
                          <div className="flex items-center gap-1">
                            <Icon className={`h-3 w-3 ${status === "verified" ? "text-emerald-500" : status === "degraded" ? "text-amber-500" : "text-red-500"}`} />
                            <span className="capitalize">{status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Region
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Country</span>
                      <span className="font-medium" data-testid="demo-country">{activeScenario.country}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Locale</span>
                      <span className="font-medium">{activeScenario.locale}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sample Amount</span>
                      <span className="font-medium" data-testid="demo-currency-format">
                        {formatDemoCurrency(1234.56, activeScenario.currency, activeScenario.locale)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Agent Decisions ({activeScenario.agentDecisions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {activeScenario.agentDecisions.map((decision, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border/50"
                        data-testid={`demo-decision-${i}`}
                      >
                        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{decision.agent}</span>
                            <Badge variant="outline" className={`text-[9px] h-4 border ${BAND_COLORS[decision.band]}`}>
                              {decision.band}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{decision.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locale" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  Localization Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Currency Format</div>
                      <div className="text-sm font-medium" data-testid="demo-locale-currency">
                        {formatDemoCurrency(9999.99, activeScenario.currency, activeScenario.locale)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date Format</div>
                      <div className="text-sm font-medium">
                        {new Intl.DateTimeFormat(activeScenario.locale, { dateStyle: "long" }).format(new Date())}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Number Format</div>
                      <div className="text-sm font-medium">
                        {new Intl.NumberFormat(activeScenario.locale).format(1234567.89)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Revenue Display</div>
                      <div className="text-lg font-bold text-emerald-500">
                        {formatDemoCurrency(47832.50, activeScenario.currency, activeScenario.locale)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payout Status</div>
                      <Badge variant={activeScenario.capabilityStatus["payment:payout"] === "unavailable" ? "destructive" : "default"}>
                        {activeScenario.capabilityStatus["payment:payout"] === "unavailable" ? "Restricted" : "Available"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trust" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Trust Budget
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Budget Used</span>
                      <span className="font-medium">{activeScenario.trustBudgetUsed}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          activeScenario.trustBudgetUsed > 75 ? "bg-red-500" :
                          activeScenario.trustBudgetUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${activeScenario.trustBudgetUsed}%` }}
                        data-testid="demo-trust-bar"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {["sponsorship_intensity", "cta_pressure", "title_volatility", "posting_pressure"].map((cat) => (
                      <div key={cat} className="flex justify-between p-2 rounded bg-muted/50">
                        <span className="text-muted-foreground">{cat.replace(/_/g, " ")}</span>
                        <span className="font-medium">{Math.max(0, 100 - activeScenario.trustBudgetUsed - Math.floor(Math.random() * 15))}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
