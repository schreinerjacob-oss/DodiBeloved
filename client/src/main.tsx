import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function normalizeError(thrown: unknown): { message: string; stack: string | null } {
  if (thrown instanceof Error) {
    return { message: thrown.message, stack: thrown.stack ?? null };
  }
  if (typeof thrown === "string") return { message: thrown, stack: null };
  if (typeof thrown === "object" && thrown !== null && "message" in thrown && typeof (thrown as { message: unknown }).message === "string") {
    const o = thrown as { message: string; stack?: unknown };
    return { message: o.message, stack: typeof o.stack === "string" ? o.stack : null };
  }
  try {
    return { message: String(thrown), stack: null };
  } catch {
    return { message: "Unknown error", stack: null };
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error != null) {
      const { message, stack } = normalizeError(this.state.error);
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 480 }}>
          <h2 style={{ color: '#b91c1c', marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ background: '#fef2f2', padding: 12, overflow: 'auto', fontSize: 12 }}>
            {message}
          </pre>
          {stack && <p style={{ marginTop: 12, fontSize: 14 }}>{stack}</p>}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              backgroundColor: '#b91c1c',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
