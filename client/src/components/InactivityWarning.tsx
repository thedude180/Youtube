import { useEffect } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InactivityWarningProps {
  open: boolean;
  secondsLeft: number;
  onStayLoggedIn: () => void;
  onSignOut: () => void;
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

export function InactivityWarning({
  open,
  secondsLeft,
  onStayLoggedIn,
  onSignOut,
}: InactivityWarningProps) {
  useEffect(() => {
    if (secondsLeft <= 0 && open) onSignOut();
  }, [secondsLeft, open, onSignOut]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        className="max-w-sm"
        data-testid="dialog-inactivity-warning"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Still there?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              You've been inactive for a while. For your security, you'll be
              signed out automatically.
            </span>
            <span
              className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground"
              data-testid="text-inactivity-countdown"
            >
              <Clock className="h-4 w-4 text-muted-foreground" />
              {formatSeconds(secondsLeft)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onSignOut}
            data-testid="button-inactivity-signout"
          >
            Sign out
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onStayLoggedIn}
            data-testid="button-inactivity-stay"
          >
            Stay logged in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
