import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], description: "Open command palette" },
  { keys: ["Ctrl", "Shift", "D"], description: "Toggle dark mode" },
  { keys: ["Ctrl", "Shift", "A"], description: "Toggle advanced mode" },
  { keys: ["Ctrl", "Shift", "F"], description: "Toggle focus mode" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialogs" },
];

export default function KeyboardShortcuts() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-keyboard-shortcuts">
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Keyboard Shortcuts</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="px-2 py-1 text-xs bg-muted rounded border">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}