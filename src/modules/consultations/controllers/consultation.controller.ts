import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  Req,
  Patch,
  Delete,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  NotFoundException,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody, 
  ApiParam, 
  ApiQuery 
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import { ConsultationService } from '../services/consultation.service';
import { 
  CreateConsultationDto, 
  UpdateConsultationStatusDto 
} from '../dto/new-consultation.dto';
import { 
  AIAgentSymptomCollectionDto, 
  AIDiagnosisResponseDto,
  GynecologicalAssessmentDto,
  StructuredDiagnosisResponseDto,
  PaymentConfirmationDto
} from '../dto/consultation.dto';
import { ConsultationStatus, ConsultationType } from '../schemas/consultation.schema';
import { UserRole } from '../../users/schemas/user.schema';
import { Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { UseInterceptors } from '@nestjs/common';
import { Logger } from '@nestjs/common';

@ApiTags('Consultations')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('consultations')
export class ConsultationController {
  private readonly logger = new Logger(ConsultationController.name);

  constructor(private readonly consultationService: ConsultationService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new consultation',
    description: 'Creates a new consultation for the authenticated patient'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Consultation created successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Patient already has an active consultation' 
  })
  @ApiBody({ type: CreateConsultationDto })
  async createConsultation(
    @Body() createConsultationDto: CreateConsultationDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.createConsultation(
      createConsultationDto,
      user.id
    );
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get consultation by ID',
    description: 'Retrieves a specific consultation by its ID'
  })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Consultation retrieved successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Consultation not found' 
  })
  async getConsultation(@Param('id') id: string, @GetUser() user: any) {
    return await this.consultationService.findConsultationById(id, user.id);
  }

  @Get('patient/:patientId')
  @ApiOperation({ 
    summary: 'Get consultations by patient ID',
    description: 'Retrieves all consultations for a specific patient'
  })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Consultations retrieved successfully' 
  })
  async getConsultationsByPatientId(
    @Param('patientId') patientId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @GetUser() user: any
  ) {
    return await this.consultationService.findConsultationsByPatientId(
      patientId,
      user.id,
      limit,
      (page - 1) * limit
    );
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update consultation',
    description: 'Updates an existing consultation'
  })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  @ApiBody({ type: CreateConsultationDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Consultation updated successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Consultation not found' 
  })
  async updateConsultation(
    @Param('id') id: string,
    @Body() updateConsultationDto: CreateConsultationDto,
    @GetUser() user: any
  ) {
    return await this.consultationService.updateConsultation(
      id,
      updateConsultationDto,
      user.id
    );
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Delete consultation',
    description: 'Soft deletes a consultation'
  })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Consultation deleted successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Consultation not found' 
  })
  async deleteConsultation(@Param('id') id: string, @GetUser() user: any) {
    return await this.consultationService.deleteConsultation(id, user.id);
  }

  @Post('symptoms/collect')
  @ApiOperation({ 
    summary: 'Collect symptoms for AI diagnosis',
    description: 'Collects patient symptoms and returns AI diagnosis'
  })
  @ApiBody({ type: AIAgentSymptomCollectionDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Symptoms collected and diagnosis generated',
    type: AIDiagnosisResponseDto
  })
  @Roles(UserRole.PATIENT)
  async collectSymptoms(
    @Body() symptomCollectionDto: AIAgentSymptomCollectionDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<AIDiagnosisResponseDto> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectAIAgentSymptoms(
      user.id,
      symptomCollectionDto,
      requestMetadata
    );
  }

  @Post('symptoms/collect-structured')
  @ApiOperation({ 
    summary: 'Collect structured gynecological symptoms',
    description: 'Collects detailed structured symptoms for gynecological assessment'
  })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        clinicalSessionId: { type: 'string', description: 'Clinical session ID (optional, will auto-detect if not provided)' }
      },
      additionalProperties: true
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Structured assessment completed',
    type: StructuredDiagnosisResponseDto
  })
  @Roles(UserRole.PATIENT)
  async collectStructuredSymptoms(
    @Body() body: any,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<StructuredDiagnosisResponseDto & { consultationId: string; clinicalSessionId: string; consultationPricing: any; paymentVerified: boolean }> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    const { clinicalSessionId, ...assessmentData } = body;

    let sessionClinicalSessionId = clinicalSessionId;
    if (!sessionClinicalSessionId) {
      const recentConsultation = await this.consultationService.findConsultationsByPatientId(user.id, user.id, 1, 0);
      console.log('Recent consultations found:', recentConsultation.consultations.length);

      if (recentConsultation.consultations.length > 0) {
        const latestConsultation = recentConsultation.consultations[0];
        console.log('Latest consultation:', {
          consultationId: latestConsultation.consultationId,
          clinicalSessionId: latestConsultation.clinicalSessionId,
          paymentStatus: latestConsultation.paymentInfo?.paymentStatus,
          status: latestConsultation.status
        });

        if (latestConsultation.clinicalSessionId &&
            latestConsultation.paymentInfo?.paymentStatus === 'completed' &&
            latestConsultation.status === ConsultationStatus.PAYMENT_CONFIRMED) {
          sessionClinicalSessionId = latestConsultation.clinicalSessionId;
          console.log('Using clinicalSessionId from latest consultation:', sessionClinicalSessionId);
        } else {
          console.log('Latest consultation does not meet criteria:', {
            hasClinicalSessionId: !!latestConsultation.clinicalSessionId,
            paymentStatus: latestConsultation.paymentInfo?.paymentStatus,
            consultationStatus: latestConsultation.status
          });
        }
      } else {
        console.log('No recent consultations found for user:', user.id);
      }
    }

    if (!sessionClinicalSessionId) {
      const recentConsultation = await this.consultationService.findConsultationsByPatientId(user.id, user.id, 5, 0);
      let errorDetails = 'No consultations found.';

      if (recentConsultation.consultations.length > 0) {
        const latest = recentConsultation.consultations[0];
        errorDetails = `Found consultation ${latest.consultationId} with status: ${latest.status}, payment: ${latest.paymentInfo?.paymentStatus}, clinicalSessionId: ${latest.clinicalSessionId || 'missing'}`;
      }

      throw new BadRequestException(`clinicalSessionId is required. ${errorDetails} Please complete payment confirmation first to get your clinicalSessionId.`);
    }

    return await this.consultationService.collectStructuredGynecologicalAssessment(
      user.id,
      assessmentData,
      sessionClinicalSessionId,
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

  @Post('debug-payment')
  @Public()
  async debugPayment(@Body() debugData: { sessionId: string; paymentId: string }) {
    try {
      this.logger.log(`Debug payment request: ${JSON.stringify(debugData)}`);
      
      // Check if payment exists in cache
      const paymentService = this.consultationService['paymentService'];
      const cachedPayment = await paymentService.getPaymentBySessionId(debugData.sessionId);
      
      // Check if session data exists
      const sessionData = await this.consultationService['getTemporaryConsultationData'](debugData.sessionId);
      
      return {
        success: true,
        debug: {
          sessionId: debugData.sessionId,
          paymentId: debugData.paymentId,
          cachedPayment: cachedPayment ? 'EXISTS' : 'NOT_FOUND',
          sessionData: sessionData ? 'EXISTS' : 'NOT_FOUND',
          paymentDetails: cachedPayment,
          sessionDetails: sessionData ? { hasData: true, keys: Object.keys(sessionData) } : null
        }
      };
    } catch (error) {
      this.logger.error(`Debug payment error: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  @Post('select-consultation')
  @ApiOperation({ 
    summary: 'Select consultation type and initiate payment',
    description: 'Patient selects consultation type and gets payment details'
  })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        selectedConsultationType: { 
          type: 'string', 
          enum: ['chat', 'video', 'tele', 'emergency', 'follow_up', 'structured_assessment'],
          description: 'Type of consultation selected'
        }
      },
      required: ['sessionId', 'selectedConsultationType']
    }
  })
  @Roles(UserRole.PATIENT)
  async selectConsultationType(
    @Body() body: { sessionId: string; selectedConsultationType: string },
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.selectConsultationType(
      body,
      user.id,
      requestMetadata
    );
  }

  @Get('conflicts')
  @ApiOperation({ 
    summary: 'Check consultation conflicts',
    description: 'Check if patient has any consultation conflicts (active, pending payment, expired)'
  })
  @Roles(UserRole.PATIENT)
  async checkConflicts(@GetUser() user: any) {
    return await this.consultationService.checkConsultationConflicts(user.id);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get consultation statistics',
    description: 'Get consultation statistics for the current patient'
  })
  @Roles(UserRole.PATIENT)
  async getConsultationStats(@GetUser() user: any) {
    return await this.consultationService.getPatientConsultationStats(user.id);
  }

  @Get('active')
  @ApiOperation({ 
    summary: 'Get active consultation',
    description: 'Get the currently active consultation for the patient'
  })
  @Roles(UserRole.PATIENT)
  async getActiveConsultation(@GetUser() user: any) {
    const activeConsultation = await this.consultationService.getActiveConsultation(user.id);
    
    if (!activeConsultation) {
      throw new NotFoundException('No active consultation found');
    }
    
    return activeConsultation;
  }

  @Patch(':consultationId/status')
  @ApiOperation({ 
    summary: 'Update consultation status',
    description: 'Update consultation status with proper business logic validation'
  })
  @ApiBody({ type: UpdateConsultationStatusDto })
  @Roles(UserRole.PATIENT, UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN)
  async updateConsultationStatus(
    @Param('consultationId') consultationId: string,
    @Body() updateStatusDto: UpdateConsultationStatusDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    await this.consultationService.updateConsultationStatus(
      consultationId,
      updateStatusDto.status,
      user.id,
      updateStatusDto.reason,
      {
        source: 'api',
        trigger: 'manual_status_update',
        notes: updateStatusDto.notes
      }
    );

    return {
      message: 'Consultation status updated successfully',
      consultationId,
      newStatus: updateStatusDto.status,
      updatedAt: new Date()
    };
  }

  @Post(':consultationId/cancel')
  @ApiOperation({ 
    summary: 'Cancel consultation',
    description: 'Cancel an active consultation'
  })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for cancellation' }
      }
    }
  })
  @Roles(UserRole.PATIENT, UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN)
  async cancelConsultation(
    @Param('consultationId') consultationId: string,
    @Body() cancelDto: { reason?: string },
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    await this.consultationService.updateConsultationStatus(
      consultationId,
      ConsultationStatus.CANCELLED,
      user.id,
      cancelDto.reason || 'Cancelled by user',
      {
        source: 'api',
        trigger: 'manual_cancellation',
        notes: 'Consultation cancelled by user'
      }
    );

    return {
      message: 'Consultation cancelled successfully',
      consultationId,
      cancelledAt: new Date()
    };
  }

  // Health check endpoints
  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Consultation service health check' })
  async healthCheck() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }

  @Get('ai-service/health')
  @Public()
  @ApiOperation({ summary: 'AI service health check' })
  async aiServiceHealthCheck() {
    return await this.consultationService.checkAIServiceHealth();
  }

  @Get('db-health')
  @Public()
  @ApiOperation({ summary: 'Database health check' })
  async dbHealthCheck() {
    return await this.consultationService.checkDatabaseHealth();
  }

  @Get('test-model')
  @Public()
  @ApiOperation({ summary: 'Test AI model' })
  async testModel() {
    return await this.consultationService.testConsultationModel();
  }

  @Post('mock-payment/:sessionId')
  @ApiOperation({ 
    summary: 'Create mock payment for testing',
    description: 'Creates a mock payment for the given session ID (testing only)'
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID for payment' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Mock payment created successfully' 
  })
  @Roles(UserRole.PATIENT)
  async createMockPayment(
    @Param('sessionId') sessionId: string,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.createMockPayment(
      sessionId,
      user.id,
      requestMetadata
    );
  }

  @Post('test-session-data')
  @Public()
  async testSessionData(@Body() testData: { sessionId: string }) {
    try {
      this.logger.log(`Testing session data for: ${testData.sessionId}`);
      
      // Test session data retrieval
      const sessionData = await this.consultationService['getTemporaryConsultationData'](testData.sessionId);
      
      // Test payment data retrieval
      const paymentService = this.consultationService['paymentService'];
      const paymentData = await paymentService.getPaymentBySessionId(testData.sessionId);
      
      return {
        success: true,
        sessionId: testData.sessionId,
        sessionData: sessionData ? 'EXISTS' : 'NOT_FOUND',
        paymentData: paymentData ? 'EXISTS' : 'NOT_FOUND',
        sessionDetails: sessionData ? { keys: Object.keys(sessionData) } : null,
        paymentDetails: paymentData
      };
    } catch (error) {
      this.logger.error(`Test session data error: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }
}
