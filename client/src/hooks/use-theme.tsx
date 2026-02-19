import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type Theme = "dark" | "light";
type ThemeMode = "manual" | "auto";

interface ThemeSchedule {
  darkStart: number;
  darkEnd: number;
}

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  schedule: ThemeSchedule;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSchedule: (schedule: ThemeSchedule) => void;
}

const DEFAULT_SCHEDULE: ThemeSchedule = { darkStart: 19, darkEnd: 7 };

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  themeMode: "manual",
  schedule: DEFAULT_SCHEDULE,
  toggleTheme: () => {},
  setThemeMode: () => {},
  setSchedule: () => {},
});

function getThemeForTime(schedule: ThemeSchedule): Theme {
  const hour = new Date().getHours();
  if (schedule.darkStart > schedule.darkEnd) {
    return (hour >= schedule.darkStart || hour < schedule.darkEnd) ? "dark" : "light";
  }
  return (hour >= schedule.darkStart && hour < schedule.darkEnd) ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("creatoros-theme-mode") as ThemeMode) || "manual";
    }
    return "manual";
  });

  const [schedule, setScheduleState] = useState<ThemeSchedule>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("creatoros-theme-schedule");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return DEFAULT_SCHEDULE;
  });

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      if ((localStorage.getItem("creatoros-theme-mode") as ThemeMode) === "auto") {
        const stored = localStorage.getItem("creatoros-theme-schedule");
        const sched = stored ? JSON.parse(stored) : DEFAULT_SCHEDULE;
        return getThemeForTime(sched);
      }
      return (localStorage.getItem("creatoros-theme") as Theme) || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("creatoros-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (themeMode !== "auto") return;
    const check = () => setTheme(getThemeForTime(schedule));
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [themeMode, schedule]);

  const toggleTheme = useCallback(() => {
    if (themeMode === "auto") {
      setThemeModeState("manual");
      localStorage.setItem("creatoros-theme-mode", "manual");
    }
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, [themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem("creatoros-theme-mode", mode);
    if (mode === "auto") {
      setTheme(getThemeForTime(schedule));
    }
  }, [schedule]);

  const setSchedule = useCallback((s: ThemeSchedule) => {
    setScheduleState(s);
    localStorage.setItem("creatoros-theme-schedule", JSON.stringify(s));
    if (themeMode === "auto") {
      setTheme(getThemeForTime(s));
    }
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={{ theme, themeMode, schedule, toggleTheme, setThemeMode, setSchedule }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
