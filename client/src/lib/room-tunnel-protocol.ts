/**
 * Room-based tunnel protocol over PeerJS
 * Handles X3DH-like ephemeral key exchange + master key transmission
 */

import type { DataConnection } from 'peerjs';
import {
  generateEphemeralKeyPair,
  deriveSharedSecret,
  generateMasterKey,
  generateMasterSalt,
  createTunnelInitMessage,
  createTunnelKeyMessage,
  encryptWithSharedSecret,
  decryptWithSharedSecret,
  type EphemeralKeyPair,
  type TunnelMessage,
  type MasterKeyPayload,
} from './tunnel-handshake';

/**
 * Run tunnel protocol as creator (Device A)
 */
export async function runCreatorTunnel(
  conn: DataConnection,
  userId: string
): Promise<MasterKeyPayload> {
  console.log('🎭 Running creator tunnel protocol...');
  
  // Generate ephemeral keypair
  const ephemeralKeyPair = await generateEphemeralKeyPair();
  console.log('✓ Ephemeral keypair generated');

  // Send our public key
  const initMsg = createTunnelInitMessage(ephemeralKeyPair.publicKey);
  conn.send(initMsg);
  console.log('✓ Sent tunnel-init');

  // Wait for joiner's public key
  const joinInitMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  if (joinInitMsg.type !== 'tunnel-init' || !joinInitMsg.publicKey) {
    throw new Error('Invalid joiner tunnel-init');
  }
  console.log('✓ Received joiner tunnel-init');

  // Derive shared secret with joiner's public key
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    joinInitMsg.publicKey
  );
  console.log('✓ Shared secret derived');

  // Generate master key + salt
  const masterKey = generateMasterKey();
  const salt = generateMasterSalt();
  console.log('✓ Master key generated');

  // Wait for joiner's ID (sent after tunnel-init)
  const joinerIdMsg = (await waitForData<{ joinerId: string }>(conn)) as { joinerId: string };
  if (!joinerIdMsg.joinerId) {
    throw new Error('Joiner did not send their ID');
  }
  const joinerId = joinerIdMsg.joinerId;
  console.log('✓ Received joiner ID:', joinerId);

  // Encrypt payload with shared secret (including joiner ID for acknowledgment)
  const payload: MasterKeyPayload = { masterKey, salt, creatorId: userId, joinerId };
  const { iv, encrypted } = await encryptWithSharedSecret(
    JSON.stringify(payload),
    sharedSecret
  );
  
  // Send encrypted master key
  conn.send({ type: 'tunnel-key', iv, encrypted });
  console.log('✓ Master key sent (encrypted)');

  return payload;
}

/**
 * Run tunnel protocol as joiner (Device B)
 */
export async function runJoinerTunnel(
  conn: DataConnection,
  joinerId: string
): Promise<MasterKeyPayload> {
  console.log('🎭 Running joiner tunnel protocol...');

  // Generate ephemeral keypair
  const ephemeralKeyPair = await generateEphemeralKeyPair();
  console.log('✓ Ephemeral keypair generated');

  // Wait for creator's public key
  const creatorInitMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  if (creatorInitMsg.type !== 'tunnel-init' || !creatorInitMsg.publicKey) {
    throw new Error('Invalid creator tunnel-init');
  }
  console.log('✓ Received creator tunnel-init');

  // Derive shared secret with creator's public key
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    creatorInitMsg.publicKey
  );
  console.log('✓ Shared secret derived');

  // Send our public key
  const initMsg = createTunnelInitMessage(ephemeralKeyPair.publicKey);
  conn.send(initMsg);
  console.log('✓ Sent joiner tunnel-init');

  // Send our ID to creator
  conn.send({ joinerId });
  console.log('✓ Sent joiner ID to creator');

  // Wait for encrypted master key
  const keyMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  if (keyMsg.type !== 'tunnel-key' || !keyMsg.iv || !keyMsg.encrypted) {
    throw new Error('Invalid tunnel-key message');
  }
  console.log('✓ Received encrypted master key');

  // Decrypt master key
  const decrypted = await decryptWithSharedSecret(keyMsg.iv, keyMsg.encrypted, sharedSecret);
  const payload: MasterKeyPayload = JSON.parse(decrypted);
  console.log('✓ Master key decrypted and verified');

  return payload;
}

/**
 * Helper: Wait for data with timeout
 */
function waitForData<T = unknown>(
  conn: DataConnection,
  timeout: number = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tunnel protocol timeout'));
    }, timeout);

    const handler = (data: unknown) => {
      clearTimeout(timer);
      conn.off('data', handler);
      resolve(data as T);
    };

    conn.on('data', handler);
  });
}
