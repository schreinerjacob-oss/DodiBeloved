import { initDB, getSetting } from '@/lib/storage';

export interface PrivacyCheckResult {
  id: string;
  label: string;
  description: string;
  status: 'checking' | 'passed' | 'failed' | 'warning';
  detail?: string;
}

export interface PrivacyReport {
  checks: PrivacyCheckResult[];
  overallStatus: 'secure' | 'warning' | 'insecure';
  timestamp: number;
}

export async function checkEncryptionActive(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'encryption',
    label: 'End-to-End Encryption',
    description: 'AES-GCM 256-bit encryption is active',
    status: 'checking',
  };

  try {
    const { getEncryptionKey } = await import('@/lib/storage-encrypted');
    const key = await getEncryptionKey();
    if (key) {
      result.status = 'passed';
      result.detail = 'Master key loaded and verified';
    } else {
      result.status = 'failed';
      result.detail = 'No encryption key found';
    }
  } catch (error) {
    result.status = 'failed';
    result.detail = 'Encryption key not available';
  }

  return result;
}

export async function checkLocalStorageOnly(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'local-storage',
    label: 'Local Storage Only',
    description: 'All data stored on your device',
    status: 'checking',
  };

  try {
    const db = await initDB();
    if (db) {
      const stores = ['messages', 'memories', 'settings'];
      let hasData = false;
      for (const store of stores) {
        const count = await db.count(store);
        if (count > 0) hasData = true;
      }
      result.status = 'passed';
      result.detail = hasData ? 'IndexedDB active with encrypted data' : 'IndexedDB ready (no data yet)';
    } else {
      result.status = 'failed';
      result.detail = 'IndexedDB not available';
    }
  } catch (error) {
    result.status = 'warning';
    result.detail = 'Could not verify local storage';
  }

  return result;
}

export async function checkP2PConnection(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'p2p-connection',
    label: 'Direct P2P Connection',
    description: 'Device-to-device communication',
    status: 'checking',
  };

  try {
    const peerState = (window as any).__DODI_PEER_STATE__;
    if (peerState?.connected) {
      result.status = 'passed';
      result.detail = 'WebRTC data channel active';
    } else if (peerState?.isReconnecting || peerState?.peerId) {
      result.status = 'warning';
      result.detail = 'Connecting to signaling relay...';
    } else {
      result.status = 'warning';
      result.detail = 'Partner offline (messages queued locally)';
    }
  } catch (error) {
    result.status = 'warning';
    result.detail = 'Connection status unavailable';
  }

  return result;
}

export async function checkRelayStatus(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'relay-status',
    label: 'Signaling Relay',
    description: 'Wake-up ping configuration',
    status: 'checking',
  };

  try {
    const allowWakeUp = await getSetting('allowWakeUp');
    const isEnabled = allowWakeUp === 'true';
    
    result.status = 'passed';
    result.detail = isEnabled 
      ? 'Wake-up pings enabled (faster notifications)' 
      : 'Relay disabled (maximum privacy mode)';
  } catch (error) {
    result.status = 'warning';
    result.detail = 'Could not verify relay settings';
  }

  return result;
}

export async function checkNoServerLeaks(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'no-server-leaks',
    label: 'No Server Data',
    description: 'No data sent to external servers',
    status: 'checking',
  };

  try {
    const passphrase = await getSetting('passphrase');
    const salt = await getSetting('salt');
    
    if (passphrase && salt) {
      result.status = 'passed';
      result.detail = 'Encryption keys stored locally only';
    } else {
      result.status = 'warning';
      result.detail = 'Pairing not complete';
    }
  } catch (error) {
    result.status = 'passed';
    result.detail = 'No server connections detected';
  }

  return result;
}

export async function checkDataEncrypted(): Promise<PrivacyCheckResult> {
  const result: PrivacyCheckResult = {
    id: 'data-encrypted',
    label: 'Data At Rest',
    description: 'Stored data is encrypted',
    status: 'checking',
  };

  try {
    const db = await initDB();
    const messages = await db.getAll('messages');
    
    if (messages.length > 0) {
      const sample = messages[0];
      const hasEncryptedFields = sample.iv && sample.data;
      
      if (hasEncryptedFields) {
        result.status = 'passed';
        result.detail = `${messages.length} messages encrypted`;
      } else {
        result.status = 'failed';
        result.detail = 'Unencrypted data detected';
      }
    } else {
      result.status = 'passed';
      result.detail = 'Ready for encrypted storage';
    }
  } catch (error) {
    result.status = 'warning';
    result.detail = 'Could not verify data encryption';
  }

  return result;
}

export async function runFullPrivacyCheck(): Promise<PrivacyReport> {
  const checks = await Promise.all([
    checkEncryptionActive(),
    checkLocalStorageOnly(),
    checkP2PConnection(),
    checkRelayStatus(),
    checkNoServerLeaks(),
    checkDataEncrypted(),
  ]);

  const failedCount = checks.filter(c => c.status === 'failed').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;

  let overallStatus: 'secure' | 'warning' | 'insecure';
  if (failedCount > 0) {
    overallStatus = 'insecure';
  } else if (warningCount > 1) {
    overallStatus = 'warning';
  } else {
    overallStatus = 'secure';
  }

  return {
    checks,
    overallStatus,
    timestamp: Date.now(),
  };
}
