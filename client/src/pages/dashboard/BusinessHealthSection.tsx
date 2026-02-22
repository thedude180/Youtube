import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import type { LucideIcon } from "lucide-react";

interface HealthArea {
  key: string;
  label: string;
  icon: LucideIcon;
  link: string;
}

interface HealthStatus {
  status: "good" | "warning" | "action";
  label: string;
}

interface BusinessHealthSectionProps {
  healthAreas: HealthArea[];
  getHealthStatus: (area: string) => HealthStatus;
  statusDot: (status: string) => string;
}

export default function BusinessHealthSection({ healthAreas, getHealthStatus, statusDot }: BusinessHealthSectionProps) {
  return (
    <SectionErrorBoundary fallbackTitle="Business Health failed to load">
      <Card data-testid="card-business-health">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Business Health</CardTitle>
            <Badge variant="secondary" className="text-xs" data-testid="badge-health-summary">
              <Activity className="w-3 h-3 mr-1" />
              {healthAreas.filter(a => getHealthStatus(a.key).status === "good").length}/{healthAreas.length} healthy
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {healthAreas.map((area) => {
              const health = getHealthStatus(area.key);
              const Icon = area.icon;
              return (
                <Link key={area.key} href={area.link} data-testid={`link-health-${area.key}`}>
                  <div className="flex flex-col items-center gap-1.5 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`health-${area.key}`}>
                    <div className="relative">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${statusDot(health.status)}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium">{area.label}</p>
                      <p className={`text-xs ${health.status === "good" ? "text-emerald-400" : health.status === "warning" ? "text-amber-400" : "text-red-400"}`} data-testid={`text-health-status-${area.key}`}>
                        {health.label}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
