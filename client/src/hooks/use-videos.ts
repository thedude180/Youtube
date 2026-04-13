import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type UpdateVideoRequest, type Video } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useVideos(filters?: { status?: string; type?: string }) {
  let path = '/api/videos';
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.type) params.append("type", filters.type);
  const qs = params.toString();
  if (qs) path += `?${qs}`;

  return useQuery<Video[]>({
    queryKey: ['/api/videos', filters],
    queryFn: async () => {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return res.json();
    },
    refetchInterval: 3 * 60_000,
    staleTime: 2 * 60_000,
  });
}

export function useVideo(id: number) {
  return useQuery<Video | null>({
    queryKey: ['/api/videos', id],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch video details");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateVideoRequest) => {
      const res = await apiRequest("PUT", `/api/videos/${id}`, updates);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', variables.id] });
      toast({ title: "Video Updated", description: "Changes have been saved." });
    },
  });
}

export function useGenerateMetadata() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/videos/${id}/metadata`, {});
      return res.json();
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', id] });
      toast({ title: "AI Magic Complete", description: "New metadata suggestions generated." });
    },
  });
}
