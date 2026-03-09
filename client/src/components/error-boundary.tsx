import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    // Keep minimal logging; do not report externally.
    console.error('[ErrorBoundary] Unhandled error:', error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    window.location.assign('/reset');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-black/10 dark:border-white/10 rounded-xl p-6 bg-background/80 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h1 className="text-base font-semibold text-foreground">Something went wrong</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Dodi hit an unexpected error. Your data is still stored on-device. You can reload, or do a full reset if the app is stuck.
          </p>
          <div className="flex gap-3">
            <Button onClick={this.handleReload} className="flex-1" data-testid="button-error-reload">
              Reload
            </Button>
            <Button onClick={this.handleReset} variant="outline" className="flex-1" data-testid="button-error-reset">
              Reset
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error != null && (
            <pre className="text-[11px] whitespace-pre-wrap bg-muted/40 border border-border/60 rounded-lg p-3 text-muted-foreground overflow-auto max-h-40">
              {String(this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

