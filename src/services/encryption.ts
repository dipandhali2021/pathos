import * as crypto from 'crypto';

export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 12; // 96 bits for GCM
  private tagLength = 16; // 128 bits authentication tag
  private key: Buffer;

  constructor() {
    // Generate a deterministic key based on the machine ID to ensure consistent decryption
    const machineId = this.getMachineId();
    this.key = crypto.pbkdf2Sync(machineId, 'devtrack-salt', 100000, this.keyLength, 'sha256');
  }

  private getMachineId(): string {
    // Use a combination of environment variables to create a unique machine ID
    const env = process.env;
    return crypto.createHash('sha256')
      .update(JSON.stringify({
        username: env.USERNAME || env.USER,
        hostname: env.HOSTNAME || env.COMPUTERNAME,
        home: env.HOME || env.USERPROFILE
      }))
      .digest('hex');
  }

  encrypt(data: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as crypto.CipherGCM;
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    // Combine IV, encrypted data, and auth tag
    const result = Buffer.concat([iv, tag, encrypted]);
    return result.toString('base64');
  }

  decrypt(encryptedData: string): string {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      
      // Extract IV, tag and encrypted content
      const iv = buffer.subarray(0, this.ivLength);
      const tag = buffer.subarray(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = buffer.subarray(this.ivLength + this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(tag);

      return decipher.update(encrypted) + decipher.final('utf8');
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }
}