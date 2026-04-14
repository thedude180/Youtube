import { useState, useEffect } from "react";

export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const handleScroll = () => {
      const scrollHeight = main.scrollHeight - main.clientHeight;
      if (scrollHeight <= 0) {
        setProgress(0);
        return;
      }
      setProgress((main.scrollTop / scrollHeight) * 100);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  if (progress < 1) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[98] h-[1.5px] pointer-events-none"
      data-testid="scroll-progress"
    >
      <div
        className="h-full transition-[width] duration-100 ease-linear rounded-r-full"
        style={{
          width: `${progress}%`,
          background: "hsl(var(--primary) / 0.3)",
        }}
      />
    </div>
  );
}
