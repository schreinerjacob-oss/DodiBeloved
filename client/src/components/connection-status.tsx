import { useState, useEffect } from 'react';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { useDodi } from '@/contexts/DodiContext';
import { Wifi, WifiOff, Loader, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const { state } = usePeerConnection();
  const { isPaired } = useDodi();
  const [showDetails, setShowDetails] = useState(false);
  const [persistedError, setPersistedError] = useState<string | null>(null);

  // Persist error message for 7 seconds
  useEffect(() => {
    if (state.error) {
      setPersistedError(state.error);
      const timeout = setTimeout(() => {
        setPersistedError(null);
      }, 7000);
      return () => clearTimeout(timeout);
    }
  }, [state.error]);

  if (!isPaired) return null;

  const getStatusConfig = () => {
    if (state.connected) {
      return {
        icon: Wifi,
        color: 'text-accent',
        bg: 'bg-accent/10',
        label: 'Connected',
        description: 'P2P secure connection active',
        pulse: true,
      };
    }
    if (state.isReconnecting) {
      return {
        icon: Loader,
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        label: 'Reconnecting',
        description: 'Attempting to restore connection...',
        pulse: false,
      };
    }
    if (persistedError) {
      return {
        icon: AlertCircle,
        color: 'text-destructive',
        bg: 'bg-destructive/10',
        label: 'Connection Error',
        description: persistedError,
        pulse: false,
      };
    }
    return {
      icon: WifiOff,
      color: 'text-muted-foreground',
      bg: 'bg-muted/10',
      label: 'Offline',
      description: 'Waiting for connection...',
      pulse: false,
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            'relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all',
            'hover-elevate',
            config.bg,
            'cursor-pointer'
          )}
          data-testid="button-connection-status"
        >
          <div className="relative">
            {config.pulse && (
              <div className={cn(
                'absolute inset-0 rounded-full animate-pulse',
                config.color.replace('text-', 'bg-'),
                'opacity-50'
              )} />
            )}
            <Icon className={cn('w-4 h-4 relative z-10', config.color)} />
          </div>
          <span className={cn('text-xs font-medium', config.color)}>
            {config.label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{config.label}</p>
          <p className="text-xs opacity-90">{config.description}</p>
          {state.peerId && (
            <p className="text-xs opacity-75 font-mono">
              ID: {state.peerId.substring(0, 8)}...
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
