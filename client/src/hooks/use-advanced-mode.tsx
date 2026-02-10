import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface AdvancedModeContextType {
  isAdvanced: boolean;
  toggleAdvanced: () => void;
}

const AdvancedModeContext = createContext<AdvancedModeContextType>({
  isAdvanced: false,
  toggleAdvanced: () => {},
});

export function AdvancedModeProvider({ children }: { children: ReactNode }) {
  const [isAdvanced, setIsAdvanced] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("creatoros-advanced") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("creatoros-advanced", String(isAdvanced));
  }, [isAdvanced]);

  const toggleAdvanced = () => setIsAdvanced((v) => !v);

  return (
    <AdvancedModeContext.Provider value={{ isAdvanced, toggleAdvanced }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  return useContext(AdvancedModeContext);
}
