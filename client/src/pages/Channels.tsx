import { useChannels, useCreateChannel } from "@/hooks/use-channels";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Plus, RefreshCw, Trash2, ExternalLink, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { insertChannelSchema, PLATFORMS, PLATFORM_INFO, type Platform } from "@shared/schema";
import {
  SiYoutube,
  SiTwitch,
  SiKick,
  SiFacebook,
  SiTiktok,
  SiX,
  SiLinkedin,
  SiInstagram,
} from "react-icons/si";

function PlatformIcon({ platform, className = "h-5 w-5" }: { platform: string; className?: string }) {
  const icons: Record<string, any> = {
    youtube: SiYoutube,
    twitch: SiTwitch,
    kick: SiKick,
    facebook: SiFacebook,
    tiktok: SiTiktok,
    x: SiX,
    linkedin: SiLinkedin,
    instagram: SiInstagram,
    rumble: Globe,
  };
  const Icon = icons[platform] || Globe;
  return <Icon className={className} />;
}

const addChannelSchema = insertChannelSchema.pick({
  platform: true,
  channelName: true,
  channelId: true,
});
type AddChannelForm = z.infer<typeof addChannelSchema>;

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const [open, setOpen] = useState(false);

  const form = useForm<AddChannelForm>({
    resolver: zodResolver(addChannelSchema),
    defaultValues: {
      platform: "youtube",
      channelName: "",
      channelId: "",
    },
  });

  const onSubmit = (data: AddChannelForm) => {
    createChannel.mutate({ ...data, userId: "demo" });
    setOpen(false);
    form.reset();
  };

  if (isLoading) return <ChannelsSkeleton />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Channels</h1>
          <p className="text-muted-foreground mt-1">Manage connected platforms and permissions.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-channel">
              <Plus className="h-4 w-4 mr-2" />
              Connect Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Connect New Channel</DialogTitle>
              <DialogDescription>Enter channel details to connect your account.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Platform</label>
                <Select
                  defaultValue="youtube"
                  onValueChange={(val) => form.setValue("platform", val)}
                >
                  <SelectTrigger data-testid="select-platform">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={p} className="h-3 w-3" />
                          {PLATFORM_INFO[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel Name</label>
                <Input
                  data-testid="input-channel-name"
                  {...form.register("channelName")}
                  placeholder="e.g. My Awesome Channel"
                />
                {form.formState.errors.channelName && (
                  <span className="text-xs text-destructive">{form.formState.errors.channelName.message}</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel ID</label>
                <Input
                  data-testid="input-channel-id"
                  {...form.register("channelId")}
                  placeholder="UC..."
                />
                {form.formState.errors.channelId && (
                  <span className="text-xs text-destructive">{form.formState.errors.channelId.message}</span>
                )}
              </div>
              <div className="pt-4 flex justify-end">
                <Button data-testid="button-submit-channel" type="submit" disabled={createChannel.isPending}>
                  {createChannel.isPending ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(!channels || channels.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No channels connected</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Connect your YouTube, Twitch, Kick, TikTok, or other channels to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {channels.map((channel) => (
            <Card key={channel.id} data-testid={`card-channel-${channel.id}`} className="hover-elevate">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6 gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center border-2 border-border shrink-0"
                      style={{ color: PLATFORM_INFO[channel.platform as Platform]?.color }}
                    >
                      <PlatformIcon platform={channel.platform} className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <h3 data-testid={`text-channel-name-${channel.id}`} className="text-xl font-bold font-display truncate">
                        {channel.channelName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-muted-foreground truncate">{channel.channelId}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-500">Connected</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Preset</p>
                    <p className="font-medium capitalize">{channel.settings?.preset || "Normal"}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
                    <p className="font-medium">
                      {channel.lastSyncAt ? format(new Date(channel.lastSyncAt), "HH:mm") : "Never"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-6 border-t border-border/50">
                  <Button data-testid={`button-sync-channel-${channel.id}`} variant="secondary" className="flex-1">
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Sync Now
                  </Button>
                  <Button data-testid={`button-remove-channel-${channel.id}`} variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelsSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-10 w-1/3 mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
