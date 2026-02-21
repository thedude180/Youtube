import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cookie, X } from "lucide-react";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setShow(true);
  }, []);

  if (!show) return null;

  const accept = () => {
    localStorage.setItem("cookie_consent", "accepted");
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setShow(false);
  };

  const decline = () => {
    localStorage.setItem("cookie_consent", "essential_only");
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center" data-testid="cookie-consent-banner">
      <Card className="max-w-lg p-4 shadow-lg border bg-card">
        <div className="flex items-start gap-3">
          <Cookie className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              We use cookies to improve your experience. Essential cookies are required for the app to function.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={accept} data-testid="button-accept-cookies">Accept All</Button>
              <Button size="sm" variant="outline" onClick={decline} data-testid="button-decline-cookies">Essential Only</Button>
            </div>
          </div>
          <button onClick={decline} className="text-muted-foreground hover:text-foreground" data-testid="button-dismiss-cookies">
            <X className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}