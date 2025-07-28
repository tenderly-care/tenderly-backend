import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Patch, 
  Delete, 
  Query, 
  Req, 
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth, 
  ApiParam, 
  ApiQuery,
  ApiBody,
  ApiConsumes,
  ApiProduces 
} from '@nestjs/swagger';
import { Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConsultationService } from '../services/consultation.service';
// New DTOs
import { 
  CreateConsultationDto as NewCreateConsultationDto,
  UpdateConsultationStatusDto,
  CreatePatientProfileDto, 
  CreateSymptomScreeningDto, 
  ConsultationResponseDto, 
  PrescriptionResponseDto 
} from '../dto/new-consultation.dto';
// Legacy DTOs for backward compatibility
import { 
  CreateConsultationDto, 
  UpdateConsultationDto, 
  SymptomInputDto,
  BasicSymptomInputDto,
  StructuredSymptomRequestDto,
  DetailedSymptomInputDto,
  DetailedDiagnosisResponseDto,
  ConsultationSelectionDto,
  PaymentConfirmationDto,
  DoctorInvestigationDto,
  AIAgentSymptomCollectionDto,
  AIDiagnosisResponseDto,
  ClinicalDetailedSymptomsDto,
  GynecologicalAssessmentDto,
  StructuredDiagnosisResponseDto
} from '../dto/consultation.dto';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Public } from '../../../shared/decorators/public.decorator';


@ApiTags('Consultations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new consultation',
    description: 'Creates a new consultation session for a patient after symptom collection and payment confirmation'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Consultation created successfully'
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Patient already has an active consultation' 
  })
  @ApiBody({ type: NewCreateConsultationDto })
  async createConsultation(
    @Body() createConsultationDto: NewCreateConsultationDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.createConsultation(
      createConsultationDto,
      requestMetadata
    );
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get consultation by ID',
    description: 'Retrieves a specific consultation by its ID with proper access control'
  })
  @ApiParam({ 
    name: 'id', 
    type: 'string', 
    description: 'Consultation ID'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Consultation retrieved successfully' 
  })
  async findConsultationById(
    @Param('id') consultationId: string,
    @GetUser() user: any
  ) {
    return await this.consultationService.findConsultationById(
      consultationId,
      user.id,
      user.roles
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ 
    summary: 'Get all consultations for a patient',
    description: 'Retrieves paginated list of consultations for a specific patient'
  })
  @ApiParam({ 
    name: 'patientId', 
    type: 'string', 
    description: 'Patient ID'
  })
  @ApiQuery({ 
    name: 'limit', 
    type: 'number', 
    required: false, 
    description: 'Number of consultations to retrieve'
  })
  @ApiQuery({ 
    name: 'offset', 
    type: 'number', 
    required: false, 
    description: 'Number of consultations to skip'
  })
  async findConsultationsByPatientId(
    @Param('patientId') patientId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @GetUser() user: any
  ) {
    const result = await this.consultationService.findConsultationsByPatientId(
      patientId,
      user.id,
      limit,
      offset
    );

    return {
      ...result,
      limit,
      offset
    };
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update consultation',
    description: 'Updates a consultation with new information'
  })
  @ApiParam({ 
    name: 'id', 
    type: 'string', 
    description: 'Consultation ID'
  })
  @ApiBody({ type: UpdateConsultationDto })
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateConsultation(
    @Param('id') consultationId: string,
    @Body() updateConsultationDto: UpdateConsultationDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.updateConsultation(
      consultationId,
      updateConsultationDto,
      user.id,
      requestMetadata,
      user.roles
    );
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Cancel consultation',
    description: 'Cancels a consultation (soft delete)'
  })
  @ApiParam({ 
    name: 'id', 
    type: 'string', 
    description: 'Consultation ID'
  })
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async cancelConsultation(
    @Param('id') consultationId: string,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    await this.consultationService.deleteConsultation(
      consultationId,
      user.id,
      requestMetadata,
      user.roles
    );

    return {
      message: 'Consultation cancelled successfully',
      consultationId
    };
  }

    @Post('symptoms/collect')
  @ApiOperation({
    summary: 'AI Agent Compatible Symptom Collection',
    description: 'Collects symptoms in the exact format expected by tenderly-ai-agent and returns AI diagnosis with consultation recommendations'
  })
  @ApiBody({ 
    type: AIAgentSymptomCollectionDto,
    description: 'Symptom data in AI agent compatible format - matches tenderly-ai-agent schema',
    examples: {
      'Urinary Infection Symptoms': {
        value: {
          diagnosis_request: {
            symptoms: ['urinary infection', 'burn during urination'],
            patient_age: 34,
            severity_level: 'severe',
            duration: '3 days',
            onset: 'sudden',
            progression: 'stable'
          }
        }
      },
      'Vaginal Discharge Symptoms': {
        value: {
          diagnosis_request: {
            symptoms: ['vaginal discharge', 'itching', 'burning sensation'],
            patient_age: 25,
            severity_level: 'moderate',
            duration: '5 days',
            onset: 'gradual',
            progression: 'worsening'
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'AI diagnosis completed successfully',
    type: AIDiagnosisResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data - check symptoms array length (1-3 items) and patient age (12-100)' 
  })
  @ApiResponse({ 
    status: HttpStatus.SERVICE_UNAVAILABLE, 
    description: 'AI diagnosis service temporarily unavailable' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required - patient role only' 
  })
  @Roles(UserRole.PATIENT)
  async collectSymptoms(
    @Body() symptomData: AIAgentSymptomCollectionDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<AIDiagnosisResponseDto & { sessionId: string; consultationPricing: any }> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectAIAgentSymptoms(
      user.id,
      symptomData,
      requestMetadata
    );
  }

  @Post('symptoms/collect-structured')
  @ApiOperation({
    summary: 'Structured Gynecological Assessment',
    description: 'Collects comprehensive gynecological symptoms and medical history for detailed AI diagnosis using structured assessment format'
  })
  @ApiBody({ 
    type: GynecologicalAssessmentDto,
    description: 'Comprehensive gynecological assessment data matching tenderly-ai-agent structured schema',
    examples: {
      'Irregular Periods Assessment': {
        value: {
          patient_profile: {
            age: 25,
            request_id: "patient_123",
            timestamp: "2025-01-28T10:30:00Z"
          },
          primary_complaint: {
            main_symptom: "irregular periods",
            duration: "3 months",
            severity: "moderate",
            onset: "gradual",
            progression: "stable"
          },
          symptom_specific_details: {
            symptom_characteristics: {
              cycle_length_range: "21–45 days",
              bleeding_duration_variability: "2–10 days",
              bleeding_intensity: "sometimes heavy",
              bleeding_between_periods: true,
              skipped_periods: "twice in last 6 months",
              associated_symptoms: ["severe cramps", "fatigue", "mood swings"],
              recent_weight_changes: false,
              known_causes: "none identified"
            }
          },
          reproductive_history: {
            pregnancy_status: {
              could_be_pregnant: false,
              pregnancy_test_result: "negative"
            },
            sexual_activity: {
              sexually_active: true,
              contraception_method: "condoms"
            },
            menstrual_history: {
              menarche_age: 12,
              cycle_frequency: 28,
              period_duration: 5
            }
          },
          associated_symptoms: {
            pain: {
              pelvic_pain: "mild",
              vulvar_irritation: "none"
            },
            systemic: {
              fatigue: "moderate",
              nausea: false,
              fever: false
            }
          },
          medical_context: {
            current_medications: [],
            recent_medications: [],
            medical_conditions: ["diabetes"],
            previous_gynecological_issues: [],
            allergies: ["penicillin"],
            family_history: []
          },
          healthcare_interaction: {
            previous_consultation: true,
            consultation_outcome: "inconclusive",
            investigations_done: false,
            current_treatment: "none"
          },
          patient_concerns: {
            main_worry: "fertility issues due to irregular periods",
            impact_on_life: "moderate",
            additional_notes: "Concerned about ability to conceive"
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Structured diagnosis completed successfully',
    type: StructuredDiagnosisResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data - check required fields and data types' 
  })
  @ApiResponse({ 
    status: HttpStatus.SERVICE_UNAVAILABLE, 
    description: 'AI diagnosis service temporarily unavailable' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required - patient role only' 
  })
  @Roles(UserRole.PATIENT)
  async collectStructuredSymptoms(
    @Body() assessmentData: GynecologicalAssessmentDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<StructuredDiagnosisResponseDto & { sessionId: string; consultationPricing: any }> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectStructuredGynecologicalAssessment(
      user.id,
      assessmentData,
      requestMetadata
    );
  }


  @Post('select-consultation')
  @ApiOperation({ 
    summary: 'Select consultation type and initiate payment',
    description: 'Patient selects consultation type and gets payment details'
  })
  @ApiBody({ type: ConsultationSelectionDto })
  @Roles(UserRole.PATIENT)
  async selectConsultationType(
    @Body() consultationSelectionDto: ConsultationSelectionDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.selectConsultationType(
      consultationSelectionDto,
      user.id,
      requestMetadata
    );
  }

  @Post('confirm-payment')
  @ApiOperation({ 
    summary: 'Confirm payment and finalize consultation',
    description: 'Confirms payment status and creates permanent consultation record'
  })
  @ApiBody({ type: PaymentConfirmationDto })
  @Roles(UserRole.PATIENT)
  async confirmPayment(
    @Body() paymentConfirmationDto: PaymentConfirmationDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.confirmPayment(
      paymentConfirmationDto,
      user.id,
      requestMetadata
    );
  }

  /**
   * Phase 2: Collect detailed symptoms for clinical assessment
   * Production-level endpoint for comprehensive symptom collection after payment confirmation
   */
  @Post(':consultationId/clinical/:clinicalSessionId/detailed-symptoms')
  @ApiOperation({
    summary: 'Phase 2: Collect detailed symptoms for clinical assessment',
    description: 'Collects comprehensive symptom data after payment confirmation for detailed AI analysis and doctor review. This endpoint is called after successful payment to gather detailed clinical information for professional medical assessment.'
  })
  @ApiParam({ 
    name: 'consultationId', 
    description: 'Consultation ID from Phase 1 payment confirmation',
    type: 'string',
    required: true
  })
  @ApiParam({ 
    name: 'clinicalSessionId', 
    description: 'Clinical session ID for Phase 2 data collection',
    type: 'string',
    required: true
  })
  @ApiBody({ 
    type: ClinicalDetailedSymptomsDto,
    description: 'Comprehensive symptom data including primary complaint, associated symptoms, medical history, reproductive history, lifestyle factors, and patient concerns for clinical assessment'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Detailed symptoms collected successfully and comprehensive AI diagnosis generated',
    type: Object
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid symptom data, consultation not ready for clinical assessment, or clinical session phase mismatch' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required - patient role only' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Consultation or clinical session not found or expired' 
  })
  @ApiResponse({ 
    status: HttpStatus.INTERNAL_SERVER_ERROR, 
    description: 'Internal server error during symptom processing or AI diagnosis generation' 
  })
  @Roles(UserRole.PATIENT)
  async collectDetailedSymptomsForConsultation(
    @Param('consultationId') consultationId: string,
    @Param('clinicalSessionId') clinicalSessionId: string,
    @Body() detailedSymptomsDto: ClinicalDetailedSymptomsDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<any> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectDetailedSymptomsForConsultation(
      consultationId,
      clinicalSessionId,
      detailedSymptomsDto,
      user.id,
      requestMetadata
    );
  }

  @Post('mock-payment/:sessionId')
  @ApiOperation({ 
    summary: 'Mock payment completion for testing',
    description: 'Simulates payment completion for testing purposes'
  })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Session ID' })
  @Roles(UserRole.PATIENT)
  async mockPayment(
    @Param('sessionId') sessionId: string,
    @Body() mockData: { success?: boolean },
    @GetUser() user: any
  ) {
    return await this.consultationService.mockPaymentCompletion(
      sessionId,
      user.id,
      mockData.success ?? true
    );
  }

  @Patch(':id/investigations')
  @ApiOperation({ 
    summary: 'Add doctor investigations and updates',
    description: 'Allows doctors to add investigations and update consultation details'
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Consultation ID' })
  @ApiBody({ type: DoctorInvestigationDto })
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async addInvestigations(
    @Param('id') consultationId: string,
    @Body() investigationDto: DoctorInvestigationDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.addDoctorInvestigations(
      consultationId,
      investigationDto,
      user.id,
      requestMetadata
    );
  }

  @Get('health')
  @Public()
  @ApiOperation({ 
    summary: 'Health check for consultation service'
  })
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'consultation-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  @Get('ai-service/health')
  @Public()
  @ApiOperation({
    summary: 'Health check for AI service with JWT authentication test',
    description: 'Tests AI service connectivity and JWT token generation'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI service health status with authentication details'
  })
  async checkAIServiceHealth() {
    return await this.consultationService.checkAIServiceHealth();
  }

  @Get('db-health')
  @ApiOperation({ 
    summary: 'Database health check',
    description: 'Check if the database connection is working properly'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Database health check completed'
  })
  async checkDatabaseHealth() {
    return await this.consultationService.checkDatabaseHealth();
  }

  @Get('test-model')
  @ApiOperation({ 
    summary: 'Test consultation model',
    description: 'Test if the consultation model is working properly'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Model test completed'
  })
  async testConsultationModel() {
    return await this.consultationService.testConsultationModel();
  }

}
