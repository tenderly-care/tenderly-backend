import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface DigitalSignatureResult {
  signature: string;
  algorithm: string;
  certificateId: string;
  signedAt: Date;
}

@Injectable()
export class DigitalSignatureService {
  private readonly logger = new Logger(DigitalSignatureService.name);
  private readonly awsKmsKeyId: string;
  private readonly algorithm = 'RS256';

  constructor(private configService: ConfigService) {
    this.awsKmsKeyId = this.configService.get<string>('storage.aws.kms.keyId') || 'default-key';
  }

  /**
   * Signs data using digital signature
   * In production, this would integrate with AWS KMS for secure signing
   */
  async signData(dataToSign: string): Promise<DigitalSignatureResult> {
    try {
      this.logger.log('Creating digital signature for prescription data');

      // Create a hash of the data to sign
      const dataHash = crypto.createHash('sha256').update(dataToSign).digest('hex');
      
      // In production, this would use AWS KMS asymmetric signing
      // For now, we'll simulate the signing process
      const signature = this.simulateKMSSign(dataHash);

      const result: DigitalSignatureResult = {
        signature,
        algorithm: this.algorithm,
        certificateId: this.awsKmsKeyId,
        signedAt: new Date(),
      };

      this.logger.log('Digital signature created successfully');
      return result;

    } catch (error) {
      this.logger.error('Failed to create digital signature:', error);
      throw new InternalServerErrorException('Digital signature creation failed');
    }
  }

  /**
   * Verify digital signature
   */
  async verifySignature(originalData: string, signature: string, certificateId: string): Promise<boolean> {
    try {
      const dataHash = crypto.createHash('sha256').update(originalData).digest('hex');
      const expectedSignature = this.simulateKMSSign(dataHash);
      
      return signature === expectedSignature && certificateId === this.awsKmsKeyId;
    } catch (error) {
      this.logger.error('Failed to verify signature:', error);
      return false;
    }
  }

  /**
   * Simulate AWS KMS signing - In production, this would call AWS KMS
   * This creates a deterministic signature for demonstration purposes
   */
  private simulateKMSSign(dataHash: string): string {
    // In production, this would be:
    // const params = {
    //   KeyId: this.awsKmsKeyId,
    //   Message: Buffer.from(dataHash),
    //   SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    //   MessageType: 'DIGEST'
    // };
    // const result = await this.kmsClient.sign(params).promise();
    // return result.Signature.toString('base64');

    // Simulate signing with a deterministic result
    const secretKey = this.configService.get<string>('security.encryption.dataEncryptionKey') || 'default-secret';
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(dataHash);
    return hmac.digest('base64');
  }

  /**
   * Generate PDF hash for integrity verification
   */
  generatePdfHash(pdfBuffer: Buffer): string {
    return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  }
}
