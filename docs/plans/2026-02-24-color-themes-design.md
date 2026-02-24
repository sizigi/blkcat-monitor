# Color Themes Design

## Context

The dashboard has a single hardcoded dark theme (GitHub Dark). Users want multiple dark color schemes. The system already uses 9 CSS custom properties (`--bg`, `--bg-secondary`, `--bg-tertiary`, `--border`, `--text`, `--text-muted`, `--accent`, `--green`, `--red`) referenced in 15 files / 313 places.

## Approach

CSS variable override via `data-theme` attribute on `<html>`. Zero JS runtime overhead for theming. localStorage persistence with inline script to prevent flash.

## Themes

Four dark themes: GitHub Dark (default), Dracula, Nord, Monokai. Each defines the same 9 CSS variables.

## Changes

### 1. `index.css` — add theme variable blocks

Three `[data-theme="..."]` blocks after `:root`. Default (GitHub Dark) stays in `:root`.

### 2. `useTheme.ts` — new hook

- Reads `blkcat:theme` from localStorage on init
- Sets `document.documentElement.dataset.theme`
- Returns `{ theme, setTheme, themes }` where `themes` is the list of available theme IDs
- Theme ID type: `"github-dark" | "dracula" | "nord" | "monokai"`

### 3. `TerminalOutput.tsx` — dynamic xterm theme

Replace hardcoded `#0d1117` / `#c9d1d9` with values read from CSS variables via `getComputedStyle`. On theme change, update `term.options.theme`.

### 4. `App.tsx` — instantiate hook, pass to Sidebar

### 5. `Sidebar.tsx` — theme switcher at bottom

Row of small colored circles (one per theme, showing its `--bg` + `--accent`), click to switch. Current theme has a border highlight. Placed above AgentManager.

### 6. `index.html` — inline script for flash prevention

```html
<script>
  const t = localStorage.getItem("blkcat:theme");
  if (t) document.documentElement.dataset.theme = t;
</script>
```
