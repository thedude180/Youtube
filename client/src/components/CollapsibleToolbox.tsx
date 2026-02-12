import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface CollapsibleToolboxProps {
  title: string;
  toolCount?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}

export function CollapsibleToolbox({
  title,
  toolCount,
  children,
  defaultOpen = false,
  icon,
}: CollapsibleToolboxProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card data-testid={`toolbox-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover-elevate rounded-md"
        data-testid={`button-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon || <Sparkles className="h-5 w-5 text-primary shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            {toolCount && (
              <p className="text-xs text-muted-foreground">{toolCount} tools available</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!open && (
            <Badge variant="secondary" className="text-xs">
              Tap to expand
            </Badge>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-4">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
