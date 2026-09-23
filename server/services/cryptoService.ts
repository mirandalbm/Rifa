import crypto from 'crypto';

const DEFAULT_SECRET = 'your-secret-encryption-key-32-chars!!';
const SECRET_KEY = process.env.API_ENCRYPTION_KEY || DEFAULT_SECRET;

if (!process.env.API_ENCRYPTION_KEY) {
  console.warn(
    '⚠️ API_ENCRYPTION_KEY is not set - API credentials are encrypted with a public default key. ' +
    'Set API_ENCRYPTION_KEY to a long random secret.'
  );
}

const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'v2';
const IV_LENGTH = 12; // recommended nonce size for GCM

/**
 * OpenSSL EVP_BytesToKey (MD5, 1 iteration, no salt) - the derivation used by the
 * removed `crypto.createCipher`. Only needed to read values stored by older versions.
 */
function evpBytesToKey(password: string, keyLen: number, ivLen: number): { key: Buffer; iv: Buffer } {
  const pass = Buffer.from(password, 'utf8');
  let derived = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    prev = crypto.createHash('md5').update(Buffer.concat([prev, pass])).digest();
    derived = Buffer.concat([derived, prev]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

class CryptoService {
  private key: Buffer;

  constructor() {
    this.key = crypto.scryptSync(SECRET_KEY, 'darknews-api-config', 32);
  }

  /** Encrypts with AES-256-GCM and a random IV. Format: `v2:<iv>:<authTag>:<ciphertext>` (hex). */
  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [VERSION_PREFIX, iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /** Decrypts values produced by `encrypt`, and legacy values produced by the old `simpleEncrypt`. */
  decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts[0] === VERSION_PREFIX && parts.length === 4) {
        const [, ivHex, authTagHex, encrypted] = parts;
        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
      }
      return this.legacyDecrypt(encryptedText);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  // Kept for existing callers; both now use the authenticated scheme above.
  simpleEncrypt(text: string): string {
    return this.encrypt(text);
  }

  simpleDecrypt(encryptedText: string): string {
    return this.decrypt(encryptedText);
  }

  // Legacy format: hex ciphertext from `crypto.createCipher('aes192', SECRET_KEY)`.
  private legacyDecrypt(encryptedText: string): string {
    const { key, iv } = evpBytesToKey(SECRET_KEY, 24, 16);
    const decipher = crypto.createDecipheriv('aes-192-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const cryptoService = new CryptoService();
