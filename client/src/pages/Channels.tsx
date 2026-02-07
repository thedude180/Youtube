import { useChannels, useCreateChannel } from "@/hooks/use-channels";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Youtube, Plus, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { insertChannelSchema } from "@shared/schema";

// Schema for manual addition (normally this would be OAuth flow)
const addChannelSchema = insertChannelSchema.pick({ 
    platform: true, 
    channelName: true, 
    channelId: true 
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
    }
  });

  const onSubmit = (data: AddChannelForm) => {
    // In a real app, this would redirect to Google OAuth
    // Here we simulate adding a channel manually for the MVP
    createChannel.mutate({ ...data, userId: 1 }); // Mock user ID
    setOpen(false);
    form.reset();
  };

  if (isLoading) return <ChannelsSkeleton />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Channels</h1>
          <p className="text-muted-foreground mt-1">Manage connected platforms and permissions.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/25 flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Connect Channel
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Connect New Channel</DialogTitle>
                    <DialogDescription>
                        Enter channel details manually for this demo.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Platform</label>
                        <select 
                            {...form.register("platform")}
                            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="youtube">YouTube</option>
                            <option value="tiktok">TikTok</option>
                            <option value="instagram">Instagram</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Channel Name</label>
                        <input 
                            {...form.register("channelName")}
                            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-primary/20 outline-none"
                            placeholder="e.g. My Awesome Channel"
                        />
                         {form.formState.errors.channelName && <span className="text-xs text-destructive">{form.formState.errors.channelName.message}</span>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Channel ID</label>
                        <input 
                            {...form.register("channelId")}
                            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-primary/20 outline-none"
                            placeholder="UC..."
                        />
                         {form.formState.errors.channelId && <span className="text-xs text-destructive">{form.formState.errors.channelId.message}</span>}
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button 
                            type="submit" 
                            disabled={createChannel.isPending}
                            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {createChannel.isPending ? "Connecting..." : "Connect"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {channels?.map((channel) => (
            <div key={channel.id} className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm hover:border-primary/50 transition-colors group">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors">
                            {channel.platform === 'youtube' ? <Youtube className="h-8 w-8 text-red-500" /> : <div className="font-bold text-xl uppercase">{channel.platform[0]}</div>}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold font-display">{channel.channelName}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-mono text-muted-foreground">{channel.channelId}</span>
                                <ExternalLink className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-primary" />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-medium text-green-500">Connected</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-secondary/30 rounded-xl p-3 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Preset</p>
                        <p className="font-medium capitalize">{channel.settings?.preset || "Normal"}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-xl p-3 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
                        <p className="font-medium">{channel.lastSyncAt ? format(new Date(channel.lastSyncAt), "HH:mm") : "Never"}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-6 border-t border-border/50">
                    <button className="flex-1 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync Now
                    </button>
                    <button className="py-2 px-3 text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}

function ChannelsSkeleton() {
    return (
        <div className="p-8 space-y-6">
             <Skeleton className="h-10 w-1/3 mb-8" />
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
             </div>
        </div>
    );
}
