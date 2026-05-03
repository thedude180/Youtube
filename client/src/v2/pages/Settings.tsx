import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Link2, Link2Off, Youtube, MessageCircle, Twitch } from "lucide-react";
import { SiTiktok, SiKick } from "react-icons/si";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: Youtube,
  discord: MessageCircle,
  twitch: Twitch,
  tiktok: SiTiktok,
  kick: SiKick,
};

const PLATFORMS = ["youtube", "discord", "twitch", "tiktok", "kick"];

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
      toast({ title: "Platform disconnected" });
    },
  });

  const notifPrefMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/notifications/preferences", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
      toast({ title: "Preferences saved" });
    },
  });

  const connectedByPlatform = Object.fromEntries(
    channels.map((c: any) => [c.platform, c]),
  );

  return (
    <div className="space-y-6" data-testid="page-settings">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms" data-testid="tab-platforms">Platforms</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="mt-4 space-y-3">
          {channelsLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            PLATFORMS.map((platform) => {
              const channel = connectedByPlatform[platform];
              const Icon = PLATFORM_ICONS[platform] ?? Link2;
              return (
                <Card key={platform} data-testid={`card-platform-${platform}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium capitalize">{platform}</p>
                        {channel && (
                          <p className="text-xs text-muted-foreground">{channel.username ?? channel.displayName}</p>
                        )}
                      </div>
                      {channel ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="bg-green-600 border-0">Connected</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disconnectMutation.mutate(channel.id)}
                            disabled={disconnectMutation.isPending}
                            data-testid={`btn-disconnect-${platform}`}
                          >
                            <Link2Off className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => connectMutation.mutate(platform)}
                          disabled={connectMutation.isPending}
                          data-testid={`btn-connect-${platform}`}
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          Connect
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card data-testid="card-notif-prefs">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified.</CardDescription>
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

        <TabsContent value="account" className="mt-4">
          <Card data-testid="card-account">
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{user?.email ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Plan</p>
                <Badge variant="outline" className="capitalize">{user?.subscriptionTier ?? "free"}</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">User ID</p>
                <p className="font-mono text-xs text-muted-foreground">{user?.id}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
