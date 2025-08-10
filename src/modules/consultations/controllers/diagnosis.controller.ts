import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  Req,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody,
  ApiHeader
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { DiagnosisService } from '../services/diagnosis.service';
import { UserRole } from '../../users/schemas/user.schema';
import { Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UsePipes, ValidationPipe } from '@nestjs/common';

// DTOs for structured diagnosis
export class StructuredDiagnosisRequestDto {
  patient_profile?: {
    age?: number;
    request_id?: string;
    timestamp?: string;
  };
  primary_complaint?: {
    main_symptom?: string;
    duration?: string;
    severity?: 'mild' | 'moderate' | 'severe';
    onset?: string;
    progression?: string;
  };
  symptom_specific_details?: Record<string, any>;
  reproductive_history?: Record<string, any>;
  associated_symptoms?: Record<string, any>;
  medical_context?: {
    current_medications?: string[];
    recent_medications?: string[];
    medical_conditions?: string[];
    previous_gynecological_issues?: string[];
    allergies?: string[];
    family_history?: string[];
  };
  healthcare_interaction?: {
    previous_consultation?: boolean;
    consultation_outcome?: string;
    investigations_done?: boolean;
    investigation_results?: string;
    current_treatment?: string;
  };
  patient_concerns?: {
    main_worry?: string;
    impact_on_life?: 'minimal' | 'mild' | 'moderate' | 'significant' | 'severe';
    additional_notes?: string;
  };
  // Allow for dynamic additional fields
  [key: string]: any;
}

export class StructuredDiagnosisResponseDto {
  diagnosis: string;
  confidence_score: number;
  severity_assessment: {
    level: 'low' | 'moderate' | 'high' | 'critical';
    reasoning: string;
  };
  suggested_investigations: {
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
    estimated_cost?: string;
    duration?: string;
  }[];
  recommended_medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    reason: string;
    notes?: string;
    side_effects?: string[];
  }[];
  lifestyle_advice: string[];
  follow_up_recommendations: {
    timeline: string;
    specialist_referral?: boolean;
    specialist_type?: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };
  red_flags?: string[];
  differential_diagnoses?: {
    diagnosis: string;
    probability: number;
    reasoning: string;
  }[];
  disclaimer: string;
  timestamp: string;
  response_metadata: {
    processing_time_ms: number;
    model_version: string;
    service_name: string;
  };
}

@ApiTags('Diagnosis')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('diagnosis')
export class DiagnosisController {
  private readonly logger = new Logger(DiagnosisController.name);

  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Post('structure')
  @ApiOperation({ 
    summary: 'Get structured AI diagnosis',
    description: 'Processes structured patient data and returns comprehensive AI diagnosis with full clinical details'
  })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API key for tenderly-ai-agent authentication',
    required: true
  })
  @ApiHeader({
    name: 'X-Service-Name', 
    description: 'Service name identifier (should be "tenderly-backend")',
    required: true
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Structured diagnosis generated successfully',
    type: StructuredDiagnosisResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid request data' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Invalid or missing authentication' 
  })
  @ApiResponse({ 
    status: HttpStatus.SERVICE_UNAVAILABLE, 
    description: 'AI diagnosis service temporarily unavailable' 
  })
  @ApiBody({ 
    type: StructuredDiagnosisRequestDto,
    description: 'Structured patient data for comprehensive diagnosis',
    examples: {
      example1: {
        summary: 'Gynecological consultation example',
        value: {
          patient_profile: {
            age: 28,
            request_id: 'DIAG_001_20240810',
            timestamp: '2024-08-10T04:52:43Z'
          },
          primary_complaint: {
            main_symptom: 'Irregular menstrual cycle',
            duration: '3 months',
            severity: 'moderate',
            onset: 'gradual',
            progression: 'worsening'
          },
          medical_context: {
            current_medications: [],
            medical_conditions: [],
            allergies: ['penicillin'],
            family_history: ['diabetes']
          },
          patient_concerns: {
            main_worry: 'Worried about fertility',
            impact_on_life: 'moderate'
          }
        }
      }
    }
  })
  @Roles(UserRole.PATIENT, UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUPER_DOC)
  async getStructuredDiagnosis(
    @Body() diagnosisRequest: StructuredDiagnosisRequestDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<StructuredDiagnosisResponseDto> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Processing structured diagnosis request for user: ${user.id}`);

      const requestMetadata = {
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        userId: user.id,
        userRole: user.role
      };

      // Add request metadata to diagnosis request
      const enrichedRequest = {
        ...diagnosisRequest,
        patient_profile: {
          ...diagnosisRequest.patient_profile,
          user_id: user.id,
          user_role: user.role,
          timestamp: new Date().toISOString(),
          request_id: diagnosisRequest.patient_profile?.request_id || `DIAG_${user.id}_${Date.now()}`
        }
      };

      const diagnosis = await this.diagnosisService.getStructuredDiagnosis(
        enrichedRequest,
        requestMetadata
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(`Structured diagnosis completed in ${processingTime}ms for user: ${user.id}`);

      return {
        ...diagnosis,
        response_metadata: {
          ...diagnosis.response_metadata,
          processing_time_ms: processingTime,
          service_name: 'tenderly-backend'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Structured diagnosis failed after ${processingTime}ms for user ${user.id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('simple')
  @ApiOperation({ 
    summary: 'Get simple AI diagnosis (legacy)',
    description: 'Legacy endpoint for simple symptom-based diagnosis'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Simple diagnosis generated successfully'
  })
  @Roles(UserRole.PATIENT, UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN)
  async getSimpleDiagnosis(
    @Body() diagnosisRequest: any,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    this.logger.log(`Processing simple diagnosis request for user: ${user.id}`);

    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      userId: user.id,
      userRole: user.role
    };

    return await this.diagnosisService.getSimpleDiagnosis(
      diagnosisRequest,
      requestMetadata
    );
  }

  @Post('health')
  @ApiOperation({ 
    summary: 'Check AI diagnosis service health',
    description: 'Health check endpoint for AI diagnosis service connectivity'
  })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUPER_DOC)
  async checkDiagnosisHealth() {
    return await this.diagnosisService.checkServiceHealth();
  }
}
