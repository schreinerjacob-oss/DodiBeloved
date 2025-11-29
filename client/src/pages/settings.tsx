import { useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { Lock, LogOut, Shield, Heart, Sparkles, AlertCircle, Copy, Check, Key } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
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
import { savePIN, verifyPIN } from '@/lib/storage-encrypted';

export default function SettingsPage() {
  const { userId, partnerId, passphrase, logout, isOnline, isTrialActive, trialDaysRemaining } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [copiedPassphrase, setCopiedPassphrase] = useState(false);
  const [copiedPartnerId, setCopiedPartnerId] = useState(false);
  const [copiedReconnect, setCopiedReconnect] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

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
    if (!currentPin.trim()) {
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
      // Verify current PIN is correct
      const isValid = await verifyPIN(currentPin);
      if (!isValid) {
        toast({
          title: "Incorrect PIN",
          description: "The current PIN you entered is incorrect.",
          variant: "destructive",
        });
        setPinSaving(false);
        return;
      }

      // Save new PIN
      await savePIN(newPin);
      toast({
        title: "PIN changed",
        description: "Your PIN has been updated successfully.",
      });

      // Clear form and close dialog
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinDialogOpen(false);
    } catch (error) {
      toast({
        title: "Failed to change PIN",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your private sanctuary
        </p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {isTrialActive && trialDaysRemaining <= 7 && (
            <Card className="p-4 bg-accent/10 border-accent/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-medium text-sm">Trial Ending Soon</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    You have {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left of your free trial.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setLocation('/subscription')}
                    className="mt-2"
                    variant="default"
                    data-testid="button-view-plans"
                  >
                    View Plans
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-medium">Privacy & Security</h3>
                  <p className="text-xs text-muted-foreground">
                    All data is encrypted end-to-end
                  </p>
                </div>
              </div>
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="pt-3 space-y-2 text-sm text-muted-foreground border-t">
              <p>• AES-GCM 256-bit encryption</p>
              <p>• PBKDF2 600k iterations</p>
              <p>• Data never leaves your device unencrypted</p>
              <p>• No cloud storage, no backups</p>
            </div>
          </Card>

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
                  <DialogTitle>Change Your PIN</DialogTitle>
                  <DialogDescription>
                    Enter your current PIN, then set a new one. PINs must be at least 4 characters.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
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
                    {pinSaving ? 'Changing...' : 'Change PIN'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-gold" />
              <div>
                <h3 className="font-medium">Connection Status</h3>
                <p className="text-xs text-muted-foreground">
                  {isOnline ? 'Connected to sync server' : 'Offline - changes saved locally'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-medium">Reconnection Details</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Share these details if you need to reconnect your devices
                </p>
              </div>
            </div>
            <div className="pt-3 space-y-4 border-t">
              {userId && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">YOUR ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-2 rounded text-foreground">
                      {userId}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyUserId}
                      data-testid="button-copy-user-id"
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
                  <p className="text-xs font-medium text-muted-foreground">PARTNER ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-2 rounded text-foreground">
                      {partnerId}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyPartnerId}
                      data-testid="button-copy-partner-id"
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
                  <p className="text-xs font-medium text-muted-foreground">SHARED PASSPHRASE</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono flex-1 break-all bg-muted/50 p-2 rounded text-foreground">
                      {passphrase}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyPassphrase}
                      data-testid="button-copy-passphrase"
                    >
                      {copiedPassphrase ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

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
        </div>
      </ScrollArea>
    </div>
  );
}
