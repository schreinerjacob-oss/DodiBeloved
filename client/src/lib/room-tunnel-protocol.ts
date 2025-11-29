import type { DataConnection } from 'peerjs';
import {
  generateEphemeralKeyPair,
  deriveSharedSecret,
  generateMasterKey,
  generateMasterSalt,
  encryptWithSharedSecret,
  decryptWithSharedSecret,
  type TunnelMessage,
  type MasterKeyPayload,
} from './tunnel-handshake';
import { arrayBufferToBase64 } from './crypto';

// Helper: Sign data with the pairing secret using HMAC-SHA256
async function signData(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign(
    'HMAC',
    key,
    messageData
  );

  return arrayBufferToBase64(signature);
}

/**
 * Run tunnel protocol as CREATOR (Device A)
 * Returns: The Joiner's User ID (so we can save them as our partner)
 */
export async function runCreatorTunnel(
  conn: DataConnection,
  myUserId: string,
  pairingSecret: string
): Promise<{ masterKey: string; salt: string; partnerId: string }> {
  console.log('🎭 Creator: Starting SECURE tunnel protocol...');
  
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  // 1. Send our Public Key
  conn.send({
    type: 'tunnel-init',
    publicKey: ephemeralKeyPair.publicKey,
  });

  // 2. Wait for Joiner's Response (Public Key + Proof + UserID)
  const joinResponse = (await waitForData<TunnelMessage>(conn)) as any;
  
  if (joinResponse.type !== 'tunnel-init' || !joinResponse.publicKey || !joinResponse.proof) {
    throw new Error('Invalid protocol: Missing key or proof from joiner');
  }

  // 3. Verify Joiner's Proof
  const expectedPayload = ephemeralKeyPair.publicKey + joinResponse.publicKey;
  const expectedProof = await signData(expectedPayload, pairingSecret);

  if (joinResponse.proof !== expectedProof) {
    console.error('🚨 SECURITY ALERT: Invalid handshake proof!');
    conn.close();
    throw new Error('Security verification failed.');
  }

  const joinerId = joinResponse.userId;
  if (!joinerId) throw new Error('Protocol error: Joiner did not send User ID');
  
  console.log('✅ Creator: Validated partner:', joinerId);

  // 4. Derive Shared Secret
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    joinResponse.publicKey
  );

  // 5. Encrypt and Send Master Key
  const masterKey = generateMasterKey();
  const salt = generateMasterSalt();
  const payload: MasterKeyPayload = { masterKey, salt, creatorId: myUserId };
  
  const { iv, encrypted } = await encryptWithSharedSecret(
    JSON.stringify(payload),
    sharedSecret
  );
  
  conn.send({ type: 'tunnel-key', iv, encrypted });
  console.log('🔐 Creator: Keys sent.');

  // Return the keys AND the partner's ID so we can save it
  return { masterKey, salt, partnerId: joinerId };
}

/**
 * Run tunnel protocol as JOINER (Device B)
 */
export async function runJoinerTunnel(
  conn: DataConnection,
  myUserId: string,
  pairingSecret: string
): Promise<MasterKeyPayload> {
  console.log('🎭 Joiner: Starting SECURE tunnel protocol...');

  const ephemeralKeyPair = await generateEphemeralKeyPair();

  // 1. Wait for Creator's Public Key
  const creatorInitMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  
  if (creatorInitMsg.type !== 'tunnel-init' || !creatorInitMsg.publicKey) {
    throw new Error('Invalid protocol: Missing creator key');
  }

  // 2. Generate Proof
  const proofPayload = creatorInitMsg.publicKey + ephemeralKeyPair.publicKey;
  const proof = await signData(proofPayload, pairingSecret);

  // 3. Send Our Public Key + Proof + Our UserID
  conn.send({
    type: 'tunnel-init',
    publicKey: ephemeralKeyPair.publicKey,
    proof: proof,
    userId: myUserId,
  } as any);

  // 4. Derive Shared Secret
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    creatorInitMsg.publicKey
  );

  // 5. Wait for Encrypted Master Key
  const keyMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  if (keyMsg.type !== 'tunnel-key' || !keyMsg.iv || !keyMsg.encrypted) {
    throw new Error('Invalid protocol: Missing key data');
  }

  // 6. Decrypt Master Key
  const decrypted = await decryptWithSharedSecret(keyMsg.iv, keyMsg.encrypted, sharedSecret);
  const payload: MasterKeyPayload = JSON.parse(decrypted);

  return payload;
}

function waitForData<T = unknown>(conn: DataConnection, timeout: number = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tunnel timeout')), timeout);
    const handler = (data: unknown) => {
      clearTimeout(timer);
      conn.off('data', handler);
      resolve(data as T);
    };
    conn.on('data', handler);
  });
}
