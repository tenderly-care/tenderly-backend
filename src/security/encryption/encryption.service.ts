import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  algorithm: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger('EncryptionService');
  private readonly algorithm: string;
  private readonly keySize: number;
  private readonly ivSize: number;
  private readonly tagSize: number;
  private readonly iterations: number;
  private readonly masterKey: string;

  constructor(private configService: ConfigService) {
    this.algorithm = this.configService.get<string>('security.encryption.algorithm') || 'aes-256-gcm';
    this.keySize = this.configService.get<number>('security.encryption.keySize') || 32;
    this.ivSize = this.configService.get<number>('security.encryption.ivSize') || 16;
    this.tagSize = this.configService.get<number>('security.encryption.tagSize') || 16;
    this.iterations = this.configService.get<number>('security.encryption.keyDerivationIterations') || 100000;
    this.masterKey = this.configService.get<string>('security.encryption.dataEncryptionKey') || 'change-this-key-in-production';

    if (!this.masterKey || this.masterKey === 'change-this-key-in-production') {
      this.logger.warn('Using default encryption key. Please set DATA_ENCRYPTION_KEY in production!');
    }
  }

  /**
   * Derives an encryption key from the master key using PBKDF2
   */
  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keySize, 'sha512');
  }

  /**
   * Encrypts sensitive data using AES-256-GCM
   */
  async encryptPII(data: string): Promise<EncryptedData> {
    try {
      if (!data) {
        throw new Error('Data to encrypt cannot be empty');
      }

      // Generate random salt and IV
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(this.ivSize);
      
      // Derive encryption key
      const key = this.deriveKey(salt);
      
      // Create cipher with proper GCM mode
      const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;
      cipher.setAAD(salt); // Additional authenticated data
      
      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: Buffer.concat([salt, iv]).toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm,
      };
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts sensitive data
   */
  async decryptPII(encryptedData: EncryptedData): Promise<string> {
    try {
      if (!encryptedData || !encryptedData.encrypted) {
        throw new Error('Invalid encrypted data');
      }

      // Extract salt and IV
      const combined = Buffer.from(encryptedData.iv, 'hex');
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16);
      
      // Derive decryption key
      const key = this.deriveKey(salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(encryptedData.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAAD(salt);
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hashes passwords securely using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verifies password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates a cryptographically secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generates HMAC for data integrity verification
   */
  generateHMAC(data: string, secret?: string): string {
    const key = secret || this.masterKey;
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  /**
   * Verifies HMAC signature
   */
  verifyHMAC(data: string, signature: string, secret?: string): boolean {
    const key = secret || this.masterKey;
    const expectedSignature = crypto.createHmac('sha256', key).update(data).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Generates a secure hash for data fingerprinting
   */
  generateHash(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Encrypts file data for secure storage
   */
  async encryptFile(fileBuffer: Buffer): Promise<EncryptedData> {
    const data = fileBuffer.toString('base64');
    return this.encryptPII(data);
  }

  /**
   * Decrypts file data
   */
  async decryptFile(encryptedData: EncryptedData): Promise<Buffer> {
    const decryptedData = await this.decryptPII(encryptedData);
    return Buffer.from(decryptedData, 'base64');
  }
}
