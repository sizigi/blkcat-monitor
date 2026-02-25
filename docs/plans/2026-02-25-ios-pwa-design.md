# iOS PWA Support Design

## Goal
Make blkcat-monitor installable as a standalone PWA on iOS (Add to Home Screen) with full-screen experience, proper icons, and service worker caching of static assets.

## Components

### 1. Web App Manifest (`manifest.json`)
- name: "BLKCAT Monitor", short_name: "BLKCAT"
- display: standalone, orientation: any
- theme_color/background_color: #0d1117
- Icons: 192x192, 512x512

### 2. Service Worker (via `vite-plugin-pwa`)
- Precache all static assets (HTML, CSS, JS, images)
- Network-only for WebSocket and /api routes
- Auto-update with prompt to refresh

### 3. iOS Meta Tags (`index.html`)
- apple-mobile-web-app-capable
- apple-mobile-web-app-status-bar-style: black-translucent
- apple-touch-icon: 180x180
- theme-color meta tag

### 4. Icons
- Generate 180x180, 192x192, 512x512 from existing blkcat.png

### 5. Theme Color Sync
- Update theme-color meta tag when CSS theme changes
