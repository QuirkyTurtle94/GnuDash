"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const STORAGE_KEY = "gnudash-theme";

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
  mounted: false,
});

// useSyncExternalStore with a no-op subscription gives us a clean "is this
// the client after hydration?" signal: returns false during SSR and the
// first client render, true on every render after hydration. Using this in
// place of useEffect+setState avoids the react-hooks/set-state-in-effect
// lint error while serving the same purpose.
const subscribeNoop = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializers read from localStorage / the pre-hydration .dark class
  // so the provider starts with the correct theme on the client without a
  // setState-in-effect round trip. On the server these return safe defaults
  // ("system" / "light"); the inline <head> script (in the root layout) has
  // already applied the correct class to <html> before React hydrates, so
  // no flash occurs even though React's state starts defaulted.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const mounted = useMounted();

  // Apply the .dark class whenever the effective theme changes, and follow
  // the OS preference when theme === "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const next: ResolvedTheme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      setResolvedTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    resolve();
    if (theme === "system") {
      media.addEventListener("change", resolve);
      return () => media.removeEventListener("change", resolve);
    }
  }, [theme]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  // Plain light ↔ dark flip. If currently following "system", this anchors
  // to the opposite of whatever is resolved right now so a click always
  // changes something visible.
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, mounted }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
