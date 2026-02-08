import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type InsertChannel, type UpdateChannelRequest, type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ['/api/channels'],
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertChannel) => {
      const res = await apiRequest("POST", "/api/channels", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
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
      const res = await apiRequest("PUT", `/api/channels/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
      toast({ title: "Settings Saved", description: "Channel configuration updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}
