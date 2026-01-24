import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Heart, Loader2, Copy, Check, Leaf, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { normalizeRoomCode, isValidRoomCode, generateRoomCode } from '@/lib/pairing-codes';
import { initializePeer, createRoomPeerId, getRemotePeerId, waitForConnection, connectToRoom, closeRoom, type RoomConnection } from '@/hooks/use-peer-connection';
import { runCreatorTunnel, runJoinerTunnel } from '@/lib/tunnel-handshake';
import { requestNotificationPermission } from '@/lib/notifications';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';

type Mode = 'choose' | 'pairing' | 'success-animation' | 'restore-mode' | 'restore-entry';

export default function PairingPage() {
  const { completePairingWithMasterKey, completePairingAsCreator, onPeerConnected, pairingStatus, userId } = useDodi();
  const { toast } = useToast();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialMode = searchParams.get('mode') === 'restore' ? 'restore-mode' : 'choose';
  
  const [mode, setMode] = useState<Mode>(initialMode);
  const [roomCode, setRoomCode] = useState<string>('');
  const [showScanner, setShowScanner] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [isRestoringEssentials, setIsRestoringEssentials] = useState(false);
  const [isSyncingOlder, setIsSyncingOlder] = useState(false);
  const [syncBatchCount, setSyncBatchCount] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (mode === 'restore-mode' && !roomCode) {
      handleCreateRoom();
    }
  }, [mode]);
  const [inputCode, setInputCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const roomRef = useRef<RoomConnection | null>(null);
  const retryCountRef = useRef<number>(0);

  useEffect(() => {
    if (pairingStatus === 'connected') {
      setShowSuccess(true);
      // Request notification permission after successful pairing
      requestNotificationPermission().then(granted => {
        console.log('📬 Notification permission:', granted ? 'granted' : 'denied');
      });
    }
  }, [pairingStatus]);

  useEffect(() => {
    const handleRestorePayload = async (e: any) => {
      const payload = e.detail;
      console.log('♾️ [RESTORE] Processing restoration payload:', payload);
      await handleMasterKeyReceived(payload, false);
    };

    window.addEventListener('dodi-restore-payload', handleRestorePayload);
    
    const handleSyncComplete = () => {
      setIsSyncingOlder(false);
      toast({
        title: "All restored ♾️",
        description: "Your entire garden history is now synchronized.",
      });
    };
    
    const handleSyncProgress = (e: any) => {
      setIsSyncingOlder(true);
      setSyncBatchCount(prev => prev + 1);
      if (e.detail?.totalBatches) {
        setTotalBatches(e.detail.totalBatches);
      }
    };

    window.addEventListener('dodi-sync-complete', handleSyncComplete);
    window.addEventListener('dodi-sync-batch', handleSyncProgress);
    
    return () => {
      window.removeEventListener('dodi-restore-payload', handleRestorePayload);
      window.removeEventListener('dodi-sync-complete', handleSyncComplete);
      window.removeEventListener('dodi-sync-batch', handleSyncProgress);
    };
  }, []);

  const handleMasterKeyReceived = async (payload: any, isCreatorRole: boolean) => {
    try {
      if (payload.essentials) {
        setIsRestoringEssentials(true);
        setRestoreProgress(10);
        console.log('♾️ [RESTORE] Applying essential data...');
        const { saveIncomingItems } = await import('@/lib/storage-encrypted');
        const stores = Object.keys(payload.essentials);
        for (let i = 0; i < stores.length; i++) {
          const store = stores[i];
          const items = payload.essentials[store];
          if (items && items.length > 0) {
            await saveIncomingItems(store as any, items);
          }
          setRestoreProgress(10 + Math.floor(((i + 1) / stores.length) * 90));
        }
        setIsRestoringEssentials(false);
        console.log('✅ [RESTORE] Essentials applied');
        toast({
          title: "Core restored ♾️",
          description: "Older items will sync in the background.",
        });
      }
      
      console.log('📋 [ID AUDIT] Master key payload received:', {
        creatorId: payload.creatorId,
        joinerId: payload.joinerId,
        myUserId: userId,
        hasMasterKey: !!payload.masterKey,
        hasSalt: !!payload.salt,
        isCreatorRole,
      });
      
      if (isCreatorRole) {
        // Creator: store masterKey and joiner's ID
        if (!payload.joinerId) {
          throw new Error('Joiner ID not received in tunnel');
        }
        
        // CRITICAL VALIDATION: Ensure we're not pairing with ourselves
        if (userId === payload.joinerId) {
          throw new Error(`Self-pairing detected: Creator ID (${userId}) matches Joiner ID (${payload.joinerId})`);
        }
        
        console.log('💾 [ID AUDIT] Creator calling completePairingAsCreator:', { myId: userId, remotePartnerId: payload.joinerId });
        console.log('🔑 [STORE] Creator will store: { userId:', userId, 'partnerId:', payload.joinerId, '}');
        await completePairingAsCreator(payload.masterKey, payload.salt, payload.joinerId);
      } else {
        // Joiner: store masterKey and creator's ID
        if (!payload.creatorId) {
          throw new Error('Creator ID not received in tunnel');
        }
        
        // CRITICAL VALIDATION: Ensure we're not pairing with ourselves
        if (userId === payload.creatorId) {
          throw new Error(`Self-pairing detected: Joiner ID (${userId}) matches Creator ID (${payload.creatorId})`);
        }
        
        console.log('💾 [ID AUDIT] Joiner calling completePairingWithMasterKey:', { myId: userId, remotePartnerId: payload.creatorId });
        console.log('🔑 [STORE] Joiner will store: { userId:', userId, 'partnerId:', payload.creatorId, '}');
        await completePairingWithMasterKey(payload.masterKey, payload.salt, payload.creatorId);
      }
      
      console.log('✅ [PAIRING] Storage updated, updating global state...');
      onPeerConnected();
      
      // Force a small delay to ensure context state propagates before transition
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (roomRef.current) closeRoom(roomRef.current);
      setShowSuccess(true);
      setMode('success-animation');
      console.log('✨ [PAIRING] Transitioning to success view');
    } catch (error) {
      if (roomRef.current) closeRoom(roomRef.current);
      console.error('❌ [ID AUDIT] Pairing failed:', error);
      toast({
        title: 'Pairing Failed',
        description: (error instanceof Error ? error.message : 'Could not complete connection.'),
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    // Generate code fresh every time for new pairings
    const freshCode = generateRoomCode();
    setRoomCode(freshCode);
    const normalizedCode = normalizeRoomCode(freshCode);

    // VALIDATION: Ensure userId exists
    if (!userId) {
      console.error('❌ [ID AUDIT] FAILED: Creator has no userId - cannot start pairing');
      toast({
        title: 'Pairing Error',
        description: 'User ID not initialized. Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    
    console.log('✅ [ID AUDIT] Creator userId exists:', userId);
    setLoading(true);
    setIsCreator(true);
    
    // IMPORTANT: For new pairings (not restore), we need to stay on the code display screen
    // so the partner can see the code and connect.
    if (mode !== 'restore-mode') {
      // Stay on 'pairing' mode to show the code/QR
      setMode('pairing');
    }
    
    try {
      const myPeerId = createRoomPeerId(normalizedCode, true);
      
      console.log('🌿 Creating room as creator:', normalizedCode);
      console.log('📋 [ID AUDIT] Creator will send userId to tunnel:', userId);
      const peer = await initializePeer(myPeerId);
      
      const connPromise = waitForConnection(peer, 120000).then(async (conn) => {
        roomRef.current = { peer, conn, isCreator: true, peerId: myPeerId };
        console.log('🌊 [FLOW] Creator calling runCreatorTunnel with userId:', userId);
        const payload = await runCreatorTunnel(conn, userId);
        
        console.log('📋 [ID AUDIT] Creator received tunnel payload:', {
          creatorId: payload.creatorId,
          joinerId: payload.joinerId,
          creatorIdMatchesUserId: payload.creatorId === userId,
          hasJoinerId: !!payload.joinerId,
        });
        
        console.log('✅ [ID AUDIT] Creator pairing complete:', {
          myId: userId,
          partnerId: payload.joinerId,
          idMismatch: userId === payload.joinerId,
        });
        
        await handleMasterKeyReceived(payload, true);
      });
      
      connPromise.catch((error) => {
        console.error('Creator connection error:', error);
        if (roomRef.current) {
          closeRoom(roomRef.current);
        }
        if (mode === 'pairing') {
          toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'Partner did not connect. Try again.', variant: 'destructive' });
          setMode('choose');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Create room error:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create room.', variant: 'destructive' });
      setMode('choose');
      setLoading(false);
    }
  };

  const attemptJoinRoom = async (normalCode: string, isRetry: boolean = false) => {
    try {
      console.log(`🌿 ${isRetry ? 'Retrying' : 'Joining'} room as joiner:`, normalCode);
      
      // VALIDATION: Ensure userId exists for joiner
      if (!userId) {
        console.error('❌ [ID AUDIT] FAILED: Joiner has no userId - cannot join');
        throw new Error('Joiner user ID not initialized');
      }
      
      console.log('✅ [ID AUDIT] Joiner userId exists:', userId);
      
      const myPeerId = createRoomPeerId(normalCode, false);
      const peer = await initializePeer(myPeerId);
      const remotePeerId = getRemotePeerId(normalCode, false);
      const conn = await connectToRoom(peer, remotePeerId, 6000);
      roomRef.current = { peer, conn, isCreator: false, peerId: myPeerId };
      console.log('🌊 [FLOW] Joiner calling runJoinerTunnel with userId:', userId);
      
      // Pass userId so the tunnel can send the ACK with joinerId inline
      const payload = await runJoinerTunnel(conn, userId);
      
      console.log('📋 [ID AUDIT] Joiner received tunnel payload:', {
        creatorId: payload.creatorId,
        hasCreatorId: !!payload.creatorId,
      });
      
      if (!payload.creatorId) {
        throw new Error('Creator ID not received in tunnel');
      }
      
      console.log('✅ [ID AUDIT] Joiner pairing complete:', {
        myId: userId,
        creatorId: payload.creatorId,
        idMismatch: userId === payload.creatorId,
      });
      
      await handleMasterKeyReceived(payload, false);
    } catch (error) {
      console.error(`Join room error (${isRetry ? 'retry' : 'attempt'} ${retryCountRef.current}):`, error);
      
      // If first attempt fails and we haven't retried yet, show "One moment…" and retry
      if (!isRetry && retryCountRef.current === 0) {
        retryCountRef.current = 1;
        setIsRetrying(true);
        
        // Wait 2 seconds then retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          await attemptJoinRoom(normalCode, true);
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          if (roomRef.current) closeRoom(roomRef.current);
          toast({ 
            title: 'Connection took too long', 
            description: 'Creator may not be ready. Please try again.',
            variant: 'destructive' 
          });
          setMode('choose');
          setLoading(false);
          setIsRetrying(false);
          retryCountRef.current = 0;
        }
      } else {
        // Second attempt failed
        if (roomRef.current) closeRoom(roomRef.current);
        toast({ 
          title: 'Connection Failed', 
          description: 'Could not connect. Please try again.',
          variant: 'destructive' 
        });
        setMode('choose');
        setLoading(false);
        setIsRetrying(false);
        retryCountRef.current = 0;
      }
    }
  };

  const handleJoinRoom = async () => {
    if (!isValidRoomCode(inputCode)) {
      toast({ title: 'Invalid code', description: 'Please enter a valid 8-character code (e.g., A7K9-P2M4)', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    setIsCreator(false);
    const normalCode = normalizeRoomCode(inputCode);
    setRoomCode(normalCode);
    setMode('pairing');
    retryCountRef.current = 0;
    setIsRetrying(false);
    
    await attemptJoinRoom(normalCode, false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && mode === 'pairing') {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-8 bg-background h-full w-full overflow-y-auto" style={{ minHeight: '100dvh' }}>
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="mx-auto w-12 h-12"
            >
              <Loader2 className="w-12 h-12 text-sage" />
            </motion.div>
            <div className="space-y-2">
              <h2 className="text-2xl font-light text-sage tracking-tight">Connecting Your Gardens...</h2>
              <p className="text-muted-foreground italic text-sm">Searching for your partner's light ♾️</p>
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-6"
          >
            <div className="bg-sage/5 border border-sage/20 rounded-2xl p-6 space-y-4">
              <p className="text-sm text-sage font-medium">Share this code with your partner:</p>
              <div className="flex items-center justify-center gap-3">
                <code className="text-3xl font-mono tracking-widest text-foreground bg-white dark:bg-card px-4 py-2 rounded-lg border border-sage/10 shadow-sm">
                  {roomCode}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleCopyCode}
                  className="text-sage hover:bg-sage/10"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
                <div className="h-px w-8 bg-muted-foreground/20" />
                <span>Or scan to connect</span>
                <div className="h-px w-8 bg-muted-foreground/20" />
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-inner border border-sage/10 inline-block mx-auto">
                <QRCodeSVG 
                  value={roomCode} 
                  size={160}
                  level="M"
                  includeMargin={false}
                  className="dark:invert"
                />
              </div>
            </div>

            <Button 
              variant="ghost" 
              onClick={() => {
                if (roomRef.current) closeRoom(roomRef.current);
                setMode('choose');
                setLoading(false);
              }}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Cancel Connection
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading && mode === 'restore-mode') {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-6 bg-background h-full w-full overflow-y-auto" style={{ minHeight: '100dvh' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="w-12 h-12 text-sage" />
        </motion.div>
        <div className="space-y-2">
          <h2 className="text-2xl font-light text-sage">Restoring Your Garden...</h2>
          <p className="text-muted-foreground italic text-sm">One moment while we regrow the vines of your connection ♾️</p>
        </div>
      </div>
    );
  }

    const isRestoreFlow = searchParams.get('mode') === 'restore' || mode === 'restore-mode';

  if (showSuccess) {
    const progressValue = isRestoringEssentials 
      ? restoreProgress 
      : isSyncingOlder 
        ? Math.min(95, Math.floor((syncBatchCount / Math.max(1, totalBatches || 10)) * 100))
        : 100;

    const handleCancelSync = () => {
      window.dispatchEvent(new CustomEvent('dodi-cancel-sync'));
      setIsSyncingOlder(false);
      // Ensure sync batch tracking resets
      setSyncBatchCount(0);
      setTotalBatches(0);
      toast({
        title: "Sync paused",
        description: "You can resume later when you're both online.",
      });
    };

    return (
      <div className="flex flex-col items-center justify-center p-6 overflow-hidden bg-background h-full w-full" style={{ minHeight: '100dvh' }}>
        {/* Vines Animation Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="w-full h-full relative"
          >
            {/* Beautiful growing vines */}
            <svg viewBox="0 0 100 100" className="absolute top-0 left-0 w-full h-full fill-none stroke-sage/50 dark:stroke-sage/40 stroke-[0.3]">
              <motion.path 
                d="M-10,110 C20,80 10,40 50,50 S80,10 110,-10" 
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 4, ease: "easeInOut" }}
              />
              <motion.path 
                d="M110,110 C80,80 90,40 50,50 S20,10 -10,-10" 
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 4, delay: 0.5, ease: "easeInOut" }}
              />
              <motion.path 
                d="M50,110 Q50,50 50,-10" 
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 3, delay: 1, ease: "easeInOut" }}
              />
            </svg>
            
            {/* Floating leaves */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: Math.random() * 100 + "%", 
                  y: "110%", 
                  rotate: Math.random() * 360,
                  opacity: 0 
                }}
                animate={{ 
                  y: "-10%", 
                  rotate: Math.random() * 720,
                  opacity: [0, 0.4, 0] 
                }}
                transition={{ 
                  duration: 5 + Math.random() * 5, 
                  repeat: Infinity, 
                  delay: Math.random() * 5,
                  ease: "linear" 
                }}
                className="absolute"
              >
                <Leaf className="w-4 h-4 text-sage fill-sage/20" />
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} className="text-center space-y-8 max-w-md relative z-10 bg-white/80 dark:bg-card/80 backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-sage/20">
          <motion.div 
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} 
            transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }} 
            className="relative inline-block"
          >
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-3xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-sage to-blush p-8 rounded-full">
              {isRestoreFlow ? <RefreshCw className="w-16 h-16 text-white" /> : <Heart className="w-16 h-16 text-white" />}
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            transition={{ delay: 0.3, duration: 0.5 }} 
            className="space-y-3"
          >
            <h1 className="text-3xl font-light text-foreground tracking-tight leading-tight">
              {isRestoreFlow ? "The Garden is" : "Your Gardens Are Now"}
              <br />
              <span className="font-serif text-sage dark:text-sage text-4xl block mt-2">
                {isRestoreFlow ? "Restored ♾️" : "Eternally Connected"}
              </span>
            </h1>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.8, duration: 0.8 }} 
            className="text-sm text-muted-foreground italic leading-relaxed"
          >
            {isRestoreFlow 
              ? "Your connection has been regrown. Your shared space is blooming once again ♾️"
              : "All your messages are encrypted end-to-end and synced securely across your devices."}
          </motion.p>

          {(isRestoringEssentials || isSyncingOlder) && (
            <div className="space-y-4 py-4 w-full">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-sage font-medium px-1">
                  <span>{isRestoringEssentials ? "Restoring core..." : "Syncing history..."}</span>
                  <span>{progressValue}%</span>
                </div>
                <div className="h-2 w-full bg-sage/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressValue}%` }}
                    className="h-full bg-sage"
                  />
                </div>
              </div>
              
              {isSyncingOlder && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCancelSync}
                  className="text-muted-foreground hover:text-destructive text-xs h-8 hover:bg-transparent"
                >
                  Cancel sync
                </Button>
              )}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="pt-4"
          >
            <Button 
              className="w-full bg-sage hover:bg-sage/90 text-white rounded-xl h-12 text-lg font-light shadow-lg shadow-sage/20"
              onClick={() => setLocation('/chat')}
              disabled={isRestoringEssentials}
            >
              Enter Your Garden
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <img src={dodiTypographyLogo} alt="dodi" className="h-20 mx-auto" data-testid="img-logo" />
          <h1 className="text-4xl font-light tracking-wide text-foreground">dodi</h1>
          <p className="text-muted-foreground font-light text-sm italic">Your private garden. Nothing ever leaves your two devices.</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'choose' && (
            <motion.div 
              key="choose" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="space-y-3 text-center">
                  <Heart className="w-8 h-8 mx-auto text-blush" />
                  <h2 className="text-2xl font-light">Hold Close and Connect</h2>
                  <p className="text-sm text-muted-foreground">A private sanctuary for two. After pairing, data stays on your devices forever—no servers, no leaks.</p>
                </div>

                <div className="space-y-3">
                  <Button 
                    onClick={handleCreateRoom} 
                    disabled={loading} 
                    className="w-full h-12 hover-elevate" 
                    data-testid="button-create-room"
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-5 h-5 mr-2" />}
                    {loading ? 'Creating...' : 'Create Connection'}
                  </Button>

                  <Button 
                    onClick={() => { setInputCode(''); setMode('pairing'); setIsCreator(false); }} 
                    variant="outline" 
                    className="w-full h-12 hover-elevate" 
                    data-testid="button-join-code"
                  >
                    Join with Code
                  </Button>

                  <Button 
                    onClick={() => { setInputCode(''); setMode('restore-entry'); setIsCreator(false); }} 
                    variant="ghost" 
                    className="w-full h-12 text-sage hover:bg-sage/5 border border-dashed border-sage/20"
                    data-testid="button-restore-from-partner"
                  >
                    Restore from Partner
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'restore-entry' && (
            <motion.div 
              key="restore-entry" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="space-y-3 text-center">
                  <RefreshCw className="w-8 h-8 mx-auto text-sage" />
                  <h2 className="text-2xl font-light">Restore Garden</h2>
                  <p className="text-sm text-muted-foreground">Enter the code from your partner's device to reconnect</p>
                </div>

                <div className="space-y-4">
                  <Input 
                    placeholder="Enter 8-character code" 
                    value={inputCode} 
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    className="h-12 text-center text-lg tracking-widest font-mono uppercase"
                    maxLength={9}
                    data-testid="input-restore-code"
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      onClick={() => {
                        console.log('Restore mode joined – waiting for partner to send key');
                        handleJoinRoom();
                      }}
                      disabled={loading || !inputCode}
                      className="h-12 hover-elevate"
                      data-testid="button-restore-submit"
                    >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Restore
                    </Button>
                    <Button 
                      onClick={() => setShowScanner(true)}
                      variant="outline"
                      className="h-12 hover-elevate"
                      data-testid="button-restore-scan"
                    >
                      Scan QR
                    </Button>
                  </div>

                  <Button 
                    onClick={() => setMode('choose')} 
                    variant="ghost" 
                    className="w-full h-12"
                    data-testid="button-restore-back"
                  >
                    Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'pairing' && (
            <motion.div 
              key="pairing" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                {isRestoringEssentials && (
                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <h2 className="text-xl font-light">Restoring Essentials...</h2>
                      <p className="text-sm text-muted-foreground italic">Rebuilding your private sanctuary</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <motion.div 
                        className="bg-sage h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${restoreProgress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                      {restoreProgress < 100 ? 'Synchronizing core data...' : 'Essentials restored ♾️'}
                    </p>
                  </div>
                )}
                {isCreator ? (
                  <>
                    <div className="text-center space-y-2">
                      <h2 className="text-xl font-light">Share This Code</h2>
                      <p className="text-sm text-muted-foreground">Let your partner scan or type it</p>
                    </div>

                    <div className="text-center p-6 bg-sage/10 rounded-lg">
                      <p className="text-6xl font-light tracking-widest text-sage font-mono" data-testid="text-room-code">
                        {roomCode}
                      </p>
                    </div>

                    <div className="flex justify-center">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <QRCodeSVG 
                          value={roomCode} 
                          size={80} 
                          level="H" 
                          includeMargin={false}
                          data-testid="qr-room-code"
                        />
                      </div>
                    </div>

                    <Button 
                      variant="ghost" 
                      className="w-full" 
                      onClick={handleCopyCode} 
                      data-testid="button-copy-code"
                    >
                      {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                      {copied ? 'Copied!' : 'Copy Code'}
                    </Button>

                    {loading && (
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                      >
                        <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                          <Leaf className="w-4 h-4 text-sage" />
                        </motion.div>
                        <span>Waiting for partner...</span>
                      </motion.div>
                    )}

                    <Button 
                      onClick={() => { 
                        if (roomRef.current) closeRoom(roomRef.current); 
                        setMode('choose'); 
                        setLoading(false); 
                      }} 
                      variant="ghost" 
                      className="w-full" 
                      disabled={loading}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-center space-y-2">
                      <h2 className="text-xl font-light">Enter Restore Code</h2>
                      <p className="text-sm text-muted-foreground italic">Regrow your connection from your partner's device</p>
                    </div>

                    <Input 
                      type="text" 
                      placeholder="e.g., A7K9-P2M4" 
                      value={inputCode} 
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())} 
                      disabled={loading} 
                      data-testid="input-room-code" 
                      className="text-lg font-mono text-center tracking-widest" 
                      maxLength={9}
                    />

                    {isRetrying && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-2"
                      >
                        <p className="text-sm text-sage font-light">One moment…</p>
                        <motion.div
                          className="flex justify-center gap-1 mt-2"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                        </motion.div>
                      </motion.div>
                    )}

                    <Button 
                      onClick={handleJoinRoom} 
                      disabled={loading || !isValidRoomCode(inputCode)} 
                      className="w-full h-12 hover-elevate" 
                      data-testid="button-join-room"
                    >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-5 h-5 mr-2" />}
                      {loading ? 'Connecting...' : 'Connect'}
                    </Button>

                    <Button 
                      onClick={() => { setInputCode(''); setMode('choose'); }} 
                      variant="ghost" 
                      className="w-full" 
                      disabled={loading}
                      data-testid="button-cancel"
                    >
                      Back
                    </Button>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {mode === 'restore-mode' && (
            <motion.div 
              key="restore" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-gold/30 shadow-lg bg-cream/50 dark:bg-card">
                <div className="space-y-3 text-center">
                  <RefreshCw className="w-8 h-8 mx-auto text-sage animate-spin-slow" />
                  <h2 className="text-2xl font-light text-foreground">Restore Partner Device</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Have your partner open Dodi on their device and choose <span className="text-sage font-medium">‘Restore from Partner’</span>
                  </p>
                </div>

                <div className="text-center p-6 bg-sage/10 rounded-lg space-y-4">
                  <p className="text-4xl font-light tracking-widest text-sage font-mono">
                    {roomCode || 'RESTORE'}
                  </p>
                  <div className="flex justify-center">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <QRCodeSVG 
                        value={roomCode || 'RESTORE'} 
                        size={120} 
                        level="H" 
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground italic">
                  Restore mode activated – waiting for partner to join
                </p>

                <Button 
                  onClick={() => setMode('choose')} 
                  variant="ghost" 
                  className="w-full h-12" 
                >
                  Back
                </Button>
              </Card>
            </motion.div>
          )}

          {mode === 'success-animation' && (
            <motion.div 
              key="success" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg text-center">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }} 
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Heart className="w-12 h-12 mx-auto text-blush" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-light">Connected</h2>
                  <p className="text-sm text-muted-foreground mt-1">Your gardens are eternally connected</p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
