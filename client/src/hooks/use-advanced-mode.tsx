import { createContext, useContext, type ReactNode } from "react";

interface AdvancedModeContextType {
  isAdvanced: boolean;
  toggleAdvanced: () => void;
}

const AdvancedModeContext = createContext<AdvancedModeContextType>({
  isAdvanced: true,
  toggleAdvanced: () => {},
});

export function AdvancedModeProvider({ children }: { children: ReactNode }) {
  return (
    <AdvancedModeContext.Provider value={{ isAdvanced: true, toggleAdvanced: () => {} }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  return useContext(AdvancedModeContext);
}
