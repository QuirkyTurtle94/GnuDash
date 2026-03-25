"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PrivacyContextType {
  hideValues: boolean;
  toggleHideValues: () => void;
}

const PrivacyContext = createContext<PrivacyContextType>({ hideValues: false, toggleHideValues: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hideValues, setHideValues] = useState(false);
  return (
    <PrivacyContext.Provider value={{ hideValues, toggleHideValues: () => setHideValues((v) => !v) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
