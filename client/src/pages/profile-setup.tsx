import { useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Heart, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';

export default function ProfileSetupPage() {
  const { initializeProfile } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateProfile = async () => {
    if (!displayName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your display name',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await initializeProfile(displayName);
      toast({
        title: 'Profile created!',
        description: `Welcome, ${displayName}. Now pair with your beloved.`,
      });
      setLocation('/pairing');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen flex flex-col items-center justify-center bg-background" style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-sm px-6 space-y-8">
        <div className="text-center space-y-4">
          <img src={dodiTypographyLogo} alt="dodi" className="w-20 h-20 mx-auto" />
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Welcome</h1>
            <p className="text-muted-foreground">Your whispers stay only between you two — forever</p>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your name</label>
            <Input
              type="text"
              placeholder="Enter your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
              disabled={loading}
              data-testid="input-display-name"
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">This is how your beloved will see you in dodi</p>
          </div>

          <Button
            onClick={handleCreateProfile}
            disabled={!displayName.trim() || loading}
            className="w-full"
            data-testid="button-create-profile"
          >
            <Heart className="w-4 h-4 mr-2" />
            {loading ? 'Creating...' : 'Create Profile'}
          </Button>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Lock className="w-3 h-3 inline mr-1" />
          Your whispers stay only between you two — forever
        </p>
      </div>
    </div>
  );
}
