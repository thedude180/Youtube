import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertChannel, type UpdateChannelRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useChannels() {
  return useQuery({
    queryKey: [api.channels.list.path],
    queryFn: async () => {
      const res = await fetch(api.channels.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch channels");
      return api.channels.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertChannel) => {
      const res = await fetch(api.channels.create.path, {
        method: api.channels.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
           // Try to parse validation error
           try {
             const error = api.channels.create.responses[400].parse(await res.json());
             throw new Error(error.message);
           } catch {
             throw new Error("Validation failed");
           }
        }
        throw new Error("Failed to create channel");
      }
      return api.channels.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.channels.list.path] });
      toast({ title: "Channel Connected", description: "Your channel has been successfully linked." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateChannelRequest) => {
      const url = buildUrl(api.channels.update.path, { id });
      const res = await fetch(url, {
        method: api.channels.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update channel settings");
      return api.channels.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.channels.list.path] });
      toast({ title: "Settings Saved", description: "Channel configuration updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}
