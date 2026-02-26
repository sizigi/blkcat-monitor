import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Track visual viewport height for mobile keyboard accommodation.
// Sets --app-height CSS custom property so layouts resize when the soft keyboard opens.
// This is the primary fix for iOS PWA mode where interactive-widget may not work.
if (window.visualViewport) {
  const update = () => {
    document.documentElement.style.setProperty("--app-height", `${window.visualViewport!.height}px`);
  };
  update();
  window.visualViewport.addEventListener("resize", update);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
