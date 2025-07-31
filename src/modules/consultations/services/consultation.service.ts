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
import { Consultation, ConsultationDocument, ConsultationStatus, ConsultationType, ConsultationPriority } from '../schemas/consultation.schema';
import { 
  CreateConsultationDto, 
  UpdateConsultationStatusDto, 
  CreatePatientProfileDto, 
  CreateSymptomScreeningDto, 
  ConsultationResponseDto, 
  PrescriptionResponseDto 
} from '../dto/new-consultation.dto';
// Import legacy DTOs for backward compatibility
import { 
  UpdateConsultationDto,
  SymptomInputDto,
  BasicSymptomInputDto,
  DetailedSymptomInputDto,
  DetailedDiagnosisResponseDto,
  AIAgentSymptomCollectionDto,
  AIDiagnosisResponseDto,
  GynecologicalAssessmentDto,
  StructuredDiagnosisResponseDto
} from '../dto/consultation.dto';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';
import { DoctorShiftService } from './doctor-shift.service';
import { DoctorAssignmentService } from './doctor-assignment.service';
import { AIAgentService } from './ai-agent.service';
import { PaymentService } from './payment.service';
import { SessionManagerService } from './session-manager.service';
import { ConsultationBusinessService } from './consultation-business.service';

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
    private doctorAssignmentService: DoctorAssignmentService,
    private aiAgentService: AIAgentService,
    private paymentService: PaymentService,
    private sessionManager: SessionManagerService,
    private consultationBusinessService: ConsultationBusinessService,
  ) {}

  /**
   * Check AI service health and JWT authentication
   */
  async checkAIServiceHealth(): Promise<{
    status: string;
    aiService: {
      connectivity: string;
      authentication: string;
      latency?: number;
    };
    tokenService: {
      status: string;
      tokenInfo?: any;
    };
    timestamp: string;
  }> {
    const startTime = Date.now();
    const result = {
      status: 'healthy',
      aiService: {
        connectivity: 'unknown',
        authentication: 'unknown',
        latency: undefined as number | undefined,
      },
      tokenService: {
        status: 'unknown',
        tokenInfo: undefined as any,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // Test AI service health
      const aiHealthResult = await this.aiAgentService.healthCheck();
      result.aiService.connectivity = aiHealthResult.status;
      result.aiService.latency = aiHealthResult.latency;
      
      if (aiHealthResult.status === 'healthy') {
        result.aiService.authentication = 'verified';
      } else {
        result.aiService.authentication = 'failed';
        result.status = 'degraded';
      }
    } catch (error) {
      this.logger.error('AI service health check failed:', error);
      result.aiService.connectivity = 'failed';
      result.aiService.authentication = 'failed';
      result.status = 'degraded';
    }

    // Test token service using existing AI agent service
    try {
      this.logger.debug('Testing AI token service health...');
      const tokenInfo = await this.aiAgentService.getTokenInfo();
      result.tokenService.status = tokenInfo ? 'healthy' : 'failed';
      result.tokenService.tokenInfo = tokenInfo;
      
      if (!tokenInfo) {
        this.logger.warn('Token service returned null token info');
        result.status = 'degraded';
      } else {
        this.logger.debug('Token service health check passed');
      }
    } catch (error) {
      this.logger.error('Token service health check failed:', error.message);
      this.logger.error('Token service error stack:', error.stack);
      result.tokenService.status = 'failed';
      result.status = 'degraded';
    }

    const totalLatency = Date.now() - startTime;
    this.logger.log(`AI service health check completed in ${totalLatency}ms - Status: ${result.status}`);
    
    return result;
  }

  async findConsultationsByDoctorId(
    doctorId: string,
    queryDto: any,
  ): Promise<{ consultations: Consultation[]; total: number }> {
    try {
      this.logger.log(`Fetching consultations for doctor: ${doctorId}`);
      
      const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = queryDto;
      
      const query: any = { doctorId: new Types.ObjectId(doctorId) };
      
      if (status) {
        query.status = status;
      }
      
      const sortOptions: { [key: string]: 'asc' | 'desc' } = {};
      sortOptions[sortBy] = sortOrder;

      const [consultations, total] = await Promise.all([
        this.consultationModel
          .find(query)
          .sort(sortOptions)
          .limit(limit)
          .skip((page - 1) * limit)
          .populate('patientId', 'firstName lastName email')
          .exec(),
        this.consultationModel.countDocuments(query),
      ]);
      
      return { consultations, total };

    } catch (error) {
      this.logger.error(`Failed to fetch consultations for doctor ${doctorId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch consultations');
    }
  }

  /**
   * Collect AI Agent symptoms and retrieve diagnosis with session management
   */
  async collectAIAgentSymptoms(
    patientId: string,
    aiAgentSymptomCollectionDto: AIAgentSymptomCollectionDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<AIDiagnosisResponseDto & { sessionId: string; consultationPricing: any }> {
    try {
      this.logger.log(`Collecting AI Agent symptoms for patient: ${patientId}`);
      
      // Validate input according to schema rules
      this.validateAISymptoms(aiAgentSymptomCollectionDto, patientId);

      // Create session using SessionManager
      const sessionId = await this.sessionManager.createSession(patientId, requestMetadata);
      
      // Transform or map input as needed for internal processing
      const transformedInput = this.transformAISymptoms(aiAgentSymptomCollectionDto);

      // Call AI Agent service to get diagnosis
      const aiDiagnosis = await this.aiAgentService.getDiagnosisFromAgent(
        patientId,
        transformedInput,
        requestMetadata
      );

      // Get consultation pricing based on recommended type
      const consultationPricing = this.getConsultationPricing(aiDiagnosis.recommendedConsultationType || 'chat');

      // Update session with diagnosis and pricing for next phase
      await this.sessionManager.updateSession(
        sessionId,
        'consultation_selection',
        {
          initialSymptoms: transformedInput,
          aiDiagnosis,
          consultationPricing
        },
        patientId
      );

      // Log audit event for AI agent symptom collection
      await this.auditService.logDataAccess(
        patientId,
        'ai-agent-symptoms',
        'create',
        sessionId,
        undefined,
        {
          symptoms: aiAgentSymptomCollectionDto.diagnosis_request.symptoms,
          patientAge: aiAgentSymptomCollectionDto.diagnosis_request.patient_age,
          severityLevel: aiAgentSymptomCollectionDto.diagnosis_request.severity_level,
          duration: aiAgentSymptomCollectionDto.diagnosis_request.duration,
          onset: aiAgentSymptomCollectionDto.diagnosis_request.onset,
          progression: aiAgentSymptomCollectionDto.diagnosis_request.progression,
          aiDiagnosis: {
            diagnosis: aiDiagnosis.diagnosis,
            confidence: aiDiagnosis.confidence,
            severity: aiDiagnosis.severity
          },
          sessionId
        },
        requestMetadata
      );

      this.logger.log(`Session created successfully: ${sessionId} for patient: ${patientId}`);

      // Return extended response with session info
      const response = {
        ...aiDiagnosis,
        sessionId,
        consultationPricing
      };
      
      this.logger.log(`Symptoms collected and diagnosis generated successfully for patient: ${patientId}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Failed to collect AI Agent symptoms for patient ${patientId}: ${error.message}`);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to collect AI Agent symptoms and generate diagnosis');
    }
  }

  /**
   * Collect structured gynecological assessment and retrieve comprehensive diagnosis
   */
  async collectStructuredGynecologicalAssessment(
    patientId: string,
    assessmentData: GynecologicalAssessmentDto,
    clinicalSessionId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<StructuredDiagnosisResponseDto & { consultationId: string; clinicalSessionId: string; consultationPricing: any; paymentVerified: boolean }> {
    try {
      this.logger.log(`Collecting structured gynecological assessment for patient: ${patientId}`);
      
      // 1. Find consultation by clinicalSessionId and patientId
      const consultation = await this.consultationModel.findOne({
        patientId: new Types.ObjectId(patientId),
        clinicalSessionId
      });
      if (!consultation) {
        this.logger.warn(`No consultation found for patient: ${patientId} and clinicalSessionId: ${clinicalSessionId}`);
        throw new BadRequestException('Consultation not found. Please confirm payment first.');
      }

      // 2. Verify payment status and phase
      if (!consultation.paymentInfo || consultation.paymentInfo.paymentStatus !== 'completed') {
        this.logger.warn(`Payment not confirmed for consultation: ${consultation.consultationId}`);
        throw new BadRequestException('Payment not confirmed. Please complete payment first.');
      }
      
      // Debug: Log the status values for comparison
      this.logger.debug(`Status comparison - DB status: "${consultation.status}" (type: ${typeof consultation.status}), Enum value: "${ConsultationStatus.PAYMENT_CONFIRMED}" (type: ${typeof ConsultationStatus.PAYMENT_CONFIRMED})`);
      
      if (consultation.status !== ConsultationStatus.PAYMENT_CONFIRMED) {
        this.logger.warn(`Consultation not in PAYMENT_CONFIRMED phase: ${consultation.consultationId}`);
        throw new BadRequestException('Consultation not ready for assessment.');
      }

      // 3. Validate input
      this.validateStructuredAssessment(assessmentData, patientId);

      // 4. Call AI agent
      const transformedInput = this.transformStructuredAssessment(assessmentData);
      const structuredDiagnosis = await this.aiAgentService.getStructuredDiagnosis(
        patientId,
        transformedInput,
        requestMetadata
      );

      // 5. Get consultation pricing
      const consultationPricing = this.getConsultationPricingFromUrgency(
        structuredDiagnosis.risk_assessment?.urgency_level || 'moderate'
      );

      // 6. Update consultation with input/output, status, and statusHistory
      consultation.structuredAssessmentInput = assessmentData;
      consultation.aiAgentOutput = structuredDiagnosis;
      consultation.status = ConsultationStatus.CLINICAL_ASSESSMENT_COMPLETE;
      consultation.statusHistory = consultation.statusHistory || [];
      consultation.statusHistory.push({
        status: ConsultationStatus.CLINICAL_ASSESSMENT_COMPLETE,
        changedAt: new Date(),
        changedBy: new Types.ObjectId(patientId),
        reason: 'Structured assessment completed'
      });
      await consultation.save();

      // 7. Log audit
      await this.auditService.logDataAccess(
        patientId,
        'structured-gynecological-assessment',
        'create',
        consultation.consultationId,
        undefined,
        {
          patientProfile: {
            age: assessmentData.patient_profile.age,
            requestId: assessmentData.patient_profile.request_id
          },
          primaryComplaint: {
            mainSymptom: assessmentData.primary_complaint.main_symptom,
            severity: assessmentData.primary_complaint.severity,
            duration: assessmentData.primary_complaint.duration
          },
          structuredDiagnosis: {
            possibleDiagnoses: structuredDiagnosis.possible_diagnoses?.length || 0,
            confidenceScore: structuredDiagnosis.confidence_score,
            urgencyLevel: structuredDiagnosis.risk_assessment?.urgency_level
          },
          consultationId: consultation._id,
          clinicalSessionId,
          paymentVerified: true
        },
        requestMetadata
      );

      this.logger.log(`Structured assessment completed successfully for patient: ${patientId}`);

      // 8. Return response
      return {
        ...structuredDiagnosis,
        consultationId: consultation.consultationId,
        clinicalSessionId,
        consultationPricing,
        paymentVerified: true
      };
    } catch (error) {
      this.logger.error(`Failed to collect structured assessment for patient ${patientId}: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to collect structured assessment and generate diagnosis');
    }
  }

  private validateStructuredAssessment(assessmentData: GynecologicalAssessmentDto, patientId: string): void {
    if (!assessmentData.patient_profile) {
      throw new BadRequestException('Patient profile is required');
    }
    
    if (!assessmentData.patient_profile.age || assessmentData.patient_profile.age < 10 || assessmentData.patient_profile.age > 100) {
      throw new BadRequestException('Valid patient age (10-100) is required');
    }
    
    if (!assessmentData.patient_profile.request_id) {
      throw new BadRequestException('Request ID is required');
    }
    
    if (!assessmentData.primary_complaint) {
      throw new BadRequestException('Primary complaint is required');
    }
    
    if (!assessmentData.primary_complaint.main_symptom) {
      throw new BadRequestException('Main symptom is required');
    }
    
    if (!assessmentData.primary_complaint.severity || !['mild', 'moderate', 'severe'].includes(assessmentData.primary_complaint.severity)) {
      throw new BadRequestException('Valid severity level is required');
    }
    
    if (!assessmentData.reproductive_history) {
      throw new BadRequestException('Reproductive history is required');
    }
    
    if (!assessmentData.medical_context) {
      throw new BadRequestException('Medical context is required');
    }
    
    if (!assessmentData.healthcare_interaction) {
      throw new BadRequestException('Healthcare interaction is required');
    }
    
    if (!assessmentData.patient_concerns) {
      throw new BadRequestException('Patient concerns are required');
    }
  }

  private transformStructuredAssessment(assessmentData: GynecologicalAssessmentDto): any {
    return {
      structured_request: {
        patient_profile: assessmentData.patient_profile,
        primary_complaint: assessmentData.primary_complaint,
        symptom_specific_details: assessmentData.symptom_specific_details,
        reproductive_history: assessmentData.reproductive_history,
        associated_symptoms: assessmentData.associated_symptoms,
        medical_context: assessmentData.medical_context,
        healthcare_interaction: assessmentData.healthcare_interaction,
        patient_concerns: assessmentData.patient_concerns
      }
    };
  }

  private getConsultationPricingFromUrgency(urgencyLevel: string): { amount: number; currency: string } {
    switch (urgencyLevel) {
      case 'urgent':
        return { amount: 999, currency: 'INR' };
      case 'high':
        return { amount: 599, currency: 'INR' };
      case 'moderate':
        return { amount: 399, currency: 'INR' };
      case 'low':
        return { amount: 299, currency: 'INR' };
      default:
        return { amount: 399, currency: 'INR' };
    }
  }

  private validateAISymptoms(aiAgentSymptomCollectionDto: AIAgentSymptomCollectionDto, patientId: string): void {
    // Extract diagnosis_request from nested structure
    const diagnosisRequest = aiAgentSymptomCollectionDto.diagnosis_request;
    
    if (!diagnosisRequest) {
      throw new BadRequestException('diagnosis_request is required');
    }

    // Validate symptoms array length (1-3 items as per schema rules)
    if (!diagnosisRequest.symptoms || 
        !Array.isArray(diagnosisRequest.symptoms) ||
        diagnosisRequest.symptoms.length < 1 || 
        diagnosisRequest.symptoms.length > 3) {
      throw new BadRequestException('Symptoms must be an array with 1-3 items');
    }

    // Validate patient age range (12-100 as per schema rules)
    if (!diagnosisRequest.patient_age ||
        diagnosisRequest.patient_age < 12 ||
        diagnosisRequest.patient_age > 100) {
      throw new BadRequestException('Patient age must be between 12 and 100 years');
    }

    // Validate severity level
    const validSeverityLevels = ['mild', 'moderate', 'severe'];
    if (diagnosisRequest.severity_level && !validSeverityLevels.includes(diagnosisRequest.severity_level)) {
      throw new BadRequestException('Severity level must be one of: mild, moderate, severe');
    }

    // Validate duration
    if (!diagnosisRequest.duration || 
        typeof diagnosisRequest.duration !== 'string' ||
        diagnosisRequest.duration.trim().length === 0) {
      throw new BadRequestException('Duration is required and must be a non-empty string');
    }

    // Validate duration length
    if (diagnosisRequest.duration.length > 50) {
      throw new BadRequestException('Duration must be 50 characters or less');
    }

    // Validate symptoms are non-empty strings
    for (const symptom of diagnosisRequest.symptoms) {
      if (!symptom || typeof symptom !== 'string' || symptom.trim().length === 0) {
        throw new BadRequestException('All symptoms must be non-empty strings');
      }
    }

    // Validate optional fields
    if (diagnosisRequest.onset && !['sudden', 'gradual', 'chronic'].includes(diagnosisRequest.onset)) {
      throw new BadRequestException('Onset must be one of: sudden, gradual, chronic');
    }

    if (diagnosisRequest.progression && !['stable', 'improving', 'worsening', 'fluctuating'].includes(diagnosisRequest.progression)) {
      throw new BadRequestException('Progression must be one of: stable, improving, worsening, fluctuating');
    }
  }

  private transformAISymptoms(aiAgentSymptomCollectionDto: AIAgentSymptomCollectionDto) {
    // Extract the diagnosis_request from nested structure
    const diagnosisRequest = aiAgentSymptomCollectionDto.diagnosis_request;
    
    // Transform input for AI agent processing
    // Keep severity level in AI agent's expected format (mild, moderate, severe)
    const transformedInput = {
      ...diagnosisRequest,
      // Keep original severity level format that AI agent expects
      severity_level: diagnosisRequest.severity_level || 'moderate',
      // Clean and normalize symptoms
      symptoms: diagnosisRequest.symptoms.map(symptom => symptom.trim()),
      // Add empty arrays for missing properties that AI agent expects
      medical_history: [] as string[],
      // Add empty additional notes
      additional_notes: ''
    };

    return transformedInput;
  }

  /**
   * Create a new consultation with proper validation and audit logging
   */
  async createConsultation(
    createConsultationDto: CreateConsultationDto,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<ConsultationDocument> {
    try {
      this.logger.log(`Creating consultation for patient: ${createConsultationDto.patientId}`);
      this.logger.debug(`CreateConsultationDto received: ${JSON.stringify(createConsultationDto, null, 2)}`);
      
      // Validate patient exists
      this.logger.debug(`Validating patient exists: ${createConsultationDto.patientId}`);
      await this.validatePatientExists(createConsultationDto.patientId);
      this.logger.debug(`Patient validation passed`);
      
      // Check for existing active consultation
      this.logger.debug(`Checking for existing active consultation for patient: ${createConsultationDto.patientId}`);
      const existingConsultation = await this.consultationModel.findOne({
        patientId: createConsultationDto.patientId,
        status: { $nin: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED] }
      });
      
      if (existingConsultation) {
        this.logger.warn(`Patient already has an active consultation: ${existingConsultation._id}`);
        throw new ConflictException('Patient already has an active consultation');
      }
      this.logger.debug(`No existing active consultation found`);

      // Get active doctor for current time if not provided
      let doctorId = createConsultationDto.doctorId;
      if (!doctorId) {
        this.logger.debug(`No doctor ID provided, getting active doctor for current time`);
        const activeDoctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();
        if (!activeDoctorId) {
          this.logger.error(`No active doctor available for consultation`);
          throw new InternalServerErrorException('No active doctor available for consultation');
        }
        doctorId = activeDoctorId;
        this.logger.debug(`Assigned active doctor: ${doctorId}`);
      }

      // Convert other ID fields to ObjectId as needed
      this.logger.debug(`Converting patient ID to ObjectId: ${createConsultationDto.patientId}`);
      const patientObjectId = new Types.ObjectId(createConsultationDto.patientId);
      const doctorObjectId = doctorId ? new Types.ObjectId(doctorId) : undefined;
      
      // Convert paymentInfo.paymentId if it exists
      let paymentInfo = createConsultationDto.paymentInfo;
      if (paymentInfo && paymentInfo.paymentId) {
        this.logger.debug(`Processing payment info with paymentId: ${paymentInfo.paymentId}`);
        try {
          // Only convert to ObjectId if it's a valid ObjectId string
          if (Types.ObjectId.isValid(paymentInfo.paymentId)) {
            paymentInfo = {
              ...paymentInfo,
              paymentId: new Types.ObjectId(paymentInfo.paymentId)
            };
            this.logger.debug(`Converted paymentId to ObjectId: ${paymentInfo.paymentId}`);
          } else {
            this.logger.debug(`PaymentId is not a valid ObjectId, keeping as string: ${paymentInfo.paymentId}`);
          }
        } catch (error) {
          this.logger.warn(`Could not convert paymentId to ObjectId, keeping as string: ${paymentInfo.paymentId}`);
        }
      }

      // Create consultation without consultationId initially
      this.logger.debug(`Creating consultation data object`);
      const consultationData = {
        ...createConsultationDto,
        patientId: patientObjectId,
        doctorId: doctorObjectId,
        paymentInfo,
        status: ConsultationStatus.DOCTOR_ASSIGNED,
        metadata: {
          patientId: patientObjectId,
          doctorId: doctorObjectId,
          ...createConsultationDto.metadata,
          ...requestMetadata,
        },
      };

      this.logger.debug(`Creating consultation without consultationId initially`);
      this.logger.debug(`Final consultation data: ${JSON.stringify(consultationData, null, 2)}`);
      
      const createdConsultation = new this.consultationModel(consultationData);
      
      this.logger.debug(`Consultation document created, attempting to save...`);
      
      let savedConsultation: ConsultationDocument;
      try {
        savedConsultation = await createdConsultation.save();
        this.logger.debug(`Consultation saved successfully: ${savedConsultation._id}`);
      } catch (saveError) {
        this.logger.error(`Mongoose save error: ${saveError.message}`);
        this.logger.error(`Save error stack: ${saveError.stack}`);
        this.logger.error(`Save error name: ${saveError.name}`);
        this.logger.error(`Save error code: ${(saveError as any)?.code}`);
        this.logger.error(`Save error details: ${JSON.stringify(saveError, null, 2)}`);
        
        if (saveError.errors) {
          for (const [field, error] of Object.entries(saveError.errors)) {
            this.logger.error(`Field '${field}' error: ${(error as any)?.message || 'Unknown error'}`);
            this.logger.error(`Field '${field}' kind: ${(error as any)?.kind || 'Unknown'}`);
            this.logger.error(`Field '${field}' value: ${(error as any)?.value || 'Unknown'}`);
          }
        }
        
        // Check for specific MongoDB error codes
        if ((saveError as any)?.code === 11000) {
          this.logger.error('Duplicate key error - consultation already exists');
          throw new ConflictException('Consultation already exists');
        }
        
        if ((saveError as any)?.code === 121) {
          this.logger.error('Document validation failed');
          throw new BadRequestException('Consultation data validation failed');
        }
        
        throw new InternalServerErrorException(`Consultation save failed: ${saveError.message}`);
      }

      // Generate consultation ID after the document is created
      const consultationId = `consultation_${(savedConsultation._id as any).toString()}`;
      this.logger.debug(`Generated consultation ID: ${consultationId}`);
      
      // Update the consultation with the generated consultationId
      savedConsultation.consultationId = consultationId;
      savedConsultation.metadata.consultationId = consultationId;
      
      // Save the updated consultation with consultationId
      const updatedConsultation = await savedConsultation.save();
      this.logger.debug(`Consultation updated with consultationId: ${consultationId}`);

      // Cache consultation for quick access
      this.logger.debug(`Caching consultation for quick access`);
      await this.cacheConsultation(updatedConsultation);

      // Log audit event for consultation creation
      this.logger.debug(`Logging audit event for consultation creation`);
      await this.auditService.logDataAccess(
        createConsultationDto.patientId,
        'consultations',
        'create',
        updatedConsultation._id?.toString(),
        undefined,
        updatedConsultation,
        requestMetadata
      );

      this.logger.log(`Consultation created successfully: ${updatedConsultation._id} with consultationId: ${consultationId}`);
      return updatedConsultation;

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

      // Convert patientId to ObjectId for database query
      const patientObjectId = new Types.ObjectId(patientId);

      // Fetch from database
      const [consultations, total] = await Promise.all([
        this.consultationModel
          .find({ patientId: patientObjectId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(offset)
          .populate('doctorId', 'firstName lastName specialization')
          .exec(),
        this.consultationModel.countDocuments({ patientId: patientObjectId })
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
   * Find consultation by session ID (now uses consultationId)
   */
  async findConsultationBySessionId(sessionId: string): Promise<Consultation> {
    try {
      const consultation = await this.consultationModel
        .findOne({ consultationId: sessionId })
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
   * Confirm payment ONLY - No consultation creation (Production Standard)
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
        this.logger.error(`[${transactionId}] Invalid input: Session ID or Payment ID is missing`);
        throw new BadRequestException('Session ID and Payment ID are required');
      }

      // Step 1: Verify payment with payment service
      this.logger.debug(`[${transactionId}] Verifying payment with ID: ${paymentConfirmationDto.paymentId}`);
      let paymentStatus;
      try {
        paymentStatus = await this.paymentService.verifyPayment(paymentConfirmationDto);
        this.logger.debug(`[${transactionId}] Payment verification completed successfully`);
      } catch (paymentError) {
        this.logger.error(`[${transactionId}] Payment verification failed: ${paymentError.message}`, paymentError.stack);
        if (paymentError instanceof BadRequestException) {
          throw paymentError; // Re-throw BadRequestException as-is
        }
        throw new InternalServerErrorException('Payment verification failed. Please try again.');
      }

      if (!paymentStatus || paymentStatus.status !== 'payment_completed') {
        this.logger.error(`[${transactionId}] Payment not completed. Status: ${paymentStatus?.status}`);
        throw new BadRequestException('Payment verification failed or payment not completed');
      }

      this.logger.debug(`[${transactionId}] Payment verified successfully: ${paymentStatus.paymentId}`);

      // Step 2: Validate session data
      this.logger.debug(`[${transactionId}] Validating session data for session: ${paymentConfirmationDto.sessionId}`);
      let sessionData;
      try {
        sessionData = await this.retrieveAndValidateSessionData(
          paymentConfirmationDto.sessionId,
          patientId,
          transactionId
        );
        this.logger.debug(`[${transactionId}] Session data validation completed successfully`);
      } catch (sessionError) {
        this.logger.error(`[${transactionId}] Session data validation failed: ${sessionError.message}`, sessionError.stack);
        throw new BadRequestException(`Session data validation failed: ${sessionError.message}`);
      }

      this.logger.debug(`[${transactionId}] Session data validated successfully`);

      // Step 3: Create clinical session
      this.logger.debug(`[${transactionId}] Creating clinical session`);
      let clinicalSessionId;
      try {
        clinicalSessionId = await this.sessionManager.createClinicalSession(
          paymentConfirmationDto.sessionId,
          patientId,
          requestMetadata
        );
        this.logger.debug(`[${transactionId}] Clinical session created successfully: ${clinicalSessionId}`);
      } catch (sessionManagerError) {
        this.logger.error(`[${transactionId}] Failed to create clinical session: ${sessionManagerError.message}`, sessionManagerError.stack);
        throw new InternalServerErrorException('Failed to create clinical session. Please try again.');
      }

      this.logger.debug(`[${transactionId}] Clinical session created: ${clinicalSessionId}`);

      // Step 4: Check for consultation conflicts
      this.logger.debug(`[${transactionId}] Checking for consultation conflicts`);
      let conflicts;
      try {
        conflicts = await this.consultationBusinessService.checkConsultationConflicts(patientId);
        this.logger.debug(`[${transactionId}] Consultation conflicts check completed`);
      } catch (conflictError) {
        this.logger.warn(`[${transactionId}] Failed to check consultation conflicts: ${conflictError.message}`);
        // Don't fail the payment confirmation if conflict check fails
        conflicts = { hasActiveConsultation: false };
      }
      
      if (conflicts.hasActiveConsultation) {
        this.logger.warn(`[${transactionId}] Patient ${patientId} has active consultation: ${conflicts.activeConsultation.consultationId}`);
        // Optionally handle this case - either cancel existing or prevent new one
      }

      // Step 5: Assign doctor based on current shift
      this.logger.debug(`[${transactionId}] Assigning doctor based on current shift`);
      let doctorAssignment;
      try {
        doctorAssignment = await this.doctorAssignmentService.assignDoctorToConsultation(
          sessionData.selectedConsultationType || 'chat',
          'normal'
        );
        this.logger.debug(`[${transactionId}] Doctor assigned successfully: ${doctorAssignment.doctorInfo.firstName} ${doctorAssignment.doctorInfo.lastName}`);
      } catch (doctorError) {
        this.logger.error(`[${transactionId}] Failed to assign doctor: ${doctorError.message}`, doctorError.stack);
        throw new InternalServerErrorException('Failed to assign doctor to consultation. Please try again.');
      }

      // Step 6: Create or update Consultation document in DB
      this.logger.debug(`[${transactionId}] Creating or updating consultation document`);
      let consultation;
      try {
        // First, check if consultation already exists
        consultation = await this.consultationModel.findOne({
          patientId: new Types.ObjectId(patientId),
          consultationId: paymentConfirmationDto.sessionId
        });

        const now = new Date();
        const paymentInfo = {
          paymentId: paymentStatus.paymentId,
          paymentStatus: 'completed' as 'completed',
          amount: paymentStatus.amount,
          currency: paymentStatus.currency,
          paidAt: now,
          transactionId: paymentStatus.transactionId,
          ...(paymentStatus && (paymentStatus as any).paymentMethod ? { paymentMethod: (paymentStatus as any).paymentMethod } : {}),
          ...(paymentStatus && (paymentStatus as any).gatewayResponse ? { gatewayResponse: (paymentStatus as any).gatewayResponse } : {})
        };

        if (!consultation) {
          this.logger.debug(`[${transactionId}] Creating new consultation document`);
          
          // Validate required fields before creating consultation
          if (!doctorAssignment || !doctorAssignment.doctorId || !doctorAssignment.doctorInfo) {
            throw new InternalServerErrorException('Doctor assignment data is incomplete');
          }

          if (!clinicalSessionId) {
            throw new InternalServerErrorException('Clinical session ID is missing');
          }

          // Create consultation document with proper validation
          const consultationData = {
            patientId: new Types.ObjectId(patientId),
            doctorId: new Types.ObjectId(doctorAssignment.doctorId),
            doctorInfo: doctorAssignment.doctorInfo,
            consultationId: paymentConfirmationDto.sessionId,
            clinicalSessionId,
            consultationType: sessionData.selectedConsultationType as ConsultationType || ConsultationType.CHAT,
            priority: ConsultationPriority.NORMAL,
            status: ConsultationStatus.PAYMENT_CONFIRMED,
            isActive: true,
            activatedAt: now,
            paymentInfo,
            prescriptionStatus: 'not_started',
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
            businessRules: [
              'automatic_doctor_assignment_based_on_shift',
              'single_active_consultation_per_patient',
              '24_hour_consultation_expiry'
            ],
            statusHistory: [{
              status: ConsultationStatus.ACTIVE,
              changedAt: now,
              changedBy: new Types.ObjectId(patientId),
              reason: 'Payment confirmed and doctor assigned',
              metadata: {
                source: 'payment',
                trigger: 'payment_confirmation',
                notes: `Payment confirmed, consultation activated, and doctor assigned: ${doctorAssignment.doctorInfo.firstName} ${doctorAssignment.doctorInfo.lastName}`,
                doctorAssignment: doctorAssignment.assignmentMetadata
              }
            }],
            metadata: {
              ...requestMetadata,
              source: 'api',
              referralSource: 'payment_confirmation',
              doctorAssignmentMethod: doctorAssignment.assignmentMetadata.fallbackUsed ? 'fallback' : 'shift_based'
            }
          };

          // Log the consultation data for debugging
          this.logger.debug(`[${transactionId}] Consultation data to create:`, {
            patientId: consultationData.patientId,
            doctorId: consultationData.doctorId,
            consultationId: consultationData.consultationId,
            clinicalSessionId: consultationData.clinicalSessionId,
            consultationType: consultationData.consultationType,
            status: consultationData.status
          });

          consultation = new this.consultationModel(consultationData);
          await consultation.save();
          this.logger.debug(`[${transactionId}] New consultation created in database with doctor assigned`);
        } else {
          this.logger.debug(`[${transactionId}] Updating existing consultation document`);
          // Update existing consultation
          consultation.paymentInfo = paymentInfo;
          consultation.doctorId = new Types.ObjectId(doctorAssignment.doctorId);
          consultation.doctorInfo = doctorAssignment.doctorInfo;
          consultation.status = ConsultationStatus.PAYMENT_CONFIRMED;
          consultation.isActive = true;
          consultation.activatedAt = now;
          consultation.businessRules = [
            'automatic_doctor_assignment_based_on_shift',
            'single_active_consultation_per_patient',
            '24_hour_consultation_expiry'
          ];
          consultation.statusHistory.push({
            status: ConsultationStatus.ACTIVE,
            changedAt: now,
            changedBy: new Types.ObjectId(patientId),
            reason: 'Payment confirmed and doctor assigned',
            metadata: {
              source: 'payment',
              trigger: 'payment_confirmation',
              notes: `Payment confirmed, consultation activated, and doctor assigned: ${doctorAssignment.doctorInfo.firstName} ${doctorAssignment.doctorInfo.lastName}`,
              doctorAssignment: doctorAssignment.assignmentMetadata
            }
          });
          await consultation.save();
          this.logger.debug(`[${transactionId}] Existing consultation updated in database with doctor assigned`);
        }
      } catch (dbError) {
        this.logger.error(`[${transactionId}] Failed to create/update consultation in database: ${dbError.message}`, dbError.stack);
        
        // Log additional context for debugging
        this.logger.error(`[${transactionId}] Database operation failed with context:`, {
          patientId,
          sessionId: paymentConfirmationDto.sessionId,
          paymentId: paymentStatus?.paymentId,
          doctorAssignment: doctorAssignment ? {
            doctorId: doctorAssignment.doctorId,
            doctorInfo: doctorAssignment.doctorInfo ? {
              firstName: doctorAssignment.doctorInfo.firstName,
              lastName: doctorAssignment.doctorInfo.lastName
            } : null
          } : null,
          clinicalSessionId,
          error: dbError.message,
          stack: dbError.stack
        });
        
        throw new InternalServerErrorException('Failed to create consultation record. Please try again.');
      }

      // Step 7: Log audit event
      this.logger.debug(`[${transactionId}] Logging audit event`);
      try {
        await this.auditService.logDataAccess(
          patientId,
          'payment',
          'update',
          paymentConfirmationDto.sessionId,
          undefined,
          {
            sessionId: paymentConfirmationDto.sessionId,
            paymentId: paymentStatus.paymentId,
            clinicalSessionId,
            consultationId: consultation._id,
            amount: paymentStatus.amount,
            currency: paymentStatus.currency,
            status: 'confirmed'
          },
          requestMetadata
        );
        this.logger.debug(`[${transactionId}] Audit event logged successfully`);
      } catch (auditError) {
        this.logger.warn(`[${transactionId}] Failed to log audit event: ${auditError.message}`);
        // Don't fail the payment confirmation if audit logging fails
      }

      // Step 8: Clean up temporary data
      this.logger.debug(`[${transactionId}] Cleaning up temporary data`);
      try {
        await this.cleanupTemporaryData(paymentConfirmationDto.sessionId, transactionId);
        this.logger.debug(`[${transactionId}] Temporary data cleanup completed`);
      } catch (cleanupError) {
        this.logger.warn(`[${transactionId}] Failed to cleanup temporary data: ${cleanupError.message}`);
        // Don't fail the payment confirmation if cleanup fails
      }

      this.logger.log(`[${transactionId}] Payment confirmation completed successfully for patient: ${patientId}`);

      return {
        success: true,
        message: 'Payment confirmed successfully',
        sessionId: paymentConfirmationDto.sessionId,
        paymentStatus: 'confirmed',
        paymentId: paymentStatus.paymentId,
        clinicalSessionId,
        amount: paymentStatus.amount,
        currency: paymentStatus.currency,
        consultationId: consultation._id,
        nextStep: {
          endpoint: '/consultations/symptoms/collect-structured',
          clinicalSessionId,
          description: 'Collect structured symptoms for AI assessment'
        }
      };

    } catch (error) {
      this.logger.error(`[${transactionId}] Failed to confirm payment for patient ${patientId}: ${error.message}`, error.stack);
      
      // Re-throw known errors
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      // Log additional context for debugging
      this.logger.error(`[${transactionId}] Payment confirmation failed with context:`, {
        patientId,
        sessionId: paymentConfirmationDto?.sessionId,
        paymentId: paymentConfirmationDto?.paymentId,
        error: error.message,
        stack: error.stack
      });
      
      // Wrap unknown errors with more context
      throw new InternalServerErrorException('Failed to confirm payment. Please try again or contact support if the issue persists.');
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
        sessionId: sessionId,
        consultationType: sessionData.selectedConsultationType,
        aiDiagnosis: sessionData.aiDiagnosis,
        paymentInfo: {
          paymentId: `mock_${sessionId}`,
          amount: 299,
          currency: 'INR',
          paymentMethod: 'mock',
          paymentStatus: 'completed',
          transactionId: `mock_${sessionId}`,
          paymentDate: new Date(),
          status: 'payment_completed',
          paidAt: new Date()
        },
        metadata: {
          ipAddress: 'mock',
          userAgent: 'mock'
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
    this.logger.debug(`[${transactionId}] Retrieving session data with key: ${sessionId}`);
    
    try {
      const session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        this.logger.error(`[${transactionId}] Session is null or undefined`);
        throw new BadRequestException('Session not found or expired');
      }
      
      this.validateSessionData(session, patientId, transactionId);
      
      return session.data;
      
    } catch (sessionError) {
      this.logger.warn(`[${transactionId}] Session data retrieval failed: ${sessionError.message}`);
      
      // If it's a BadRequestException, re-throw it
      if (sessionError instanceof BadRequestException) {
        throw sessionError;
      }
      
      // Last resort: create minimal recovery data
      this.logger.warn(`[${transactionId}] Creating minimal recovery session data`);
      return this.createRecoverySessionData(patientId, sessionId);
    }
  }

  /**
   * Validate session data integrity
   */
  private validateSessionData(session: any, patientId: string, transactionId: string): void {
    if (!session) {
      throw new BadRequestException('Session data is null or undefined');
    }

    const sessionData = session.data;
    
    if (session.patientId !== patientId) {
      this.logger.error(`[${transactionId}] Patient ID mismatch: expected ${session.patientId}, got ${patientId}`);
      throw new BadRequestException('Invalid session or patient mismatch');
    }
    
    // Log session data quality for monitoring
    const hasSymptoms = sessionData?.initialSymptoms && Object.keys(sessionData.initialSymptoms).length > 0;
    const hasAIDiagnosis = sessionData?.aiDiagnosis && Object.keys(sessionData.aiDiagnosis).length > 0;
    
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
   * This method only returns AI diagnosis without creating consultation
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
      
      // Get AI diagnosis from tenderly-ai-agent (or mock for now)
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
      
      this.logger.log(`AI diagnosis generated successfully for patient: ${patientId}`);
      
      // Return only the AI diagnosis
      return detailedAIResponse;
      
    } catch (error) {
      this.logger.error(`Failed to collect detailed symptoms for patient ${patientId}: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to collect detailed symptoms and generate AI diagnosis');
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
        impact === 'severe') {
      return 'critical';
    }
    
    // High severity indicators
    if (baseSeverity === 'severe' || 
        impact === 'significant') {
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
      chat: { amount: 150, currency: 'INR' },
      tele: { amount: 200, currency: 'INR' },
      video: { amount: 250, currency: 'INR' },
      emergency: { amount: 300, currency: 'INR' }
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
    
    if (mainSymptom.includes('pain') && symptoms.associated_symptoms?.pain?.pelvic_pain) {
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

  /**
   * Extract main symptom from symptoms object
   */
  private extractMainSymptom(symptoms: any): string {
    if (!symptoms) return 'General consultation';
    
    if (Array.isArray(symptoms.primarySymptom)) {
      return symptoms.primarySymptom[0] || 'General consultation';
    }
    
    return symptoms.primarySymptom || 'General consultation';
  }

  /**
   * Map severity number to string
   */
  private mapSeverityToString(severity: any): string {
    if (typeof severity === 'string') {
      return severity;
    }
    
    const severityMap = {
      1: 'mild',
      2: 'moderate', 
      3: 'severe'
    };
    
    return severityMap[severity] || 'moderate';
  }

  /**
   * Map severity level string to number for DTO compatibility
   */
  private mapSeverityNumberFromLevel(severityLevel: any): number {
    if (typeof severityLevel === 'number') {
      return severityLevel;
    }
    
    const severityMap = {
      'mild': 1,
      'moderate': 2,
      'severe': 3
    };
    
    return severityMap[severityLevel] || 2; // Default to moderate
  }

  /**
   * Phase 2: Collect detailed symptoms for clinical assessment (Production)
   * This method is called after payment confirmation with clinical session
   */
  async collectDetailedSymptomsForConsultation(
    consultationId: string,
    clinicalSessionId: string,
    detailedSymptoms: any,
    patientId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    const transactionId = `detailed_collection_${Date.now()}`;
    
    try {
      this.logger.log(`[${transactionId}] Collecting detailed symptoms for consultation: ${consultationId}`);
      
      // Step 1: Validate clinical session
      const clinicalSession = await this.sessionManager.validateClinicalSession(
        clinicalSessionId,
        consultationId,
        patientId
      );
      
      if (clinicalSession.currentPhase !== 'detailed_assessment') {
        throw new BadRequestException(`Invalid clinical session phase: ${clinicalSession.currentPhase}`);
      }
      
      // Step 2: Get consultation to verify status
      const consultation = await this.findConsultationById(consultationId, patientId);
      
      if (consultation.status !== ConsultationStatus.CLINICAL_ASSESSMENT_PENDING) {
        throw new BadRequestException('Consultation is not ready for detailed symptom collection');
      }
      
      // Step 3: Transform and validate detailed symptoms
      const structuredSymptoms = this.transformToStructuredSymptoms(detailedSymptoms);
      
      // Step 4: Generate comprehensive AI diagnosis using structured data
      const comprehensiveAIDiagnosis = await this.generateComprehensiveAIDiagnosis(
        structuredSymptoms,
        consultation,
        requestMetadata
      );
      
      // Step 5: Update clinical session with detailed data
      await this.sessionManager.updateClinicalSession(
        clinicalSessionId,
        'doctor_review',
        {
          detailedSymptoms: structuredSymptoms,
          clinicalDiagnosis: comprehensiveAIDiagnosis
        },
        patientId
      );
      
      // Step 6: Update consultation with detailed symptoms and diagnosis
      await this.consultationModel.findByIdAndUpdate(consultationId, {
        detailedSymptoms: structuredSymptoms,
        aiDiagnosis: this.mapAIDiagnosisToNew(comprehensiveAIDiagnosis),
        status: ConsultationStatus.DOCTOR_REVIEW_PENDING,
        lastUpdated: new Date()
      });
      
      // Step 7: Log audit event for detailed symptom collection
      await this.auditService.logDataAccess(
        patientId,
        'detailed-symptoms-clinical',
        'create',
        consultationId,
        undefined,
        {
          consultationId,
          clinicalSessionId,
          detailedSymptomsCount: Object.keys(structuredSymptoms).length,
          aiDiagnosisConfidence: comprehensiveAIDiagnosis.confidence_score,
          transactionId
        },
        requestMetadata
      );
      
      this.logger.log(`[${transactionId}] Detailed symptoms collected successfully for consultation: ${consultationId}`);
      
      return {
        consultationId,
        clinicalSessionId,
        diagnosis: comprehensiveAIDiagnosis,
        status: 'doctor_review_pending',
        nextSteps: 'Your detailed symptoms have been collected and analyzed. A doctor will review your case and provide treatment recommendations.',
        estimatedReviewTime: '2-4 hours',
        transactionId
      };
      
    } catch (error) {
      this.logger.error(`[${transactionId}] Failed to collect detailed symptoms: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException({
        message: 'Failed to collect detailed symptoms',
        transactionId,
        error: error.message
      });
    }
  }
  
  /**
   * Transform input to structured symptoms format
   */
  private transformToStructuredSymptoms(detailedSymptoms: any): any {
    return {
      primary_complaint: {
        main_symptom: detailedSymptoms.primary_complaint?.main_symptom || 'General symptoms',
        duration: detailedSymptoms.primary_complaint?.duration || 'unknown',
        severity: detailedSymptoms.primary_complaint?.severity || 'moderate',
        onset: detailedSymptoms.primary_complaint?.onset || 'gradual',
        progression: detailedSymptoms.primary_complaint?.progression || 'stable'
      },
      associated_symptoms: detailedSymptoms.associated_symptoms || {},
      medical_context: {
        current_medications: detailedSymptoms.medical_context?.current_medications || [],
        recent_medications: detailedSymptoms.medical_context?.recent_medications || [],
        medical_conditions: detailedSymptoms.medical_context?.medical_conditions || [],
        previous_gynecological_issues: detailedSymptoms.medical_context?.previous_gynecological_issues || [],
        allergies: detailedSymptoms.medical_context?.allergies || [],
        family_history: detailedSymptoms.medical_context?.family_history || []
      },
      reproductive_history: detailedSymptoms.reproductive_history || {},
      lifestyle_factors: detailedSymptoms.lifestyle_factors || {},
      patient_concerns: {
        main_worry: detailedSymptoms.patient_concerns?.main_worry || 'General health concern',
        impact_on_life: detailedSymptoms.patient_concerns?.impact_on_life || 'minimal',
        additional_notes: detailedSymptoms.patient_concerns?.additional_notes || ''
      },
      healthcare_interaction: detailedSymptoms.healthcare_interaction || {},
      symptom_specific_details: detailedSymptoms.symptom_specific_details || {}
    };
  }
  
  /**
   * Generate comprehensive AI diagnosis using structured symptoms
   */
  private async generateComprehensiveAIDiagnosis(
    structuredSymptoms: any,
    consultation: any,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    try {
      // For production, this would call the enhanced AI agent with structured input
      // For now, we'll generate a comprehensive response based on the structured data
      
      const mainSymptom = structuredSymptoms.primary_complaint.main_symptom.toLowerCase();
      const severity = structuredSymptoms.primary_complaint.severity;
      const medicalHistory = structuredSymptoms.medical_context;
      
      const comprehensiveDiagnosis = {
        possible_diagnoses: this.generatePossibleDiagnoses(structuredSymptoms),
        clinical_reasoning: this.generateClinicalReasoning(structuredSymptoms),
        recommended_investigations: this.generateDetailedInvestigations(structuredSymptoms),
        treatment_recommendations: {
          primary_treatment: this.generatePrimaryTreatment(structuredSymptoms),
          safe_medications: this.generateSafeMedications(structuredSymptoms),
          lifestyle_modifications: this.generateLifestyleModifications(structuredSymptoms),
          dietary_advice: this.generateDietaryAdvice(structuredSymptoms),
          follow_up_timeline: this.generateFollowUpTimeline(structuredSymptoms)
        },
        patient_education: this.generatePatientEducation(structuredSymptoms),
        warning_signs: this.generateWarningSignsToWatch(structuredSymptoms),
        confidence_score: this.calculateEnhancedConfidenceScore(structuredSymptoms),
        processing_notes: 'Generated from comprehensive structured symptom analysis',
        disclaimer: this.generateDisclaimer(),
        timestamp: new Date(),
        consultation_context: {
          consultation_id: consultation._id?.toString(),
          patient_id: consultation.patientId,
          consultation_type: consultation.consultationType
        }
      };
      
      this.logger.log(`Generated comprehensive AI diagnosis with confidence: ${comprehensiveDiagnosis.confidence_score}`);
      
      return comprehensiveDiagnosis;
      
    } catch (error) {
      this.logger.error(`Failed to generate comprehensive AI diagnosis: ${error.message}`);
      
      // Fallback diagnosis
      return {
        possible_diagnoses: ['Gynecological consultation required'],
        clinical_reasoning: 'Unable to generate comprehensive analysis - manual review required',
        confidence_score: 0.3,
        processing_notes: 'Fallback diagnosis due to processing error',
        disclaimer: this.generateDisclaimer(),
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Generate possible diagnoses from structured symptoms
   */
  private generatePossibleDiagnoses(symptoms: any): string[] {
    const diagnoses: string[] = [];
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    const severity = symptoms.primary_complaint.severity;
    
    if (mainSymptom.includes('pain')) {
      if (severity === 'severe') {
        diagnoses.push('Severe pelvic inflammatory disease (PID)');
        diagnoses.push('Ovarian cyst with complication');
        diagnoses.push('Endometriosis with acute flare');
      } else {
        diagnoses.push('Mild to moderate pelvic inflammatory condition');
        diagnoses.push('Ovarian functional cyst');
        diagnoses.push('Musculoskeletal pelvic pain');
      }
    }
    
    if (mainSymptom.includes('discharge')) {
      diagnoses.push('Bacterial vaginosis');
      diagnoses.push('Vulvovaginal candidiasis');
      diagnoses.push('Sexually transmitted infection');
    }
    
    if (mainSymptom.includes('bleeding') || mainSymptom.includes('menstrual')) {
      diagnoses.push('Dysfunctional uterine bleeding');
      diagnoses.push('Hormonal imbalance');
      diagnoses.push('Endometrial pathology');
    }
    
    // Add contraceptive-related diagnoses if relevant
    if (symptoms.reproductive_history?.contraceptive_use) {
      diagnoses.push('Contraceptive-related side effects');
    }
    
    return diagnoses.length > 0 ? diagnoses : ['General gynecological condition requiring evaluation'];
  }
  
  /**
   * Generate clinical reasoning
   */
  private generateClinicalReasoning(symptoms: any): string {
    const mainSymptom = symptoms.primary_complaint.main_symptom;
    const duration = symptoms.primary_complaint.duration;
    const severity = symptoms.primary_complaint.severity;
    const associatedSymptoms = symptoms.associated_symptoms;
    
    let reasoning = `Patient presents with ${mainSymptom} of ${duration} duration with ${severity} severity. `;
    
    if (associatedSymptoms?.systemic?.fever) {
      reasoning += 'Presence of fever suggests infectious or inflammatory process. ';
    }
    
    if (associatedSymptoms?.pain?.pelvic_pain) {
      reasoning += 'Pelvic pain indicates need for gynecological evaluation. ';
    }
    
    if (symptoms.medical_context?.allergies?.length > 0) {
      reasoning += `Patient has known allergies to ${symptoms.medical_context.allergies.join(', ')}, affecting medication choices. `;
    }
    
    reasoning += 'Comprehensive evaluation and appropriate investigations recommended for accurate diagnosis and treatment planning.';
    
    return reasoning;
  }
  
  /**
   * Generate detailed investigations based on comprehensive symptoms
   */
  private generateDetailedInvestigations(symptoms: any): Array<{
    category: string;
    tests: Array<{ name: string; priority: string; reason: string }>;
  }> {
    const investigations: Array<{
      category: string;
      tests: Array<{ name: string; priority: string; reason: string }>;
    }> = [];
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    
    // Basic laboratory tests
    investigations.push({
      category: 'Laboratory Tests',
      tests: [
        {
          name: 'Complete Blood Count (CBC) with differential',
          priority: 'high',
          reason: 'To evaluate for infection, anemia, or hematologic abnormalities'
        },
        {
          name: 'Comprehensive Metabolic Panel (CMP)',
          priority: 'medium',
          reason: 'To assess overall metabolic status and organ function'
        },
        {
          name: 'Urine analysis and culture',
          priority: 'high',
          reason: 'To rule out urinary tract infections or kidney involvement'
        }
      ]
    });
    
    // Gynecological-specific tests
    if (mainSymptom.includes('discharge') || mainSymptom.includes('infection')) {
      investigations.push({
        category: 'Gynecological Tests',
        tests: [
          {
            name: 'Vaginal swab with culture and sensitivity',
            priority: 'high',
            reason: 'To identify specific pathogens and antibiotic sensitivity'
          },
          {
            name: 'STI panel (Chlamydia, Gonorrhea, Trichomonas)',
            priority: 'high',
            reason: 'To rule out sexually transmitted infections'
          }
        ]
      });
    }
    
    // Imaging studies
    if (mainSymptom.includes('pain') || symptoms.primary_complaint.severity === 'severe') {
      investigations.push({
        category: 'Imaging Studies',
        tests: [
          {
            name: 'Transvaginal ultrasound',
            priority: 'high',
            reason: 'To evaluate pelvic organs, detect cysts, masses, or structural abnormalities'
          },
          {
            name: 'Pelvic MRI (if ultrasound inconclusive)',
            priority: 'medium',
            reason: 'For detailed evaluation of pelvic anatomy and pathology'
          }
        ]
      });
    }
    
    // Hormonal evaluation if menstrual issues
    if (mainSymptom.includes('menstrual') || mainSymptom.includes('bleeding')) {
      investigations.push({
        category: 'Hormonal Evaluation',
        tests: [
          {
            name: 'Hormonal panel (FSH, LH, Estradiol, Progesterone)',
            priority: 'medium',
            reason: 'To evaluate hormonal status and menstrual cycle regulation'
          },
          {
            name: 'Thyroid function tests (TSH, T3, T4)',
            priority: 'medium',
            reason: 'To rule out thyroid disorders affecting menstrual cycle'
          }
        ]
      });
    }
    
    return investigations;
  }
  
  /**
   * Generate enhanced confidence score
   */
  private calculateEnhancedConfidenceScore(symptoms: any): number {
    let confidence = 0.4; // Lower base for structured analysis
    
    // Symptom clarity and detail
    const mainSymptom = symptoms.primary_complaint.main_symptom;
    if (mainSymptom && mainSymptom.length > 15) {
      confidence += 0.15;
    }
    
    // Duration specificity
    const duration = symptoms.primary_complaint.duration;
    if (duration && duration !== 'unknown' && duration.length > 5) {
      confidence += 0.1;
    }
    
    // Medical context completeness
    const medicalContext = symptoms.medical_context;
    if (medicalContext?.allergies?.length > 0) confidence += 0.05;
    if (medicalContext?.current_medications?.length > 0) confidence += 0.05;
    if (medicalContext?.medical_conditions?.length > 0) confidence += 0.1;
    
    // Associated symptoms detail
    if (symptoms.associated_symptoms && Object.keys(symptoms.associated_symptoms).length > 2) {
      confidence += 0.15;
    }
    
    // Reproductive history
    if (symptoms.reproductive_history && Object.keys(symptoms.reproductive_history).length > 0) {
      confidence += 0.1;
    }
    
    // Patient concerns detail
    if (symptoms.patient_concerns?.additional_notes && symptoms.patient_concerns.additional_notes.length > 20) {
      confidence += 0.05;
    }
    
    // Healthcare interaction history
    if (symptoms.healthcare_interaction?.previous_consultation) {
      confidence += 0.05;
    }
    
    // Cap at 0.92 for comprehensive structured analysis
    return Math.min(confidence, 0.92);
  }
  
  // Additional helper methods for comprehensive diagnosis generation
  private generatePrimaryTreatment(symptoms: any): string {
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    const severity = symptoms.primary_complaint.severity;
    
    if (mainSymptom.includes('pain') && severity === 'severe') {
      return 'Urgent gynecological evaluation with pain management and targeted treatment based on diagnosis';
    }
    
    if (mainSymptom.includes('discharge')) {
      return 'Antimicrobial therapy based on culture results with supportive care';
    }
    
    return 'Symptomatic treatment with close monitoring and follow-up care';
  }
  
  private generateSafeMedications(symptoms: any): string[] {
    const allergies = symptoms.medical_context?.allergies || [];
    const medications: string[] = [];
    
    // Pain management (checking for allergies)
    if (!this.checkMedicationAllergy(allergies, 'acetaminophen')) {
      medications.push('Acetaminophen 500mg every 6-8 hours as needed for pain');
    }
    
    if (!this.checkMedicationAllergy(allergies, 'ibuprofen', 'nsaid')) {
      medications.push('Ibuprofen 400mg every 8 hours with food for pain and inflammation');
    }
    
    // Probiotics for vaginal health
    if (!this.checkMedicationAllergy(allergies, 'probiotic')) {
      medications.push('Probiotic supplement daily for vaginal flora support');
    }
    
    return medications;
  }
  
  private generateLifestyleModifications(symptoms: any): string[] {
    return [
      'Maintain proper genital hygiene with mild, unscented products',
      'Wear breathable, cotton underwear',
      'Avoid tight-fitting clothing',
      'Stay well-hydrated (8-10 glasses of water daily)',
      'Practice stress management techniques (meditation, yoga)',
      'Get adequate sleep (7-9 hours nightly)',
      'Regular, moderate exercise as tolerated'
    ];
  }
  
  private generateDietaryAdvice(symptoms: any): string[] {
    return [
      'Consume a balanced diet rich in fruits and vegetables',
      'Include probiotics (yogurt, kefir) for gut and vaginal health',
      'Limit refined sugars and processed foods',
      'Ensure adequate calcium and vitamin D intake',
      'Stay hydrated with water, limit caffeine and alcohol',
      'Consider anti-inflammatory foods (omega-3 rich fish, leafy greens)'
    ];
  }
  
  private generateFollowUpTimeline(symptoms: any): string {
    const severity = symptoms.primary_complaint.severity;
    
    if (severity === 'severe') {
      return 'Follow up within 24-48 hours or sooner if symptoms worsen';
    } else if (severity === 'moderate') {
      return 'Follow up in 3-5 days or if symptoms persist or worsen';
    }
    
    return 'Follow up in 1-2 weeks or if new symptoms develop';
  }
  
  private generatePatientEducation(symptoms: any): string[] {
    const mainSymptom = symptoms.primary_complaint.main_symptom.toLowerCase();
    const education: string[] = [];
    
    if (mainSymptom.includes('pain')) {
      education.push('Pelvic pain can have various causes and requires proper medical evaluation');
      education.push('Heat therapy may provide temporary relief for cramping pain');
      education.push('Track pain patterns, triggers, and severity for your healthcare provider');
    }
    
    if (mainSymptom.includes('discharge')) {
      education.push('Normal vaginal discharge varies throughout the menstrual cycle');
      education.push('Avoid douching and scented feminine products');
      education.push('Changes in color, odor, or consistency may indicate infection');
    }
    
    education.push('Maintain regular gynecological check-ups for preventive care');
    education.push('Practice safe sex and communicate openly with your healthcare provider');
    
    return education;
  }
  
  private generateWarningSignsToWatch(symptoms: any): string[] {
    return [
      'Severe, sudden onset pelvic pain',
      'High fever (>101.3°F/38.5°C) with chills',
      'Heavy vaginal bleeding soaking more than one pad per hour',
      'Severe nausea and vomiting',
      'Dizziness or fainting',
      'Signs of severe infection (rapid heart rate, confusion)',
      'Worsening of current symptoms despite treatment',
      'New or unusual symptoms not previously experienced'
    ];
  }

  /**
   * Convert session ID string to ObjectId
   * Handles session IDs in format: "session_6884dfdee2f266201798973d_1753538526812"
   * Extracts the ObjectId part and creates a proper MongoDB ObjectId
   */
  private convertSessionIdToObjectId(sessionId: string): Types.ObjectId {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Session ID must be a non-empty string');
    }

    // If it's already a valid ObjectId string, use it directly
    if (Types.ObjectId.isValid(sessionId) && sessionId.length === 24) {
      return new Types.ObjectId(sessionId);
    }

    // Handle session ID format: "session_6884dfdee2f266201798973d_1753538526812"
    if (sessionId.startsWith('session_')) {
      const parts = sessionId.split('_');
      if (parts.length >= 2) {
        const objectIdPart = parts[1]; // Extract the ObjectId part
        
        // Validate that it's a proper ObjectId
        if (Types.ObjectId.isValid(objectIdPart) && objectIdPart.length === 24) {
          return new Types.ObjectId(objectIdPart);
        }
      }
    }

    // Handle clinical session ID format: "clinical_6884dfdee2f266201798973d_1753538526812"
    if (sessionId.startsWith('clinical_')) {
      const parts = sessionId.split('_');
      if (parts.length >= 2) {
        const objectIdPart = parts[1]; // Extract the ObjectId part
        
        // Validate that it's a proper ObjectId
        if (Types.ObjectId.isValid(objectIdPart) && objectIdPart.length === 24) {
          return new Types.ObjectId(objectIdPart);
        }
      }
    }

    // If we can't parse the session ID, try to generate a valid ObjectId from it
    // This is a fallback for any unexpected format
    try {
      // Remove any non-hex characters and take first 24 hex characters
      const cleanId = sessionId.replace(/[^a-fA-F0-9]/g, '').substring(0, 24);
      
      if (cleanId.length === 24) {
        return new Types.ObjectId(cleanId);
      }
      
      // If we still don't have enough characters, pad with zeros
      if (cleanId.length < 24) {
        const paddedId = cleanId.padEnd(24, '0');
        return new Types.ObjectId(paddedId);
      }
      
    } catch (error) {
      this.logger.warn(`Failed to parse session ID '${sessionId}': ${error.message}`);
    }

    // Last resort: generate a new ObjectId (should not happen in production)
    this.logger.error(`Unable to convert session ID '${sessionId}' to ObjectId, generating new one`);
    return new Types.ObjectId();
  }

  /**
   * Map AI diagnosis to new schema format
   */
  private mapAIDiagnosisToNew(aiDiagnosis: any, isRecovered: boolean = false): any {
    if (!aiDiagnosis) {
      return {
        possible_diagnoses: ['General consultation'],
        clinical_reasoning: 'Standard consultation based on available information',
        recommended_investigations: [],
        treatment_recommendations: {
          primary_treatment: 'Consultation with healthcare provider',
          safe_medications: [],
          lifestyle_modifications: [],
          dietary_advice: [],
          follow_up_timeline: '1-2 weeks'
        },
        patient_education: [],
        warning_signs: [],
        confidence_score: 0.5,
        processing_notes: isRecovered ? 'Recovered from session data' : 'Generated from symptoms',
        disclaimer: this.generateDisclaimer(),
        timestamp: new Date()
      };
    }
    
    return {
      possible_diagnoses: [aiDiagnosis.diagnosis || aiDiagnosis.primaryDiagnosis || 'General consultation'],
      clinical_reasoning: 'AI-generated diagnosis based on symptoms',
      recommended_investigations: aiDiagnosis.recommendedTests || [],
      treatment_recommendations: {
        primary_treatment: aiDiagnosis.diagnosis || 'General treatment',
        safe_medications: [],
        lifestyle_modifications: [],
        dietary_advice: [],
        follow_up_timeline: '1-2 weeks'
      },
      patient_education: [],
      warning_signs: [],
      confidence_score: typeof aiDiagnosis.confidence === 'number' ? aiDiagnosis.confidence : 0.5,
      processing_notes: isRecovered ? 'Recovered from session data' : 'Generated from AI analysis',
      disclaimer: this.generateDisclaimer(),
      timestamp: aiDiagnosis.generatedAt ? new Date(aiDiagnosis.generatedAt) : new Date()
    };
  }

  /**
   * Test method to check if consultation model is working
   */
  async testConsultationModel(): Promise<any> {
    try {
      this.logger.log('Testing consultation model...');
      
      // Test 1: Check if model exists
      this.logger.debug('Consultation model exists:', !!this.consultationModel);
      
      // Test 2: Try to count documents
      const count = await this.consultationModel.countDocuments();
      this.logger.debug('Total consultations in database:', count);
      
      // Test 3: Try to create a simple document
      const testDoc = new this.consultationModel({
        patientId: new Types.ObjectId('6884d6abc1ceb202ca8066c4'),
        sessionId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        consultationType: 'chat',
        status: 'pending'
      });
      
      this.logger.debug('Test document created, attempting to save...');
      const savedDoc = await testDoc.save();
      this.logger.debug('Test document saved successfully:', savedDoc._id);
      
      // Clean up
      await this.consultationModel.findByIdAndDelete(savedDoc._id);
      this.logger.debug('Test document cleaned up');
      
      return {
        success: true,
        message: 'Consultation model is working properly',
        totalConsultations: count
      };
      
    } catch (error) {
      this.logger.error('Consultation model test failed:', error.message);
      this.logger.error('Error stack:', error.stack);
      return {
        success: false,
        message: 'Consultation model test failed',
        error: error.message
      };
    }
  }

  /**
   * Check database health and connection
   */
  async checkDatabaseHealth(): Promise<any> {
    try {
      this.logger.log('Checking database health...');
      
      // Test 1: Check if model exists
      this.logger.debug('Consultation model exists:', !!this.consultationModel);
      
      // Test 2: Try to count documents
      const count = await this.consultationModel.countDocuments();
      this.logger.debug('Total consultations in database:', count);
      
      // Test 3: Try to create a simple document
      const testDoc = new this.consultationModel({
        patientId: new Types.ObjectId('6884d6abc1ceb202ca8066c4'),
        sessionId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        consultationType: 'chat',
        status: 'pending'
      });
      
      this.logger.debug('Test document created, attempting to save...');
      const savedDoc = await testDoc.save();
      this.logger.debug('Test document saved successfully:', savedDoc._id);
      
      // Clean up
      await this.consultationModel.findByIdAndDelete(savedDoc._id);
      this.logger.debug('Test document cleaned up');
      
      return {
        success: true,
        message: 'Database connection is working properly',
        totalConsultations: count,
        modelExists: true,
        saveTest: 'passed'
      };
      
    } catch (error) {
      this.logger.error('Database health check failed:', error.message);
      this.logger.error('Error stack:', error.stack);
      return {
        success: false,
        message: 'Database health check failed',
        error: error.message,
        errorStack: error.stack,
        modelExists: !!this.consultationModel
      };
    }
  }

  // Business Logic Methods
  async checkConsultationConflicts(patientId: string): Promise<any> {
    return await this.consultationBusinessService.checkConsultationConflicts(patientId);
  }

  async getPatientConsultationStats(patientId: string): Promise<any> {
    return await this.consultationBusinessService.getPatientConsultationStats(patientId);
  }

  async getActiveConsultation(patientId: string): Promise<Consultation | null> {
    return await this.consultationBusinessService.getActiveConsultation(patientId);
  }

  async updateConsultationStatus(
    consultationId: string,
    newStatus: ConsultationStatus,
    changedBy: string,
    reason?: string,
    metadata?: any
  ): Promise<void> {
    return await this.consultationBusinessService.updateConsultationStatus(
      consultationId,
      newStatus,
      changedBy,
      reason,
      metadata
    );
  }

  async selectConsultationType(
    selectionData: { sessionId: string; selectedConsultationType: string },
    patientId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    this.logger.log(`Patient ${patientId} selecting consultation type: ${selectionData.selectedConsultationType}`);

    // Validate consultation type
    const validTypes = ['chat', 'video', 'tele', 'emergency', 'follow_up', 'structured_assessment'];
    if (!validTypes.includes(selectionData.selectedConsultationType)) {
      throw new BadRequestException(`Invalid consultation type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Check for conflicts
    await this.consultationBusinessService.validateNewConsultation(patientId);

    // Get consultation pricing based on type
    const pricing = this.getConsultationPricing(selectionData.selectedConsultationType);

    // Check if session exists, if not create it
    let sessionData = await this.sessionManager.getSession(selectionData.sessionId);
    if (!sessionData) {
      // Create a new session with the provided sessionId
      this.logger.log(`Session ${selectionData.sessionId} not found, creating new session for patient ${patientId}`);
      const session: any = {
        sessionId: selectionData.sessionId,
        patientId,
        currentPhase: 'consultation_selection',
        data: {
          selectedConsultationType: selectionData.selectedConsultationType,
          consultationPricing: pricing
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          ...requestMetadata
        },
        expiresAt: new Date(Date.now() + 3600 * 1000) // 1 hour
      };
      
      // Store the session directly
      await this.sessionManager.storeSession(selectionData.sessionId, session);
      sessionData = session;
    } else {
      // Update existing session with selected consultation type
      await this.sessionManager.updateSession(
        selectionData.sessionId,
        'consultation_selection',
        {
          selectedConsultationType: selectionData.selectedConsultationType,
          consultationPricing: pricing
        },
        patientId
      );
    }

    // Log audit
    await this.auditService.logDataAccess(
      patientId,
      'consultation-selection',
      'create',
      selectionData.sessionId,
      undefined,
      {
        selectedType: selectionData.selectedConsultationType,
        pricing,
        sessionId: selectionData.sessionId
      },
      requestMetadata
    );

    return {
      message: 'Consultation type selected successfully',
      sessionId: selectionData.sessionId,
      consultationType: selectionData.selectedConsultationType,
      pricing,
      nextStep: {
        endpoint: '/consultations/confirm-payment',
        description: 'Proceed to payment confirmation'
      }
    };
  }

  async createMockPayment(
    sessionId: string,
    patientId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<any> {
    const transactionId = `mock_payment_${Date.now()}`;
    
    try {
      this.logger.log(`[${transactionId}] Creating mock payment for session: ${sessionId}, patient: ${patientId}`);

      // Get session data to determine consultation type and pricing
      const sessionData = await this.sessionManager.getSession(sessionId);
      if (!sessionData) {
        throw new BadRequestException('Session not found');
      }

      const consultationType = sessionData.data?.selectedConsultationType || 'chat';
      const pricing = sessionData.data?.consultationPricing || this.getConsultationPricing(consultationType);

      // Create mock payment using payment service
      const paymentResponse = await this.paymentService.createPaymentOrder(
        sessionId,
        patientId,
        consultationType as 'chat' | 'tele' | 'video' | 'emergency',
        'Mock diagnosis for testing',
        'medium',
        requestMetadata
      );

      // Log audit event
      await this.auditService.logDataAccess(
        patientId,
        'payment',
        'create',
        sessionId,
        undefined,
        {
          sessionId,
          consultationType,
          paymentId: paymentResponse.paymentId,
          amount: paymentResponse.amount,
          currency: paymentResponse.currency,
          mockPayment: true
        },
        requestMetadata
      );

      this.logger.log(`[${transactionId}] Mock payment created successfully: ${paymentResponse.paymentId}`);

      return {
        message: 'Mock payment created successfully',
        paymentId: paymentResponse.paymentId,
        paymentUrl: paymentResponse.paymentUrl,
        status: paymentResponse.status,
        amount: paymentResponse.amount,
        currency: paymentResponse.currency,
        expiresAt: paymentResponse.expiresAt,
        nextStep: {
          endpoint: '/consultations/confirm-payment',
          description: 'Confirm payment to proceed'
        }
      };

    } catch (error) {
      this.logger.error(`[${transactionId}] Failed to create mock payment: ${error.message}`, error.stack);
      throw error;
    }
  }



}
