import { 
  Controller, 
  Get, 
  Put, 
  Post, 
  Param, 
  Body, 
  UseGuards, 
  Req, 
  Res, 
  Query, 
  HttpCode, 
  HttpStatus, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException 
} from '@nestjs/common';
import { Response } from 'express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth, 
  ApiParam 
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { UserRole, UserDocument } from '../../users/schemas/user.schema';
import { PrescriptionService } from '../services/prescription.service';
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

@ApiTags('Prescriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations/:id/prescription')
export class PrescriptionController {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  @Get('workspace')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Get prescription workspace data' })
  @ApiResponse({
    status: 200,
    description: 'Prescription workspace data retrieved successfully',
    type: PrescriptionWorkspaceResponseDto,
  })
  async getPrescriptionWorkspace(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
  ): Promise<PrescriptionWorkspaceResponseDto> {
    return this.prescriptionService.getPrescriptionWorkspace(consultationId, user);
  }

  @Put('diagnosis')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Update diagnosis for prescription' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis updated successfully',
    type: PrescriptionStatusResponseDto,
  })
  async updateDiagnosis(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Body() updateDiagnosisDto: UpdateDiagnosisDto,
    @Req() req: Request,
  ): Promise<PrescriptionStatusResponseDto> {
    return this.prescriptionService.updateDiagnosis(
      consultationId,
      user,
      updateDiagnosisDto,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    );
  }

  @Put('diagnosis/modify')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Modify AI diagnosis' })
  @ApiResponse({
    status: 200,
    description: 'AI diagnosis modified successfully',
  })
  async modifyDiagnosis(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Body() modifyDiagnosisDto: ModifyDiagnosisDto,
    @Req() req: Request,
  ) {
    return this.prescriptionService.modifyDiagnosis(
      consultationId,
      user,
      modifyDiagnosisDto,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    );
  }

  @Put('draft')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Save prescription draft' })
  @ApiResponse({
    status: 200,
    description: 'Prescription draft saved successfully',
    type: PrescriptionStatusResponseDto,
  })
  async savePrescriptionDraft(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Req() req: Request,
  ): Promise<PrescriptionStatusResponseDto> {
    return this.prescriptionService.savePrescriptionDraft(
      consultationId,
      user,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    );
  }

  @Post('generate-preview')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate prescription PDF preview' })
  @ApiResponse({
    status: 200,
    description: 'PDF preview generated successfully',
    type: PrescriptionPreviewResponseDto,
  })
  async generatePreview(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Req() req: Request,
  ): Promise<PrescriptionPreviewResponseDto> {
    return this.prescriptionService.generatePreview(
      consultationId, 
      user,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      }
    );
  }

  @Post('sign-and-send')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign and send prescription' })
  @ApiResponse({
    status: 200,
    description: 'Prescription signed and sent successfully',
    type: SignedPrescriptionResponseDto,
  })
  async signAndSendPrescription(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Body() signAndSendDto: SignAndSendDto,
    @Req() req: Request,
  ): Promise<SignedPrescriptionResponseDto> {
    return this.prescriptionService.signAndSendPrescription(
      consultationId,
      user,
      signAndSendDto,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    );
  }

  @Get('history')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN, UserRole.SUPER_DOC, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get prescription history' })
  @ApiResponse({
    status: 200,
    description: 'Prescription history retrieved successfully',
    type: [PrescriptionHistoryDto],
  })
  async getPrescriptionHistory(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
  ): Promise<PrescriptionHistoryDto[]> {
    return this.prescriptionService.getPrescriptionHistory(consultationId, user);
  }

  @Get('pdf/preview')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Stream prescription draft PDF for preview' })
  @ApiResponse({
    status: 200,
    description: 'PDF streamed successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  async streamDraftPdf(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Res() res: Response,
  ): Promise<void> {
    return this.prescriptionService.streamDraftPdf(consultationId, user, res);
  }

  @Get('pdf/download')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @ApiOperation({ summary: 'Download signed prescription PDF' })
  @ApiResponse({
    status: 200,
    description: 'Signed PDF downloaded successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  async downloadSignedPdf(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Query('attachment') attachment: string = 'true',
    @Res() res: Response,
  ): Promise<void> {
    return this.prescriptionService.downloadSignedPdf(consultationId, user, res, attachment === 'true');
  }

  @Post('complete-consultation')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.SUPER_DOC)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark consultation as completed by assigned doctor' })
  @ApiResponse({
    status: 200,
    description: 'Consultation marked as completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        consultationStatus: { type: 'string' },
        completedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  async completeConsultation(
    @Param('id') consultationId: string,
    @GetUser() user: UserDocument,
    @Req() req: Request,
  ): Promise<{
    message: string;
    consultationStatus: string;
    completedAt: Date;
  }> {
    return this.prescriptionService.completeConsultation(
      consultationId,
      user,
      {
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    );
  }
}

