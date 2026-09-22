"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

type Theme = "light" | "dark";

/**
 * Temporary control for reviewing the palette in both modes.
 * The real app follows the system preference unless a choice is stored.
 *
 * Reads the current theme on click rather than in an effect, so there is no
 * hydration mismatch and no cascading render.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  function toggle() {
    const root = document.documentElement;
    const current =
      (root.getAttribute("data-theme") as Theme | null) ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    const next: Theme = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="border-border bg-surface text-muted hover:text-text flex shrink-0 items-center gap-2 rounded-(--radius-control) border px-3 py-2 text-sm transition-colors"
      aria-label="Toggle colour theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      {theme === null ? "Theme" : theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
