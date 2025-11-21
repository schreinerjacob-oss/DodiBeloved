import type { EncryptedData } from "@shared/schema";

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passphraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoder.encode(data)
  );

  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encryptedBuffer),
  };
}

export async function decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(encryptedData.iv) },
    key,
    base64ToArrayBuffer(encryptedData.data)
  );

  return decoder.decode(decryptedBuffer);
}

export function generateSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generatePassphrase(): string {
  const words = [
    "sunset", "ocean", "mountain", "river", "forest", "meadow", "breeze", "starlight",
    "whisper", "embrace", "harmony", "serenity", "bloom", "radiant", "gentle", "precious",
    "treasure", "beloved", "cherish", "eternal", "promise", "devotion", "moonlight", "dawn"
  ];
  
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).join("-");
}
