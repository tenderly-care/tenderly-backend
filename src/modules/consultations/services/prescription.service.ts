import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException, 
  InternalServerErrorException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Consultation, ConsultationDocument, PrescriptionStatus, PrescriptionAction, ConsultationStatus } from '../schemas/consultation.schema';
import { User, UserDocument, UserRole } from '../../users/schemas/user.schema';
import { 
  UpdateDiagnosisDto, 
  SavePrescriptionDraftDto, 
  SignAndSendDto,
  PrescriptionWorkspaceResponseDto,
  PrescriptionStatusResponseDto,
  PrescriptionPreviewResponseDto,
  SignedPrescriptionResponseDto,
  PrescriptionHistoryDto
} from '../dto/prescription.dto';
import { ModifyDiagnosisDto } from '../dto/modify-diagnosis.dto';
import { PdfGenerationService } from './pdf-generation.service';
import { DigitalSignatureService } from './digital-signature.service';
import { FileStorageService } from './file-storage.service';
import { AuditService } from '../../../security/audit/audit.service';
import { ConsultationBusinessService } from './consultation-business.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PrescriptionService {
  private readonly logger = new Logger(PrescriptionService.name);

  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<ConsultationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly pdfGenerationService: PdfGenerationService,
    private readonly digitalSignatureService: DigitalSignatureService,
    private readonly fileStorageService: FileStorageService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly consultationBusinessService: ConsultationBusinessService,
  ) {}

  async getPrescriptionWorkspace(
    consultationId: string,
    user: UserDocument,
  ): Promise<PrescriptionWorkspaceResponseDto> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    // Convert doctorDiagnosis ObjectId fields to strings for DTO compatibility
    const doctorDiagnosis = consultation.doctorDiagnosis ? {
      ...consultation.doctorDiagnosis,
      modifiedBy: consultation.doctorDiagnosis.modifiedBy.toString(),
    } : undefined;

    return {
      consultationId: consultation.consultationId,
      structuredAssessmentInput: consultation.structuredAssessmentInput,
      aiAgentOutput: consultation.aiAgentOutput,
      doctorDiagnosis,
      prescriptionStatus: consultation.prescriptionStatus,
      prescriptionData: consultation.prescriptionData,
      patientInfo: {
        firstName: 'Patient', // Replace with actual patient data
        lastName: 'Name',
      },
      hasDoctorDiagnosis: !!consultation.doctorDiagnosis,
    };
  }

  private async findAndValidateConsultation(
    consultationId: string,
    doctorId: Types.ObjectId,
  ): Promise<ConsultationDocument> {
    if (!Types.ObjectId.isValid(consultationId)) {
      throw new BadRequestException('Invalid consultation ID format');
    }

    const consultation = await this.consultationModel.findById(consultationId);

    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${consultationId} not found`);
    }

    if (consultation.doctorId.toString() !== doctorId.toString()) {
      throw new ForbiddenException('You are not authorized to access this consultation');
    }

    return consultation;
  }

  async updateDiagnosis(
    consultationId: string,
    user: UserDocument,
    updateDiagnosisDto: UpdateDiagnosisDto,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<PrescriptionStatusResponseDto> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    // Initialize prescription data if it doesn't exist
    if (!consultation.prescriptionData) {
      consultation.prescriptionData = {} as any;
    }

    // Update diagnosis
    consultation.prescriptionData.modifiedDiagnosis = {
      primaryDiagnosis: updateDiagnosisDto.primaryDiagnosis,
      differentialDiagnosis: updateDiagnosisDto.differentialDiagnosis,
      clinicalReasoning: updateDiagnosisDto.clinicalReasoning,
      confidenceScore: updateDiagnosisDto.confidenceScore,
      modifiedAt: new Date(),
      modifiedBy: user._id as Types.ObjectId,
    };

    consultation.prescriptionStatus = PrescriptionStatus.DIAGNOSIS_MODIFICATION;
    
    // Add to prescription history
    this.addToPrescriptionHistory(
      consultation,
      PrescriptionAction.DIAGNOSIS_MODIFIED,
      user._id as Types.ObjectId,
      'Doctor modified AI diagnosis',
      metadata,
    );

    await consultation.save();

    this.logger.log(`Diagnosis updated for consultation ${consultationId} by doctor ${user._id}`);

    return {
      prescriptionStatus: consultation.prescriptionStatus,
      message: 'Diagnosis updated successfully',
      updatedAt: new Date(),
    };
  }

  async modifyDiagnosis(
    consultationId: string,
    user: UserDocument,
    modifyDiagnosisDto: ModifyDiagnosisDto,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<any> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (!consultation.aiAgentOutput) {
      throw new BadRequestException('AI diagnosis not found for this consultation');
    }

    const originalDiagnosis = consultation.aiAgentOutput;
    
    // Determine the diagnosis data to use
    let diagnosisToSave;
    let isInitialCopy = false;
    let baseData;
    
    // Check if incoming diagnosis data is empty or absent
    const hasIncomingData = modifyDiagnosisDto && 
      (modifyDiagnosisDto.possible_diagnoses || 
       modifyDiagnosisDto.clinical_reasoning || 
       modifyDiagnosisDto.recommended_investigations || 
       modifyDiagnosisDto.treatment_recommendations ||
       modifyDiagnosisDto.patient_education ||
       modifyDiagnosisDto.warning_signs ||
       modifyDiagnosisDto.confidence_score ||
       modifyDiagnosisDto.processing_notes ||
       modifyDiagnosisDto.disclaimer);
    
    if (!hasIncomingData) {
      // Initialize doctorDiagnosis with aiAgentOutput if no incoming data
      diagnosisToSave = { ...originalDiagnosis };
      isInitialCopy = true;
      baseData = originalDiagnosis;
      this.logger.log(`Initializing doctorDiagnosis with aiAgentOutput for consultation ${consultationId}`);
    } else {
      // Use existing doctorDiagnosis as base, or aiAgentOutput if doctorDiagnosis doesn't exist
      baseData = consultation.doctorDiagnosis || originalDiagnosis;
      
      // Merge existing data with new modifications
      diagnosisToSave = {
        // Start with existing data (either doctorDiagnosis or aiAgentOutput)
        ...baseData,
        // Override with new data only for fields that are provided
        ...(modifyDiagnosisDto.possible_diagnoses !== undefined && { possible_diagnoses: modifyDiagnosisDto.possible_diagnoses }),
        ...(modifyDiagnosisDto.clinical_reasoning !== undefined && { clinical_reasoning: modifyDiagnosisDto.clinical_reasoning }),
        ...(modifyDiagnosisDto.recommended_investigations !== undefined && { recommended_investigations: modifyDiagnosisDto.recommended_investigations }),
        ...(modifyDiagnosisDto.treatment_recommendations !== undefined && { treatment_recommendations: modifyDiagnosisDto.treatment_recommendations }),
        ...(modifyDiagnosisDto.patient_education !== undefined && { patient_education: modifyDiagnosisDto.patient_education }),
        ...(modifyDiagnosisDto.warning_signs !== undefined && { warning_signs: modifyDiagnosisDto.warning_signs }),
        ...(modifyDiagnosisDto.confidence_score !== undefined && { confidence_score: modifyDiagnosisDto.confidence_score }),
        ...(modifyDiagnosisDto.processing_notes !== undefined && { processing_notes: modifyDiagnosisDto.processing_notes }),
        ...(modifyDiagnosisDto.disclaimer !== undefined && { disclaimer: modifyDiagnosisDto.disclaimer }),
      };
      
      this.logger.log(`Modifying existing doctorDiagnosis for consultation ${consultationId}`);
    }

    // Calculate changes from original AI diagnosis
    const changesFromAI = Object.keys(diagnosisToSave).filter(key => {
      if (key === 'modifiedAt' || key === 'modifiedBy' || key === 'modificationType' || key === 'modificationNotes' || key === 'changesFromAI' || key === 'isInitialCopy') {
        return false; // Skip metadata fields
      }
      return JSON.stringify(originalDiagnosis[key]) !== JSON.stringify(diagnosisToSave[key]);
    });

    // Determine modification type
    const modificationType = isInitialCopy 
      ? 'initial_copy' 
      : changesFromAI.length === 0 
        ? 'no_changes' 
        : 'enhanced';

    consultation.doctorDiagnosis = {
      ...diagnosisToSave,
      modifiedAt: new Date(),
      modifiedBy: user._id as Types.ObjectId,
      modificationType,
      modificationNotes: modifyDiagnosisDto?.modificationNotes || (isInitialCopy ? 'Initial copy of AI diagnosis' : consultation.doctorDiagnosis?.modificationNotes || ''),
      changesFromAI,
      isInitialCopy,
    };

    consultation.prescriptionStatus = PrescriptionStatus.DIAGNOSIS_MODIFICATION;

    const historyMessage = isInitialCopy 
      ? 'Doctor initialized diagnosis with AI output'
      : 'Doctor modified AI diagnosis';

    this.addToPrescriptionHistory(
      consultation,
      PrescriptionAction.DIAGNOSIS_MODIFIED,
      user._id as Types.ObjectId,
      historyMessage,
      metadata,
    );

    await consultation.save();

    this.logger.log(`Doctor diagnosis ${isInitialCopy ? 'initialized' : 'modified'} for consultation ${consultationId} by doctor ${user._id}`);

    return {
      prescriptionStatus: consultation.prescriptionStatus,
      message: `Doctor diagnosis ${isInitialCopy ? 'initialized' : 'modified'} successfully`,
      updatedAt: new Date(),
      isInitialCopy,
      modificationType,
      changesFromAI,
    };
  }

  async savePrescriptionDraft(
    consultationId: string,
    user: UserDocument,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<PrescriptionStatusResponseDto> {
    try {
      this.logger.log(`Starting savePrescriptionDraft for consultation ${consultationId}`);
      
      const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);
      this.logger.log(`Found consultation: ${consultationId}`);

      if (!consultation.doctorDiagnosis) {
        this.logger.error(`No doctorDiagnosis found for consultation ${consultationId}`);
        throw new BadRequestException('Cannot create a draft without a confirmed diagnosis. Please modify the diagnosis first.');
      }
      this.logger.log(`Doctor diagnosis exists for consultation ${consultationId}`);

      // Initialize prescription data if it doesn't exist
      if (!consultation.prescriptionData) {
        consultation.prescriptionData = {} as any;
      }
      this.logger.log(`Prescription data initialized for consultation ${consultationId}`);

      // Auto-populate prescription from doctorDiagnosis
      const { 
        treatment_recommendations,
        recommended_investigations,
        patient_education
      } = consultation.doctorDiagnosis;
      this.logger.log(`Extracted data from doctorDiagnosis for consultation ${consultationId}`);

      // Safe medication mapping - PRODUCTION FIX
      consultation.prescriptionData.medications = [];
      if (treatment_recommendations?.safe_medications) {
        consultation.prescriptionData.medications = treatment_recommendations.safe_medications.map((med: any) => {
          // Handle both string and object medication formats
          if (typeof med === 'string') {
            return {
              name: med,
              dosage: 'As per doctor recommendation',
              frequency: 'As per doctor recommendation',
              duration: 'As per doctor recommendation',
              instructions: 'As per doctor recommendation'
            };
          } else if (med && typeof med === 'object') {
            return {
              name: med.name || 'Unknown Medication',
              dosage: med.dosage || 'As per doctor recommendation',
              frequency: med.frequency || 'As per doctor recommendation',
              duration: med.duration || 'As per doctor recommendation',
              instructions: med.notes || med.instructions || 'As per doctor recommendation'
            };
          } else {
            // Fallback for invalid data
            return {
              name: 'Unknown Medication',
              dosage: 'As per doctor recommendation',
              frequency: 'As per doctor recommendation', 
              duration: 'As per doctor recommendation',
              instructions: 'As per doctor recommendation'
            };
          }
        });
      }
      this.logger.log(`Medications populated: ${consultation.prescriptionData.medications.length} items`);

      // Safe investigations mapping
      consultation.prescriptionData.investigations = [];
      if (recommended_investigations && Array.isArray(recommended_investigations)) {
        consultation.prescriptionData.investigations = recommended_investigations.flatMap(cat => {
          if (cat && cat.tests && Array.isArray(cat.tests)) {
            return cat.tests.map(test => ({ 
              name: test.name || 'Investigation', 
              instructions: test.reason || 'As recommended by doctor'
            }));
          }
          return [];
        });
      }
      this.logger.log(`Investigations populated: ${consultation.prescriptionData.investigations.length} items`);
    
      // Safe lifestyle advice mapping
      consultation.prescriptionData.lifestyleAdvice = patient_education && Array.isArray(patient_education) ? patient_education : [];
      this.logger.log(`Lifestyle advice populated: ${consultation.prescriptionData.lifestyleAdvice.length} items`);

      // Safe follow-up mapping
      consultation.prescriptionData.followUp = {
        date: new Date(),
        instructions: treatment_recommendations?.follow_up_timeline || 'Follow up as advised by your doctor.'
      };
      this.logger.log(`Follow-up populated for consultation ${consultationId}`);

      consultation.prescriptionStatus = PrescriptionStatus.PRESCRIPTION_DRAFT;
      this.logger.log(`Status updated to PRESCRIPTION_DRAFT for consultation ${consultationId}`);
    
      this.addToPrescriptionHistory(
        consultation,
        PrescriptionAction.DRAFT_UPDATED,
        user._id as Types.ObjectId,
        'Prescription draft auto-generated from doctor diagnosis',
        metadata,
      );
      this.logger.log(`Added to prescription history for consultation ${consultationId}`);

      await consultation.save();
      this.logger.log(`Consultation saved successfully for ${consultationId}`);

      this.logger.log(`Prescription draft auto-generated for consultation ${consultationId}`);

      return {
        prescriptionStatus: consultation.prescriptionStatus,
        message: 'Prescription draft saved successfully from diagnosis',
        updatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error in savePrescriptionDraft for consultation ${consultationId}:`, error.stack || error.message);
      throw error;
    }
  }

  async generatePreview(
    consultationId: string,
    user: UserDocument,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<PrescriptionPreviewResponseDto> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (!consultation.doctorDiagnosis || !consultation.prescriptionData) {
      throw new BadRequestException('Prescription draft is incomplete. Please complete diagnosis and medications.');
    }

    try {
      this.logger.log(`Starting PDF generation process for consultation ${consultationId}`);
      
      // Generate HTML content for PDF with enhanced error handling
      this.logger.log(`Generating HTML content for consultation ${consultationId}`);
      const htmlContent = this.generatePrescriptionHTML(consultation, user, true);
      this.logger.log(`HTML content generated successfully for consultation ${consultationId}`);
      
      // Generate PDF with enhanced logging
      this.logger.log(`Starting PDF generation for consultation ${consultationId}`);
      const pdfBuffer = await this.pdfGenerationService.generatePdf(htmlContent, true);
      this.logger.log(`PDF buffer generated successfully for consultation ${consultationId}`);
      
      // Upload draft PDF to storage with enhanced logging
      this.logger.log(`Starting file upload for consultation ${consultationId}`);
      const uploadResult = await this.fileStorageService.uploadPdf(
        pdfBuffer,
        `prescription-draft-${consultation.consultationId}.pdf`,
        true,
      );
      this.logger.log(`PDF uploaded successfully for consultation ${consultationId}: ${uploadResult.url}`);

      // Store draft PDF URL
      consultation.prescriptionData.draftPdfUrl = uploadResult.url;
      consultation.prescriptionStatus = PrescriptionStatus.AWAITING_REVIEW;
      
      // Add to prescription history
      this.addToPrescriptionHistory(
        consultation,
        PrescriptionAction.PREVIEW_GENERATED,
        user._id as Types.ObjectId,
        'Draft PDF generated for review',
        metadata,
      );

      await consultation.save();
      this.logger.log(`Consultation updated and saved for ${consultationId}`);

      this.logger.log(`Preview PDF generated successfully for consultation ${consultationId}`);

      return {
        draftPdfUrl: uploadResult.url,
        prescriptionStatus: consultation.prescriptionStatus,
        message: 'Preview PDF generated successfully',
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to generate preview PDF for consultation ${consultationId}:`, error.message);
      this.logger.error(`Error stack trace:`, error.stack);
      
      // More specific error handling based on error type
      if (error.message?.includes('Puppeteer') || error.message?.includes('Chrome') || error.message?.includes('browser')) {
        this.logger.error('PDF generation service error detected');
        throw new InternalServerErrorException('PDF generation service is currently unavailable. Please try again later.');
      } else if (error.message?.includes('ENOENT') || error.message?.includes('permission') || error.message?.includes('EACCES')) {
        this.logger.error('File system error detected');
        throw new InternalServerErrorException('File storage error occurred. Please contact support.');
      } else if (error.message?.includes('ENOSPC')) {
        this.logger.error('Disk space error detected');
        throw new InternalServerErrorException('Insufficient storage space. Please contact support.');
      } else if (error.name === 'ValidationError') {
        this.logger.error('Data validation error detected');
        throw new BadRequestException('Prescription data validation failed. Please check your input data.');
      } else {
        this.logger.error('Unknown error type:', typeof error, error.constructor.name);
        throw new InternalServerErrorException('Failed to generate prescription preview');
      }
    }
  }

  async signAndSendPrescription(
    consultationId: string,
    user: UserDocument,
    signAndSendDto: SignAndSendDto,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<SignedPrescriptionResponseDto> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (consultation.prescriptionStatus !== PrescriptionStatus.AWAITING_REVIEW) {
      throw new BadRequestException('Prescription is not ready for signing. Please generate preview first.');
    }

    // Re-authenticate user for security
    await this.reAuthenticateUser(user, signAndSendDto.password, signAndSendDto.mfaCode);

    try {
      // Generate final HTML content (without watermark)
      const htmlContent = this.generatePrescriptionHTML(consultation, user, false);
      
      // Generate final PDF
      const pdfBuffer = await this.pdfGenerationService.generatePdf(htmlContent, false);
      
      // Create digital signature
      const prescriptionData = JSON.stringify(consultation.prescriptionData);
      const digitalSignature = await this.digitalSignatureService.signData(prescriptionData);
      
      // Generate PDF hash for integrity
      const pdfHash = this.digitalSignatureService.generatePdfHash(pdfBuffer);
      
      // Upload signed PDF
      const uploadResult = await this.fileStorageService.uploadPdf(
        pdfBuffer,
        `prescription-signed-${consultation.consultationId}.pdf`,
        false,
      );

      // Update consultation with signature and final PDF
      consultation.prescriptionData.digitalSignature = {
        signature: digitalSignature.signature,
        algorithm: digitalSignature.algorithm,
        certificateId: digitalSignature.certificateId,
        signedAt: digitalSignature.signedAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      };
      consultation.prescriptionData.signedPdfUrl = uploadResult.url;
      consultation.prescriptionData.pdfHash = pdfHash;
      consultation.prescriptionStatus = PrescriptionStatus.SIGNED;
      
      // Add to prescription history
      this.addToPrescriptionHistory(
        consultation,
        PrescriptionAction.SIGNATURE_APPLIED,
        user._id as Types.ObjectId,
        'Prescription digitally signed by doctor',
        metadata,
      );

      await consultation.save();

      // TODO: Send notification to patient
      // await this.notificationService.notifyPatientPrescriptionReady(consultation);

      // Update status to SENT
      consultation.prescriptionStatus = PrescriptionStatus.SENT;
      this.addToPrescriptionHistory(
        consultation,
        PrescriptionAction.SENT_TO_PATIENT,
        user._id as Types.ObjectId,
        'Prescription sent to patient',
        metadata,
      );
      
      await consultation.save();

      this.logger.log(`Prescription signed and sent for consultation ${consultationId}`);

      return {
        signedPdfUrl: uploadResult.url,
        pdfHash,
        prescriptionStatus: consultation.prescriptionStatus,
        digitalSignature: {
          algorithm: digitalSignature.algorithm,
          signedAt: digitalSignature.signedAt,
          certificateId: digitalSignature.certificateId,
        },
        message: 'Prescription signed and sent successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to sign and send prescription for consultation ${consultationId}:`, error);
      throw new InternalServerErrorException('Failed to sign and send prescription');
    }
  }

  async getPrescriptionHistory(
    consultationId: string,
    user: UserDocument,
  ): Promise<PrescriptionHistoryDto[]> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (!consultation.prescriptionHistory) {
      return [];
    }

    return consultation.prescriptionHistory.map(entry => ({
      action: entry.action,
      timestamp: entry.timestamp,
      performedBy: entry.performedBy.toString(),
      details: entry.details,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    }));
  }

  private addToPrescriptionHistory(
    consultation: ConsultationDocument,
    action: PrescriptionAction,
    performedBy: Types.ObjectId,
    details: string,
    metadata: { ipAddress: string; userAgent: string },
  ): void {
    if (!consultation.prescriptionHistory) {
      consultation.prescriptionHistory = [];
    }

    consultation.prescriptionHistory.push({
      action,
      timestamp: new Date(),
      performedBy,
      details,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private generatePrescriptionHTML(
    consultation: ConsultationDocument,
    doctor: UserDocument,
    isDraft: boolean,
  ): string {
    const prescriptionData = consultation.prescriptionData;
    const watermarkClass = isDraft ? 'draft-watermark' : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Medical Prescription</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .doctor-info { margin: 20px 0; }
          .diagnosis { margin: 20px 0; }
          .medications { margin: 20px 0; }
          .medication { margin-bottom: 10px; border: 1px solid #ddd; padding: 10px; }
          .footer { margin-top: 30px; text-align: center; }
          .signature { margin-top: 50px; text-align: right; }
          ${isDraft ? '.draft-watermark::before { content: "DRAFT"; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.1); z-index: -1; }' : ''}
        </style>
      </head>
      <body class="${watermarkClass}">
        <div class="header">
          <h1>MEDICAL PRESCRIPTION</h1>
          <p>Tenderly Care - OB-GYN Telemedicine Platform</p>
        </div>
        
        <div class="doctor-info">
          <p><strong>Doctor:</strong> ${doctor.firstName} ${doctor.lastName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Consultation ID:</strong> ${consultation._id}</p>
        </div>

        <div class="diagnosis">
          <h3>Diagnosis</h3>
          <p><strong>Possible Diagnoses:</strong> ${
            Array.isArray(consultation.doctorDiagnosis?.possible_diagnoses)
              ? consultation.doctorDiagnosis.possible_diagnoses
                  .map((d: any) => {
                    // Handle both string and object formats
                    if (typeof d === 'string') {
                      return d;
                    } else if (d && typeof d === 'object' && 'name' in d) {
                      return d.name;
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join(', ') || 'Not specified'
              : 'Not specified'
          }</p>
          ${
            // Only show diagnosis description if we have object-based diagnoses with descriptions
            Array.isArray(consultation.doctorDiagnosis?.possible_diagnoses) &&
            consultation.doctorDiagnosis.possible_diagnoses.some((d: any) => 
              d && typeof d === 'object' && 'description' in d && d.description
            )
              ? `<p><strong>Diagnosis Description:</strong> ${
                  consultation.doctorDiagnosis.possible_diagnoses
                    .map((d: any) => {
                      if (d && typeof d === 'object' && 'description' in d) {
                        return d.description;
                      }
                      return '';
                    })
                    .filter(Boolean)
                    .join(', ')
                }</p>`
              : ''
          }
          <p><strong>Clinical Reasoning:</strong> ${consultation.doctorDiagnosis?.clinical_reasoning || 'Not specified'}</p>
        </div>

        <div class="medications">
          <h3>Medications</h3>
          ${
            // PRODUCTION FIX: Enhanced medication rendering with malformed data handling
            Array.isArray(consultation.doctorDiagnosis?.treatment_recommendations?.safe_medications) && consultation.doctorDiagnosis.treatment_recommendations.safe_medications.length > 0
              ? consultation.doctorDiagnosis.treatment_recommendations.safe_medications.map((safeMed: any) => {
                  // Defensive programming - handle both current malformed data and future correct data
                  let medicationName, dosage, frequency, duration, reason, notes;
                  
                  if (typeof safeMed === 'string') {
                    medicationName = safeMed;
                    dosage = frequency = duration = reason = notes = 'N/A';
                  } else if (safeMed && typeof safeMed === 'object') {
                    // Handle nested object structure (current malformed data)
                    if (safeMed.name && typeof safeMed.name === 'object') {
                      medicationName = safeMed.name.name || 'Unknown Medication';
                      dosage = safeMed.name.dosage || safeMed.dosage || 'N/A';
                      frequency = safeMed.name.frequency || safeMed.frequency || 'N/A';
                      duration = safeMed.name.duration || safeMed.duration || 'N/A';
                      reason = safeMed.name.reason || safeMed.reason || 'N/A';
                      notes = safeMed.name.notes || safeMed.notes || 'N/A';
                    } else {
                      // Handle normal object structure
                      medicationName = safeMed.name || 'Unknown Medication';
                      dosage = safeMed.dosage || 'N/A';
                      frequency = safeMed.frequency || 'N/A';
                      duration = safeMed.duration || 'N/A';
                      reason = safeMed.reason || 'N/A';
                      notes = safeMed.notes || 'N/A';
                    }
                  } else {
                    return ''; // Skip invalid entries
                  }

                  return `
                    <div class="medication">
                      <p><strong>${medicationName}</strong>${dosage !== 'N/A' ? ' - ' + dosage : ''}</p>
                      <p>Frequency: ${frequency}</p>
                      <p>Duration: ${duration}</p>
                      <p>Reason: ${reason}</p>
                      <p>Notes: ${notes}</p>
                    </div>
                  `;
                }).join('')
              : '<p>No medications prescribed</p>'
          }
        </div>

        <div class="investigations">
          <h3>Recommended Investigations</h3>
          ${
            Array.isArray(consultation.doctorDiagnosis?.recommended_investigations) && consultation.doctorDiagnosis.recommended_investigations.length > 0
              ? consultation.doctorDiagnosis.recommended_investigations.map((test: any) => {
                  if (test && typeof test === 'object') {
                    return `
                      <div class="investigation-test">
                        <p>
                          <strong>${test.name || 'Test'}</strong>
                          ${test.reason ? ' - ' + test.reason : ''}
                        </p>
                        <p>Priority: ${test.priority || 'Normal'}</p>
                      </div>
                    `;
                  } else if (typeof test === 'string') {
                    return `
                      <div class="investigation-test">
                        <p><strong>${test}</strong></p>
                      </div>
                    `;
                  } else {
                    return '';
                  }
                }).join('')
              : '<p>No specific tests</p>'
          }
        </div>

        <div class="treatment-plan">
          <h3>Treatment Recommendations</h3>
          <p><strong>Primary Treatment:</strong> ${consultation.doctorDiagnosis?.treatment_recommendations?.primary_treatment || 'Not specified'}</p>
          <p><strong>Lifestyle Modifications:</strong></p>
          <ul>
            ${consultation.doctorDiagnosis?.treatment_recommendations?.lifestyle_modifications && Array.isArray(consultation.doctorDiagnosis.treatment_recommendations.lifestyle_modifications) ? consultation.doctorDiagnosis.treatment_recommendations.lifestyle_modifications.map(mod => `<li>${mod}</li>`).join('') : '<li>None specified</li>'}
          </ul>
          <p><strong>Dietary Advice:</strong></p>
          <ul>
            ${consultation.doctorDiagnosis?.treatment_recommendations?.dietary_advice && Array.isArray(consultation.doctorDiagnosis.treatment_recommendations.dietary_advice) ? consultation.doctorDiagnosis.treatment_recommendations.dietary_advice.map(advice => `<li>${advice}</li>`).join('') : '<li>None specified</li>'}
          </ul>
          <p><strong>Follow-up Timeline:</strong> ${consultation.doctorDiagnosis?.treatment_recommendations?.follow_up_timeline || 'Not specified'}</p>
        </div>

        <div class="patient-education">
          <h3>Patient Education</h3>
          <ul>
            ${consultation.doctorDiagnosis?.patient_education?.map(edu => `<li>${edu}</li>`).join('') || '<li>No specific education provided</li>'}
          </ul>
        </div>

        <div class="warning-signs">
          <h3>Warning Signs</h3>
          <ul>
            ${consultation.doctorDiagnosis?.warning_signs?.map(sign => `<li>${sign}</li>`).join('') || '<li>No specific warning signs provided</li>'}
          </ul>
        </div>

        <div class="disclaimer">
          <p><em>${consultation.doctorDiagnosis?.disclaimer || 'This prescription is based on the information provided and should be used as advised. Consult a healthcare professional for any concerns.'}</em></p>
        </div>

        <div class="signature">
          <p>_______________________</p>
          <p>Dr. ${doctor.firstName} ${doctor.lastName}</p>
          <p>Digital Signature Applied</p>
          ${!isDraft && prescriptionData.digitalSignature ? `<p>Signed on: ${new Date(prescriptionData.digitalSignature.signedAt).toLocaleString()}</p>` : ''}
        </div>

        <div class="footer">
          <p><small>This is a digitally generated prescription from Tenderly Care platform</small></p>
        </div>
      </body>
      </html>
    `;
  }

  private async reAuthenticateUser(
    user: UserDocument,
    password: string,
    mfaCode?: string,
  ): Promise<void> {
    // Get user with password
    const userWithPassword = await this.userModel.findById(user._id).select('+password');
    if (!userWithPassword) {
      throw new NotFoundException('User not found');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid password for re-authentication');
    }

    // Verify MFA if enabled and code provided
    if (user.isMFAEnabled && mfaCode) {
      // TODO: Implement MFA verification
      // const isMFAValid = await this.mfaService.verifyMFA(user._id, mfaCode);
      // if (!isMFAValid) {
      //   throw new BadRequestException('Invalid MFA code');
      // }
    }

    this.logger.log(`User ${user._id} successfully re-authenticated for prescription signing`);
  }

  async completeConsultation(
    consultationId: string,
    user: UserDocument,
    metadata: { ipAddress: string; userAgent: string },
  ): Promise<{
    message: string;
    consultationStatus: string;
    completedAt: Date;
  }> {
    // Validate consultation and prescription status before completing
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (consultation.prescriptionStatus !== PrescriptionStatus.SENT) {
      throw new BadRequestException(
        'Consultation cannot be completed until the prescription has been sent.',
      );
    }

    const completedAt = new Date();
    
    try {
      // Check if MongoDB supports transactions (replica set)
      const isReplicaSet = await this.isReplicaSetEnabled();
      
      if (isReplicaSet) {
        // Use transaction for replica set environments (production)
        await this.completeConsultationWithTransaction(consultationId, consultation, user, completedAt, metadata);
      } else {
        // Use atomic update for standalone MongoDB (development)
        await this.completeConsultationAtomic(consultationId, consultation, user, completedAt, metadata);
      }

      this.logger.log(`Consultation ${consultationId} status updated to COMPLETED and isActive set to false by doctor ${user._id}`);

      return {
        message: 'Consultation marked as completed successfully',
        consultationStatus: ConsultationStatus.COMPLETED,
        completedAt,
      };

    } catch (error) {
      this.logger.error(`Failed to complete consultation ${consultationId}:`, error.message);
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new InternalServerErrorException('Failed to complete consultation');
    }
  }

  private async isReplicaSetEnabled(): Promise<boolean> {
    try {
      const db = this.consultationModel.db.db;
      if (!db) {
        this.logger.warn('Database connection not available, assuming standalone');
        return false;
      }
      
      const admin = db.admin();
      const result = await admin.command({ isMaster: 1 });
      return !!(result.setName || result.isreplicaset);
    } catch (error) {
      this.logger.warn('Could not determine replica set status, assuming standalone');
      return false;
    }
  }

  private async completeConsultationWithTransaction(
    consultationId: string,
    consultation: ConsultationDocument,
    user: UserDocument,
    completedAt: Date,
    metadata: { ipAddress: string; userAgent: string }
  ): Promise<void> {
    const session = await this.consultationModel.db.startSession();
    
    try {
      await session.withTransaction(async () => {
        const updateResult = await this.consultationModel.findByIdAndUpdate(
          consultationId,
          {
            $set: {
              status: ConsultationStatus.COMPLETED,
              completedAt,
              isActive: false,
            },
            $push: {
              statusHistory: {
                status: ConsultationStatus.COMPLETED,
                changedAt: completedAt,
                changedBy: user._id as Types.ObjectId,
                reason: 'Consultation completed by doctor',
                previousStatus: consultation.status,
                metadata: {
                  source: 'prescription_service',
                  trigger: 'complete_consultation',
                  notes: 'Consultation marked as completed via prescription service'
                }
              },
              prescriptionHistory: {
                action: PrescriptionAction.CONSULTATION_COMPLETED,
                timestamp: completedAt,
                performedBy: user._id as Types.ObjectId,
                details: 'Consultation marked as completed by doctor',
                ipAddress: metadata.ipAddress,
                userAgent: metadata.userAgent,
              }
            }
          },
          { 
            new: true, 
            session,
            runValidators: true 
          }
        );

        if (!updateResult) {
          throw new InternalServerErrorException('Failed to update consultation status');
        }
      });
    } finally {
      await session.endSession();
    }
  }

  private async completeConsultationAtomic(
    consultationId: string,
    consultation: ConsultationDocument,
    user: UserDocument,
    completedAt: Date,
    metadata: { ipAddress: string; userAgent: string }
  ): Promise<void> {
    // Single atomic update operation for standalone MongoDB
    const updateResult = await this.consultationModel.findByIdAndUpdate(
      consultationId,
      {
        $set: {
          status: ConsultationStatus.COMPLETED,
          completedAt,
          isActive: false, // Explicitly set isActive to false
        },
        $push: {
          statusHistory: {
            status: ConsultationStatus.COMPLETED,
            changedAt: completedAt,
            changedBy: user._id as Types.ObjectId,
            reason: 'Consultation completed by doctor',
            previousStatus: consultation.status,
            metadata: {
              source: 'prescription_service',
              trigger: 'complete_consultation',
              notes: 'Consultation marked as completed via prescription service'
            }
          },
          prescriptionHistory: {
            action: PrescriptionAction.CONSULTATION_COMPLETED,
            timestamp: completedAt,
            performedBy: user._id as Types.ObjectId,
            details: 'Consultation marked as completed by doctor',
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          }
        }
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updateResult) {
      throw new InternalServerErrorException('Failed to update consultation status');
    }
  }
}
