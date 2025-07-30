import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException, 
  ConflictException,
  InternalServerErrorException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DoctorShift, DoctorShiftDocument, ShiftType, ShiftStatus } from '../schemas/doctor-shift.schema';
import { CreateDoctorShiftDto, UpdateDoctorShiftDto } from '../dto/doctor-shift.dto';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';

@Injectable()
export class DoctorShiftService {
  private readonly logger = new Logger(DoctorShiftService.name);
  private readonly CACHE_PREFIX = 'doctor-shift:';

  constructor(
    @InjectModel(DoctorShift.name) private doctorShiftModel: Model<DoctorShiftDocument>,
    private cacheService: CacheService,
    private auditService: AuditService,
  ) {}

  /**
   * Initialize default doctor shifts
   */
  async initializeDefaultShifts(): Promise<void> {
    try {
      const existingShifts = await this.doctorShiftModel.countDocuments();
      
      if (existingShifts === 0) {
        const defaultShifts = [
          {
            shiftType: ShiftType.MORNING,
            doctorId: new Types.ObjectId('687664ac2478464bb482b84a'), // Dr. Test Madam
            startHour: 7,
            endHour: 16,
            status: ShiftStatus.ACTIVE,
            createdBy: new Types.ObjectId('68765a80e69fa2e8923dbc55'), // Super admin
            effectiveFrom: new Date(),
            notes: 'Default morning shift - 7 AM to 4 PM'
          },
          {
            shiftType: ShiftType.EVENING,
            doctorId: new Types.ObjectId('687656c3e69fa2e8923dbc2c'), // Dr. Sarah Ashar
            startHour: 16,
            endHour: 24,
            status: ShiftStatus.ACTIVE,
            createdBy: new Types.ObjectId('68765a80e69fa2e8923dbc55'), // Super admin
            effectiveFrom: new Date(),
            notes: 'Default evening shift - 4 PM to 12 AM'
          }
        ];

        await this.doctorShiftModel.insertMany(defaultShifts);
        this.logger.log('Default doctor shifts initialized');
      }
    } catch (error) {
      this.logger.error('Failed to initialize default shifts:', error.message);
    }
  }

  /**
   * Get active doctor for current time
   */
  async getActiveDoctorForCurrentTime(): Promise<string | null> {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}current-doctor:${currentHour}`;
      let cachedDoctor = await this.cacheService.get(cacheKey);
      
      if (cachedDoctor) {
        return cachedDoctor;
      }

      // Find active shift for current time
      const activeShift = await this.doctorShiftModel.findOne({
        status: ShiftStatus.ACTIVE,
        startHour: { $lte: currentHour },
        endHour: { $gt: currentHour },
        $and: [
          {
            $or: [
              { effectiveFrom: { $lte: now } },
              { effectiveFrom: null }
            ]
          },
          {
            $or: [
              { effectiveTo: { $gte: now } },
              { effectiveTo: null }
            ]
          }
        ]
      }).exec();

      if (!activeShift) {
        // Fallback to default assignments if no active shift found
        const fallbackDoctorId = currentHour >= 7 && currentHour < 16 
          ? '687664ac2478464bb482b84a' // Dr. Test Madam
          : '687656c3e69fa2e8923dbc2c'; // Dr. Sarah Ashar
        
        // Cache for 30 minutes
        await this.cacheService.set(cacheKey, fallbackDoctorId, 1800);
        return fallbackDoctorId;
      }

      const doctorId = activeShift.doctorId.toString();
      
      // Cache for 30 minutes
      await this.cacheService.set(cacheKey, doctorId, 1800);
      
      return doctorId;
    } catch (error) {
      this.logger.error('Failed to get active doctor:', error.message);
      // Return fallback doctor
      const currentHour = new Date().getHours();
      return currentHour >= 7 && currentHour < 16 
        ? '687664ac2478464bb482b84a' 
        : '687656c3e69fa2e8923dbc2c';
    }
  }

  /**
   * Create or update doctor shift
   */
  async createOrUpdateShift(
    createDoctorShiftDto: CreateDoctorShiftDto,
    userId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<DoctorShift> {
    try {
      // Validate doctor exists and is healthcare provider
      await this.validateDoctorExists(createDoctorShiftDto.doctorId);
      
      // Validate time range
      this.validateTimeRange(createDoctorShiftDto.startHour, createDoctorShiftDto.endHour);
      
      // Check for existing shift
      const existingShift = await this.doctorShiftModel.findOne({
        shiftType: createDoctorShiftDto.shiftType
      });

      let shift: DoctorShift;

      if (existingShift) {
        // Update existing shift
        const updateData = {
          ...createDoctorShiftDto,
          updatedBy: new Types.ObjectId(userId),
          effectiveFrom: createDoctorShiftDto.effectiveFrom ? new Date(createDoctorShiftDto.effectiveFrom) : new Date(),
          effectiveTo: createDoctorShiftDto.effectiveTo ? new Date(createDoctorShiftDto.effectiveTo) : null
        };

        const updatedShift = await this.doctorShiftModel.findByIdAndUpdate(
          existingShift._id,
          updateData,
          { new: true }
        ).exec();
        
        if (!updatedShift) {
          throw new InternalServerErrorException('Failed to update shift');
        }
        
        shift = updatedShift;
      } else {
        // Create new shift
        const newShift = new this.doctorShiftModel({
          ...createDoctorShiftDto,
          createdBy: new Types.ObjectId(userId),
          effectiveFrom: createDoctorShiftDto.effectiveFrom ? new Date(createDoctorShiftDto.effectiveFrom) : new Date(),
          effectiveTo: createDoctorShiftDto.effectiveTo ? new Date(createDoctorShiftDto.effectiveTo) : null
        });

        shift = await newShift.save();
      }

      // Clear cache
      await this.clearShiftCache();

      // Log audit event
      await this.auditService.logDataAccess(
        userId,
        'doctor-shifts',
        existingShift ? 'update' : 'create',
        (shift as any)._id.toString(),
        existingShift,
        shift,
        requestMetadata
      );

      this.logger.log(`Doctor shift ${existingShift ? 'updated' : 'created'} successfully: ${(shift as any)._id}`);
      return shift;

    } catch (error) {
      this.logger.error('Failed to create/update doctor shift:', error.message);
      throw new InternalServerErrorException('Failed to manage doctor shift');
    }
  }

  /**
   * Get all doctor shifts
   */
  async getAllShifts(): Promise<DoctorShift[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}all-shifts`;
      let shifts = await this.cacheService.get(cacheKey);
      
      if (!shifts) {
        shifts = await this.doctorShiftModel
          .find()
          .populate('doctorId', 'firstName lastName email specialization')
          .populate('createdBy', 'firstName lastName email')
          .populate('updatedBy', 'firstName lastName email')
          .sort({ shiftType: 1, createdAt: -1 })
          .exec();
        
        // Cache for 10 minutes
        await this.cacheService.set(cacheKey, shifts, 600);
      }

      return shifts;
    } catch (error) {
      this.logger.error('Failed to get all shifts:', error.message);
      throw new InternalServerErrorException('Failed to fetch doctor shifts');
    }
  }

  /**
   * Update shift status
   */
  async updateShiftStatus(
    shiftType: ShiftType,
    status: ShiftStatus,
    userId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<DoctorShift> {
    try {
      const shift = await this.doctorShiftModel.findOne({ shiftType });
      
      if (!shift) {
        throw new NotFoundException(`Shift with type ${shiftType} not found`);
      }

      const updatedShift = await this.doctorShiftModel.findByIdAndUpdate(
        shift._id,
        { 
          status,
          updatedBy: new Types.ObjectId(userId)
        },
        { new: true }
      ).exec();

      if (!updatedShift) {
        throw new InternalServerErrorException('Failed to update shift status');
      }

      // Clear cache
      await this.clearShiftCache();

      // Log audit event
      await this.auditService.logDataAccess(
        userId,
        'doctor-shifts',
        'update',
        (shift as any)._id.toString(),
        shift,
        updatedShift,
        requestMetadata
      );

      this.logger.log(`Doctor shift status updated: ${(shift as any)._id}`);
      return updatedShift;

    } catch (error) {
      this.logger.error('Failed to update shift status:', error.message);
      throw error;
    }
  }

  // Private helper methods
  private async validateDoctorExists(doctorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID format');
    }
    // Additional validation logic for doctor existence and role can be added here
  }

  private validateTimeRange(startHour: number, endHour: number): void {
    if (startHour >= endHour) {
      throw new BadRequestException('Start hour must be less than end hour');
    }
    
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      throw new BadRequestException('Hours must be between 0 and 23');
    }
  }

  private async clearShiftCache(): Promise<void> {
    try {
      // Clear all shift-related cache keys
      await this.cacheService.delete(`${this.CACHE_PREFIX}all-shifts`);
      
      // Clear current doctor cache for all hours
      for (let hour = 0; hour < 24; hour++) {
        await this.cacheService.delete(`${this.CACHE_PREFIX}current-doctor:${hour}`);
      }
    } catch (error) {
      this.logger.error('Failed to clear shift cache:', error.message);
    }
  }
}
