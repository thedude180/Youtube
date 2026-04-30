import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type CreatorMode = "content" | "streaming";

interface LiveStreamInfo {
  id?: string | number;
  title?: string;
  platform?: string;
  viewerCount?: number;
  startedAt?: string;
  streamId?: string | number;
}

interface CreatorModeContextType {
  mode: CreatorMode;
  isLive: boolean;
  liveStream: LiveStreamInfo | null;
  setMode: (mode: CreatorMode) => void;
  returnToContent: () => void;
  streamDuration: string;
}

const CreatorModeContext = createContext<CreatorModeContextType>({
  mode: "content",
  isLive: false,
  liveStream: null,
  setMode: () => {},
  returnToContent: () => {},
  streamDuration: "0:00:00",
});

export function useCreatorMode() {
  return useContext(CreatorModeContext);
}

function formatDuration(startedAt: string | undefined): string {
  if (!startedAt) return "0:00:00";
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CreatorModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<CreatorMode>("content");
  const [liveStream, setLiveStream] = useState<LiveStreamInfo | null>(null);
  const [streamDuration, setStreamDuration] = useState("0:00:00");
  const prevLiveRef = useRef(false);

  const { data: ytLiveStatus } = useQuery<any>({
    queryKey: ["/api/youtube/live-status"],
    refetchInterval: 3 * 60_000,
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: activeStream } = useQuery<any>({
    queryKey: ["/api/stream-pipeline/active"],
    refetchInterval: 3 * 60_000,
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: streamList = [] } = useQuery<any[]>({
    queryKey: ["/api/streams"],
    refetchInterval: 3 * 60_000,
    enabled: !!user,
    staleTime: 60_000,
  });

  const dbLiveStream = (streamList as any[]).find((s) => s.status === "live") ?? null;

  const isLive =
    !!(ytLiveStatus?.connected && ytLiveStatus?.liveStreamId) ||
    !!(activeStream?.id && activeStream?.status === "running") ||
    !!dbLiveStream;

  useEffect(() => {
    if (isLive && !prevLiveRef.current) {
      const info: LiveStreamInfo = {
        id: ytLiveStatus?.liveStreamId ?? activeStream?.id ?? dbLiveStream?.id,
        title: ytLiveStatus?.title ?? activeStream?.youtubeVideoId ?? dbLiveStream?.title ?? "Live Stream",
        platform: ytLiveStatus?.connected
          ? "YouTube"
          : (activeStream?.platform ?? (dbLiveStream?.platforms?.[0] as string | undefined) ?? "YouTube"),
        viewerCount: ytLiveStatus?.viewerCount ?? 0,
        startedAt: activeStream?.startedAt ?? dbLiveStream?.startedAt ?? new Date().toISOString(),
      };
      setLiveStream(info);
      setModeState("streaming");
    } else if (!isLive && prevLiveRef.current) {
      setModeState("content");
      setLiveStream(null);
    }
    prevLiveRef.current = isLive;
  }, [isLive, ytLiveStatus, activeStream, dbLiveStream]);

  useEffect(() => {
    if (!isLive || !liveStream?.startedAt) return;
    const t = setInterval(() => {
      setStreamDuration(formatDuration(liveStream.startedAt));
    }, 1000);
    return () => clearInterval(t);
  }, [isLive, liveStream?.startedAt]);

  const setMode = useCallback((m: CreatorMode) => setModeState(m), []);
  const returnToContent = useCallback(() => setModeState("content"), []);

  return (
    <CreatorModeContext.Provider value={{ mode, isLive, liveStream, setMode, returnToContent, streamDuration }}>
      {children}
    </CreatorModeContext.Provider>
  );
}
