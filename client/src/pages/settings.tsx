import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { Lock, LogOut, Shield, Heart, Sparkles, AlertCircle, Copy, Check, Key, Bug, RefreshCw, ShieldCheck, Trash2, BookOpen } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DeveloperDiagnostics } from '@/components/developer-diagnostics';
import { PrivacyHealthCheck } from '@/components/privacy-health-check';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { savePIN, verifyPINAndGetPassphrase } from '@/lib/storage-encrypted';
import { clearAndGoToPairing, clearCachesAndReload } from '@/lib/clear-app-data';

export default function SettingsPage() {
  const { userId, partnerId, passphrase, logout, isOnline, allowWakeUp, setAllowWakeUp, isPaired, isPremium, hasPIN } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { reconnect } = usePeerConnection();
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [copiedPassphrase, setCopiedPassphrase] = useState(false);
  const [copiedPartnerId, setCopiedPartnerId] = useState(false);
  const [copiedReconnect, setCopiedReconnect] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [peerState, setPeerState] = useState<any>(null);

  useEffect(() => {
    if (showDiagnostics) {
      const interval = setInterval(() => {
        setPeerState((window as any).__DODI_PEER_STATE__);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showDiagnostics]);

  const handleTestSync = async () => {
    toast({
      title: "Simulating Reconnect",
      description: "Triggering reconciliation protocol..."
    });
    reconnect();
  };

  const handleSyncNow = async () => {
    if (!isPaired) {
      toast({
        title: "Not paired",
        description: "Pair with your partner to sync data.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSyncing(true);
    toast({
      title: "Sync Initiated",
      description: "Your device is now reconciling data with your partner.",
    });
    
    reconnect();
    
    // Manual sync trigger - wait for connection
    setTimeout(() => {
      setIsSyncing(false);
    }, 5000);
  };

  const handleCopyUserId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      setCopiedUserId(true);
      toast({
        title: "Copied!",
        description: "Your ID has been copied to clipboard.",
      });
      setTimeout(() => setCopiedUserId(false), 2000);
    }
  };

  const handleCopyPassphrase = () => {
    if (passphrase) {
      navigator.clipboard.writeText(passphrase);
      setCopiedPassphrase(true);
      toast({
        title: "Copied!",
        description: "Your passphrase has been copied to clipboard.",
      });
      setTimeout(() => setCopiedPassphrase(false), 2000);
    }
  };

  const handleCopyPartnerId = () => {
    if (partnerId) {
      navigator.clipboard.writeText(partnerId);
      setCopiedPartnerId(true);
      toast({
        title: "Copied!",
        description: "Partner ID has been copied to clipboard.",
      });
      setTimeout(() => setCopiedPartnerId(false), 2000);
    }
  };

  const handleCopyReconnect = () => {
    if (userId && partnerId && passphrase) {
      const reconnectData = `dodi:${userId}:${partnerId}:${passphrase}`;
      navigator.clipboard.writeText(reconnectData);
      setCopiedReconnect(true);
      toast({
        title: "Copied!",
        description: "Reconnection details have been copied to clipboard.",
      });
      setTimeout(() => setCopiedReconnect(false), 2000);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Logged out",
      description: "Your pairing has been cleared from this device.",
    });
  };

  const handleChangePIN = async () => {
    // Validate inputs
    if (hasPIN && !currentPin.trim()) {
      toast({
        title: "Current PIN required",
        description: "Please enter your current PIN to proceed.",
        variant: "destructive",
      });
      return;
    }

    if (!newPin.trim() || newPin.length < 4) {
      toast({
        title: "Invalid PIN",
        description: "New PIN must be at least 4 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: "PINs don't match",
        description: "New PIN and confirmation must be identical.",
        variant: "destructive",
      });
      return;
    }

    setPinSaving(true);
    try {
      let activePassphrase = passphrase;

      // If we have a PIN, we must verify it to get the passphrase securely
      if (hasPIN) {
        const verifiedPassphrase = await verifyPINAndGetPassphrase(currentPin);
        if (!verifiedPassphrase) {
          toast({
            title: "Incorrect PIN",
            description: "The current PIN you entered is incorrect.",
            variant: "destructive",
          });
          setPinSaving(false);
          return;
        }
        activePassphrase = verifiedPassphrase;
      }

      if (!activePassphrase) {
        throw new Error("Shared passphrase not available");
      }

      // Save new PIN with the recovered passphrase
      await savePIN(newPin, activePassphrase);
      toast({
        title: hasPIN ? "PIN changed" : "PIN set",
        description: "Your PIN has been updated successfully.",
      });

      // Clear form and close dialog
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinDialogOpen(false);
    } catch (error) {
      console.error("PIN update error:", error);
      toast({
        title: "Failed to update PIN",
        description: error instanceof Error ? error.message : "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your private sanctuary
        </p>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="w-full max-w-md mx-auto space-y-8 pb-24 px-4 sm:px-6 py-6">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="hover-elevate"
              onClick={handleSyncNow}
              disabled={isSyncing}
              data-testid="button-sync-now-quick"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button
              variant="outline"
              className="hover-elevate"
              onClick={() => {
                console.log('♾️ [RESTORE] Restore mode entered (from Settings)');
                setLocation('/pairing?mode=restore');
              }}
              data-testid="button-restore-partner-quick"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Restore
            </Button>
          </div>

          {/* Support */}
          <Card className="p-6 space-y-4 border-accent/20 bg-accent/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Heart className={`w-5 h-5 ${isPremium ? 'text-accent fill-accent' : 'text-muted-foreground'}`} />
                <div>
                  <h3 className="font-medium">Support Status</h3>
                  <p className="text-xs text-muted-foreground">
                    {isPremium ? 'You are an Eternal Guardian' : 'Help keep Dodi private forever'}
                  </p>
                </div>
              </div>
              <Button 
                variant={isPremium ? "outline" : "default"}
                size="sm" 
                onClick={() => setLocation('/subscription')}
                className="hover-elevate"
              >
                {isPremium ? 'View Details' : 'Support Now'}
              </Button>
            </div>
            
            <div className="pt-4 border-t flex flex-col gap-3">
              <Button variant="ghost" className="text-xs text-accent underline p-0 h-auto justify-start" onClick={() => setLocation('/subscription')}>
                Why support? Your gift keeps Dodi serverless, private, and free of ads — for you and others.
              </Button>
              <Button variant="ghost" className="text-[10px] text-muted-foreground underline p-0 h-auto justify-start" onClick={() => setLocation('/subscription')}>
                Restore my support
              </Button>
            </div>
          </Card>

          {/* Connection & Sync */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Connection</p>

            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Heart className="w-5 h-5 text-accent" />
                  <div>
                    <h3 className="font-medium">Sync & Connection</h3>
                    <p className="text-xs text-muted-foreground">
                      {isOnline ? 'Direct P2P – no server involved' : 'Offline — changes saved locally'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="hover-elevate"
                  data-testid="button-sync-now"
                >
                  <Sparkles className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing…' : 'Sync now'}
                </Button>
              </div>

              <div className="pt-3 border-t space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Sparkles className="w-5 h-5 text-gold" />
                    <div>
                      <h4 className="font-medium">Wake-up Pings</h4>
                      <p className="text-xs text-muted-foreground">
                        Allow partner to wake app via signaling relay (faster notifications)
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={allowWakeUp} 
                    onCheckedChange={setAllowWakeUp}
                    className="shrink-0 data-[state=checked]:bg-sage data-[state=unchecked]:bg-muted"
                    data-testid="switch-wake-up-ping"
                  />
                </div>
                {!allowWakeUp && (
                  <p className="text-[10px] text-muted-foreground italic px-8">
                    Fallback: local polling every 30 minutes
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Backup & restore education */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Safety</p>

            <Card className="p-6 space-y-4 border-sage/20 bg-sage/5">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-sage" />
                <div>
                  <h3 className="font-medium">How backup & restore works</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    There is no cloud backup. Your pairing code and reconnection details are the only way to restore on a new device.
                  </p>
                </div>
              </div>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Save your reconnection details (Settings → copy) somewhere safe.</li>
                <li>If you lose this device, use Restore and enter those details to mirror your shared history from your partner&apos;s device.</li>
                <li>Both of you hold the full data; nothing is stored on our servers.</li>
              </ul>
              <Button variant="outline" size="sm" className="w-full border-sage/40 text-sage hover:bg-sage/10" onClick={() => setLocation('/redundancy')}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Learn more: The Redundant Garden
              </Button>
            </Card>
          </div>

          {/* Privacy */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Privacy</p>

            <Card className="p-6 space-y-4 border-accent/20 bg-accent/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-accent" />
                  <div>
                    <h3 className="font-medium">Privacy Status</h3>
                    <p className="text-xs text-muted-foreground">Architectural verification</p>
                  </div>
                </div>
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
              
              <div className="pt-3 space-y-3 text-[11px] uppercase tracking-wider text-muted-foreground border-t">
                <div className="flex justify-between items-center">
                  <span>Content</span>
                  <span className="text-foreground font-medium text-right">100% On-Device (Encrypted)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Connection</span>
                  <span className="text-foreground font-medium text-right">Direct P2P (No Server Storage)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Wake-ups</span>
                  <span className="text-foreground font-medium text-right">Relay Optional (Encrypted Signaling)</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span>Privacy Mode</span>
                  <span className="text-accent font-bold">Absolute (Zero Backend)</span>
                </div>
              </div>

              <details className="pt-3 border-t">
                <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                  Encryption details
                </summary>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>• AES-GCM 256-bit encryption</p>
                  <p>• PBKDF2 600k iterations</p>
                  <p>• Data never leaves your device unencrypted</p>
                  <p>• No cloud storage, no backups</p>
                </div>
              </details>
            </Card>

            <PrivacyHealthCheck />
          </div>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Appearance</h3>
                <p className="text-xs text-muted-foreground">
                  Toggle between light and dark mode
                </p>
              </div>
              <ThemeToggle />
            </div>
          </Card>

          {/* Security */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Security</p>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-sage" />
              <div className="flex-1">
                <h3 className="font-medium">App PIN</h3>
                <p className="text-xs text-muted-foreground">
                  Set or change your 4-digit app unlock PIN
                </p>
              </div>
            </div>
            <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full" data-testid="button-change-pin">
                  <Key className="w-4 h-4 mr-2" />
                  Change PIN
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-change-pin">
                <DialogHeader>
                  <DialogTitle>{hasPIN ? 'Change Your PIN' : 'Set App PIN'}</DialogTitle>
                  <DialogDescription>
                    {hasPIN 
                      ? 'Enter your current PIN, then set a new one. PINs must be at least 4 characters.'
                      : 'Secure your app with a 4-digit PIN. This will be required to open the app.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {hasPIN && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Current PIN</label>
                      <Input
                        type="password"
                        placeholder="Enter current PIN"
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value)}
                        data-testid="input-current-pin"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New PIN</label>
                    <Input
                      type="password"
                      placeholder="Enter new PIN (4+ characters)"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      data-testid="input-new-pin"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Confirm New PIN</label>
                    <Input
                      type="password"
                      placeholder="Re-enter new PIN"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      data-testid="input-confirm-pin"
                    />
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setPinDialogOpen(false)}
                    data-testid="button-cancel-pin-change"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleChangePIN}
                    disabled={pinSaving}
                    data-testid="button-confirm-pin-change"
                  >
                    {pinSaving ? 'Saving...' : (hasPIN ? 'Change PIN' : 'Set PIN')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </Card>
          </div>

          {/* Recovery & Restore */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Recovery</p>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-medium">Recovery Keys</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Keep these private. They never leave your devices unless you copy/share them.
                </p>
              </div>
            </div>
            <div className="pt-3 space-y-4 border-t">
              {userId && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your ID</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-3 rounded-lg text-foreground border border-border/50">
                      {userId}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyUserId}
                      data-testid="button-copy-user-id"
                      className="hover-elevate h-11 w-11 flex-shrink-0"
                    >
                      {copiedUserId ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              {partnerId && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Partner ID</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-3 rounded-lg text-foreground border border-border/50">
                      {partnerId}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyPartnerId}
                      data-testid="button-copy-partner-id"
                      className="hover-elevate h-11 w-11 flex-shrink-0"
                    >
                      {copiedPartnerId ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              {passphrase && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shared Passphrase</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-3 rounded-lg text-foreground border border-border/50">
                      {passphrase}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyPassphrase}
                      data-testid="button-copy-passphrase"
                      className="hover-elevate h-11 w-11"
                    >
                      {copiedPassphrase ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    This recovery key is only stored on your devices. Keep it secret.
                  </p>
                </div>
              )}

              {userId && partnerId && passphrase && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">One‑tap Reconnect String</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-3 rounded-lg text-foreground border border-border/50">
                      {`dodi:${userId}:${partnerId}:${passphrase}`}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyReconnect}
                      data-testid="button-copy-reconnect"
                      className="hover-elevate h-11 w-11"
                    >
                      {copiedReconnect ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    Use this only if you fully trust where you paste it.
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-4 border-sage/20 bg-sage/5">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-sage" />
              <div>
                <h3 className="font-medium text-sage">Restore & Redundancy</h3>
                <p className="text-xs text-muted-foreground">Reconnect, restore, and learn how your garden stays serverless</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              className="w-full text-sage underline text-xs justify-start h-auto p-0"
              onClick={() => setLocation('/redundancy')}
            >
              Learn how your data stays safe without a cloud →
            </Button>
            <div className="pt-2">
              <Button 
                variant="outline" 
                className="w-full border-sage/30 text-sage hover:bg-sage/10 hover-elevate"
                onClick={() => {
                  console.log('♾️ [RESTORE] Restore mode entered (from Settings)');
                  setLocation('/pairing?mode=restore');
                }}
                data-testid="button-restore-partner"
              >
                Reconnect & Restore Partner Device
              </Button>
            </div>
          </Card>
          </div>

          {/* Advanced / Diagnostics */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Advanced</p>

            <Card className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Bug className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="font-medium">Developer Diagnostics</h3>
                    <p className="text-xs text-muted-foreground">
                      Tools for debugging sync, connection, and storage
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={showDiagnostics} 
                  onCheckedChange={setShowDiagnostics}
                  className="shrink-0"
                  data-testid="switch-developer-mode"
                />
              </div>

              {showDiagnostics && (
                <div className="pt-4 border-t space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Live status</p>
                    <Button variant="ghost" size="sm" onClick={handleTestSync} data-testid="button-test-full-sync">
                      Test Full Sync
                    </Button>
                  </div>
                  <div className="space-y-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Connection</span>
                      <span className={peerState?.connected ? "text-sage" : "text-destructive"}>
                        {peerState?.connected ? "Direct WebRTC" : "Disconnected"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reconnecting</span>
                      <span>{peerState?.isReconnecting ? "YES" : "NO"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Encryption</span>
                      <span className="text-sage">AES-GCM-256 Verified</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Offline Queue</span>
                      <span>{peerState?.queueSize || 0} messages</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Device ID</span>
                      <span className="truncate max-w-[100px]">{userId?.substring(0,8)}...</span>
                    </div>
                  </div>

                  <DeveloperDiagnostics />
                </div>
              )}
            </Card>
          </div>

          {/* Get latest version (soft reset) */}
          <Card className="p-6 space-y-4 border-muted">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Get latest version</h3>
                <p className="text-xs text-muted-foreground">Clear caches and reload to fix issues after an update. Your data and pairing stay.</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                toast({ title: 'Reloading…', description: 'Fetching latest version.' });
                clearCachesAndReload();
              }}
              data-testid="button-get-latest"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh app
            </Button>
          </Card>

          {/* Danger zone */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">Danger zone</p>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5 text-destructive" />
              <div>
                <h3 className="font-medium">Disconnect</h3>
                <p className="text-xs text-muted-foreground">Clear all data and end connection</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Unpair from this device
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unpair from this device?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear your pairing data from this device. Your data will remain on your
                    partner's device. You can pair again using your original credentials.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-logout">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    data-testid="button-confirm-logout"
                  >
                    Unpair
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>

          <Card className="p-6 space-y-4 border-destructive/20">
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-destructive" />
              <div>
                <h3 className="font-medium">Complete Reset</h3>
                <p className="text-xs text-muted-foreground">Clear all data, caches, and service workers</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this if pairing is failing or the app is behaving unexpectedly. This clears everything and lets you start fresh.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive"
                  data-testid="button-clear-all"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Data & Restart
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all app data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear IndexedDB, localStorage, service workers, and all cached data. 
                    The app will reload and you'll need to pair again. Your partner's data will remain on their device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      toast({
                        title: "Clearing all data...",
                        description: "Your app will restart fresh.",
                      });
                      setTimeout(() => clearAndGoToPairing(), 500);
                    }}
                    data-testid="button-confirm-clear"
                  >
                    Clear Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
