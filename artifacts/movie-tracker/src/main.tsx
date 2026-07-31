import { createRoot } from "react-dom/client";

import App from "./App";
import { installClerkNetworkGuard } from "./lib/clerk-network-guard";

import "./index.css";

installClerkNetworkGuard();

createRoot(document.getElementById("root")!).render(<App />);
