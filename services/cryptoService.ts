
/**
 * Simple utility for End-to-End Encryption using Web Crypto API
 */

export class CryptoService {
  private static ALGORITHM = 'AES-GCM';

  static async generateKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
      { name: this.ALGORITHM, length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  static async exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  static async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
    return await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      this.ALGORITHM,
      true,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt(data: ArrayBuffer, key: CryptoKey): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      data
    );
    return { iv, ciphertext };
  }

  static async decrypt(ciphertext: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    return await window.crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv },
      key,
      ciphertext
    );
  }
}
