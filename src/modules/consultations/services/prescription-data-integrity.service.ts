import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Consultation, ConsultationDocument, PrescriptionStatus } from '../schemas/consultation.schema';
import { FileStorageService } from './file-storage.service';

interface DataIntegrityReport {
  consultationId: string;
  issues: string[];
  fixes: string[];
  status: 'healthy' | 'warning' | 'critical';
}

interface PrescriptionDataVerification {
  hasRequiredFields: boolean;
  signedPdfExists: boolean;
  fileExists: boolean;
  hashMatches: boolean;
  statusConsistent: boolean;
}

@Injectable()
export class PrescriptionDataIntegrityService {
  private readonly logger = new Logger(PrescriptionDataIntegrityService.name);

  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<ConsultationDocument>,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /**
   * Verify and fix prescription data integrity for a specific consultation
   */
  async verifyAndFixConsultation(consultationId: string): Promise<DataIntegrityReport> {
    const report: DataIntegrityReport = {
      consultationId,
      issues: [],
      fixes: [],
      status: 'healthy'
    };

    try {
      const consultation = await this.consultationModel.findById(consultationId);
      
      if (!consultation) {
        report.issues.push('Consultation not found');
        report.status = 'critical';
        return report;
      }

      // Verify prescription data structure
      const verification = await this.verifyPrescriptionData(consultation);
      
      if (consultation.prescriptionStatus === PrescriptionStatus.SENT) {
        // For sent prescriptions, ensure all signed PDF data is present
        await this.verifySignedPrescriptionData(consultation, verification, report);
        
        // If critical issues found, attempt to fix them
        if (report.status === 'critical' && report.issues.length > 0) {
          await this.attemptDataRecovery(consultation, report);
        }
      }

      // Set final status based on issues found
      if (report.issues.length === 0) {
        report.status = 'healthy';
      } else if (report.issues.some(issue => issue.includes('critical') || issue.includes('missing'))) {
        report.status = 'critical';
      } else {
        report.status = 'warning';
      }

      this.logger.log(`Data integrity check completed for consultation ${consultationId}: ${report.status}`);
      
    } catch (error) {
      this.logger.error(`Data integrity check failed for consultation ${consultationId}:`, error.message);
      report.issues.push(`Verification failed: ${error.message}`);
      report.status = 'critical';
    }

    return report;
  }

  /**
   * Verify prescription data structure
   */
  private async verifyPrescriptionData(consultation: ConsultationDocument): Promise<PrescriptionDataVerification> {
    const verification: PrescriptionDataVerification = {
      hasRequiredFields: false,
      signedPdfExists: false,
      fileExists: false,
      hashMatches: false,
      statusConsistent: false
    };

    // Check if prescription data exists
    verification.hasRequiredFields = !!(
      consultation.prescriptionData &&
      consultation.prescriptionData.medications &&
      Array.isArray(consultation.prescriptionData.medications)
    );

    // Check if signed PDF data exists
    verification.signedPdfExists = !!(
      consultation.prescriptionData?.signedPdfUrl &&
      consultation.prescriptionData?.pdfHash &&
      consultation.prescriptionData?.digitalSignature
    );

    // Check status consistency
    verification.statusConsistent = 
      consultation.prescriptionStatus === PrescriptionStatus.SENT ? 
      verification.signedPdfExists : 
      true;

    return verification;
  }

  /**
   * Verify signed prescription data integrity
   */
  private async verifySignedPrescriptionData(
    consultation: ConsultationDocument, 
    verification: PrescriptionDataVerification,
    report: DataIntegrityReport
  ): Promise<void> {
    // Check if signedPdfUrl exists
    if (!consultation.prescriptionData?.signedPdfUrl) {
      report.issues.push('CRITICAL: signedPdfUrl is missing for sent prescription');
      report.status = 'critical';
    }

    // Check if pdfHash exists
    if (!consultation.prescriptionData?.pdfHash) {
      report.issues.push('WARNING: pdfHash is missing');
      if (report.status !== 'critical') report.status = 'warning';
    }

    // Check if digitalSignature exists
    if (!consultation.prescriptionData?.digitalSignature) {
      report.issues.push('WARNING: digitalSignature is missing');
      if (report.status !== 'critical') report.status = 'warning';
    }

    // Verify file exists in storage
    if (consultation.prescriptionData?.signedPdfUrl) {
      try {
        const fileBuffer = await this.fileStorageService.downloadPdf(consultation.prescriptionData.signedPdfUrl);
        verification.fileExists = true;
        
        // TODO: Verify hash matches (if hash verification service is available)
        // const computedHash = this.digitalSignatureService.generatePdfHash(fileBuffer);
        // verification.hashMatches = computedHash === consultation.prescriptionData.pdfHash;
        
        this.logger.log(`Verified signed PDF exists for consultation ${consultation._id}: ${fileBuffer.length} bytes`);
      } catch (error) {
        report.issues.push(`CRITICAL: Signed PDF file not found in storage: ${error.message}`);
        report.status = 'critical';
      }
    }
  }

  /**
   * Attempt to recover missing prescription data
   */
  private async attemptDataRecovery(consultation: ConsultationDocument, report: DataIntegrityReport): Promise<void> {
    this.logger.log(`Attempting data recovery for consultation ${consultation._id}`);

    // Look for the most recent signed PDF file in storage
    if (!consultation.prescriptionData?.signedPdfUrl && consultation.prescriptionStatus === PrescriptionStatus.SENT) {
      const potentialFile = await this.findMostRecentSignedPdf(consultation.consultationId);
      
      if (potentialFile) {
        // Update database with recovered file information
        try {
          await this.consultationModel.findByIdAndUpdate(
            consultation._id,
            {
              $set: {
                'prescriptionData.signedPdfUrl': potentialFile.url,
                'prescriptionData.pdfHash': potentialFile.hash || 'recovered-unknown'
              }
            }
          );
          
          report.fixes.push(`Recovered signedPdfUrl: ${potentialFile.url}`);
          this.logger.log(`Successfully recovered signedPdfUrl for consultation ${consultation._id}`);
        } catch (updateError) {
          this.logger.error(`Failed to update recovered data for consultation ${consultation._id}:`, updateError.message);
          report.issues.push(`Recovery failed: ${updateError.message}`);
        }
      } else {
        report.issues.push('No recoverable signed PDF found in storage');
      }
    }
  }

  /**
   * Find the most recent signed PDF file for a consultation
   */
  private async findMostRecentSignedPdf(consultationId: string): Promise<{ url: string; hash?: string } | null> {
    try {
      // In a production environment, this would query the file storage system
      // For now, we'll use a simple filename pattern match
      const expectedFilename = `prescription-signed-${consultationId}.pdf`;
      
      // This is a simplified implementation
      // In production, you would iterate through storage files and find matches
      const potentialUrl = `/uploads/prescription-signed/${Date.now()}-${expectedFilename}`;
      
      // Check if file exists
      try {
        await this.fileStorageService.downloadPdf(potentialUrl);
        return { url: potentialUrl };
      } catch {
        return null;
      }
    } catch (error) {
      this.logger.error(`Error searching for signed PDF files:`, error.message);
      return null;
    }
  }

  /**
   * Run integrity check on all sent prescriptions
   */
  async runSystemWideIntegrityCheck(): Promise<DataIntegrityReport[]> {
    this.logger.log('Starting system-wide prescription data integrity check');
    
    const sentConsultations = await this.consultationModel
      .find({ prescriptionStatus: PrescriptionStatus.SENT })
      .select('_id prescriptionData prescriptionStatus')
      .lean();

    const reports: DataIntegrityReport[] = [];
    
    for (const consultation of sentConsultations) {
      const report = await this.verifyAndFixConsultation(consultation._id.toString());
      reports.push(report);
      
      // Add delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      total: reports.length,
      healthy: reports.filter(r => r.status === 'healthy').length,
      warning: reports.filter(r => r.status === 'warning').length,
      critical: reports.filter(r => r.status === 'critical').length
    };

    this.logger.log(`System-wide integrity check completed: ${JSON.stringify(summary)}`);
    
    return reports;
  }

  /**
   * Manual fix for a specific consultation (emergency use)
   */
  async emergencyFixConsultation(
    consultationId: string,
    signedPdfUrl: string,
    pdfHash?: string
  ): Promise<void> {
    this.logger.warn(`EMERGENCY FIX: Manually setting signedPdfUrl for consultation ${consultationId}`);
    
    try {
      // Verify the file exists before updating
      await this.fileStorageService.downloadPdf(signedPdfUrl);
      
      const updateResult = await this.consultationModel.findByIdAndUpdate(
        consultationId,
        {
          $set: {
            'prescriptionData.signedPdfUrl': signedPdfUrl,
            ...(pdfHash && { 'prescriptionData.pdfHash': pdfHash }),
            'prescriptionData.emergencyFixApplied': {
              timestamp: new Date(),
              reason: 'Manual emergency fix for missing signedPdfUrl'
            }
          }
        },
        { new: true }
      );

      if (updateResult) {
        this.logger.log(`EMERGENCY FIX SUCCESS: Updated consultation ${consultationId}`);
      } else {
        throw new Error('Consultation not found');
      }
    } catch (error) {
      this.logger.error(`EMERGENCY FIX FAILED for consultation ${consultationId}:`, error.message);
      throw error;
    }
  }
}
