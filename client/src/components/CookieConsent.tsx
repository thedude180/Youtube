import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  const handleConsent = (type: string) => {
    localStorage.setItem("cookie_consent", type);
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t"
      data-testid="cookie-consent-banner"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3">
        <Cookie className="h-5 w-5 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground text-center sm:text-left flex-1">
          We use cookies to improve your experience. By using CreatorOS, you agree to our{" "}
          <a href="/legal?tab=privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleConsent("essential")}
            data-testid="button-cookie-essential"
          >
            Essential Only
          </Button>
          <Button
            size="sm"
            onClick={() => handleConsent("all")}
            data-testid="button-cookie-accept"
          >
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
