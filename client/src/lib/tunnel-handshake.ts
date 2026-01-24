import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface EphemeralKeyPair {
  publicKey: string;
  privateKey: CryptoKey;
  fingerprint: string;
}

export interface MasterKeyPayload {
  masterKey: string;
  salt: string;
  creatorId: string;
  joinerId?: string;
}

export async function generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits']
  );

  const exportedPublicKey = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(exportedPublicKey);
  const fingerprint = await generateFingerprint(publicKeyBase64);

  return {
    publicKey: publicKeyBase64,
    privateKey: keyPair.privateKey,
    fingerprint,
  };
}

export async function generateFingerprint(publicKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(publicKey));
  const hashArray = new Uint8Array(hashBuffer);
  
  const hex = Array.from(hashArray.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  
  return hex.match(/.{2}/g)?.join(':') || hex;
}

export async function deriveSharedSecret(
  privateKey: CryptoKey,
  peerPublicKeyBase64: string
): Promise<CryptoKey> {
  const peerPublicKeyRaw = base64ToArrayBuffer(peerPublicKeyBase64);
  
  const peerPublicKey = await window.crypto.subtle.importKey(
    'raw',
    peerPublicKeyRaw,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    []
  );

  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    256
  );

  return window.crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithSharedSecret(
  data: string,
  sharedKey: CryptoKey
): Promise<{ iv: string; encrypted: string }> {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoder.encode(data)
  );

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encryptedBuffer),
  };
}

export async function decryptWithSharedSecret(
  ivBase64: string,
  encryptedBase64: string,
  sharedKey: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder();
  const iv = base64ToArrayBuffer(ivBase64);
  const encrypted = base64ToArrayBuffer(encryptedBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encrypted
  );

  return decoder.decode(decryptedBuffer);
}

export function generateMasterKey(): string {
  const keyBytes = window.crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  return arrayBufferToBase64(keyBytes);
}

export function generateMasterSalt(): string {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(saltBytes);
}

export interface TunnelMessage {
  type: 'tunnel-init' | 'tunnel-key' | 'tunnel-ack';
  publicKey?: string;
  iv?: string;
  joinerId?: string;
  encrypted?: string;
  fingerprint?: string;
}

export interface RoomProtocolMessage {
  type: 'tunnel-init' | 'tunnel-key' | 'tunnel-ack';
  publicKey?: string;
  iv?: string;
  encrypted?: string;
}

export function createTunnelInitMessage(publicKey: string): TunnelMessage {
  return {
    type: 'tunnel-init',
    publicKey,
  };
}

export async function createTunnelKeyMessage(
  payload: MasterKeyPayload,
  sharedKey: CryptoKey
): Promise<TunnelMessage> {
  const { iv, encrypted } = await encryptWithSharedSecret(
    JSON.stringify(payload),
    sharedKey
  );
  
  return {
    type: 'tunnel-key',
    iv,
    encrypted,
  };
}

export function createTunnelAckMessage(): TunnelMessage {
  return {
    type: 'tunnel-ack',
  };
}

export async function runCreatorTunnel(conn: any, creatorId: string): Promise<MasterKeyPayload> {
  const isRestore = window.location.search.includes('mode=restore');
  
  return new Promise((resolve, reject) => {
    let ephemeralKeys: EphemeralKeyPair | null = null;
    let sharedKey: CryptoKey | null = null;

    const handleMessage = async (data: any) => {
      console.log('📬 [TUNNEL] Creator received:', data.type);
      
      try {
          if (data.type === 'tunnel-init') {
            console.log('📬 [TUNNEL] Processing tunnel-init from joiner');
            if (!ephemeralKeys) {
              ephemeralKeys = await generateEphemeralKeyPair();
            }
            sharedKey = await deriveSharedSecret(ephemeralKeys.privateKey, data.publicKey);
            
            // SECURITY: Verify the public key length and format before proceeding
            const peerKeyRaw = base64ToArrayBuffer(data.publicKey);
            if (peerKeyRaw.length !== 65) {
              throw new Error('Invalid peer public key entropy');
            }
            
            // Send our init so the joiner can derive the secret too
            const initMsg = createTunnelInitMessage(ephemeralKeys.publicKey);
            console.log('📤 [TUNNEL] Sending creator-init response to joiner');
            conn.send({ ...initMsg, type: 'tunnel-init', fingerprint: ephemeralKeys.fingerprint });
        }
        
        if (data.type === 'tunnel-ack') {
          console.log('📥 [TUNNEL] Received tunnel-ack, preparing key payload');
          const { getSetting } = await import('./storage');
          const masterKey = await getSetting('passphrase');
          const salt = await getSetting('salt');
          
          if (!masterKey || !salt) {
            console.warn('⚠️ [TUNNEL] Creator missing credentials in primary storage, checking localStorage...');
            const localMaster = localStorage.getItem('dodi-passphrase');
            const localSalt = localStorage.getItem('dodi-salt');
            if (localMaster && localSalt && sharedKey) {
              console.log('✅ [TUNNEL] Found fallback credentials in localStorage');
              const payload: MasterKeyPayload = {
                masterKey: localMaster,
                salt: localSalt,
                creatorId: creatorId,
                joinerId: data.joinerId
              };
              const keyMsg = await createTunnelKeyMessage(payload, sharedKey);
              conn.send(keyMsg);
              conn.off('data', handleMessage);
              resolve(payload);
              return;
            } else if (localMaster && localSalt && !sharedKey) {
               console.error('❌ [TUNNEL] Fallback credentials found but sharedKey is missing');
            }
            console.error('❌ [TUNNEL] Creator missing masterKey or salt in all storage locations');
            throw new Error('Missing encryption credentials');
          }

          let payload: MasterKeyPayload | null = null;
          
          if (isRestore) {
            console.log('♾️ [RESTORE] Sending restoration payload to joiner');
            const { getEssentials } = await import('./storage-encrypted');
            const essentials = await getEssentials();
            
            payload = {
              masterKey,
              salt,
              creatorId: creatorId,
              joinerId: data.joinerId,
              essentials // Adding essentials to payload
            } as any;
            
            if (sharedKey && payload) {
              const keyMsg = await createTunnelKeyMessage(payload, sharedKey);
              conn.send({ ...keyMsg, type: 'restore-key' });
              console.log('Sent master key, ID, and essentials to restoring device');
            } else if (payload) {
              // Fallback for unencrypted if sharedKey failed (shouldn't happen in normal flow)
              conn.send({ type: 'restore-key', ...payload });
            }
            // Small delay to ensure message delivery before closing tunnel
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else if (sharedKey) {
            payload = {
              masterKey,
              salt,
              creatorId: creatorId,
              joinerId: data.joinerId
            };
            const keyMsg = await createTunnelKeyMessage(payload, sharedKey);
            conn.send(keyMsg);
          }
          
          conn.off('data', handleMessage);
          if (payload) {
            resolve(payload);
          } else {
            reject(new Error('Failed to generate payload'));
          }
        }
      } catch (err) {
        console.error('Tunnel error:', err);
        reject(err);
      }
    };

    conn.on('data', handleMessage);
  });
}

export async function runJoinerTunnel(conn: any, joinerId: string): Promise<MasterKeyPayload> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🌱 [TUNNEL] Starting joiner handshake');
      const ephemeralKeys = await generateEphemeralKeyPair();
      let sharedKey: CryptoKey | null = null;
      let ackSent = false;

      const handleMessage = async (data: any) => {
        console.log('📬 [TUNNEL] Joiner received:', data.type);
        
        try {
          if (data.type === 'tunnel-init' && !ackSent) {
            console.log('📬 [TUNNEL] Processing tunnel-init from creator');
            sharedKey = await deriveSharedSecret(ephemeralKeys.privateKey, data.publicKey);
            
            // Send ACK with joiner's ID so Creator can proceed to send the key
            console.log('📤 [TUNNEL] Sending tunnel-ack with joinerId:', joinerId);
            conn.send({ 
              type: 'tunnel-ack', 
              joinerId: joinerId,
              publicKey: ephemeralKeys.publicKey,
              fingerprint: ephemeralKeys.fingerprint 
            });
            ackSent = true;
          }
          
          if ((data.type === 'tunnel-key' || data.type === 'restore-key') && sharedKey) {
            console.log('🔑 [TUNNEL] Received key payload, decrypting...');
            const decrypted = await decryptWithSharedSecret(data.iv, data.encrypted, sharedKey);
            const payload = JSON.parse(decrypted);
            console.log('✅ [TUNNEL] Handshake successful');
            conn.off('data', handleMessage);
            resolve(payload);
          }
        } catch (err) {
          console.error('❌ [TUNNEL] Joiner handshake error:', err);
          reject(err);
        }
      };

      conn.on('data', handleMessage);
      // Send initial tunnel-init to kickstart the handshake
      console.log('📤 [TUNNEL] Sending initial tunnel-init to creator');
      conn.send(createTunnelInitMessage(ephemeralKeys.publicKey));
    } catch (err) {
      reject(err);
    }
  });
}

export async function sendPairingAck(conn: any, userId: string): Promise<void> {
  conn.send({ type: 'tunnel-ack', joinerId: userId });
}
