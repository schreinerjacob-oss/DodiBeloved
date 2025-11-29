import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface EphemeralKeyPair {
  publicKey: string;
  privateKey: CryptoKey;
  fingerprint: string;
}

export interface TunnelOffer {
  offer: string;
  publicKey: string;
  fingerprint: string;
}

export interface MasterKeyPayload {
  masterKey: string;
  salt: string;
  creatorId: string;
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

export function createTunnelOffer(webRtcOffer: string, ephemeralKeyPair: EphemeralKeyPair): TunnelOffer {
  return {
    offer: webRtcOffer,
    publicKey: ephemeralKeyPair.publicKey,
    fingerprint: ephemeralKeyPair.fingerprint,
  };
}

export function encodeTunnelOffer(tunnelOffer: TunnelOffer): string {
  const minified = {
    o: tunnelOffer.offer,
    k: tunnelOffer.publicKey,
    f: tunnelOffer.fingerprint,
  };
  return btoa(JSON.stringify(minified));
}

export function decodeTunnelOffer(encoded: string): TunnelOffer | null {
  try {
    const decoded = JSON.parse(atob(encoded));
    return {
      offer: decoded.o,
      publicKey: decoded.k,
      fingerprint: decoded.f,
    };
  } catch {
    return null;
  }
}

export interface TunnelMessage {
  type: 'tunnel-init' | 'tunnel-key' | 'tunnel-ack';
  publicKey?: string;
  iv?: string;
  encrypted?: string;
  fingerprint?: string;
}

export function createTunnelInitMessage(publicKey: string, fingerprint: string): TunnelMessage {
  return {
    type: 'tunnel-init',
    publicKey,
    fingerprint,
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

export async function extractMasterKeyPayload(
  message: TunnelMessage,
  sharedKey: CryptoKey
): Promise<MasterKeyPayload | null> {
  if (message.type !== 'tunnel-key' || !message.iv || !message.encrypted) {
    return null;
  }

  try {
    const decrypted = await decryptWithSharedSecret(
      message.iv,
      message.encrypted,
      sharedKey
    );
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to extract master key payload:', error);
    return null;
  }
}
