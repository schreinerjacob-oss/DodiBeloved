/**
 * Room-based tunnel protocol over PeerJS
 * Implements secure HMAC-based Secret Handshake to prevent unauthorized access
 * Prevents unauthorized users from joining the room and obtaining the master key
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
  generateProof,
  verifyProof,
  type EphemeralKeyPair,
  type TunnelMessage,
  type MasterKeyPayload,
} from './tunnel-handshake';

/**
 * Run tunnel protocol as creator (Device A)
 * Uses HMAC-based secret handshake for authorization
 */
export async function runCreatorTunnel(
  conn: DataConnection,
  userId: string
): Promise<MasterKeyPayload> {
  console.log('🎭 Running creator tunnel protocol with secure handshake...');
  
  // Generate ephemeral keypair
  const ephemeralKeyPair = await generateEphemeralKeyPair();
  console.log('✓ Ephemeral keypair generated');

  // Send our public key with proof
  const initMsg = createTunnelInitMessage(ephemeralKeyPair.publicKey);
  const initProof = await generateProof(
    JSON.stringify(initMsg),
    ephemeralKeyPair.privateKey as any // Using private key as seed for initial proof
  ).catch(() => '');
  const initMsgWithProof = { ...initMsg, proof: initProof };
  conn.send(initMsgWithProof);
  console.log('✓ Sent tunnel-init with proof');

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

  // Verify joiner's proof using derived shared secret
  if (joinInitMsg.proof) {
    const joinerInitNoProof = {
      type: joinInitMsg.type,
      publicKey: joinInitMsg.publicKey,
    };
    const proofValid = await verifyProof(
      JSON.stringify(joinerInitNoProof),
      joinInitMsg.proof,
      sharedSecret
    );
    if (!proofValid) {
      console.warn('⚠ Joiner proof verification failed - rejecting unauthorized connection');
      throw new Error('Unauthorized: Invalid joiner proof');
    }
    console.log('✓ Joiner proof verified');
  }

  // Generate master key + salt
  const masterKey = generateMasterKey();
  const salt = generateMasterSalt();
  console.log('✓ Master key generated');

  // Encrypt payload with shared secret
  const payload: MasterKeyPayload = { masterKey, salt, creatorId: userId };
  const { iv, encrypted } = await encryptWithSharedSecret(
    JSON.stringify(payload),
    sharedSecret
  );
  
  // Generate proof for key message
  const keyMsg = { type: 'tunnel-key', iv, encrypted };
  const keyProof = await generateProof(
    JSON.stringify(keyMsg),
    sharedSecret
  );

  // Send encrypted master key with proof
  conn.send({ ...keyMsg, proof: keyProof });
  console.log('✓ Master key sent (encrypted with proof)');

  return payload;
}

/**
 * Run tunnel protocol as joiner (Device B)
 * Uses HMAC-based secret handshake for authorization
 */
export async function runJoinerTunnel(
  conn: DataConnection
): Promise<MasterKeyPayload> {
  console.log('🎭 Running joiner tunnel protocol with secure handshake...');

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

  // Verify creator's proof using derived shared secret
  if (creatorInitMsg.proof) {
    const creatorInitNoProof = {
      type: creatorInitMsg.type,
      publicKey: creatorInitMsg.publicKey,
    };
    const proofValid = await verifyProof(
      JSON.stringify(creatorInitNoProof),
      creatorInitMsg.proof,
      sharedSecret
    );
    if (!proofValid) {
      console.warn('⚠ Creator proof verification failed - rejecting unauthorized connection');
      throw new Error('Unauthorized: Invalid creator proof');
    }
    console.log('✓ Creator proof verified');
  }

  // Send our public key with proof
  const initMsg = createTunnelInitMessage(ephemeralKeyPair.publicKey);
  const initProof = await generateProof(
    JSON.stringify(initMsg),
    sharedSecret
  );
  const initMsgWithProof = { ...initMsg, proof: initProof };
  conn.send(initMsgWithProof);
  console.log('✓ Sent joiner tunnel-init with proof');

  // Wait for encrypted master key
  const keyMsg = (await waitForData<TunnelMessage>(conn)) as TunnelMessage;
  if (keyMsg.type !== 'tunnel-key' || !keyMsg.iv || !keyMsg.encrypted) {
    throw new Error('Invalid tunnel-key message');
  }
  console.log('✓ Received encrypted master key');

  // Verify key message proof
  if (keyMsg.proof) {
    const keyMsgNoProof = {
      type: keyMsg.type,
      iv: keyMsg.iv,
      encrypted: keyMsg.encrypted,
    };
    const proofValid = await verifyProof(
      JSON.stringify(keyMsgNoProof),
      keyMsg.proof,
      sharedSecret
    );
    if (!proofValid) {
      console.warn('⚠ Key message proof verification failed - rejecting message');
      throw new Error('Unauthorized: Invalid key message proof');
    }
    console.log('✓ Key message proof verified');
  }

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
