import { useState, useEffect } from "react";

/**
 * Tracks the height of the virtual keyboard on mobile using the visualViewport API.
 * Returns the pixel offset from the bottom of the window to the top of the keyboard.
 * Returns 0 on desktop or when no keyboard is visible.
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(Math.max(0, Math.round(kb)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
