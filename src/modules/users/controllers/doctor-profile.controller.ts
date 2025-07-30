import { Controller, Get, Put, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiBody,
  ApiBearerAuth,
  ApiSecurity 
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import {
  UpdateDoctorProfessionalInfoDto,
  UpdateMedicalLicenseDto,
  UpdateAvailabilityDto,
  DoctorProfessionalInfoResponseDto,
  ProfileCompletionStatusDto,
  ValidateLicenseDto,
  LicenseValidationResponseDto,
} from '../dto/doctor-profile.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../schemas/user.schema';

@ApiTags('Doctor Profile')
@Controller('doctor-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Get doctor profile', 
    description: 'Retrieve comprehensive doctor professional information' 
  })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Doctor profile retrieved successfully',
    type: DoctorProfessionalInfoResponseDto 
  })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getDoctorProfile(
    @Param('id') id: string,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    return this.usersService.getDoctorProfile(id);
  }

  @Put('professional-info')
  @Roles(UserRole.HEALTHCARE_PROVIDER)
  @ApiOperation({ 
    summary: 'Update professional information', 
    description: 'Update doctor professional details (self-service)' 
  })
  @ApiBody({ type: UpdateDoctorProfessionalInfoDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Professional information updated successfully',
    type: DoctorProfessionalInfoResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Access denied - healthcare providers only' })
  async updateProfessionalInfo(
    @Request() req,
    @Body() updateDto: UpdateDoctorProfessionalInfoDto,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    return this.usersService.updateProfessionalInfo(req.user.id, updateDto);
  }

  @Patch('availability')
  @Roles(UserRole.HEALTHCARE_PROVIDER)
  @ApiOperation({ 
    summary: 'Update availability slots', 
    description: 'Update doctor availability schedule (self-service)' 
  })
  @ApiBody({ type: UpdateAvailabilityDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Availability updated successfully',
    type: DoctorProfessionalInfoResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Invalid availability slots or overlapping times' })
  @ApiResponse({ status: 403, description: 'Access denied - healthcare providers only' })
  async updateAvailability(
    @Request() req,
    @Body() updateDto: UpdateAvailabilityDto,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    return this.usersService.updateAvailability(req.user.id, updateDto);
  }

  @Patch(':id/license')
  @Roles(UserRole.SUPER_DOC, UserRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Update medical license (Super Admin & Super Doc only)', 
    description: 'Update doctor medical license information - requires manual verification' 
  })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  @ApiBody({ type: UpdateMedicalLicenseDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Medical license updated successfully',
    type: DoctorProfessionalInfoResponseDto 
  })
  @ApiResponse({ status: 403, description: 'Access denied - super_admin and super_doc only' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async updateMedicalLicense(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateMedicalLicenseDto,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    return this.usersService.updateMedicalLicense(id, updateDto, req.user.id);
  }

  @Patch('validate-license')
  @Roles(UserRole.SUPER_DOC, UserRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Validate medical license (Super Admin & Super Doc only)', 
    description: 'Validate medical license with external authority' 
  })
  @ApiBody({ type: ValidateLicenseDto })
  @ApiResponse({ 
    status: 200, 
    description: 'License validation completed',
    type: LicenseValidationResponseDto 
  })
  @ApiResponse({ status: 403, description: 'Access denied - super_admin and super_doc only' })
  async validateLicense(
    @Body() validateDto: ValidateLicenseDto,
  ): Promise<LicenseValidationResponseDto> {
    return this.usersService.validateLicense(validateDto);
  }

  @Get(':id/completion-status')
  @Roles(UserRole.HEALTHCARE_PROVIDER, UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Get profile completion status', 
    description: 'Check doctor profile completion percentage and missing fields' 
  })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Profile completion status retrieved',
    type: ProfileCompletionStatusDto 
  })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async getProfileCompletionStatus(
    @Param('id') id: string,
  ): Promise<ProfileCompletionStatusDto> {
    return this.usersService.getProfileCompletionStatus(id);
  }
}

