import { useState, useCallback } from "react";

export type ThemeId = "github-dark" | "dracula" | "nord" | "monokai";

export const THEMES: { id: ThemeId; label: string; accent: string; bg: string }[] = [
  { id: "github-dark", label: "GitHub Dark", accent: "#58a6ff", bg: "#0d1117" },
  { id: "dracula", label: "Dracula", accent: "#bd93f9", bg: "#282a36" },
  { id: "nord", label: "Nord", accent: "#88c0d0", bg: "#2e3440" },
  { id: "monokai", label: "Monokai", accent: "#66d9ef", bg: "#272822" },
];

const STORAGE_KEY = "blkcat:theme";

function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  } catch {}
  return "github-dark";
}

function applyTheme(id: ThemeId) {
  if (id === "github-dark") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const t = loadTheme();
    applyTheme(t);
    return t;
  });

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    applyTheme(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  return { theme, setTheme, themes: THEMES };
}
