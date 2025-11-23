// Global polyfill for Simple-Peer WebRTC library
if (typeof global === 'undefined') {
  (window as any).global = window;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
