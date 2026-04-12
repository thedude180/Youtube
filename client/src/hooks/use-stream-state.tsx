import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreatorMode } from "@/hooks/use-creator-mode";
import { useAuth } from "@/hooks/use-auth";
import type { Stream } from "@shared/schema";

export type StreamMode = "idle" | "prep" | "live";

export interface StreamScheduleItem {
  id?: number;
  title?: string;
  scheduledAt?: string;
  platform?: string;
}

export interface StreamStateInfo {
  mode: StreamMode;
  isLive: boolean;
  liveStreamInfo: {
    title?: string;
    platform?: string;
    viewerCount?: number;
    startedAt?: string;
  } | null;
  nextScheduled: StreamScheduleItem | null;
  plannedStreams: Stream[];
  hasUpcomingStream: boolean;
}

const PREP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function useStreamState(): StreamStateInfo {
  const { user } = useAuth();
  const { isLive, liveStream } = useCreatorMode();

  const { data: streamList = [] } = useQuery<Stream[]>({
    queryKey: ["/api/streams"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
    enabled: !!user,
  });

  const { data: scheduleData = [] } = useQuery<StreamScheduleItem[]>({
    queryKey: ["/api/stream-upgrades/schedule"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!user,
  });

  const plannedStreams = useMemo(
    () => streamList.filter((s) => s.status === "planned"),
    [streamList]
  );

  const nextScheduled = useMemo(() => {
    const now = Date.now();
    const upcoming = [
      ...scheduleData
        .filter((s) => s.scheduledAt && new Date(s.scheduledAt).getTime() > now)
        .map((s) => ({ ...s, _time: new Date(s.scheduledAt!).getTime() })),
      ...plannedStreams
        .filter((s) => s.scheduledFor && new Date(s.scheduledFor).getTime() > now)
        .map((s) => ({
          id: s.id,
          title: s.title,
          scheduledAt: s.scheduledFor ?? undefined,
          platform: ((s.platforms as string[]) || [])[0],
          _time: new Date(s.scheduledFor!).getTime(),
        })),
    ].sort((a, b) => a._time - b._time);

    return upcoming[0] ?? null;
  }, [scheduleData, plannedStreams]);

  const hasUpcomingStream = useMemo(() => {
    const now = Date.now();
    const hasNearPlanned = plannedStreams.some((s) => {
      if (!s.scheduledFor) return false;
      const diff = new Date(s.scheduledFor).getTime() - now;
      return diff > 0 && diff < PREP_WINDOW_MS;
    });
    if (hasNearPlanned) return true;
    if (!nextScheduled?.scheduledAt) return false;
    const diff = new Date(nextScheduled.scheduledAt).getTime() - now;
    return diff > 0 && diff < PREP_WINDOW_MS;
  }, [plannedStreams, nextScheduled]);

  const mode: StreamMode = useMemo(() => {
    if (isLive) return "live";
    if (hasUpcomingStream) return "prep";
    return "idle";
  }, [isLive, hasUpcomingStream]);

  return {
    mode,
    isLive,
    liveStreamInfo: isLive && liveStream
      ? {
          title: liveStream.title,
          platform: liveStream.platform,
          viewerCount: liveStream.viewerCount,
          startedAt: liveStream.startedAt,
        }
      : null,
    nextScheduled,
    plannedStreams,
    hasUpcomingStream,
  };
}
