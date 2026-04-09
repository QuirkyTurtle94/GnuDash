"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ClosingContextType {
  excludeClosing: boolean;
  toggleExcludeClosing: () => void;
}

const ClosingContext = createContext<ClosingContextType>({ excludeClosing: true, toggleExcludeClosing: () => {} });

export function ClosingProvider({ children }: { children: ReactNode }) {
  const [excludeClosing, setExcludeClosing] = useState(true);
  return (
    <ClosingContext.Provider value={{ excludeClosing, toggleExcludeClosing: () => setExcludeClosing((v) => !v) }}>
      {children}
    </ClosingContext.Provider>
  );
}

export function useClosing() {
  return useContext(ClosingContext);
}
