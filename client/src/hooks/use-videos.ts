import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertVideo, type UpdateVideoRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useVideos(filters?: { status?: string; type?: string }) {
  const url = new URL(api.videos.list.path, window.location.origin);
  if (filters?.status) url.searchParams.append("status", filters.status);
  if (filters?.type) url.searchParams.append("type", filters.type);

  return useQuery({
    queryKey: [api.videos.list.path, filters],
    queryFn: async () => {
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return api.videos.list.responses[200].parse(await res.json());
    },
  });
}

export function useVideo(id: number) {
  return useQuery({
    queryKey: [api.videos.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.videos.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch video details");
      return api.videos.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateVideoRequest) => {
      const url = buildUrl(api.videos.update.path, { id });
      const res = await fetch(url, {
        method: api.videos.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update video");
      return api.videos.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.videos.get.path, variables.id] });
      toast({ title: "Video Updated", description: "Changes have been saved." });
    },
  });
}

export function useGenerateMetadata() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.videos.generateMetadata.path, { id });
      const res = await fetch(url, {
        method: api.videos.generateMetadata.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to generate metadata");
      return api.videos.generateMetadata.responses[200].parse(await res.json());
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.videos.get.path, id] });
      toast({ title: "AI Magic Complete", description: "New metadata suggestions generated." });
    },
  });
}
