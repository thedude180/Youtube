import { useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface UndoToastOptions {
  title: string;
  description?: string;
  duration?: number;
  onUndo: () => void | Promise<void>;
}

export function useUndoToast() {
  const { toast } = useToast();
  const undoRef = useRef(false);

  const showUndoToast = useCallback((opts: UndoToastOptions) => {
    undoRef.current = false;
    const { title, description, duration = 5000, onUndo } = opts;

    const { dismiss } = toast({
      title,
      description: description || "This action can be undone",
      duration,
      action: (
        <button
          data-testid="button-undo"
          onClick={() => {
            undoRef.current = true;
            dismiss();
            onUndo();
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-background hover-elevate whitespace-nowrap"
        >
          Undo
        </button>
      ) as any,
    });

    return { dismiss, wasUndone: () => undoRef.current };
  }, [toast]);

  return { showUndoToast };
}
