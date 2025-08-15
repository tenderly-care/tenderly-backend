import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException, 
  InternalServerErrorException 
} from '@nestjs/common';
import { Response } from 'express';
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

    let uploadResult: any;
    let digitalSignature: any;
    let pdfHash: string;

    try {
      this.logger.log(`Starting prescription signing process for consultation ${consultationId}`);
      
      // Generate final HTML content (without watermark)
      const htmlContent = this.generatePrescriptionHTML(consultation, user, false);
      this.logger.log(`HTML content generated for signing consultation ${consultationId}`);
      
      // Generate final PDF
      const pdfBuffer = await this.pdfGenerationService.generatePdf(htmlContent, false);
      this.logger.log(`PDF buffer generated for signing consultation ${consultationId}, size: ${pdfBuffer.length} bytes`);
      
      // Create digital signature
      const prescriptionData = JSON.stringify(consultation.prescriptionData);
      digitalSignature = await this.digitalSignatureService.signData(prescriptionData);
      this.logger.log(`Digital signature created for consultation ${consultationId}`);
      
      // Generate PDF hash for integrity
      pdfHash = this.digitalSignatureService.generatePdfHash(pdfBuffer);
      this.logger.log(`PDF hash generated for consultation ${consultationId}: ${pdfHash}`);
      
      // Upload signed PDF
      uploadResult = await this.fileStorageService.uploadPdf(
        pdfBuffer,
        `prescription-signed-${consultation.consultationId}.pdf`,
        false,
      );
      this.logger.log(`PDF uploaded successfully for consultation ${consultationId} to: ${uploadResult.url}`);

    } catch (processingError) {
      this.logger.error(`Failed to process prescription for consultation ${consultationId}:`, processingError.message);
      throw new InternalServerErrorException(`PDF generation and upload failed: ${processingError.message}`);
    }

    // PRODUCTION FIX: Use atomic database operation with retry logic
    const maxRetries = 3;
    let attempt = 0;
    let saveSuccess = false;
    
    while (attempt < maxRetries && !saveSuccess) {
      attempt++;
      this.logger.log(`Database save attempt ${attempt}/${maxRetries} for consultation ${consultationId}`);
      
      try {
        // Use atomic findByIdAndUpdate to prevent data loss
        const updateResult = await this.consultationModel.findByIdAndUpdate(
          consultationId,
          {
            $set: {
              prescriptionStatus: PrescriptionStatus.SENT,
              'prescriptionData.digitalSignature': {
                signature: digitalSignature.signature,
                algorithm: digitalSignature.algorithm,
                certificateId: digitalSignature.certificateId,
                signedAt: digitalSignature.signedAt,
                ipAddress: metadata.ipAddress,
                userAgent: metadata.userAgent,
              },
              'prescriptionData.signedPdfUrl': uploadResult.url,
              'prescriptionData.pdfHash': pdfHash,
            },
            $push: {
              prescriptionHistory: {
                $each: [
                  {
                    action: PrescriptionAction.SIGNATURE_APPLIED,
                    timestamp: new Date(),
                    performedBy: user._id as Types.ObjectId,
                    details: 'Prescription digitally signed by doctor',
                    ipAddress: metadata.ipAddress,
                    userAgent: metadata.userAgent,
                  },
                  {
                    action: PrescriptionAction.SENT_TO_PATIENT,
                    timestamp: new Date(),
                    performedBy: user._id as Types.ObjectId,
                    details: 'Prescription sent to patient',
                    ipAddress: metadata.ipAddress,
                    userAgent: metadata.userAgent,
                  }
                ]
              }
            }
          },
          {
            new: true,
            runValidators: true,
            // Ensure we get the latest version to avoid conflicts
            upsert: false
          }
        );

        if (!updateResult) {
          throw new Error('Consultation not found during update');
        }

        // Verify the critical data was saved correctly
        if (!updateResult.prescriptionData?.signedPdfUrl) {
          throw new Error('signedPdfUrl was not saved correctly');
        }

        if (!updateResult.prescriptionData?.pdfHash) {
          throw new Error('pdfHash was not saved correctly');
        }

        if (updateResult.prescriptionStatus !== PrescriptionStatus.SENT) {
          throw new Error('prescriptionStatus was not updated correctly');
        }

        this.logger.log(`PRODUCTION SUCCESS: Prescription signed and saved for consultation ${consultationId}`);
        this.logger.log(`- Status: ${updateResult.prescriptionStatus}`);
        this.logger.log(`- SignedPdfUrl: ${updateResult.prescriptionData.signedPdfUrl}`);
        this.logger.log(`- PdfHash: ${updateResult.prescriptionData.pdfHash}`);
        this.logger.log(`- DigitalSignature: ${!!updateResult.prescriptionData.digitalSignature}`);
        
        saveSuccess = true;
        
      } catch (saveError) {
        this.logger.error(`Database save attempt ${attempt} failed for consultation ${consultationId}:`, saveError.message);
        
        if (attempt === maxRetries) {
          // If all attempts failed, clean up the uploaded file
          try {
            await this.fileStorageService.deleteFile(uploadResult.key);
            this.logger.log(`Cleaned up uploaded file: ${uploadResult.key}`);
          } catch (cleanupError) {
            this.logger.error(`Failed to cleanup uploaded file: ${cleanupError.message}`);
          }
          
          throw new InternalServerErrorException(
            `Failed to save prescription data after ${maxRetries} attempts. Please try again or contact support.`
          );
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    // TODO: Send notification to patient
    // await this.notificationService.notifyPatientPrescriptionReady(consultation);

    this.logger.log(`PRODUCTION COMPLETE: Prescription signing workflow completed for consultation ${consultationId}`);

    return {
      signedPdfUrl: uploadResult.url,
      pdfHash,
      prescriptionStatus: PrescriptionStatus.SENT,
      digitalSignature: {
        algorithm: digitalSignature.algorithm,
        signedAt: digitalSignature.signedAt,
        certificateId: digitalSignature.certificateId,
      },
      message: 'Prescription signed and sent successfully',
    };
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
    const doctorDiagnosis = consultation.doctorDiagnosis;
    const watermarkClass = isDraft ? 'draft-watermark' : '';

    // Production-level data extraction and formatting
    const formatPossibleDiagnoses = (): string => {
      if (!doctorDiagnosis?.possible_diagnoses) return 'Not specified';
      
      if (Array.isArray(doctorDiagnosis.possible_diagnoses)) {
        return doctorDiagnosis.possible_diagnoses
          .map((diagnosis: any) => {
            if (typeof diagnosis === 'string') {
              return diagnosis;
            } else if (diagnosis && typeof diagnosis === 'object') {
              const name = diagnosis.name || diagnosis.condition || '';
              const description = diagnosis.description || diagnosis.details || '';
              return name + (description ? ` - ${description}` : '');
            }
            return String(diagnosis);
          })
          .filter(Boolean)
          .join(', ');
      } else if (typeof doctorDiagnosis.possible_diagnoses === 'string') {
        return doctorDiagnosis.possible_diagnoses;
      }
      
      return 'Not specified';
    };

    const formatMedications = (): string => {
      if (!prescriptionData?.medications || !Array.isArray(prescriptionData.medications) || prescriptionData.medications.length === 0) {
        return '<p>No medications prescribed</p>';
      }

      return prescriptionData.medications
        .map((medication: any) => {
          const name = String(medication?.name || 'Unknown Medication');
          const dosage = String(medication?.dosage || 'As per doctor recommendation');
          const frequency = String(medication?.frequency || 'As per doctor recommendation');
          const duration = String(medication?.duration || 'As per doctor recommendation');
          const instructions = String(medication?.instructions || 'As per doctor recommendation');

          return `
            <div class="medication">
              <p><strong>${name}</strong>${dosage !== 'As per doctor recommendation' ? ' - ' + dosage : ''}</p>
              <p>Frequency: ${frequency}</p>
              <p>Duration: ${duration}</p>
              <p>Instructions: ${instructions}</p>
            </div>
          `;
        })
        .join('');
    };

    const formatInvestigations = (): string => {
      if (!prescriptionData?.investigations || !Array.isArray(prescriptionData.investigations) || prescriptionData.investigations.length === 0) {
        return '<p>No specific investigations recommended</p>';
      }

      return prescriptionData.investigations
        .map((investigation: any) => {
          const name = String(investigation?.name || 'Investigation');
          const instructions = String(investigation?.instructions || 'As recommended by doctor');
          
          return `
            <div class="investigation-test">
              <p><strong>${name}</strong></p>
              <p>Instructions: ${instructions}</p>
            </div>
          `;
        })
        .join('');
    };

    const formatArrayToList = (items: any[], fallback: string = 'None specified'): string => {
      if (!Array.isArray(items) || items.length === 0) {
        return `<li>${fallback}</li>`;
      }
      
      return items
        .map(item => `<li>${String(item)}</li>`)
        .join('');
    };

    const formatTreatmentRecommendations = () => {
      const treatmentRecs = doctorDiagnosis?.treatment_recommendations;
      if (!treatmentRecs) {
        return {
          primaryTreatment: 'Not specified',
          lifestyleModifications: '<li>None specified</li>',
          dietaryAdvice: '<li>None specified</li>',
          followUpTimeline: 'Not specified'
        };
      }

      return {
        primaryTreatment: String(treatmentRecs.primary_treatment || 'Not specified'),
        lifestyleModifications: formatArrayToList(treatmentRecs.lifestyle_modifications),
        dietaryAdvice: formatArrayToList(treatmentRecs.dietary_advice),
        followUpTimeline: String(treatmentRecs.follow_up_timeline || 'Not specified')
      };
    };

    const treatment = formatTreatmentRecommendations();

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
          <p><strong>Doctor:</strong> ${String(doctor.firstName)} ${String(doctor.lastName)}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Consultation ID:</strong> ${String(consultation._id)}</p>
        </div>

        <div class="diagnosis">
          <h3>Diagnosis</h3>
          <p><strong>Possible Diagnoses:</strong> ${formatPossibleDiagnoses()}</p>
          <p><strong>Clinical Reasoning:</strong> ${String(doctorDiagnosis?.clinical_reasoning || 'Not specified')}</p>
          <p><strong>Confidence Score:</strong> ${String(doctorDiagnosis?.confidence_score || 'Not specified')}</p>
          ${doctorDiagnosis?.processing_notes ? `<p><strong>Processing Notes:</strong> ${String(doctorDiagnosis.processing_notes)}</p>` : ''}
        </div>

        <div class="medications">
          <h3>Medications</h3>
          ${formatMedications()}
        </div>

        <div class="investigations">
          <h3>Recommended Investigations</h3>
          ${formatInvestigations()}
        </div>

        <div class="treatment-plan">
          <h3>Treatment Recommendations</h3>
          <p><strong>Primary Treatment:</strong> ${treatment.primaryTreatment}</p>
          <p><strong>Lifestyle Modifications:</strong></p>
          <ul>
            ${treatment.lifestyleModifications}
          </ul>
          <p><strong>Dietary Advice:</strong></p>
          <ul>
            ${treatment.dietaryAdvice}
          </ul>
          <p><strong>Follow-up Timeline:</strong> ${treatment.followUpTimeline}</p>
        </div>

        <div class="patient-education">
          <h3>Patient Education</h3>
          <ul>
            ${formatArrayToList(doctorDiagnosis?.patient_education, 'No specific education provided')}
          </ul>
        </div>

        <div class="warning-signs">
          <h3>Warning Signs</h3>
          <ul>
            ${formatArrayToList(doctorDiagnosis?.warning_signs, 'No specific warning signs provided')}
          </ul>
        </div>

        <div class="disclaimer">
          <p><em>${String(doctorDiagnosis?.disclaimer || 'This prescription is based on the information provided and should be used as advised. Consult a healthcare professional for any concerns.')}</em></p>
        </div>

        <div class="signature">
          <p>_______________________</p>
          <p>Dr. ${String(doctor.firstName)} ${String(doctor.lastName)}</p>
          <p>Digital Signature Applied</p>
          ${!isDraft && prescriptionData?.digitalSignature ? `<p>Signed on: ${new Date(prescriptionData.digitalSignature.signedAt).toLocaleString()}</p>` : ''}
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

  // HYBRID PDF APPROACH: Stream drafts, store signed PDFs
  
  /**
   * Stream draft PDF directly to client without storing on server
   * This saves server storage space and provides instant preview
   */
  async streamDraftPdf(
    consultationId: string,
    user: UserDocument,
    res: Response,
  ): Promise<void> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (!consultation.doctorDiagnosis || !consultation.prescriptionData) {
      throw new BadRequestException('Prescription draft is incomplete. Please complete diagnosis and medications.');
    }

    try {
      this.logger.log(`Streaming draft PDF for consultation ${consultationId}`);
      
      // Generate HTML content for draft PDF
      const htmlContent = this.generatePrescriptionHTML(consultation, user, true);
      
      // Generate PDF buffer (no file saving)
      const pdfBuffer = await this.pdfGenerationService.generatePdf(htmlContent, true);
      
      // Set response headers for PDF streaming
      const filename = `prescription-draft-${consultation.consultationId}.pdf`;
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline', // Show in browser for preview
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Prevent caching of drafts
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-PDF-Type': 'draft'
      });
      
      // Stream PDF directly to client
      res.end(pdfBuffer);
      
      this.logger.log(`Draft PDF streamed successfully for consultation ${consultationId}`);
      
    } catch (error) {
      this.logger.error(`Failed to stream draft PDF for consultation ${consultationId}:`, error.message);
      res.status(500).json({ 
        error: 'Failed to generate draft PDF', 
        message: 'Please try again or contact support if the issue persists.' 
      });
    }
  }

  /**
   * Download signed PDF from storage
   * Signed PDFs are permanently stored for compliance and patient access
   */
  async downloadSignedPdf(
    consultationId: string,
    user: UserDocument,
    res: Response,
    asAttachment: boolean = true,
  ): Promise<void> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    // Debug logging to understand the data state
    this.logger.log(`Debug - Consultation prescriptionStatus: ${consultation.prescriptionStatus}`);
    this.logger.log(`Debug - prescriptionData exists: ${!!consultation.prescriptionData}`);
    this.logger.log(`Debug - signedPdfUrl: ${consultation.prescriptionData?.signedPdfUrl}`);
    this.logger.log(`Debug - pdfHash: ${consultation.prescriptionData?.pdfHash}`);

    if (consultation.prescriptionStatus !== PrescriptionStatus.SENT) {
      throw new BadRequestException('Prescription has not been signed and sent yet.');
    }

    if (!consultation.prescriptionData?.signedPdfUrl) {
      throw new NotFoundException('Signed prescription PDF not found. Please ensure the prescription has been signed.');
    }

    try {
      this.logger.log(`Downloading signed PDF for consultation ${consultationId}`);
      
      // Fetch signed PDF from storage
      const pdfBuffer = await this.fileStorageService.downloadPdf(consultation.prescriptionData.signedPdfUrl);
      
      // Set response headers for PDF download
      const filename = `prescription-signed-${consultation.consultationId}.pdf`;
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': asAttachment ? `attachment; filename="${filename}"` : 'inline',
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache signed PDFs for 1 hour
        'X-PDF-Type': 'signed',
        'X-PDF-Hash': consultation.prescriptionData.pdfHash || 'unknown'
      });
      
      // Stream PDF to client
      res.end(pdfBuffer);
      
      this.logger.log(`Signed PDF downloaded successfully for consultation ${consultationId}`);
      
    } catch (error) {
      this.logger.error(`Failed to download signed PDF for consultation ${consultationId}:`, error.message);
      
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        res.status(404).json({
          error: 'Signed PDF not found',
          message: 'The signed prescription PDF could not be located in storage.'
        });
      } else {
        res.status(500).json({
          error: 'Failed to download signed PDF',
          message: 'Please try again or contact support if the issue persists.'
        });
      }
    }
  }

  /**
   * Get signed PDF URL for patient chat integration
   * Returns the stored URL for signed PDFs to be shared in chat
   */
  async getSignedPdfUrl(consultationId: string, user: UserDocument): Promise<{ url: string; filename: string }> {
    const consultation = await this.findAndValidateConsultation(consultationId, user._id as Types.ObjectId);

    if (!consultation.prescriptionData?.signedPdfUrl) {
      throw new NotFoundException('Signed prescription PDF not found.');
    }

    if (consultation.prescriptionStatus !== PrescriptionStatus.SENT) {
      throw new BadRequestException('Prescription has not been signed and sent yet.');
    }

    return {
      url: consultation.prescriptionData.signedPdfUrl,
      filename: `prescription-signed-${consultation.consultationId}.pdf`
    };
  }
}
