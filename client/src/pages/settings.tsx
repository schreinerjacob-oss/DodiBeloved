import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { Lock, LogOut, Shield, Heart, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

export default function SettingsPage() {
  const { userId, logout, isOnline } = useDodi();
  const { toast } = useToast();

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Logged out",
      description: "Your pairing has been cleared from this device.",
    });
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
                <h3 className="font-medium">About dodi</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  A completely private, encrypted space for two hearts
                </p>
              </div>
            </div>
            {userId && (
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Your ID: <span className="font-mono">{userId}</span>
                </p>
              </div>
            )}
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
