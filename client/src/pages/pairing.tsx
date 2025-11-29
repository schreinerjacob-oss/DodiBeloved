import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Heart, Loader2, Shield, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from '@/lib/room-codes';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import type { MasterKeyPayload } from '@/lib/tunnel-handshake';

type Mode = 'choose' | 'creating' | 'show-code' | 'connecting' | 'success-animation';

export default function PairingPage() {
  const { completePairingWithMasterKey, onPeerConnected, pairingStatus } = useDodi();
  const { setOnTunnelComplete, state: peerState } = usePeerConnection();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('choose');
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (pairingStatus === 'connected') {
      setMode('success-animation');
      setShowSuccess(true);
    }
  }, [pairingStatus]);

  const handleMasterKeyReceived = async (payload: MasterKeyPayload) => {
    console.log('Master key received via tunnel');
    try {
      await completePairingWithMasterKey(payload.masterKey, payload.salt, payload.creatorId);
      onPeerConnected();
      setMode('success-animation');
      setShowSuccess(true);
    } catch (error) {
      console.error('Failed to complete pairing with master key:', error);
      toast({
        title: 'Pairing Failed',
        description: 'Could not complete secure connection. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  useEffect(() => {
    setOnTunnelComplete(handleMasterKeyReceived);
  }, [setOnTunnelComplete]);

  useEffect(() => {
    if (peerState.tunnelEstablished && mode !== 'success-animation') {
      setMode('success-animation');
      setShowSuccess(true);
    }
  }, [peerState.tunnelEstablished, mode]);

  const handleCreateRoom = async () => {
    setLoading(true);
    setMode('creating');

    try {
      const code = generateRoomCode();
      setRoomCode(code);
      
      toast({
        title: 'Room created',
        description: `Share code ${code} with your partner`,
      });
      
      setMode('show-code');
    } catch (error) {
      console.error('Create room error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create room. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!isValidRoomCode(inputCode)) {
      toast({
        title: 'Invalid code',
        description: 'Please enter a valid 8-character code (e.g., A7K9-P2M4)',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setMode('connecting');
    setRoomCode(normalizeRoomCode(inputCode));

    try {
      toast({
        title: 'Connecting...',
        description: 'Establishing secure tunnel with your partner.',
      });
    } catch (error) {
      console.error('Join room error:', error);
      toast({
        title: 'Error',
        description: 'Failed to join room. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (showSuccess || mode === 'success-animation') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center space-y-8"
        >
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
            className="relative inline-block"
          >
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-3xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-sage to-blush p-8 rounded-full">
              <Heart className="w-20 h-20 text-white" />
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-3"
          >
            <h1 className="text-3xl font-light text-foreground">
              Your Gardens Are Now
            </h1>
            <p className="text-4xl font-serif text-sage dark:text-sage">
              Eternally Connected
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="pt-4"
          >
            <Card className="p-4 bg-sage/10 border-sage/30 inline-block">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-sage" />
                <span>End-to-end encrypted</span>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            <p className="text-sm text-muted-foreground">
              Redirecting to your sanctuary...
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="inline-block mb-2">
            <img src={dodiTypographyLogo} alt="dodi" className="h-20" data-testid="img-logo" />
          </div>
          <h1 className="text-4xl font-light tracking-wide text-foreground">dodi</h1>
          <p className="text-muted-foreground font-light">my beloved</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="space-y-3 text-center">
                  <Heart className="w-8 h-8 mx-auto text-blush animate-pulse-glow" />
                  <h2 className="text-2xl font-light">Hold Close and Connect</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A completely private sanctuary that belongs only to you and your beloved.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleCreateRoom}
                    disabled={loading}
                    className="w-full h-12 text-base hover-elevate"
                    data-testid="button-create-room"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Heart className="w-5 h-5 mr-2" />
                    )}
                    {loading ? 'Creating...' : 'Create Connection'}
                  </Button>

                  <Button
                    onClick={() => setMode('connecting')}
                    variant="outline"
                    className="w-full h-12 text-base hover-elevate"
                    data-testid="button-join-code"
                  >
                    Join with Code
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'creating' && (
            <motion.div
              key="creating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto animate-spin text-sage" />
                  <h2 className="text-xl font-light">Creating Your Room...</h2>
                  <p className="text-sm text-muted-foreground">
                    Generating your sacred connection code
                  </p>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'show-code' && roomCode && (
            <motion.div
              key="show-code"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-light">Share This Code</h2>
                  <p className="text-sm text-muted-foreground">
                    Let your partner scan or type it
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Large code display */}
                  <div className="text-center p-6 bg-sage/10 rounded-lg">
                    <p className="text-5xl font-light tracking-widest text-sage dark:text-sage font-mono">
                      {roomCode}
                    </p>
                  </div>

                  {/* Tiny QR code */}
                  <div className="flex justify-center">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <QRCodeSVG
                        value={roomCode}
                        size={100}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                  </div>

                  {/* Copy button */}
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleCopyCode}
                    data-testid="button-copy-code"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 mr-2 text-accent" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </Button>

                  {peerState.connecting && (
                    <div className="p-3 bg-gold/10 rounded-lg text-center animate-pulse">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-gold" />
                        <span className="text-sm text-gold">Partner connecting...</span>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      setRoomCode('');
                      setMode('choose');
                    }}
                    variant="ghost"
                    className="w-full"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'connecting' && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-light">Enter Code</h2>
                  <p className="text-sm text-muted-foreground">
                    Your partner will share an 8-character code
                  </p>
                </div>

                <div className="space-y-4">
                  <Input
                    type="text"
                    placeholder="e.g., A7K9-P2M4"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    disabled={loading}
                    data-testid="input-room-code"
                    className="text-lg font-mono text-center tracking-widest"
                    maxLength={9}
                  />

                  <p className="text-xs text-muted-foreground text-center">
                    You can also scan the tiny QR code with your camera
                  </p>

                  <Button
                    onClick={handleJoinRoom}
                    disabled={loading || !isValidRoomCode(inputCode)}
                    className="w-full h-12 text-base hover-elevate"
                    data-testid="button-join-room"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Heart className="w-5 h-5 mr-2" />
                    )}
                    {loading ? 'Connecting...' : 'Connect'}
                  </Button>

                  <Button
                    onClick={() => {
                      setInputCode('');
                      setMode('choose');
                    }}
                    variant="ghost"
                    className="w-full"
                    data-testid="button-cancel-join"
                    disabled={loading}
                  >
                    Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
