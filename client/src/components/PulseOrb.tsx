interface PulseOrbProps {
  status: "active" | "idle" | "error" | "warning";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  "data-testid"?: string;
}

const colors = {
  active: { bg: "bg-emerald-500", ring: "bg-emerald-400" },
  idle: { bg: "bg-blue-500", ring: "bg-blue-400" },
  error: { bg: "bg-red-500", ring: "bg-red-400" },
  warning: { bg: "bg-amber-500", ring: "bg-amber-400" },
};

const sizes = {
  sm: { dot: "h-2 w-2", ring: "h-2 w-2" },
  md: { dot: "h-3 w-3", ring: "h-3 w-3" },
  lg: { dot: "h-4 w-4", ring: "h-4 w-4" },
};

export function PulseOrb({ status, size = "md", label, className = "", ...props }: PulseOrbProps) {
  const c = colors[status];
  const s = sizes[size];
  const shouldPulse = status === "active";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} data-testid={props["data-testid"]}>
      <span className="relative flex shrink-0" style={{ width: size === "sm" ? 8 : size === "md" ? 12 : 16, height: size === "sm" ? 8 : size === "md" ? 12 : 16 }}>
        {shouldPulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.ring} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full ${s.dot} ${c.bg}`} />
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
