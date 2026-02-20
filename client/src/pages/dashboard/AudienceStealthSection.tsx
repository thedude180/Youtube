import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformBadge } from "@/components/PlatformIcon";
import { safeArray } from "@/lib/safe-data";
import { Shield, Users, Clock, Eye } from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number | null): string {
  if (h === null) return "--";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}${suffix}`;
}

export default function AudienceStealthSection() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/audience-analytics"], refetchInterval: 30_000, staleTime: 20_000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const platforms = data.platforms || {};
  const stealthReport = data.stealthStatus?.stealthReport;
  const activePlatforms = safeArray(Object.entries(platforms)).filter(([_, v]: any) =>
    v?.topSlots?.length > 0
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      <Card data-testid="card-audience-insights">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Audience Activity</span>
            <Badge
              variant="secondary"
              className="text-xs no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-audience-source"
            >
              {data.hasAudienceData ? "Live Data" : "Smart Defaults"}
            </Badge>
          </div>

          <div className="space-y-2">
            {activePlatforms.slice(0, 4).map(([platform, info]: any) => {
              const topSlot = info.topSlots?.[0];
              return (
                <div
                  key={platform}
                  className="flex items-center justify-between gap-2"
                  data-testid={`row-audience-${platform}`}
                >
                  <PlatformBadge platform={platform} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {topSlot
                        ? `${DAY_NAMES[topSlot.dayOfWeek]} ${formatHour(topSlot.hourOfDay)}`
                        : "No data"}
                    </span>
                    {topSlot?.activityLevel && (
                      <span className="text-emerald-400 font-medium">
                        {Math.round(topSlot.activityLevel)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {activePlatforms.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Audience data builds as your channels grow. Using optimized defaults for now.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-stealth-status">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">Stealth Engine</span>
            {stealthReport && (
              <Badge
                variant="secondary"
                className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                  stealthReport.overallScore >= 80
                    ? "bg-emerald-500/10 text-emerald-400"
                    : stealthReport.overallScore >= 60
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}
                data-testid="badge-stealth-score"
              >
                Score: {stealthReport.overallScore}
              </Badge>
            )}
          </div>

          {stealthReport ? (
            <div className="space-y-2">
              {safeArray(Object.entries(stealthReport?.platformGrades || {})).slice(0, 4).map(([platform, grade]: any) => (
                <div
                  key={platform}
                  className="flex items-center justify-between gap-2"
                  data-testid={`row-stealth-${platform}`}
                >
                  <PlatformBadge platform={platform} />
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${
                      grade.grade === "A" ? "text-emerald-400" :
                      grade.grade === "B" ? "text-blue-400" :
                      grade.grade === "C" ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {grade.grade}
                    </span>
                    <Eye className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {grade.postCount} posts
                    </span>
                  </div>
                </div>
              ))}

              {stealthReport.recentIssues?.length > 0 && (
                <p className="text-xs text-amber-400 mt-2">
                  {stealthReport.recentIssues.length} issue{stealthReport.recentIssues.length !== 1 ? "s" : ""} detected
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                All automated content passes through human behavior simulation and stealth checks.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">Active</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
