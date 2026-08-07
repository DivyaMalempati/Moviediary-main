import { createRoot } from "react-dom/client";

import App from "./App";
import { installClerkNetworkGuard } from "./lib/clerk-network-guard";

import "./index.css";

/** Some hosts strip/omit viewport — without it phones render ~980px (desktop layout). */
function ensureMobileViewport() {
  const content = "width=device-width, initial-scale=1, viewport-fit=cover";
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    document.head.prepend(meta);
  }
  meta.setAttribute("content", content);
}

ensureMobileViewport();
installClerkNetworkGuard();

createRoot(document.getElementById("root")!).render(<App />);
