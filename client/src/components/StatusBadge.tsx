import { cn } from "@/lib/utils";

type StatusType = "ingested" | "processing" | "ready" | "scheduled" | "uploaded" | "published" | "failed" | "completed" | "pending";

const variants: Record<StatusType, string> = {
  ingested: "bg-blue-500/15 text-blue-500 border-blue-500/20",
  processing: "bg-amber-500/15 text-amber-500 border-amber-500/20 animate-pulse",
  ready: "bg-purple-500/15 text-purple-500 border-purple-500/20",
  scheduled: "bg-cyan-500/15 text-cyan-500 border-cyan-500/20",
  uploaded: "bg-green-500/15 text-green-500 border-green-500/20",
  published: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  completed: "bg-green-500/15 text-green-500 border-green-500/20",
  failed: "bg-red-500/15 text-red-500 border-red-500/20",
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const labels: Record<StatusType, string> = {
  ingested: "New Ingest",
  processing: "Processing",
  ready: "Ready",
  scheduled: "Scheduled",
  uploaded: "Uploaded",
  published: "Published",
  completed: "Done",
  failed: "Failed",
  pending: "Pending",
};

export function StatusBadge({ status }: { status: string }) {
  // Safe cast or fallback
  const normalizedStatus = (Object.keys(variants).includes(status) ? status : "pending") as StatusType;

  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5",
      variants[normalizedStatus]
    )}>
      <span className="relative flex h-1.5 w-1.5">
        {["processing", "ready"].includes(normalizedStatus) && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
        )}
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
      </span>
      {labels[normalizedStatus]}
    </span>
  );
}
