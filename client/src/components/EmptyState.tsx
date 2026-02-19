import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

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
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    if (!tips || tips.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % tips.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [tips?.length]);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid={props["data-testid"] || "empty-state"}>
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center float">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/20 animate-ping" />
      </div>
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-5">{description}</p>

      {tips && tips.length > 0 && (
        <div className="max-w-sm w-full mb-5">
          {tips.length === 1 ? (
            <div className="flex items-start gap-2.5 text-left p-3 rounded-md bg-muted/50">
              <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{tips[0]}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-start gap-2.5 text-left p-3 rounded-md bg-muted/50 transition-all duration-300">
                <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <span className="text-xs text-muted-foreground">{tips[currentTip]}</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentTip(i)}
                    className={`h-1 rounded-full transition-all duration-300 focus-visible:ring-1 focus-visible:ring-primary ${i === currentTip ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
                    aria-label={`Tip ${i + 1}`}
                    data-testid={`button-tip-${i}`}
                  />
                ))}
              </div>
            </div>
          )}
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
