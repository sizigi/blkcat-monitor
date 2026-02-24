import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const svg = (size: number, props: IconProps, children: React.ReactNode) => (
  <svg
    width={props.size ?? size}
    height={props.size ?? size}
    viewBox={`0 0 ${size} ${size}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...props.style }}
  >
    {children}
  </svg>
);

/** ✕  Close / remove */
export function X(props: IconProps) {
  return svg(24, props, <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>);
}

/** ✓  Check / success */
export function Check(props: IconProps) {
  return svg(24, props, <polyline points="20 6 9 17 4 12" />);
}

/** ⚙  Settings / gear */
export function Settings(props: IconProps) {
  return svg(24, props, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>);
}

/** 🔔  Bell / notifications */
export function Bell(props: IconProps) {
  return svg(24, props, <>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </>);
}

/** 📋  Clipboard / events */
export function ClipboardList(props: IconProps) {
  return svg(24, props, <>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <line x1="12" y1="11" x2="12" y2="11.01" />
    <line x1="12" y1="16" x2="12" y2="16.01" />
  </>);
}

/** 📁  Folder */
export function Folder(props: IconProps) {
  return svg(24, props, <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />);
}

/** ↻  Rotate / reload */
export function RotateCw(props: IconProps) {
  return svg(24, props, <>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </>);
}

/** ⠿  Grip dots / drag handle */
export function GripDots(props: IconProps) {
  return svg(24, props, <>
    <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
  </>);
}

/** ‹‹  Chevrons left / collapse */
export function ChevronsLeft(props: IconProps) {
  return svg(24, props, <>
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </>);
}

/** ☰  Menu / hamburger */
export function Menu(props: IconProps) {
  return svg(24, props, <>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </>);
}

/** ✏  Pencil / edit */
export function Pencil(props: IconProps) {
  return svg(24, props, <>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </>);
}

/** +  Plus / add */
export function Plus(props: IconProps) {
  return svg(24, props, <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

/** ⇑  Double chevron up / scroll to top */
export function ChevronsUp(props: IconProps) {
  return svg(24, props, <>
    <polyline points="17 11 12 6 7 11" />
    <polyline points="17 18 12 13 7 18" />
  </>);
}

/** ⇧  Chevron up / page up */
export function ChevronUp(props: IconProps) {
  return svg(24, props, <polyline points="18 15 12 9 6 15" />);
}

/** ⇩  Chevron down / page down */
export function ChevronDown(props: IconProps) {
  return svg(24, props, <polyline points="6 9 12 15 18 9" />);
}

/** ⇓  Double chevron down / scroll to bottom */
export function ChevronsDown(props: IconProps) {
  return svg(24, props, <>
    <polyline points="7 13 12 18 17 13" />
    <polyline points="7 6 12 11 17 6" />
  </>);
}

/** ⊞  Maximize / resize */
export function Maximize(props: IconProps) {
  return svg(24, props, <>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </>);
}

/** ↕  Arrow up-down / scroll history */
export function ArrowUpDown(props: IconProps) {
  return svg(24, props, <>
    <line x1="12" y1="3" x2="12" y2="21" />
    <polyline points="8 7 12 3 16 7" />
    <polyline points="8 17 12 21 16 17" />
  </>);
}

/** —  Minus / unavailable */
export function Minus(props: IconProps) {
  return svg(24, props, <line x1="5" y1="12" x2="19" y2="12" />);
}
