import { useState, useEffect, useCallback } from 'react';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { useDodi } from '@/contexts/DodiContext';
import { Wifi, WifiOff, Loader, AlertCircle, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/notifications';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const { state } = usePeerConnection();
  const { isPaired } = useDodi();
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const [persistedError, setPersistedError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');

  const updatePermissionStatus = useCallback(async () => {
    const status = await getNotificationPermission();
    setNotifPermission(status);
  }, []);

  const handleEnableNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const granted = await requestNotificationPermission();
    await updatePermissionStatus();
    if (granted) {
      const { registerPushWithNotifyServer } = await import('@/lib/push-register');
      await registerPushWithNotifyServer();
      toast({
        title: "Notifications Enabled",
        description: "You will now receive alerts for new messages.",
      });
    } else {
      toast({
        title: "Permission Denied",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    updatePermissionStatus();
  }, [updatePermissionStatus]);

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
        description: 'Reconnecting to your partner… Messages will send when the connection is back.',
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
      description: 'Direct device-to-device—no servers. We\'ll keep trying to connect.',
      pulse: false,
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      {notifPermission === 'default' && (
        <button
          onClick={handleEnableNotifications}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          title="Enable Notifications"
        >
          <Bell className="w-3 h-3 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Enable Alerts</span>
        </button>
      )}
      
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
            <p className="text-xs opacity-90">{config.description === 'P2P secure connection active' ? 'Direct P2P – no server involved' : config.description}</p>
            {!state.connected && (
              <p className="text-[10px] opacity-70 italic">
                P2P works differently: connection is only between your two devices. If it drops, we keep trying automatically.
              </p>
            )}
            {state.peerId && (
              <p className="text-xs opacity-75 font-mono">
                ID: {state.peerId.substring(0, 8)}...
              </p>
            )}
            <p className="text-[10px] opacity-50 pt-1 border-t mt-1">
              Notifications: {notifPermission.toUpperCase()}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
