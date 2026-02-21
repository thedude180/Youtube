interface PulseOrbProps {
  status: "active" | "idle" | "error" | "warning";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  "data-testid"?: string;
}

const colors = {
  active: { bg: "bg-emerald-500", ring: "bg-emerald-400", glow: "shadow-emerald-500/40" },
  idle: { bg: "bg-blue-500", ring: "bg-blue-400", glow: "shadow-blue-500/40" },
  error: { bg: "bg-red-500", ring: "bg-red-400", glow: "shadow-red-500/40" },
  warning: { bg: "bg-amber-500", ring: "bg-amber-400", glow: "shadow-amber-500/40" },
};

const sizes = {
  sm: { dot: "h-2 w-2", ring: "h-2 w-2", shadow: "shadow-[0_0_6px]" },
  md: { dot: "h-3 w-3", ring: "h-3 w-3", shadow: "shadow-[0_0_10px]" },
  lg: { dot: "h-4 w-4", ring: "h-4 w-4", shadow: "shadow-[0_0_14px]" },
};

export function PulseOrb({ status, size = "md", label, className = "", ...props }: PulseOrbProps) {
  const c = colors[status];
  const s = sizes[size];
  const shouldPulse = status === "active";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} data-testid={props["data-testid"]}>
      <span className="relative flex shrink-0" style={{ width: size === "sm" ? 8 : size === "md" ? 12 : 16, height: size === "sm" ? 8 : size === "md" ? 12 : 16 }}>
        {shouldPulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.ring} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full ${s.dot} ${c.bg} ${s.shadow} ${c.glow}`} />
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
