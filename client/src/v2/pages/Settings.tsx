import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Link2, Link2Off, Youtube, MessageCircle, Twitch, Radio } from "lucide-react";
import { SiTiktok, SiKick, SiX, SiInstagram, SiReddit, SiFacebook } from "react-icons/si";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// ─── Platform config ──────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { id: "youtube",   label: "YouTube",    Icon: Youtube,       desc: "Main channel + Shorts publishing",  group: "growth" },
  { id: "tiktok",    label: "TikTok",     Icon: SiTiktok,      desc: "Clip & Short distribution",         group: "growth" },
  { id: "twitter",   label: "Twitter / X", Icon: SiX,           desc: "Announcements & viral clips",       group: "growth" },
  { id: "instagram", label: "Instagram",  Icon: SiInstagram,   desc: "Reels & story announcements",       group: "growth" },
  { id: "reddit",    label: "Reddit",     Icon: SiReddit,       desc: "Community posts in gaming subs",    group: "growth" },
  { id: "facebook",  label: "Facebook",   Icon: SiFacebook,    desc: "Gaming page & group posts",         group: "growth" },
  { id: "discord",   label: "Discord",    Icon: MessageCircle, desc: "Community server announcements",    group: "growth" },
] as const;

const STREAM_PLATFORMS = [
  { id: "twitch", label: "Twitch", Icon: Twitch, desc: "RTMP live streaming destination" },
  { id: "kick",   label: "Kick",   Icon: SiKick, desc: "RTMP live streaming destination" },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

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

  const connectedByPlatform = Object.fromEntries(channels.map((c: any) => [c.platform, c]));

  function PlatformRow({ id, label, Icon, desc }: { id: string; label: string; Icon: any; desc: string }) {
    const channel = connectedByPlatform[id];
    return (
      <Card key={id} data-testid={`card-platform-${id}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{channel?.username ?? channel?.displayName ?? desc}</p>
            </div>
            {channel ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 border-0 text-white text-xs">Connected</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate(channel.id)}
                  disabled={disconnectMutation.isPending}
                  data-testid={`btn-disconnect-${id}`}
                >
                  <Link2Off className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => connectMutation.mutate(id)}
                disabled={connectMutation.isPending}
                data-testid={`btn-connect-${id}`}
              >
                <Link2 className="w-4 h-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-settings">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms" data-testid="tab-platforms">Platforms</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="mt-4 space-y-6">
          {channelsLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              {/* Growth / Social platforms */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">Social & Growth Platforms</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect all of these. The pipeline publishes to every connected platform and cross-promotes between them.
                  </p>
                </div>
                {SOCIAL_PLATFORMS.map((p) => (
                  <PlatformRow key={p.id} {...p} />
                ))}
              </div>

              <Separator />

              {/* Live streaming platforms */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">Live Streaming Destinations</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    RTMP stream keys for simultaneous broadcasting. Connect in the Stream page.
                  </p>
                </div>
                {STREAM_PLATFORMS.map((p) => (
                  <PlatformRow key={p.id} {...p} />
                ))}
              </div>

              {/* Cross-promotion summary */}
              <Card className="border-dashed bg-muted/30" data-testid="card-crosspromo-info">
                <CardContent className="pt-4">
                  <p className="text-xs font-medium mb-2">How cross-promotion works</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>🎬 Every YouTube video → auto-announced on all connected platforms</li>
                    <li>📱 Shorts → distributed to TikTok + Instagram Reels automatically</li>
                    <li>🔴 Every live stream → announced across Discord, Twitter, Reddit, Instagram</li>
                    <li>🔗 Every post includes links to all other platforms — all grow together</li>
                    <li>⏰ Posts are staggered 10-20 min apart to avoid spam signals</li>
                  </ul>
                </CardContent>
              </Card>
            </>
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
            <CardHeader><CardTitle>Account</CardTitle></CardHeader>
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
