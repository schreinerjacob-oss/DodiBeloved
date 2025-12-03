// Global polyfills for PeerJS/Simple-Peer WebRTC libraries
import 'events';
import 'util';

if (!globalThis.global) {
  (globalThis as any).global = globalThis;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
