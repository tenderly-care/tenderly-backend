import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException, 
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Consultation, ConsultationDocument, ConsultationStatus } from '../schemas/consultation.schema';
import { 
  CreateConsultationDto, 
  UpdateConsultationDto, 
  SymptomInputDto, 
  BasicSymptomInputDto, 
  DetailedSymptomInputDto, 
  DetailedDiagnosisResponseDto 
} from '../dto/consultation.dto';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';
import { DoctorShiftService } from './doctor-shift.service';
import { AIAgentService } from './ai-agent.service';
import { PaymentService } from './payment.service';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);
  private readonly TEMP_DATA_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'consultation:';

  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<ConsultationDocument>,
    private cacheService: CacheService,
    private auditService: AuditService,
    private configService: ConfigService,
    private doctorShiftService: DoctorShiftService,
    private aiAgentService: AIAgentService,
    private paymentService: PaymentService,
  ) {}

  /**
   * Create a new consultation with proper validation and audit logging
   */
  async createConsultation(
    createConsultationDto: CreateConsultationDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<ConsultationDocument> {
    try {
      this.logger.log(`Creating consultation for patient: ${createConsultationDto.patientId}`);
      
      // Validate patient exists
      await this.validatePatientExists(createConsultationDto.patientId);
      
      // Check for existing active consultation
      const existingConsultation = await this.consultationModel.findOne({
        patientId: createConsultationDto.patientId,
        status: { $nin: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED] }
      });
      
      if (existingConsultation) {
        throw new ConflictException('Patient already has an active consultation');
      }

      // Get active doctor for current time if not provided
      let doctorId = createConsultationDto.doctorId;
      if (!doctorId) {
        const activeDoctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();
        if (!activeDoctorId) {
          throw new InternalServerErrorException('No active doctor available for consultation');
        }
        doctorId = activeDoctorId;
      }

      // Create consultation with metadata and assigned doctor
      const consultationData = {
        ...createConsultationDto,
        doctorId: new Types.ObjectId(doctorId),
        status: ConsultationStatus.DOCTOR_ASSIGNED,
        metadata: {
          ...createConsultationDto.metadata,
          ...requestMetadata,
        },
      };

      const createdConsultation = new this.consultationModel(consultationData);
      const savedConsultation = await createdConsultation.save();

      // Cache consultation for quick access
      await this.cacheConsultation(savedConsultation);

      // Log audit event for consultation creation
      await this.auditService.logDataAccess(
        createConsultationDto.patientId,
        'consultations',
        'create',
        savedConsultation._id?.toString(),
        undefined,
        savedConsultation,
        requestMetadata
      );

      this.logger.log(`Consultation created successfully: ${savedConsultation._id}`);
      return savedConsultation;

    } catch (error) {
      this.logger.error(`Failed to create consultation: ${error.message}`, error.stack);
      
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create consultation');
    }
  }

  /**
   * Find consultations by patient ID with caching
   */
  async findConsultationsByPatientId(
    patientId: string,
    userId?: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ consultations: Consultation[]; total: number }> {
    try {
      this.logger.log(`Fetching consultations for patient: ${patientId}`);
      
      // Validate access permissions
      await this.validatePatientAccess(patientId, userId);
      
      const cacheKey = `${this.CACHE_PREFIX}patient:${patientId}:${limit}:${offset}`;
      
      // Try cache first
      let cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Cache hit for patient consultations: ${patientId}`);
        return cachedResult;
      }

      // Fetch from database
      const [consultations, total] = await Promise.all([
        this.consultationModel
          .find({ patientId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(offset)
          .populate('doctorId', 'firstName lastName specialization')
          .exec(),
        this.consultationModel.countDocuments({ patientId })
      ]);

      const result = { consultations, total };
      
      // Cache result for 5 minutes
      await this.cacheService.set(cacheKey, result, 300);
      
      return result;

    } catch (error) {
      this.logger.error(`Failed to fetch consultations for patient ${patientId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch consultations');
    }
  }

  /**
   * Find consultation by ID with proper access control
   */
  async findConsultationById(
    consultationId: string,
    userId?: string,
    userRoles?: string[]
  ): Promise<Consultation> {
    try {
      if (!Types.ObjectId.isValid(consultationId)) {
        throw new BadRequestException('Invalid consultation ID format');
      }

      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}id:${consultationId}`;
      let consultation = await this.cacheService.get(cacheKey);
      
      if (!consultation) {
        consultation = await this.consultationModel
          .findById(consultationId)
          .populate('patientId', 'firstName lastName email')
          .populate('doctorId', 'firstName lastName specialization')
          .exec();
          
        if (!consultation) {
          throw new NotFoundException('Consultation not found');
        }
        
        // Cache for 10 minutes
        await this.cacheService.set(cacheKey, consultation, 600);
      }

      // Validate access permissions
      await this.validateConsultationAccess(consultation, userId, userRoles);

      return consultation;

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`Failed to fetch consultation ${consultationId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch consultation');
    }
  }

  /**
   * Find consultation by session ID
   */
  async findConsultationBySessionId(sessionId: string): Promise<Consultation> {
    try {
      const consultation = await this.consultationModel
        .findOne({ sessionId })
        .populate('patientId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName specialization')
        .exec();
        
      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }
      
      return consultation;

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Failed to fetch consultation by session ${sessionId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch consultation');
    }
  }

  /**
   * Update consultation with validation and audit logging
   */
  async updateConsultation(
    consultationId: string,
    updateConsultationDto: UpdateConsultationDto,
    userId?: string,
    requestMetadata?: { ipAddress: string; userAgent: string },
    userRoles?: string[]
  ): Promise<Consultation> {
    try {
      const consultation = await this.findConsultationById(consultationId, userId, userRoles);
      
      // Validate update permissions
      await this.validateUpdatePermissions(consultation, userId, updateConsultationDto);
      
      const updatedConsultation = await this.consultationModel
        .findByIdAndUpdate(consultationId, updateConsultationDto, { new: true })
        .populate('patientId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName specialization')
        .exec();

      if (!updatedConsultation) {
        throw new NotFoundException('Consultation not found');
      }
      
      // Update cache
      await this.cacheConsultation(updatedConsultation);
      
      // Log audit event for consultation update
      await this.auditService.logDataAccess(
        userId || 'system',
        'consultations',
        'update',
        consultationId,
        consultation,
        updatedConsultation,
        requestMetadata
      );

      this.logger.log(`Consultation updated successfully: ${consultationId}`);
      return updatedConsultation;

    } catch (error) {
      this.logger.error(`Failed to update consultation ${consultationId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Soft delete consultation
   */
  async deleteConsultation(
    consultationId: string,
    userId?: string,
    requestMetadata?: { ipAddress: string; userAgent: string },
    userRoles?: string[]
  ): Promise<void> {
    try {
      const consultation = await this.findConsultationById(consultationId, userId, userRoles);
      
      // Only allow deletion if consultation is not completed
      if (consultation.status === ConsultationStatus.COMPLETED) {
        throw new BadRequestException('Cannot delete completed consultation');
      }

      // Soft delete by updating status
      await this.consultationModel.findByIdAndUpdate(consultationId, {
        status: ConsultationStatus.CANCELLED,
        consultationEndTime: new Date(),
      });

      // Clear cache
      await this.clearConsultationCache(consultationId, consultation.patientId.toString());
      
      // Log audit event for consultation deletion
      await this.auditService.logDataAccess(
        userId || 'system',
        'consultations',
        'delete',
        consultationId,
        consultation,
        undefined,
        requestMetadata
      );

      this.logger.log(`Consultation deleted successfully: ${consultationId}`);

    } catch (error) {
      this.logger.error(`Failed to delete consultation ${consultationId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store temporary consultation data (simplified for testing)
   */
  async storeTemporaryConsultationData(
    key: string,
    data: any,
    ttl: number = this.TEMP_DATA_TTL
  ): Promise<void> {
    try {
      // Store data directly (encryption disabled for testing)
      await this.cacheService.set(
        `temp:${key}`,
        { data: JSON.stringify(data), timestamp: new Date() },
        ttl
      );
      
      this.logger.debug(`Temporary data stored with key: ${key}`);

    } catch (error) {
      this.logger.error(`Failed to store temporary data: ${error.message}`);
      throw new InternalServerErrorException('Failed to store temporary data');
    }
  }

  /**
   * Retrieve temporary consultation data (simplified for testing)
   */
  async getTemporaryConsultationData(key: string): Promise<any> {
    try {
      const cachedData = await this.cacheService.get(`temp:${key}`);
      
      if (!cachedData) {
        throw new NotFoundException('Temporary data not found or expired');
      }

      // Parse data directly (decryption disabled for testing)
      return JSON.parse(cachedData.data);

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Failed to retrieve temporary data: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve temporary data');
    }
  }

  /**
   * Clear temporary consultation data
   */
  async clearTemporaryConsultationData(key: string): Promise<void> {
    try {
      await this.cacheService.delete(`temp:${key}`);
      this.logger.debug(`Temporary data cleared for key: ${key}`);

    } catch (error) {
      this.logger.error(`Failed to clear temporary data: ${error.message}`);
      // Don't throw error for cleanup operations
    }
  }

  /**
   * Collect symptoms from patient and get AI diagnosis
   */
  async collectSymptoms(
    patientId: string,
    symptomInputDto: SymptomInputDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<{
    sessionId: string;
    diagnosis: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recommendedConsultationType: 'chat' | 'video' | 'emergency';
    consultationPricing: { amount: number; currency: string };
    message: string;
  }> {
    try {
      const sessionId = `symptoms_${patientId}_${Date.now()}`;
      
      // Store symptoms temporarily
      await this.storeTemporaryConsultationData(sessionId, {
        patientId,
        symptoms: symptomInputDto,
        collectedAt: new Date(),
      });

      // Get AI diagnosis
      const aiDiagnosis = await this.aiAgentService.getDiagnosis(
        patientId,
        symptomInputDto,
        sessionId,
        requestMetadata
      );

      // Store AI diagnosis temporarily
      await this.storeTemporaryConsultationData(`${sessionId}_diagnosis`, {
        sessionId,
        patientId,
        aiDiagnosis,
        generatedAt: new Date(),
      });

      // Get consultation pricing
      const consultationPricing = this.paymentService.getConsultationPricing(
        aiDiagnosis.recommendedConsultationType
      );

      // Log audit event for symptom collection
      await this.auditService.logDataAccess(
        patientId,
        'symptoms',
        'create',
        sessionId,
        undefined,
        {
          symptoms: symptomInputDto,
          aiDiagnosis: {
            diagnosis: aiDiagnosis.diagnosis,
            severity: aiDiagnosis.severity,
            recommendedConsultationType: aiDiagnosis.recommendedConsultationType,
            confidence: aiDiagnosis.confidence,
          },
        },
        requestMetadata
      );

      this.logger.log(`Symptoms collected and AI diagnosis generated for patient: ${patientId}`);
      
      return {
        sessionId,
        diagnosis: aiDiagnosis.diagnosis,
        severity: aiDiagnosis.severity,
        recommendedConsultationType: aiDiagnosis.recommendedConsultationType,
        consultationPricing,
        message: 'Symptoms collected and diagnosis generated successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to collect symptoms for patient ${patientId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to collect symptoms and generate diagnosis');
    }
  }

  /**
   * Select consultation type and initiate payment
   */
  async selectConsultationType(
    consultationSelectionDto: any,
    patientId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    try {
      this.logger.log(`Selecting consultation type for patient: ${patientId}`);
      
      // Retrieve stored session data
      const sessionData = await this.getTemporaryConsultationData(consultationSelectionDto.sessionId);
      
      if (!sessionData || sessionData.patientId !== patientId) {
        throw new BadRequestException('Invalid session or patient mismatch');
      }

      // Try to get AI diagnosis data from separate storage if not in session data
      let aiDiagnosis = sessionData.aiDiagnosis;
      if (!aiDiagnosis) {
        try {
          const aiDiagnosisData = await this.getTemporaryConsultationData(`${consultationSelectionDto.sessionId}_diagnosis`);
          aiDiagnosis = aiDiagnosisData?.aiDiagnosis;
          this.logger.debug(`Retrieved AI diagnosis from separate storage for session: ${consultationSelectionDto.sessionId}`);
        } catch (error) {
          this.logger.warn(`Could not retrieve AI diagnosis for session ${consultationSelectionDto.sessionId}: ${error.message}`);
        }
      }

      // Get payment details
      const paymentDetails = await this.paymentService.createPaymentOrder(
        consultationSelectionDto.sessionId,
        patientId,
        consultationSelectionDto.selectedConsultationType,
        aiDiagnosis?.diagnosis || 'General consultation',
        aiDiagnosis?.severity || 'medium'
      );

      // Store selection temporarily with complete data
      const completeSessionData = {
        ...sessionData,
        aiDiagnosis: aiDiagnosis || this.getDefaultAIDiagnosis(),
        selectedConsultationType: consultationSelectionDto.selectedConsultationType,
        paymentDetails,
        selectedAt: new Date(),
      };

      await this.storeTemporaryConsultationData(`${consultationSelectionDto.sessionId}_selection`, completeSessionData);

      this.logger.debug(`Stored complete session data for payment confirmation: ${consultationSelectionDto.sessionId}`);

      return {
        sessionId: consultationSelectionDto.sessionId,
        paymentDetails,
        message: 'Consultation type selected successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to select consultation type for patient ${patientId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to select consultation type');
    }
  }

  /**
   * Confirm payment and finalize consultation
   */
  async confirmPayment(
    paymentConfirmationDto: any,
    patientId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    const transactionId = `payment_confirm_${Date.now()}`;
    
    try {
      this.logger.log(`[${transactionId}] Confirming payment for patient: ${patientId}, session: ${paymentConfirmationDto.sessionId}`);
      
      // Validate input
      if (!paymentConfirmationDto.sessionId || !paymentConfirmationDto.paymentId) {
        throw new BadRequestException('Session ID and Payment ID are required');
      }

      // Step 1: Verify payment first (independent of session data)
      this.logger.debug(`[${transactionId}] Verifying payment with ID: ${paymentConfirmationDto.paymentId}`);
      const paymentStatus = await this.paymentService.verifyPayment(paymentConfirmationDto);

      if (paymentStatus.status !== 'payment_completed') {
        this.logger.error(`[${transactionId}] Payment verification failed: status is ${paymentStatus.status}`);
        throw new BadRequestException(`Payment verification failed: ${paymentStatus.status}`);
      }

      this.logger.debug(`[${transactionId}] Payment verified successfully: ${paymentStatus.paymentId}`);

      // Step 2: Retrieve and validate session data
      const sessionData = await this.retrieveAndValidateSessionData(
        paymentConfirmationDto.sessionId,
        patientId,
        transactionId
      );

      this.logger.debug(`[${transactionId}] Session data retrieved successfully for patient: ${patientId}`);

      // Step 3: Create permanent consultation record with proper data mapping
      const consultationPayload = {
        patientId,
        sessionId: paymentConfirmationDto.sessionId,
        consultationType: sessionData.selectedConsultationType || 'chat',
        initialSymptoms: this.mapInitialSymptoms(sessionData.symptoms),
        medicalHistory: sessionData.symptoms?.medicalHistory || this.getDefaultMedicalHistory(),
        aiDiagnosis: this.mapAIDiagnosis(sessionData.aiDiagnosis, sessionData.isRecovered),
        paymentInfo: {
          amount: paymentStatus.amount,
          currency: paymentStatus.currency,
          paymentId: paymentStatus.paymentId,
          status: paymentStatus.status,
          paidAt: paymentStatus.paidAt || new Date()
        },
        metadata: {
          ipAddress: requestMetadata?.ipAddress || 'unknown',
          userAgent: requestMetadata?.userAgent || 'unknown',
          location: 'unknown',
          deviceInfo: 'unknown',
          isRecovered: sessionData.isRecovered || false
        }
      };

      const consultation = await this.createConsultation(consultationPayload, requestMetadata);

      this.logger.log(`[${transactionId}] Consultation created successfully: ${consultation._id}`);

      // Step 4: Clear temporary data (safe cleanup)
      await this.cleanupTemporaryData(paymentConfirmationDto.sessionId, transactionId);

      this.logger.log(`[${transactionId}] Payment confirmation completed successfully for patient: ${patientId}`);

      return {
        consultation,
        message: 'Payment confirmed and consultation created successfully',
        transactionId
      };

    } catch (error) {
      this.logger.error(`[${transactionId}] Failed to confirm payment for patient ${patientId}: ${error.message}`, error.stack);
      
      // Re-throw known errors
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      // Wrap unknown errors with more context
      throw new InternalServerErrorException({
        message: 'Failed to confirm payment',
        transactionId,
        error: error.message
      });
    }
  }

  /**
   * Mock payment completion for testing
   */
  async mockPaymentCompletion(
    sessionId: string,
    patientId: string,
    success: boolean = true
  ): Promise<any> {
    try {
      this.logger.log(`Mock payment completion for session: ${sessionId}`);
      
      if (!success) {
        return {
          success: false,
          message: 'Mock payment failed'
        };
      }

      // Retrieve stored session data
      const sessionData = await this.getTemporaryConsultationData(`${sessionId}_selection`);
      
      if (!sessionData || sessionData.patientId !== patientId) {
        throw new BadRequestException('Invalid session or patient mismatch');
      }

      // Create permanent consultation record
      const consultation = await this.createConsultation({
        patientId,
        sessionId,
        consultationType: sessionData.selectedConsultationType,
        initialSymptoms: sessionData.symptoms,
        aiDiagnosis: sessionData.aiDiagnosis,
        paymentInfo: {
          amount: 299,
          currency: 'INR',
          paymentId: `mock_${sessionId}`,
          status: 'payment_completed',
          paidAt: new Date()
        },
        metadata: {
          ipAddress: 'mock',
          userAgent: 'mock',
          location: 'mock',
          deviceInfo: 'mock'
        }
      });

      // Clear temporary data
      await this.clearTemporaryConsultationData(sessionId);
      await this.clearTemporaryConsultationData(`${sessionId}_selection`);

      return {
        success: true,
        consultation,
        message: 'Mock payment completed successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to complete mock payment for session ${sessionId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to complete mock payment');
    }
  }

  /**
   * Add doctor investigations and updates
   */
  async addDoctorInvestigations(
    consultationId: string,
    investigationDto: any,
    doctorId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    try {
      this.logger.log(`Adding doctor investigations for consultation: ${consultationId}`);
      
      // Find consultation and validate doctor access
      const consultation = await this.findConsultationById(consultationId, doctorId, ['healthcare_provider']);
      
      if (consultation.doctorId?.toString() !== doctorId) {
        throw new UnauthorizedException('Doctor not assigned to this consultation');
      }

      // Update consultation with investigation data
      const updatedConsultation = await this.updateConsultation(
        consultationId,
        {
          finalDiagnosis: investigationDto.clinicalNotes ? {
            diagnosis: investigationDto.clinicalNotes.assessment,
            notes: investigationDto.clinicalNotes.observations,
            treatmentPlan: investigationDto.clinicalNotes.plan,
            followUpRequired: investigationDto.clinicalNotes.followUpInstructions ? true : false,
            followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            doctorId: doctorId,
            diagnosedAt: new Date()
          } : undefined,
          status: investigationDto.clinicalNotes ? ConsultationStatus.COMPLETED : consultation.status,
          consultationEndTime: investigationDto.clinicalNotes ? new Date() : consultation.consultationEndTime
        },
        doctorId,
        requestMetadata,
        ['healthcare_provider']
      );

      return {
        consultation: updatedConsultation,
        message: 'Doctor investigations added successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to add doctor investigations for consultation ${consultationId}: ${error.message}`);
      throw error;
    }
  }

  // Private helper methods
  private async validatePatientExists(patientId: string): Promise<void> {
    // Implementation depends on your User service
    // This is a placeholder
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID format');
    }
  }

  private async validatePatientAccess(patientId: string, userId?: string): Promise<void> {
    // Implement access validation logic
    // Check if user has permission to access this patient's data
    if (userId && patientId !== userId) {
      // Additional role-based checks would go here
      this.logger.warn(`Access attempt by user ${userId} to patient ${patientId} data`);
    }
  }

  private async validateConsultationAccess(
    consultation: Consultation,
    userId?: string,
    userRoles?: string[]
  ): Promise<void> {
    // Implement comprehensive access validation
    const isPatient = consultation.patientId.toString() === userId;
    const isDoctor = consultation.doctorId?.toString() === userId;
    const isAdmin = userRoles?.includes('admin') || userRoles?.includes('super_admin');

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new UnauthorizedException('Insufficient permissions to access this consultation');
    }
  }

  private async validateUpdatePermissions(
    consultation: Consultation,
    userId?: string,
    updateData?: UpdateConsultationDto
  ): Promise<void> {
    // Implement update validation logic
    // Check if user has permission to update this consultation
    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('Cannot update completed consultation');
    }
  }

  private async cacheConsultation(consultation: any): Promise<void> {
    try {
      const consultationId = consultation._id || consultation.id;
      const cacheKey = `${this.CACHE_PREFIX}id:${consultationId}`;
      await this.cacheService.set(cacheKey, consultation, 600); // 10 minutes

      // Also cache by session ID
      if (consultation.sessionId) {
        const sessionCacheKey = `${this.CACHE_PREFIX}session:${consultation.sessionId}`;
        await this.cacheService.set(sessionCacheKey, consultation, 600);
      }

    } catch (error) {
      this.logger.error(`Failed to cache consultation: ${error.message}`);
      // Don't throw error for caching failures
    }
  }

  private async clearConsultationCache(consultationId: string, patientId: string): Promise<void> {
    try {
      // Clear specific consultation cache
      await this.cacheService.delete(`${this.CACHE_PREFIX}id:${consultationId}`);
      
      // Clear patient consultation list cache (simple approach - clear all pages)
      const patientCachePattern = `${this.CACHE_PREFIX}patient:${patientId}:*`;
      // Implementation depends on your cache service's pattern deletion capability
      
    } catch (error) {
      this.logger.error(`Failed to clear consultation cache: ${error.message}`);
      // Don't throw error for cache clearing failures
    }
  }

  /**
   * Retrieve and validate session data with proper error handling
   */
  private async retrieveAndValidateSessionData(
    sessionId: string,
    patientId: string,
    transactionId: string
  ): Promise<any> {
    const sessionDataKey = `${sessionId}_selection`;
    this.logger.debug(`[${transactionId}] Retrieving session data with key: ${sessionDataKey}`);
    
    try {
      // Try to retrieve session data
      const sessionData = await this.getTemporaryConsultationData(sessionDataKey);
      
      // Validate session data integrity
      this.validateSessionData(sessionData, patientId, transactionId);
      
      return sessionData;
      
    } catch (sessionError) {
      this.logger.warn(`[${transactionId}] Session data retrieval failed: ${sessionError.message}`);
      
      // Try to retrieve base session data (without _selection suffix)
      try {
        const baseSessionData = await this.getTemporaryConsultationData(sessionId);
        
        // If we found base session data, try to reconstruct
        if (baseSessionData) {
          this.logger.log(`[${transactionId}] Reconstructing session data from base session`);
          return this.reconstructSessionData(baseSessionData, patientId, sessionId);
        }
      } catch (baseError) {
        this.logger.warn(`[${transactionId}] Base session data also not found: ${baseError.message}`);
      }
      
      // Last resort: create minimal recovery data
      this.logger.warn(`[${transactionId}] Creating minimal recovery session data`);
      return this.createRecoverySessionData(patientId, sessionId);
    }
  }

  /**
   * Validate session data integrity
   */
  private validateSessionData(sessionData: any, patientId: string, transactionId: string): void {
    if (!sessionData) {
      throw new BadRequestException('Session data is null or undefined');
    }
    
    if (sessionData.patientId !== patientId) {
      this.logger.error(`[${transactionId}] Patient ID mismatch: expected ${sessionData.patientId}, got ${patientId}`);
      throw new BadRequestException('Invalid session or patient mismatch');
    }
    
    // Log session data quality for monitoring
    const hasSymptoms = sessionData.symptoms && Object.keys(sessionData.symptoms).length > 0;
    const hasAIDiagnosis = sessionData.aiDiagnosis && Object.keys(sessionData.aiDiagnosis).length > 0;
    
    this.logger.debug(`[${transactionId}] Session data quality: symptoms=${hasSymptoms}, aiDiagnosis=${hasAIDiagnosis}`);
  }

  /**
   * Reconstruct session data from base session data
   */
  private reconstructSessionData(baseSessionData: any, patientId: string, sessionId: string): any {
    return {
      patientId,
      sessionId,
      symptoms: baseSessionData.symptoms || this.getDefaultSymptoms(),
      aiDiagnosis: baseSessionData.aiDiagnosis || this.getDefaultAIDiagnosis(),
      selectedConsultationType: 'chat',
      isRecovered: true,
      recoveryReason: 'reconstructed_from_base_session'
    };
  }

  /**
   * Create minimal recovery session data when all else fails
   */
  private createRecoverySessionData(patientId: string, sessionId: string): any {
    return {
      patientId,
      sessionId,
      symptoms: this.getDefaultSymptoms(),
      aiDiagnosis: this.getDefaultAIDiagnosis(),
      selectedConsultationType: 'chat',
      isRecovered: true,
      recoveryReason: 'payment_recovery'
    };
  }

  /**
   * Map initial symptoms to consultation schema format
   */
  private mapInitialSymptoms(symptoms: any): any {
    if (!symptoms) {
      return this.getDefaultSymptoms();
    }
    
    return {
      primarySymptom: Array.isArray(symptoms.primarySymptom) 
        ? symptoms.primarySymptom.join(', ') 
        : symptoms.primarySymptom || 'General symptoms',
      duration: symptoms.duration || 'unknown',
      severity: this.mapSeverityToNumber(symptoms.severity),
      additionalSymptoms: symptoms.additionalSymptoms || [],
      triggers: symptoms.triggers || [],
      previousTreatments: symptoms.previousTreatments || []
    };
  }

  /**
   * Map severity string to number as required by schema
   */
  private mapSeverityToNumber(severity: any): number {
    if (typeof severity === 'number') {
      return severity;
    }
    
    const severityMap = {
      'mild': 1,
      'moderate': 2,
      'severe': 3
    };
    
    return severityMap[severity] || 2; // Default to moderate
  }

  /**
   * Map AI diagnosis to consultation schema format with proper validation
   */
  private mapAIDiagnosis(aiDiagnosis: any, isRecovered: boolean = false): any {
    if (!aiDiagnosis) {
      return this.getDefaultAIDiagnosis();
    }
    
    // Handle different AI diagnosis structures
    const mappedDiagnosis = {
      primaryDiagnosis: aiDiagnosis.diagnosis || aiDiagnosis.primaryDiagnosis || 'General consultation',
      differentialDiagnosis: aiDiagnosis.differentialDiagnosis || [],
      recommendedTests: aiDiagnosis.recommendedTests || [],
      urgencyLevel: aiDiagnosis.urgencyLevel || aiDiagnosis.severity || 'normal',
      confidence: typeof aiDiagnosis.confidence === 'number' ? aiDiagnosis.confidence : 0.5,
      generatedAt: aiDiagnosis.generatedAt ? new Date(aiDiagnosis.generatedAt) : new Date()
    };
    
    // Add recovery metadata if needed
    if (isRecovered) {
      mappedDiagnosis.primaryDiagnosis = `${mappedDiagnosis.primaryDiagnosis} (Recovered from session)`;
      mappedDiagnosis.confidence = Math.min(mappedDiagnosis.confidence, 0.3); // Lower confidence for recovered data
    }
    
    return mappedDiagnosis;
  }

  /**
   * Get default medical history structure
   */
  private getDefaultMedicalHistory(): any {
    return {
      allergies: [],
      currentMedications: [],
      chronicConditions: [],
      previousSurgeries: [],
      familyHistory: []
    };
  }

  /**
   * Get default symptoms structure
   */
  private getDefaultSymptoms(): any {
    return {
      primarySymptom: 'General consultation',
      duration: 'unknown',
      severity: 2,
      additionalSymptoms: [],
      triggers: [],
      previousTreatments: []
    };
  }

  /**
   * Get default AI diagnosis structure
   */
  private getDefaultAIDiagnosis(): any {
    return {
      primaryDiagnosis: 'General consultation',
      differentialDiagnosis: [],
      recommendedTests: [],
      urgencyLevel: 'normal',
      confidence: 0.5,
      generatedAt: new Date()
    };
  }

  /**
   * Clean up temporary data with proper error handling
   */
  private async cleanupTemporaryData(sessionId: string, transactionId: string): Promise<void> {
    try {
      // Clear all related temporary data
      const keysToClean = [
        sessionId,
        `${sessionId}_selection`,
        `${sessionId}_diagnosis`
      ];
      
      await Promise.allSettled(
        keysToClean.map(key => this.clearTemporaryConsultationData(key))
      );
      
      this.logger.debug(`[${transactionId}] Temporary data cleanup completed`);
      
    } catch (cleanupError) {
      this.logger.warn(`[${transactionId}] Failed to clear temporary data: ${cleanupError.message}`);
      // Don't fail the transaction due to cleanup errors
    }
  }

  /**
   * Structured symptom collection for production-level AI diagnosis
   */
  async collectStructuredSymptoms(
    patientId: string,
    detailedSymptomInputDto: DetailedSymptomInputDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    try {
      const sessionId = `symptoms_${patientId}_${Date.now()}`;
      
      this.logger.log(`Collecting structured symptoms for patient: ${patientId}`);
      
      // Validate patient ID matches request_id
      if (detailedSymptomInputDto.patient_profile.request_id !== patientId) {
        throw new ConflictException('Patient ID mismatch with request_id');
      }
      
      // Store structured symptoms temporarily for audit and potential follow-up
      await this.storeTemporaryConsultationData(sessionId, {
        patientId,
        structuredSymptoms: detailedSymptomInputDto,
        collectedAt: new Date(),
      });
      
      // Process symptoms and generate comprehensive AI diagnosis
      const diagnosis = this.generateDiagnosisFromStructuredSymptoms(detailedSymptomInputDto);
      const confidenceScore = this.calculateConfidenceScore(detailedSymptomInputDto);
      const suggestedInvestigations = this.generateInvestigations(detailedSymptomInputDto);
      const recommendedMedications = this.generateMedications(detailedSymptomInputDto);
      const lifestyleAdvice = this.generateLifestyleAdvice(detailedSymptomInputDto);
      const followUpRecommendations = this.generateFollowUpRecommendations(detailedSymptomInputDto);
      const disclaimer = this.generateDisclaimer();
      
      // Create comprehensive response
      const comprehensiveResponse = {
        diagnosis,
        confidence_score: confidenceScore,
        suggested_investigations: suggestedInvestigations,
        recommended_medications: recommendedMedications,
        lifestyle_advice: lifestyleAdvice,
        follow_up_recommendations: followUpRecommendations,
        disclaimer,
        timestamp: new Date().toISOString()
      };
      
      // Store diagnosis temporarily with comprehensive data
      await this.storeTemporaryConsultationData(`${sessionId}_diagnosis`, {
        sessionId,
        patientId,
        comprehensiveResponse,
        generatedAt: new Date(),
      });
      
      // Log audit event
      await this.auditService.logDataAccess(
        patientId,
        'structured-symptoms',
        'create',
        sessionId,
        undefined,
        {
          patientProfile: {
            age: detailedSymptomInputDto.patient_profile.age,
            timestamp: detailedSymptomInputDto.patient_profile.timestamp,
          },
          primaryComplaint: {
            mainSymptom: detailedSymptomInputDto.primary_complaint.main_symptom,
            severity: detailedSymptomInputDto.primary_complaint.severity,
            duration: detailedSymptomInputDto.primary_complaint.duration,
          },
          medicalContext: {
            allergiesCount: detailedSymptomInputDto.medical_context.allergies.length,
            medicationsCount: detailedSymptomInputDto.medical_context.current_medications.length,
            conditionsCount: detailedSymptomInputDto.medical_context.medical_conditions.length,
          },
          diagnosisResult: {
            diagnosis,
            confidence_score: confidenceScore,
            investigations_count: suggestedInvestigations.length,
            medications_count: recommendedMedications.length,
          },
        },
        requestMetadata
      );
      
      this.logger.log(`Structured symptoms collected and comprehensive diagnosis generated for patient: ${patientId}`);
      
      return comprehensiveResponse;
      
    } catch (error) {
      this.logger.error(`Failed to collect structured symptoms for patient ${patientId}: ${error.message}`);
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to collect structured symptoms and generate diagnosis');
    }
  }

  /**
   * Basic symptom collection for simple AI diagnosis (legacy)
   */
  async collectBasicSymptoms(
    patientId: string,
    basicSymptomInputDto: BasicSymptomInputDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    try {
      const sessionId = `basic_symptoms_${patientId}_${Date.now()}`;
      
      this.logger.log(`Collecting basic symptoms for patient: ${patientId}`);
      
      // Prepare request for AI agent matching the basic format
      const aiRequest = {
        symptoms: basicSymptomInputDto.symptoms,
        patient_age: basicSymptomInputDto.patient_age,
        severity_level: basicSymptomInputDto.severity_level,
        duration: basicSymptomInputDto.duration,
        medical_history: basicSymptomInputDto.medical_history || [],
        additional_notes: basicSymptomInputDto.additional_notes || ''
      };
      
      // Store basic symptoms temporarily
      await this.storeTemporaryConsultationData(sessionId, {
        patientId,
        basicSymptoms: basicSymptomInputDto,
        collectedAt: new Date(),
      });
      
      // Get AI diagnosis - we'll need to adapt the AI service for basic input
      // For now, convert to the format the AI service expects
      const convertedSymptoms: SymptomInputDto = {
        primarySymptom: basicSymptomInputDto.symptoms,
        duration: basicSymptomInputDto.duration,
        severity: basicSymptomInputDto.severity_level,
        additionalSymptoms: [],
        triggers: [],
        previousTreatments: [],
        medicalHistory: {
          allergies: [],
          currentMedications: basicSymptomInputDto.medical_history || [],
          chronicConditions: [],
          previousSurgeries: [],
          familyHistory: []
        }
      };
      
      const aiDiagnosis = await this.aiAgentService.getDiagnosis(
        patientId,
        convertedSymptoms,
        sessionId,
        requestMetadata
      );
      
      // Store AI diagnosis temporarily
      await this.storeTemporaryConsultationData(`${sessionId}_diagnosis`, {
        sessionId,
        patientId,
        aiDiagnosis,
        generatedAt: new Date(),
      });
      
      // Log audit event
      await this.auditService.logDataAccess(
        patientId,
        'basic-symptoms',
        'create',
        sessionId,
        undefined,
        {
          basicSymptoms: basicSymptomInputDto,
          aiDiagnosis: {
            diagnosis: aiDiagnosis.diagnosis,
            severity: aiDiagnosis.severity,
            confidence: aiDiagnosis.confidence,
          },
        },
        requestMetadata
      );
      
      this.logger.log(`Basic symptoms collected and AI diagnosis generated for patient: ${patientId}`);
      
      return {
        sessionId,
        diagnosis: aiDiagnosis.diagnosis,
        severity: aiDiagnosis.severity,
        recommendedConsultationType: aiDiagnosis.recommendedConsultationType,
        confidence: aiDiagnosis.confidence,
        message: 'Basic symptoms collected and diagnosis generated successfully'
      };
      
    } catch (error) {
      this.logger.error(`Failed to collect basic symptoms for patient ${patientId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to collect basic symptoms and generate diagnosis');
    }
  }

  /**
   * Detailed symptom collection for comprehensive AI diagnosis
   */
  async collectDetailedSymptoms(
    patientId: string,
    detailedSymptomInputDto: DetailedSymptomInputDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<DetailedDiagnosisResponseDto> {
    try {
      const sessionId = `detailed_symptoms_${patientId}_${Date.now()}`;
      
      this.logger.log(`Collecting detailed symptoms for patient: ${patientId}`);
      
      // Validate patient ID matches request_id
      if (detailedSymptomInputDto.patient_profile.request_id !== patientId) {
        throw new ConflictException('Patient ID mismatch with request_id');
      }
      
      // Store detailed symptoms temporarily
      await this.storeTemporaryConsultationData(sessionId, {
        patientId,
        detailedSymptoms: detailedSymptomInputDto,
        collectedAt: new Date(),
      });
      
      // Mock detailed AI response - in production, this would call the updated AI agent
      // For now, we'll create a comprehensive response based on the input
      const detailedAIResponse: DetailedDiagnosisResponseDto = {
        diagnosis: this.generateDiagnosisFromSymptoms(detailedSymptomInputDto),
        confidence_score: 0.85,
        suggested_investigations: this.generateInvestigations(detailedSymptomInputDto),
        recommended_medications: this.generateMedications(detailedSymptomInputDto),
        lifestyle_advice: this.generateLifestyleAdvice(detailedSymptomInputDto),
        follow_up_recommendations: "Follow up in 1-2 weeks if symptoms persist or worsen",
        disclaimer: "This is an AI-generated preliminary assessment. Please consult with a healthcare provider for proper medical care. This assessment is based on the information provided and should not replace professional medical advice.",
        timestamp: new Date().toISOString()
      };
      
      // Store detailed AI diagnosis
      await this.storeTemporaryConsultationData(`${sessionId}_detailed_diagnosis`, {
        sessionId,
        patientId,
        detailedAIResponse,
        generatedAt: new Date(),
      });
      
      // Log audit event
      await this.auditService.logDataAccess(
        patientId,
        'detailed-symptoms',
        'create',
        sessionId,
        undefined,
        {
          detailedSymptoms: {
            main_symptom: detailedSymptomInputDto.primary_complaint.main_symptom,
            severity: detailedSymptomInputDto.primary_complaint.severity,
            allergies: detailedSymptomInputDto.medical_context.allergies,
          },
          detailedAIResponse: {
            diagnosis: detailedAIResponse.diagnosis,
            confidence_score: detailedAIResponse.confidence_score,
            medication_count: detailedAIResponse.recommended_medications.length,
            investigation_count: detailedAIResponse.suggested_investigations.length,
          },
        },
        requestMetadata
      );
      
      this.logger.log(`Detailed symptoms collected and comprehensive AI diagnosis generated for patient: ${patientId}`);
      
      return detailedAIResponse;
      
    } catch (error) {
      this.logger.error(`Failed to collect detailed symptoms for patient ${patientId}: ${error.message}`);
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to collect detailed symptoms and generate comprehensive diagnosis');
    }
  }

  /**
   * Generate diagnosis from detailed symptoms
   */
  private generateDiagnosisFromSymptoms(symptoms: DetailedSymptomInputDto): string {
    const mainSymptom = symptoms.primary_complaint.main_symptom;
    const severity = symptoms.primary_complaint.severity;
    
    // Simple rule-based diagnosis generation
    if (mainSymptom.includes('pelvic_pain')) {
      return 'Possible pelvic inflammatory disease (PID) or ovarian cyst - requires medical evaluation';
    } else if (mainSymptom.includes('vaginal_discharge')) {
      return 'Possible vaginal infection (bacterial vaginosis, yeast infection, or STI) - laboratory testing recommended';
    } else if (mainSymptom.includes('painful_periods')) {
      return 'Possible dysmenorrhea or endometriosis - hormonal evaluation recommended';
    }
    
    return 'Gynecological consultation recommended for proper diagnosis and treatment';
  }

  /**
   * Generate investigations based on symptoms
   */
  private generateInvestigations(symptoms: DetailedSymptomInputDto): Array<{
    name: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }> {
    const mainSymptom = symptoms.primary_complaint.main_symptom;
    const severity = symptoms.primary_complaint.severity;
    
    const investigations: Array<{
      name: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
    }> = [];
    
    // Common investigations
    investigations.push({
      name: "Complete Blood Count (CBC)",
      priority: "medium" as const,
      reason: "To check for infection, anemia, or other blood disorders"
    });
    
    investigations.push({
      name: "Urine Analysis",
      priority: "medium" as const,
      reason: "To rule out urinary tract infections"
    });
    
    // Symptom-specific investigations
    if (mainSymptom.includes('pelvic_pain')) {
      investigations.push({
        name: "Pelvic Ultrasound",
        priority: "high" as const,
        reason: "To evaluate pelvic organs and rule out cysts or masses"
      });
    }
    
    if (mainSymptom.includes('vaginal_discharge')) {
      investigations.push({
        name: "Vaginal Swab Culture",
        priority: "high" as const,
        reason: "To identify specific pathogens causing discharge"
      });
    }
    
    return investigations;
  }

  /**
   * Production-level allergy checker with drug aliases and categories
   */
  private checkMedicationAllergy(allergies: string[], medicationName: string, drugClass?: string): boolean {
    // Known drug aliases and brand names
    const drugAliases: { [key: string]: string[] } = {
      'ibuprofen': ['ibuprofen', 'advil', 'motrin', 'brufen', 'nurofen', 'caldolor'],
      'naproxen': ['naproxen', 'aleve', 'naprosyn', 'anaprox'],
      'nsaid': ['nsaid', 'nonsteroidal', 'anti-inflammatory'],
      'acetaminophen': ['acetaminophen', 'paracetamol', 'tylenol', 'panadol'],
      'aspirin': ['aspirin', 'asa', 'bayer', 'bufferin'],
      'penicillin': ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin'],
      'sulfa': ['sulfa', 'sulfamethoxazole', 'trimethoprim', 'bactrim', 'septra']
    };

    // Drug class categories
    const drugClasses: { [key: string]: string[] } = {
      'nsaid': ['ibuprofen', 'naproxen', 'diclofenac', 'celecoxib', 'indomethacin'],
      'beta_lactam': ['penicillin', 'amoxicillin', 'cephalexin', 'ceftriaxone'],
      'sulfonamide': ['sulfamethoxazole', 'sulfasalazine', 'sulfadiazine']
    };

    const normalizedAllergies = allergies.map(allergy => allergy.toLowerCase().trim());
    const normalizedMedication = medicationName.toLowerCase();

    // Check direct matches and aliases
    for (const allergy of normalizedAllergies) {
      // Direct medication name match
      if (allergy === normalizedMedication) {
        return true;
      }

      // Check against all drug aliases
      for (const [drugName, aliases] of Object.entries(drugAliases)) {
        if (aliases.some(alias => allergy.includes(alias) || alias.includes(allergy))) {
          // If the allergy matches any alias, check if our medication is in that group
          if (aliases.some(alias => normalizedMedication.includes(alias) || alias.includes(normalizedMedication))) {
            return true;
          }
        }
      }

      // Check drug class allergies
      if (drugClass) {
        const classAliases = drugClasses[drugClass.toLowerCase()] || [];
        if (classAliases.some(classAlias => 
          allergy.includes(classAlias) || classAlias.includes(allergy) ||
          allergy.includes(drugClass.toLowerCase()) || drugClass.toLowerCase().includes(allergy)
        )) {
          return true;
        }
      }

      // Fuzzy matching for common misspellings or partial matches
      if (allergy.length > 3 && normalizedMedication.length > 3) {
        if (allergy.includes(normalizedMedication.substring(0, 4)) || 
            normalizedMedication.includes(allergy.substring(0, 4))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate safe medications avoiding allergies
   */
  private generateMedications(symptoms: DetailedSymptomInputDto): Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    reason: string;
    notes?: string;
  }> {
    const allergies = symptoms.medical_context.allergies || [];
    const severity = symptoms.primary_complaint.severity;
    const medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      reason: string;
      notes?: string;
    }> = [];
    
    // Pain management with comprehensive allergy checking
    const hasNSAIDAllergy = this.checkMedicationAllergy(allergies, 'ibuprofen', 'nsaid');
    const hasAcetaminophenAllergy = this.checkMedicationAllergy(allergies, 'acetaminophen');
    
    if (hasNSAIDAllergy && !hasAcetaminophenAllergy) {
      medications.push({
        name: "Acetaminophen",
        dosage: "500mg",
        frequency: "Every 6-8 hours as needed",
        duration: "5-7 days",
        reason: "Pain relief",
        notes: "⚠️ ALLERGY SUBSTITUTION: Replaced NSAID with safe alternative due to patient allergy to NSAIDs/Ibuprofen"
      });
    } else if (!hasNSAIDAllergy) {
      medications.push({
        name: "Ibuprofen",
        dosage: "400mg",
        frequency: "Every 8 hours with food",
        duration: "5-7 days",
        reason: "Pain relief and anti-inflammatory"
      });
    } else if (hasNSAIDAllergy && hasAcetaminophenAllergy) {
      medications.push({
        name: "Topical analgesic cream",
        dosage: "Apply thin layer",
        frequency: "2-3 times daily",
        duration: "5-7 days",
        reason: "Pain relief",
        notes: "⚠️ MULTIPLE ALLERGIES: Patient allergic to both NSAIDs and Acetaminophen - using topical alternative"
      });
    }
    
    // Add probiotic for vaginal health (check for any probiotic allergies)
    const hasProbioticAllergy = this.checkMedicationAllergy(allergies, 'probiotic') ||
                               this.checkMedicationAllergy(allergies, 'lactobacillus');
    
    if (!hasProbioticAllergy) {
      medications.push({
        name: "Probiotic supplement",
        dosage: "1 capsule",
        frequency: "Once daily",
        duration: "30 days",
        reason: "To support vaginal and digestive health"
      });
    } else {
      medications.push({
        name: "Cranberry supplement",
        dosage: "500mg",
        frequency: "Twice daily",
        duration: "30 days",
        reason: "Alternative support for urogenital health",
        notes: "⚠️ ALLERGY SUBSTITUTION: Replaced probiotic due to patient allergy"
      });
    }
    
    return medications;
  }

  /**
   * Generate lifestyle advice
   */
  private generateLifestyleAdvice(symptoms: DetailedSymptomInputDto): string[] {
    const advice = [
      "Maintain good personal hygiene",
      "Wear breathable, cotton underwear",
      "Stay well-hydrated (8-10 glasses of water daily)",
      "Avoid tight-fitting clothing",
      "Practice stress management techniques"
    ];
    
    const mainSymptom = symptoms.primary_complaint.main_symptom;
    
    if (mainSymptom.includes('pelvic_pain')) {
      advice.push("Apply heat therapy (warm compress) to reduce pain");
      advice.push("Avoid strenuous physical activities until symptoms improve");
    }
    
    if (mainSymptom.includes('vaginal_discharge')) {
      advice.push("Avoid douching and scented feminine products");
      advice.push("Consider probiotics to maintain vaginal flora");
    }
    
    return advice;
  }

  /**
   * Generate diagnosis from structured symptoms with intelligent analysis
   */
  private generateDiagnosisFromStructuredSymptoms(symptoms: DetailedSymptomInputDto): string {
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    const severity = symptoms.primary_complaint.severity;
    const duration = symptoms.primary_complaint.duration;
    const associatedSymptoms = symptoms.associated_symptoms;
    
    // Advanced symptom analysis
    if (mainSymptom.includes('bleeding') || mainSymptom.includes('menstrual')) {
      const bleeding = symptoms.symptom_specific_details?.bleeding_pattern;
      if (bleeding?.clots_present && bleeding?.associated_pain === 'severe') {
        return 'Heavy menstrual bleeding with severe cramping - possible hormonal imbalance or uterine pathology';
      }
      return 'Irregular menstrual bleeding - hormonal evaluation recommended';
    }
    
    if (mainSymptom.includes('pain') || mainSymptom.includes('cramp')) {
      if (severity === 'severe' && associatedSymptoms?.systemic?.fatigue) {
        return 'Severe pelvic pain with systemic symptoms - urgent gynecological evaluation required';
      }
      return 'Pelvic pain - comprehensive gynecological assessment needed';
    }
    
    if (mainSymptom.includes('discharge')) {
      return 'Vaginal discharge - infectious or inflammatory condition, laboratory testing recommended';
    }
    
    // Contraceptive-related symptoms
    if (mainSymptom.includes('pill') || mainSymptom.includes('contraceptive')) {
      return 'Post-contraceptive symptoms - hormonal adjustment period, monitoring advised';
    }
    
    return 'Gynecological symptoms require professional medical evaluation for accurate diagnosis';
  }

  /**
   * Determine severity from structured symptoms
   */
  private determineSeverityFromSymptoms(symptoms: DetailedSymptomInputDto): 'low' | 'medium' | 'high' | 'critical' {
    const baseSeverity = symptoms.primary_complaint.severity;
    const impact = symptoms.patient_concerns.impact_on_life;
    const associatedSymptoms = symptoms.associated_symptoms;
    
    // Critical indicators
    if (associatedSymptoms?.systemic?.fever || 
        associatedSymptoms?.pain?.pain_timing === 'constant' ||
        impact === 'severe') {
      return 'critical';
    }
    
    // High severity indicators
    if (baseSeverity === 'severe' || 
        impact === 'significant' ||
        associatedSymptoms?.systemic?.dizziness) {
      return 'high';
    }
    
    // Medium severity indicators
    if (baseSeverity === 'moderate' || 
        impact === 'moderate' ||
        associatedSymptoms?.systemic?.fatigue === 'moderate') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Determine consultation type from severity
   */
  private determineConsultationTypeFromSeverity(severity: string): 'chat' | 'video' | 'emergency' {
    switch (severity) {
      case 'critical':
        return 'emergency';
      case 'high':
        return 'video';
      case 'medium':
      case 'low':
      default:
        return 'chat';
    }
  }

  /**
   * Get consultation pricing based on type
   */
  private getConsultationPricing(consultationType: string): { amount: number; currency: string } {
    const pricing = {
      chat: { amount: 299, currency: 'INR' },
      video: { amount: 499, currency: 'INR' },
      emergency: { amount: 999, currency: 'INR' }
    };
    
    return pricing[consultationType] || pricing.chat;
  }

  /**
   * Calculate confidence score based on symptom completeness and clarity
   */
  private calculateConfidenceScore(symptoms: DetailedSymptomInputDto): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on data completeness
    if (symptoms.primary_complaint.main_symptom && symptoms.primary_complaint.main_symptom.length > 10) {
      confidence += 0.1;
    }
    
    if (symptoms.primary_complaint.duration && symptoms.primary_complaint.duration !== 'unknown') {
      confidence += 0.1;
    }
    
    if (symptoms.medical_context.allergies.length > 0) {
      confidence += 0.05;
    }
    
    if (symptoms.associated_symptoms && Object.keys(symptoms.associated_symptoms).length > 0) {
      confidence += 0.1;
    }
    
    if (symptoms.healthcare_interaction.previous_consultation) {
      confidence += 0.05;
    }
    
    // Specific symptom patterns increase confidence
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    if (mainSymptom.includes('pain') && symptoms.associated_symptoms?.pain) {
      confidence += 0.1;
    }
    
    // Cap confidence at 0.95 for AI-generated diagnoses
    return Math.min(confidence, 0.95);
  }

  /**
   * Generate follow-up recommendations based on symptoms
   */
  private generateFollowUpRecommendations(symptoms: DetailedSymptomInputDto): string {
    const severity = symptoms.primary_complaint.severity;
    const impact = symptoms.patient_concerns.impact_on_life;
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    
    if (severity === 'severe' || impact === 'severe') {
      return 'Follow up within 24-48 hours if symptoms persist or worsen. Seek immediate medical attention if symptoms become severe.';
    }
    
    if (mainSymptom.includes('pain') && symptoms.associated_symptoms?.pain?.pain_timing === 'constant') {
      return 'Follow up in 3-5 days if pain persists. Monitor pain levels and seek immediate care if pain becomes unbearable.';
    }
    
    if (mainSymptom.includes('bleeding') || mainSymptom.includes('discharge')) {
      return 'Follow up in 1 week if symptoms persist or if new symptoms develop. Return sooner if bleeding increases significantly.';
    }
    
    return 'Follow up in 1-2 weeks if symptoms persist or worsen. Monitor symptoms and seek medical attention if you develop fever, severe pain, or other concerning symptoms.';
  }

  /**
   * Generate standard medical disclaimer
   */
  private generateDisclaimer(): string {
    return 'This is an AI-generated preliminary assessment based on the symptoms provided. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider for proper medical evaluation and treatment. If you are experiencing a medical emergency, please seek immediate medical attention or call emergency services.';
  }
}
