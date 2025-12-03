import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SystemInfoService } from "./services/SystemInfoService";

// Initialize system info detection early
SystemInfoService.init()
  .then((info) => {
    console.log(
      "[TermAI] System detected:",
      info.os.name,
      info.os.version,
      "|",
      info.browser.name,
      info.browser.version,
    );
  })
  .catch((err) => {
    console.warn("[TermAI] Failed to detect system info:", err);
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
