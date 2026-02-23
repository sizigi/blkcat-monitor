# Mobile Responsive UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the blkcat-monitor web dashboard fully usable on smartphones and tablets (<=768px) with a slide-out sidebar drawer, full-screen overlay panels, and touch-friendly controls.

**Architecture:** CSS media queries handle layout (sidebar drawer, full-screen panels, touch targets). A `useIsMobile()` hook handles behavioral differences (auto-close drawer, toggle state). All mobile changes are behind `@media (max-width: 768px)` — desktop layout is unchanged.

**Tech Stack:** React 19, CSS media queries, `window.matchMedia` API, Vitest + Testing Library

---

### Task 1: Create `useIsMobile` hook

**Files:**
- Create: `packages/web/src/hooks/useIsMobile.ts`
- Test: `packages/web/src/hooks/useIsMobile.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/web/src/hooks/useIsMobile.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

describe("useIsMobile", () => {
  let listeners: Array<(e: { matches: boolean }) => void>;
  let matchesMock: boolean;

  beforeEach(() => {
    listeners = [];
    matchesMock = false;
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: matchesMock,
      media: query,
      addEventListener: (_: string, cb: any) => { listeners.push(cb); },
      removeEventListener: (_: string, cb: any) => {
        listeners = listeners.filter((l) => l !== cb);
      },
    })));
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns false when viewport is wider than 768px", () => {
    matchesMock = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when viewport is 768px or narrower", () => {
    matchesMock = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when media query changes", () => {
    matchesMock = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/web && bunx vitest run src/hooks/useIsMobile.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/web/src/hooks/useIsMobile.ts
import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
      : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: { matches: boolean }) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/web && bunx vitest run src/hooks/useIsMobile.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/web/src/hooks/useIsMobile.ts packages/web/src/hooks/useIsMobile.test.ts
git commit -m "feat(web): add useIsMobile hook for responsive breakpoint"
```

---

### Task 2: Add mobile CSS to `index.css`

**Files:**
- Modify: `packages/web/src/index.css`

**Step 1: Add the mobile media query block**

Append to the end of `packages/web/src/index.css`:

```css
/* ── Mobile responsive (≤768px) ── */
@media (max-width: 768px) {
  /* Sidebar as slide-out drawer */
  .sidebar {
    position: fixed !important;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    width: 280px !important;
  }
  .sidebar.open {
    transform: translateX(0);
  }

  /* Backdrop behind drawer */
  .sidebar-backdrop {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }

  /* Mobile top bar */
  .mobile-topbar {
    display: flex !important;
  }

  /* Hide desktop resize handle */
  .sidebar-resize-handle {
    display: none !important;
  }

  /* Full-screen panel overlay */
  .panel-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    z-index: 50 !important;
  }

  /* Panel tab bar: hide desktop tab strip */
  .panel-tabs-desktop {
    display: none !important;
  }

  /* Touch-friendly chat buttons */
  .chat-buttons button {
    min-height: 44px;
    min-width: 44px;
    padding: 8px 14px !important;
    font-size: 14px !important;
  }
}

/* Hidden by default (for desktop) */
.sidebar-backdrop {
  display: none;
}
.mobile-topbar {
  display: none !important;
}
```

**Step 2: Verify CSS is valid**

Run: `cd packages/web && bunx vite build 2>&1 | tail -5`
Expected: Build succeeds (CSS is bundled by Vite)

**Step 3: Commit**

```bash
git add packages/web/src/index.css
git commit -m "feat(web): add mobile responsive CSS with drawer and overlay styles"
```

---

### Task 3: Wire `useIsMobile` into App.tsx — mobile top bar + sidebar drawer

**Files:**
- Modify: `packages/web/src/App.tsx`

**Step 1: Import hook and add mobile state**

At the top of App.tsx, add import:
```typescript
import { useIsMobile } from "./hooks/useIsMobile";
```

Inside `App()`, add:
```typescript
const isMobile = useIsMobile();
const [drawerOpen, setDrawerOpen] = useState(false);
```

**Step 2: Wrap Sidebar with drawer classes on mobile**

Replace the existing sidebar rendering block (lines 98-146) with logic that:
- On mobile: renders `<aside className={`sidebar ${drawerOpen ? "open" : ""}`}>` wrapping Sidebar, plus a `.sidebar-backdrop` div when open
- On desktop: renders Sidebar as before (unchanged)

The Sidebar's `onSelectSession` callback should call `setDrawerOpen(false)` when mobile.

**Step 3: Add mobile top bar**

Before `<main>`, add a `div.mobile-topbar` that contains:
- Hamburger button (☰) → `setDrawerOpen(true)`
- Active session name (from `selectedSessionName`)
- Panel tab buttons (Events with notification count, Notifications, Skills)

**Step 4: Hide desktop panel tabs on mobile**

Add `className="panel-tabs-desktop"` to the existing desktop panel tab `<div>` (line 248-278) so CSS hides it on mobile.

**Step 5: Add `className="sidebar-resize-handle"` to resize divider**

Add the class to the resize handle div (line 134) so CSS hides it on mobile.

**Step 6: Make panels full-screen on mobile**

Add `className="panel-overlay"` to the panel content wrappers. On mobile, CSS makes them full-screen. Each panel (EventFeed, NotificationList, SkillsMatrix) should get a close/back button visible only on mobile.

**Step 7: Verify manually**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): add mobile drawer, top bar, and full-screen panels"
```

---

### Task 4: Add close button to panel components for mobile

**Files:**
- Modify: `packages/web/src/components/EventFeed.tsx`
- Modify: `packages/web/src/components/NotificationList.tsx`
- Modify: `packages/web/src/components/SkillsMatrix.tsx`

**Step 1: Add `onClose` prop to EventFeed and NotificationList**

EventFeed currently has no `onClose` prop. Add it:
```typescript
interface EventFeedProps {
  // ... existing
  onClose?: () => void;
}
```

In the header bar, add a close button (shown via CSS only on mobile):
```tsx
{onClose && (
  <button onClick={onClose} className="panel-close-btn" style={{
    background: "none", border: "none", color: "var(--text-muted)",
    cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 6px",
  }}>✕</button>
)}
```

Do the same for NotificationList. SkillsMatrix already has `onClose`.

**Step 2: Pass `onClose` from App.tsx**

Pass `onClose={() => setPanelTab(null)}` to EventFeed and NotificationList in App.tsx.

**Step 3: Commit**

```bash
git add packages/web/src/components/EventFeed.tsx packages/web/src/components/NotificationList.tsx packages/web/src/App.tsx
git commit -m "feat(web): add close button to panel components for mobile overlay"
```

---

### Task 5: Make ChatInput touch-friendly

**Files:**
- Modify: `packages/web/src/components/ChatInput.tsx`
- Test: `packages/web/src/components/ChatInput.test.tsx`

**Step 1: Add `className="chat-buttons"` to the key buttons container**

In ChatInput.tsx, the key buttons `<div>` (line 48) gets `className="chat-buttons"`:
```tsx
<div className="chat-buttons" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
```

The CSS media query in index.css already handles making buttons 44px on mobile.

**Step 2: Verify existing tests still pass**

Run: `cd packages/web && bunx vitest run src/components/ChatInput.test.tsx`
Expected: PASS (4 tests)

**Step 3: Commit**

```bash
git add packages/web/src/components/ChatInput.tsx
git commit -m "feat(web): add touch-friendly class to chat key buttons"
```

---

### Task 6: Add `className="sidebar"` to Sidebar component

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`

**Step 1: Add className to the aside element**

In Sidebar.tsx line 57, change:
```tsx
<aside style={{ ... }}>
```
to:
```tsx
<aside className="sidebar" style={{ ... }}>
```

Note: On desktop, the `.sidebar` class has no effect (styles only apply inside `@media (max-width: 768px)`). On mobile, App.tsx controls the `open` class and handles drawer positioning.

**Step 2: Verify existing tests pass**

Run: `cd packages/web && bunx vitest run src/components/Sidebar.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx
git commit -m "feat(web): add sidebar class for mobile drawer styling"
```

---

### Task 7: Run full test suite and verify

**Files:** None (verification only)

**Step 1: Run backend tests**

Run: `bun test`
Expected: All backend tests pass (no backend changes)

**Step 2: Run web tests**

Run: `cd packages/web && bunx vitest run`
Expected: All web tests pass (including new useIsMobile tests)

**Step 3: Verify build**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds

---

### Task 8: Update README and commit

**Files:**
- Modify: `README.md`

**Step 1: Add mobile section to Dashboard Features**

After the existing bullet points in "## Dashboard Features", add:
```markdown
- **Mobile responsive** — on screens ≤768px, the sidebar becomes a slide-out drawer (hamburger menu), panels open as full-screen overlays, and key buttons are touch-sized (44px). The terminal reflows to fit the narrower screen width.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add mobile responsive feature to README"
```
