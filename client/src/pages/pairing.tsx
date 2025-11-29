import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function PairingPage() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Redirect to chat (new pairing flow coming soon)
    setLocation('/chat');
  }, [setLocation]);

  return null;
}
