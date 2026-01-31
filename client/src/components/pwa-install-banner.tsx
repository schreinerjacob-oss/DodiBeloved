import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export function PwaInstallBanner() {
  const { canInstall, prompt, dismiss } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-[85] animate-in slide-in-from-bottom-4 duration-500">
      <Card className="p-4 bg-gradient-to-br from-sage/10 via-background to-blush/10 border-sage/30 shadow-xl flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sage/20 flex items-center justify-center">
          <Download className="w-5 h-5 text-sage" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">Install dodi</p>
          <p className="text-xs text-muted-foreground">
            Add to your home screen for a smoother, app-like experience
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" onClick={prompt} className="bg-sage hover:bg-sage/90">
            Install
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
