import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { clearAndGoToPairing } from '@/lib/clear-app-data';

export default function ResetPage() {
  useEffect(() => {
    clearAndGoToPairing();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-sage" />
      <p className="text-muted-foreground text-sm">Clearing all data and restarting...</p>
    </div>
  );
}
