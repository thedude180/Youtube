import { useCreatorMode } from "@/hooks/use-creator-mode";
import { useLocation } from "wouter";
import { Radio, X, ArrowRight } from "lucide-react";
import { useState } from "react";

export function LiveStreamBanner() {
  const { isLive, liveStream, streamDuration } = useCreatorMode();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  if (!isLive || dismissed) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-sm"
      style={{
        background: "linear-gradient(90deg, hsl(0 80% 20% / 0.95), hsl(0 60% 15% / 0.95))",
        borderBottom: "1px solid hsl(0 80% 50% / 0.4)",
        backdropFilter: "blur(8px)",
      }}
      data-testid="banner-live-stream"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <Radio className="w-4 h-4 text-red-400" />
          <span className="text-red-400 font-mono font-bold text-xs">LIVE</span>
        </div>
        <span className="text-white/80 text-xs truncate max-w-xs">
          {liveStream?.title ?? "Stream active"}
        </span>
        <span className="text-red-300/60 font-mono text-xs hidden sm:block">{streamDuration}</span>
        <span className="text-white/40 text-xs hidden sm:block">•</span>
        <span className="text-white/50 text-xs hidden sm:block capitalize">{liveStream?.platform ?? "YouTube"}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1 text-xs text-red-300 hover:text-white transition-colors font-mono"
          onClick={() => setLocation("/hub")}
          data-testid="btn-go-to-hub"
        >
          Stream Hub <ArrowRight className="w-3 h-3" />
        </button>
        <button
          className="text-white/40 hover:text-white/80 transition-colors ml-2"
          onClick={() => setDismissed(true)}
          data-testid="btn-dismiss-banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
