# Color Themes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four dark color themes (GitHub Dark, Dracula, Nord, Monokai) with a switcher in the sidebar and localStorage persistence.

**Architecture:** CSS custom property overrides via `[data-theme]` selectors. A `useTheme` hook manages localStorage + `data-theme` attribute. xterm.js terminal reads colors from CSS variables. Flash prevention via inline `<script>` in `index.html`.

**Tech Stack:** CSS custom properties, React hook, localStorage, xterm.js theme API

---

### Task 1: Add theme CSS variable blocks

**Files:**
- Modify: `packages/web/src/index.css:9-19`

**Step 1: Add three `[data-theme]` blocks after the existing `:root`**

Add this immediately after the `:root { ... }` block (after line 19):

```css
[data-theme="dracula"] {
  --bg: #282a36;
  --bg-secondary: #21222c;
  --bg-tertiary: #343746;
  --border: #44475a;
  --text: #f8f8f2;
  --text-muted: #6272a4;
  --accent: #bd93f9;
  --green: #50fa7b;
  --red: #ff5555;
}

[data-theme="nord"] {
  --bg: #2e3440;
  --bg-secondary: #3b4252;
  --bg-tertiary: #434c5e;
  --border: #4c566a;
  --text: #d8dee9;
  --text-muted: #81a1c1;
  --accent: #88c0d0;
  --green: #a3be8c;
  --red: #bf616a;
}

[data-theme="monokai"] {
  --bg: #272822;
  --bg-secondary: #1e1f1a;
  --bg-tertiary: #3e3d32;
  --border: #75715e;
  --text: #f8f8f2;
  --text-muted: #75715e;
  --accent: #66d9ef;
  --green: #a6e22e;
  --red: #f92672;
}
```

**Step 2: Verify build**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds. No visual change (default theme has no `data-theme` attribute).

**Step 3: Commit**

```bash
git add packages/web/src/index.css
git commit -m "feat(web): add Dracula, Nord, Monokai CSS theme variables"
```

---

### Task 2: Create `useTheme` hook

**Files:**
- Create: `packages/web/src/hooks/useTheme.ts`

**Step 1: Write the hook**

```typescript
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
```

**Step 2: Verify build**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useTheme.ts
git commit -m "feat(web): add useTheme hook with localStorage persistence"
```

---

### Task 3: Dynamic xterm terminal theme

**Files:**
- Modify: `packages/web/src/components/TerminalOutput.tsx:202`

**Step 1: Replace hardcoded theme colors with CSS variable reader**

Replace the hardcoded `theme` in the Terminal constructor (line 202):

```typescript
// Before:
theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#c9d1d9" },

// After:
theme: (() => {
  const s = getComputedStyle(document.documentElement);
  return {
    background: s.getPropertyValue("--bg").trim() || "#0d1117",
    foreground: s.getPropertyValue("--text").trim() || "#c9d1d9",
    cursor: s.getPropertyValue("--text").trim() || "#c9d1d9",
  };
})(),
```

Also replace the hardcoded `background: "#0d1117"` on the container div (line ~530):

```typescript
// Before:
style={{ width: "100%", height: "100%", overflow: "hidden", background: "#0d1117", touchAction: "manipulation" }}

// After:
style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--bg)", touchAction: "manipulation" }}
```

**Step 2: Add a MutationObserver to sync xterm theme when `data-theme` changes**

Inside the main `useEffect` (after the terminal is created), add:

```typescript
// Sync xterm theme when data-theme attribute changes
const themeObserver = new MutationObserver(() => {
  const s = getComputedStyle(document.documentElement);
  term.options.theme = {
    background: s.getPropertyValue("--bg").trim() || "#0d1117",
    foreground: s.getPropertyValue("--text").trim() || "#c9d1d9",
    cursor: s.getPropertyValue("--text").trim() || "#c9d1d9",
  };
});
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
```

Add cleanup in the return:
```typescript
themeObserver.disconnect();
```

**Step 3: Verify build**

Run: `cd packages/web && bunx vite build`

**Step 4: Commit**

```bash
git add packages/web/src/components/TerminalOutput.tsx
git commit -m "feat(web): dynamic xterm theme synced to CSS variables"
```

---

### Task 4: Wire up App.tsx and add theme switcher to Sidebar

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/Sidebar.tsx`

**Step 1: Instantiate useTheme in App.tsx**

Add import:
```typescript
import { useTheme } from "./hooks/useTheme";
```

In the App function body (near other hooks):
```typescript
const { theme, setTheme, themes } = useTheme();
```

Add to `sidebarBaseProps`:
```typescript
currentTheme: theme,
onThemeChange: setTheme,
themes,
```

**Step 2: Add theme switcher to Sidebar**

Add new props to `SidebarProps`:
```typescript
currentTheme?: string;
onThemeChange?: (id: string) => void;
themes?: { id: string; label: string; accent: string; bg: string }[];
```

Destructure in the component.

Add the theme switcher JSX **above** the `AgentManager` block (around line 539):

```tsx
{themes && onThemeChange && (
  <div style={{
    padding: "8px 16px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  }}>
    {themes.map((t) => (
      <button
        key={t.id}
        onClick={() => onThemeChange(t.id)}
        title={t.label}
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: currentTheme === t.id ? `2px solid ${t.accent}` : "2px solid transparent",
          background: `radial-gradient(circle at 30% 30%, ${t.accent}, ${t.bg})`,
          cursor: "pointer",
          padding: 0,
          transition: "border-color 0.2s",
        }}
      />
    ))}
  </div>
)}
```

**Step 3: Verify build and test manually**

Run: `cd packages/web && bunx vite build`
Open dashboard, click theme dots in sidebar, verify colors change.

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/Sidebar.tsx
git commit -m "feat(web): theme switcher in sidebar with four dark themes"
```

---

### Task 5: Flash prevention in index.html

**Files:**
- Modify: `packages/web/index.html`

**Step 1: Add inline script before the module script**

```html
<body>
  <div id="root"></div>
  <script>
    try { var t = localStorage.getItem("blkcat:theme"); if (t) document.documentElement.dataset.theme = t; } catch(e) {}
  </script>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

**Step 2: Verify build and test**

Run: `cd packages/web && bunx vite build`
Test: Set theme to Dracula, reload page, verify no flash of GitHub Dark colors.

**Step 3: Run all tests**

Run: `cd packages/web && bunx vitest run`
Expected: All tests pass.

**Step 4: Final commit**

```bash
git add packages/web/index.html
git commit -m "feat(web): flash prevention for theme persistence"
```
