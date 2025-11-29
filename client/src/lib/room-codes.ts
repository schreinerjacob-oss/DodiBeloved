/**
 * Generate a random 8-character room code for pairing
 * Format: XXXX-XXXX (e.g., A7K9-P2M4)
 * Uses uppercase letters and numbers for easy typing
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // Removed I, L, O, 0, 1 for clarity
  let code = '';
  
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Validate and normalize a room code
 */
export function normalizeRoomCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 9); // Max 8 chars + 1 dash
}

/**
 * Check if a room code is valid (8 chars + 1 dash at position 4)
 */
export function isValidRoomCode(code: string): boolean {
  const normalized = normalizeRoomCode(code);
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized);
}
