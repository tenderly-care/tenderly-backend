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
  DoctorInvestigationDto
} from '../dto/consultation.dto';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { Public } from '../../../shared/decorators/public.decorator';
import { UserRole } from '../../users/schemas/user.schema';

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
    summary: 'Structured symptom collection for production-level AI diagnosis',
    description: 'Accepts structured symptom data and returns comprehensive AI diagnosis with consultation recommendation. Supports both legacy basic format and new structured format.'
  })
  @ApiBody({ 
    type: StructuredSymptomRequestDto,
    description: 'Structured symptom request containing comprehensive patient data'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'AI diagnosis completed successfully with structured response'
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data or missing required fields' 
  })
  @ApiResponse({ 
    status: HttpStatus.SERVICE_UNAVAILABLE, 
    description: 'AI diagnosis service temporarily unavailable' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Patient ID mismatch or authentication issue' 
  })
  @Roles(UserRole.PATIENT)
  async collectStructuredSymptoms(
    @Body() structuredSymptomRequestDto: StructuredSymptomRequestDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectStructuredSymptoms(
      user.id,
      structuredSymptomRequestDto.structured_request,
      requestMetadata
    );
  }

  @Post('symptoms/collect_detailed_symptoms')
  @ApiOperation({ 
    summary: 'Detailed symptom collection for comprehensive AI diagnosis',
    description: 'Collects comprehensive patient data and returns detailed AI diagnosis with medication safety checks and investigations'
  })
  @ApiBody({ type: DetailedSymptomInputDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Detailed AI diagnosis completed successfully with comprehensive analysis',
    type: DetailedDiagnosisResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data or missing required fields' 
  })
  @ApiResponse({ 
    status: HttpStatus.SERVICE_UNAVAILABLE, 
    description: 'AI diagnosis service temporarily unavailable' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Patient ID mismatch or authentication issue'
  })
  @Roles(UserRole.PATIENT)
  async collectDetailedSymptoms(
    @Body() detailedSymptomInputDto: DetailedSymptomInputDto,
    @GetUser() user: any,
    @Req() req: Request
  ): Promise<DetailedDiagnosisResponseDto> {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.consultationService.collectDetailedSymptoms(
      user.id,
      detailedSymptomInputDto,
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
}
