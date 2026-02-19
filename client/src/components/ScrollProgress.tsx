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
      className="fixed top-[2px] left-0 right-0 z-[99] h-[2px] pointer-events-none"
      data-testid="scroll-progress"
    >
      <div
        className="h-full bg-primary/40 transition-[width] duration-75 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
