import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileUploadResult {
  url: string;
  key: string;
  bucket?: string;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly localUploadPath: string;
  private readonly useLocalStorage: boolean;

  constructor(private configService: ConfigService) {
    this.localUploadPath = this.configService.get<string>('storage.local.uploadPath') || './uploads';
    // For now, we'll use local storage. In production, this would be AWS S3
    this.useLocalStorage = true;
    
    // Ensure upload directory exists
    this.ensureUploadDirectory();
  }

  /**
   * Upload PDF file to storage
   */
  async uploadPdf(
    pdfBuffer: Buffer, 
    fileName: string, 
    isDraft: boolean = false
  ): Promise<FileUploadResult> {
    try {
      const folder = isDraft ? 'prescription-drafts' : 'prescription-signed';
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}-${fileName}`;
      
      if (this.useLocalStorage) {
        return await this.uploadToLocal(pdfBuffer, uniqueFileName, folder);
      } else {
        // In production, this would upload to AWS S3
        return await this.uploadToS3(pdfBuffer, uniqueFileName, folder);
      }
    } catch (error) {
      this.logger.error('Failed to upload PDF:', error);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  /**
   * Generate pre-signed URL for secure access
   */
  async generatePresignedUrl(fileKey: string, expirationMinutes: number = 10): Promise<string> {
    try {
      if (this.useLocalStorage) {
        // For local storage, return a simple URL
        // In production, this would generate a pre-signed S3 URL
        return `${this.configService.get<string>('app.apiPrefix')}/files/${fileKey}`;
      } else {
        // AWS S3 pre-signed URL generation would go here
        return this.generateS3PresignedUrl(fileKey, expirationMinutes);
      }
    } catch (error) {
      this.logger.error('Failed to generate presigned URL:', error);
      throw new InternalServerErrorException('Failed to generate file access URL');
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      if (this.useLocalStorage) {
        const filePath = path.join(this.localUploadPath, fileKey);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`Deleted file: ${fileKey}`);
        }
      } else {
        // AWS S3 deletion would go here
        await this.deleteFromS3(fileKey);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file ${fileKey}:`, error);
      // Don't throw error for deletion failures - log and continue
    }
  }

  /**
   * Upload to local storage
   */
  private async uploadToLocal(pdfBuffer: Buffer, fileName: string, folder: string): Promise<FileUploadResult> {
    const folderPath = path.join(this.localUploadPath, folder);
    
    // Ensure folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = path.join(folderPath, fileName);
    const fileKey = path.join(folder, fileName);

    fs.writeFileSync(filePath, pdfBuffer);
    
    this.logger.log(`File uploaded to local storage: ${fileKey}`);
    
    return {
      url: `/uploads/${fileKey}`,
      key: fileKey,
    };
  }

  /**
   * Upload to AWS S3 (placeholder for production implementation)
   */
  private async uploadToS3(pdfBuffer: Buffer, fileName: string, folder: string): Promise<FileUploadResult> {
    // In production, this would use AWS SDK:
    // const s3 = new AWS.S3();
    // const params = {
    //   Bucket: this.configService.get<string>('storage.aws.s3.prescriptionsBucket'),
    //   Key: `${folder}/${fileName}`,
    //   Body: pdfBuffer,
    //   ContentType: 'application/pdf',
    //   ServerSideEncryption: 'AES256',
    // };
    // const result = await s3.upload(params).promise();
    
    const bucket = this.configService.get<string>('storage.aws.s3.prescriptionsBucket') || 'tenderly-prescriptions';
    const key = `${folder}/${fileName}`;
    
    this.logger.log(`Would upload to S3: ${bucket}/${key}`);
    
    return {
      url: `https://${bucket}.s3.amazonaws.com/${key}`,
      key,
      bucket,
    };
  }

  /**
   * Generate S3 pre-signed URL (placeholder for production implementation)
   */
  private async generateS3PresignedUrl(fileKey: string, expirationMinutes: number): Promise<string> {
    // In production:
    // const s3 = new AWS.S3();
    // const params = {
    //   Bucket: this.configService.get<string>('storage.aws.s3.prescriptionsBucket'),
    //   Key: fileKey,
    //   Expires: expirationMinutes * 60,
    // };
    // return s3.getSignedUrl('getObject', params);
    
    return `https://signed-url-for-${fileKey}?expires=${expirationMinutes}min`;
  }

  /**
   * Delete from S3 (placeholder for production implementation)
   */
  private async deleteFromS3(fileKey: string): Promise<void> {
    // In production:
    // const s3 = new AWS.S3();
    // const params = {
    //   Bucket: this.configService.get<string>('storage.aws.s3.prescriptionsBucket'),
    //   Key: fileKey,
    // };
    // await s3.deleteObject(params).promise();
    
    this.logger.log(`Would delete from S3: ${fileKey}`);
  }

  /**
   * Ensure upload directory exists
   */
  private ensureUploadDirectory(): void {
    if (!fs.existsSync(this.localUploadPath)) {
      fs.mkdirSync(this.localUploadPath, { recursive: true });
      this.logger.log(`Created upload directory: ${this.localUploadPath}`);
    }
  }
}
