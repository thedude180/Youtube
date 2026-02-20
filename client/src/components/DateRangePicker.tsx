import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

const PRESETS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "1y", value: 365 },
  { label: "All", value: 0 },
];

export function DateRangePicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="date-range-picker">
      <Calendar className="h-4 w-4 text-muted-foreground mr-1" />
      {PRESETS.map(p => (
        <Button
          key={p.value}
          size="sm"
          variant={value === p.value ? "default" : "ghost"}
          onClick={() => onChange(p.value)}
          data-testid={`button-range-${p.label}`}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
