"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();

  // Render an inert placeholder on the server and during the first client
  // render. The actual icon depends on the client-only resolved theme, so
  // rendering it before hydration would cause a hydration mismatch. The
  // overall page theme is already correct thanks to the inline head script.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
      >
        <span className="block h-3.5 w-3.5" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
