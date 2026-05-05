import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Bot, Clock, CheckCircle, XCircle, Pause, Play } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

export default function Autopilot() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: config } = useQuery<{ enabled: boolean; platforms: string[]; maxDailyPosts: number }>({
    queryKey: ["/api/autopilot/config"],
  });

  const { data: queue = [], isLoading: queueLoading } = useQuery<any[]>({
    queryKey: ["/api/autopilot/queue"],
  });

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["/api/autopilot/history"],
  });

  const { data: schedule } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/autopilot/schedule/suggest"],
    staleTime: 60 * 60 * 1_000, // 1 hour
  });

  const toggleMutation = useMutation({
    mutationFn: (enable: boolean) =>
      apiRequest("POST", enable ? "/api/autopilot/resume" : "/api/autopilot/pause"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/autopilot/config"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/autopilot/queue/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/autopilot/queue"] }),
  });

  useSSE({
    "autopilot:post-success": (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/autopilot/history"] });
      toast({ title: "Post published!", description: `Queue item ${data.queueItemId}` });
    },
    "autopilot:post-failed": (data: any) =>
      toast({ title: "Post failed", description: data.error, variant: "destructive" }),
    "autopilot:status-changed": () =>
      qc.invalidateQueries({ queryKey: ["/api/autopilot/config"] }),
  });

  return (
    <div className="space-y-6" data-testid="page-autopilot">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autopilot</h1>
          <p className="text-muted-foreground">Automated cross-platform publishing.</p>
        </div>
        <div className="flex items-center gap-3" data-testid="autopilot-toggle">
          <Label htmlFor="autopilot-switch" className="text-sm font-medium">
            {config?.enabled ? "Autopilot ON" : "Autopilot OFF"}
          </Label>
          <Switch
            id="autopilot-switch"
            checked={config?.enabled ?? false}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
            data-testid="switch-autopilot"
          />
        </div>
      </div>

      {/* Schedule suggestion */}
      {schedule && (
        <Card data-testid="card-schedule-suggestion">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Optimal Posting Times
            </CardTitle>
            <CardDescription>AI-suggested schedule based on audience behavior.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(schedule).map(([day, times]) => (
                <div key={day} data-testid={`schedule-${day}`}>
                  <p className="font-medium capitalize">{day}</p>
                  <p className="text-muted-foreground">{times.join(", ")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue */}
      <Card data-testid="card-queue">
        <CardHeader>
          <CardTitle>Queue ({queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {queueLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">Queue is empty.</p>
          ) : (
            <div className="space-y-2">
              {queue.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`queue-item-${item.id}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{item.platform}</p>
                    {item.scheduledAt && (
                      <p className="text-xs text-muted-foreground">{new Date(item.scheduledAt).toLocaleString()}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize">{item.status}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelMutation.mutate(item.id)}
                    data-testid={`btn-cancel-${item.id}`}
                  >
                    <XCircle className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card data-testid="card-history">
          <CardHeader><CardTitle>Recent Posts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(0, 10).map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`history-item-${item.id}`}>
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{item.platform}</p>
                    {item.publishedAt && <p className="text-xs text-muted-foreground">{new Date(item.publishedAt).toLocaleString()}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
