/**
 * Generate a 32-character lowercase hexadecimal GUID,
 * matching GNUCash's CHAR(32) primary key format.
 *
 * Uses crypto.getRandomValues for cryptographic randomness.
 * Works in both Node.js (globalThis.crypto) and browsers.
 */
export function generateGuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
