import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  tips?: string[];
  "data-testid"?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, actionHref, tips, ...props }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid={props["data-testid"] || "empty-state"}>
      <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {tips && tips.length > 0 && (
        <div className="max-w-sm w-full mb-4 space-y-1.5">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-left">
              <span className="text-xs text-primary font-bold mt-0.5">{i + 1}.</span>
              <span className="text-xs text-muted-foreground">{tip}</span>
            </div>
          ))}
        </div>
      )}
      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <a href={actionHref}>
            <Button size="sm" data-testid="button-empty-action">{actionLabel}</Button>
          </a>
        ) : (
          <Button size="sm" onClick={onAction} data-testid="button-empty-action">{actionLabel}</Button>
        )
      )}
    </div>
  );
}
