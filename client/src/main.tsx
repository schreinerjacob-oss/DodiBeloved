// Global polyfill for Simple-Peer WebRTC library
if (!globalThis.global) {
  (globalThis as any).global = globalThis;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
