import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const handleScroll = () => {
      setVisible(main.scrollTop > 400);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const main = document.getElementById("main-content");
    main?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Button
      size="icon"
      variant="outline"
      onClick={scrollToTop}
      className="fixed bottom-20 md:bottom-6 right-4 z-30 shadow-md transition-all duration-200"
      style={{ visibility: visible ? "visible" : "hidden", opacity: visible ? 1 : 0 }}
      data-testid="button-back-to-top"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
