import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Link2, Link2Off, Youtube, CheckCircle2 } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: channels = [], isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ["/api/channels"],
  });

  const { data: notifPrefs } = useQuery<any>({
    queryKey: ["/api/notifications/preferences"],
  });

  const connectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const result = await apiRequest<{ url: string }>("POST", "/api/channels/oauth/start", { platform });
      window.location.href = result.url;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/channels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "YouTube disconnected" });
    },
  });

  const notifPrefMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/notifications/preferences", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
      toast({ title: "Preferences saved" });
    },
  });

  const ytChannel = channels.find((c: any) => c.platform === "youtube");

  return (
    <div className="space-y-6" data-testid="page-settings">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="channel">
        <TabsList>
          <TabsTrigger value="channel" data-testid="tab-channel">YouTube Channel</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
        </TabsList>

        {/* YouTube connection */}
        <TabsContent value="channel" className="mt-4 space-y-4">
          {channelsLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : ytChannel ? (
            <>
              <Card className="border-green-500/30 bg-green-500/5" data-testid="card-yt-connected">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Youtube className="w-6 h-6 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{ytChannel.displayName ?? ytChannel.username ?? "YouTube"}</p>
                        <Badge className="bg-green-600 text-white border-0 text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Connected
                        </Badge>
                      </div>
                      {ytChannel.username && (
                        <p className="text-xs text-muted-foreground mt-0.5">@{ytChannel.username}</p>
                      )}
                      {ytChannel.subscriberCount != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Number(ytChannel.subscriberCount).toLocaleString()} subscribers
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => disconnectMutation.mutate(ytChannel.id)}
                      disabled={disconnectMutation.isPending}
                      data-testid="btn-disconnect-youtube"
                    >
                      {disconnectMutation.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Link2Off className="w-4 h-4 text-destructive" />
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-yt-info">
                <CardHeader>
                  <CardTitle className="text-sm">What's enabled</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> Analytics syncing (subscribers, views, CTR, watch time)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> AI metadata generation (titles, description, tags, thumbnail concept)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> Shorts metadata generation</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> SEO audit</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> Live stream session tracking</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed" data-testid="card-yt-disconnected">
              <CardContent className="pt-10 pb-10 text-center">
                <Youtube className="w-10 h-10 mx-auto mb-3 text-red-500" />
                <h3 className="font-medium mb-1">Connect your YouTube channel</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                  Link your Google / YouTube account to unlock analytics, AI metadata generation, Shorts, and video vault features.
                </p>
                <Button
                  onClick={() => connectMutation.mutate("youtube")}
                  disabled={connectMutation.isPending}
                  data-testid="btn-connect-youtube"
                >
                  {connectMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <Link2 className="w-4 h-4 mr-2" />
                  }
                  Connect YouTube
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-4">
          <Card data-testid="card-notif-prefs">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified about channel activity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "emailEnabled", label: "Email notifications" },
                { key: "smsEnabled", label: "SMS notifications" },
                { key: "inAppEnabled", label: "In-app notifications" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between" data-testid={`notif-pref-${key}`}>
                  <Label htmlFor={`switch-${key}`}>{label}</Label>
                  <Switch
                    id={`switch-${key}`}
                    checked={notifPrefs?.[key] ?? false}
                    onCheckedChange={(v) => notifPrefMutation.mutate({ [key]: v })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account */}
        <TabsContent value="account" className="mt-4">
          <Card data-testid="card-account">
            <CardHeader><CardTitle>Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                <p className="font-medium">{user?.email ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Display name</p>
                <p className="font-medium">{user?.displayName ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
                <Badge variant="outline" className="capitalize">{user?.subscriptionTier ?? "free"}</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">User ID</p>
                <p className="font-mono text-xs text-muted-foreground">{user?.id}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
