import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Body, 
  Param, 
  Req, 
  UseGuards, 
  HttpStatus,
  UsePipes,
  ValidationPipe 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse,
  ApiParam,
  ApiBody 
} from '@nestjs/swagger';
import { Request } from 'express';
import { DoctorShiftService } from '../services/doctor-shift.service';
import { CreateDoctorShiftDto, UpdateDoctorShiftDto } from '../dto/doctor-shift.dto';
import { ShiftType, ShiftStatus } from '../schemas/doctor-shift.schema';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@ApiTags('Doctor Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('doctor-shifts')
export class DoctorShiftController {
  constructor(private readonly doctorShiftService: DoctorShiftService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create or update doctor shift',
    description: 'Allows super_admin to create or update doctor shift assignments'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Doctor shift created/updated successfully'
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions' 
  })
  @ApiBody({ type: CreateDoctorShiftDto })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPER_DOC)
  async createOrUpdateShift(
    @Body() createDoctorShiftDto: CreateDoctorShiftDto,
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.doctorShiftService.createOrUpdateShift(
      createDoctorShiftDto,
      user.id,
      requestMetadata
    );
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all doctor shifts',
    description: 'Retrieves all configured doctor shifts'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Doctor shifts retrieved successfully' 
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPER_DOC, UserRole.HEALTHCARE_PROVIDER)
  async getAllShifts() {
    return await this.doctorShiftService.getAllShifts();
  }

  @Get('current-doctor')
  @ApiOperation({ 
    summary: 'Get current active doctor',
    description: 'Returns the doctor ID who should handle consultations at current time'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Current active doctor retrieved successfully' 
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPER_DOC, UserRole.HEALTHCARE_PROVIDER)
  async getCurrentActiveDoctor() {
    const doctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();
    return {
      doctorId,
      timestamp: new Date().toISOString(),
      message: 'Current active doctor retrieved successfully'
    };
  }

  @Patch(':shiftType/status')
  @ApiOperation({ 
    summary: 'Update shift status',
    description: 'Updates the status of a specific shift (active/inactive)'
  })
  @ApiParam({ 
    name: 'shiftType', 
    enum: ShiftType, 
    description: 'Type of shift to update' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Shift status updated successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Shift not found' 
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPER_DOC)
  async updateShiftStatus(
    @Param('shiftType') shiftType: ShiftType,
    @Body() updateData: { status: ShiftStatus },
    @GetUser() user: any,
    @Req() req: Request
  ) {
    const requestMetadata = {
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    return await this.doctorShiftService.updateShiftStatus(
      shiftType,
      updateData.status,
      user.id,
      requestMetadata
    );
  }

  @Post('initialize-defaults')
  @ApiOperation({ 
    summary: 'Initialize default shifts',
    description: 'Creates default morning and evening shifts if none exist'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Default shifts initialized successfully' 
  })
  @Roles(UserRole.SUPER_ADMIN)
  async initializeDefaults() {
    await this.doctorShiftService.initializeDefaultShifts();
    return {
      message: 'Default doctor shifts initialized successfully',
      timestamp: new Date().toISOString()
    };
  }

  @Get('debug')
  @ApiOperation({ 
    summary: 'Get comprehensive shift debugging information',
    description: 'Returns detailed information about current shifts, active shifts, cached vs fresh doctor assignments'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Debug information retrieved successfully' 
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getDebugInfo() {
    return await this.doctorShiftService.getShiftDebugInfo();
  }

  @Post('force-refresh')
  @ApiOperation({ 
    summary: 'Force refresh current doctor assignment',
    description: 'Bypasses cache and forces real-time lookup of current doctor assignment'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Current doctor assignment refreshed successfully' 
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async forceRefreshCurrentDoctor() {
    return await this.doctorShiftService.forceRefreshCurrentDoctor();
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'Health check for doctor shift service'
  })
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'doctor-shift-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}
