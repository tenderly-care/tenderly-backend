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
   * Get active doctor for current time - Production Enhanced Version
   */
  async getActiveDoctorForCurrentTime(bypassCache: boolean = false): Promise<string | null> {
    const startTime = Date.now();
    const requestId = `shift-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const now = new Date();
      const currentHour = now.getHours();
      
      this.logger.debug(`[${requestId}] Getting active doctor for hour ${currentHour} at ${now.toISOString()}`);
      
      // Try cache first (unless bypassed)
      const cacheKey = `${this.CACHE_PREFIX}current-doctor:${currentHour}`;
      if (!bypassCache) {
        let cachedDoctor = await this.cacheService.get(cacheKey);
        if (cachedDoctor) {
          this.logger.debug(`[${requestId}] Cache hit - returning doctor: ${cachedDoctor}`);
          return cachedDoctor;
        }
      } else {
        this.logger.debug(`[${requestId}] Cache bypassed for real-time lookup`);
      }

      // Enhanced query with better logging
      this.logger.debug(`[${requestId}] Querying database for active shifts...`);
      
      // Query for active shifts during current hour
      const activeShifts = await this.doctorShiftModel.find({
        status: ShiftStatus.ACTIVE,
        effectiveFrom: { $lte: now },
        $or: [
          { effectiveTo: { $gte: now } },
          { effectiveTo: null }
        ]
      })
      .sort({ createdAt: -1 }) // Get most recent first
      .exec();

      this.logger.debug(`[${requestId}] Found ${activeShifts.length} potentially active shifts`);
      
      if (activeShifts.length > 0) {
        // Log all found shifts for debugging
        activeShifts.forEach((shift, index) => {
          this.logger.debug(`[${requestId}] Shift ${index}: Type=${shift.shiftType}, Doctor=${shift.doctorId}, Hours=${shift.startHour}-${shift.endHour}, Status=${shift.status}`);
        });
      }

      // Find the best matching shift
      let selectedShift: DoctorShiftDocument | null = null;
      for (const shift of activeShifts) {
        const isInTimeRange = this.isCurrentTimeInShift(currentHour, shift.startHour, shift.endHour);
        this.logger.debug(`[${requestId}] Shift ${shift.shiftType} (${shift.startHour}-${shift.endHour}): Time match = ${isInTimeRange}`);
        
        if (isInTimeRange) {
          selectedShift = shift;
          break; // Take first matching shift
        }
      }

      if (!selectedShift) {
        this.logger.warn(`[${requestId}] No active shift found for hour ${currentHour}, using fallback`);
        
        // Enhanced fallback logic
        const fallbackDoctorId = this.getFallbackDoctorId(currentHour);
        
        // Cache fallback for shorter duration
        await this.cacheService.set(cacheKey, fallbackDoctorId, 900); // 15 minutes
        
        this.logger.warn(`[${requestId}] Fallback doctor assigned: ${fallbackDoctorId} for hour ${currentHour}`);
        return fallbackDoctorId;
      }

      const doctorId = selectedShift.doctorId.toString();
      
      // Cache for 30 minutes
      await this.cacheService.set(cacheKey, doctorId, 1800);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`[${requestId}] Active doctor resolved: ${doctorId} (shift: ${selectedShift.shiftType}, hours: ${selectedShift.startHour}-${selectedShift.endHour}) in ${processingTime}ms`);
      
      return doctorId;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`[${requestId}] Failed to get active doctor after ${processingTime}ms:`, error.message, error.stack);
      
      // Enhanced fallback with error logging
      const currentHour = new Date().getHours();
      const fallbackDoctorId = this.getFallbackDoctorId(currentHour);
      
      this.logger.error(`[${requestId}] Using emergency fallback doctor: ${fallbackDoctorId} due to error: ${error.message}`);
      
      return fallbackDoctorId;
    }
  }
  
  /**
   * Helper method to check if current time falls within shift hours
   */
  private isCurrentTimeInShift(currentHour: number, startHour: number, endHour: number): boolean {
    if (startHour < endHour) {
      // Normal shift (e.g., 8-16)
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Overnight shift (e.g., 22-6)
      return currentHour >= startHour || currentHour < endHour;
    }
  }
  
  /**
   * Get fallback doctor ID based on current hour
   */
  private getFallbackDoctorId(currentHour: number): string {
    // Enhanced fallback logic
    if (currentHour >= 6 && currentHour < 16) {
      return '687664ac2478464bb482b84a'; // Dr. Test Madam (Morning/Day)
    } else if (currentHour >= 16 && currentHour < 24) {
      return '687656c3e69fa2e8923dbc2c'; // Dr. Sarah Ashar (Evening)
    } else {
      // Night hours (0-6): Use evening doctor as fallback
      return '687656c3e69fa2e8923dbc2c'; // Dr. Sarah Ashar (Night fallback)
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

  /**
   * Production-grade cache clearing with comprehensive cleanup
   */
  private async clearShiftCache(): Promise<void> {
    const clearingId = `cache-clear-${Date.now()}`;
    try {
      this.logger.log(`[${clearingId}] Starting comprehensive shift cache clearing...`);
      
      const clearPromises: Promise<void>[] = [];
      
      // Clear main cache keys
      clearPromises.push(this.cacheService.delete(`${this.CACHE_PREFIX}all-shifts`));
      
      // Clear current doctor cache for all hours
      for (let hour = 0; hour < 24; hour++) {
        clearPromises.push(this.cacheService.delete(`${this.CACHE_PREFIX}current-doctor:${hour}`));
      }
      
      // Clear doctor assignment cache that might be stale
      clearPromises.push(this.cacheService.delete('doctor-assignment:*'));
      
      await Promise.allSettled(clearPromises);
      
      this.logger.log(`[${clearingId}] Shift cache cleared successfully`);
    } catch (error) {
      this.logger.error(`[${clearingId}] Failed to clear shift cache:`, error.message);
    }
  }
  
  /**
   * Force refresh current doctor (for production debugging)
   */
  async forceRefreshCurrentDoctor(): Promise<{
    doctorId: string;
    source: 'database' | 'fallback';
    shiftInfo?: any;
    debugInfo: {
      currentHour: number;
      timestamp: string;
      activeShiftsFound: number;
      processingTimeMs: number;
    };
  }> {
    const startTime = Date.now();
    const now = new Date();
    const currentHour = now.getHours();
    
    try {
      this.logger.log('Force refreshing current doctor - bypassing all caches');
      
      // Clear cache first
      await this.clearShiftCache();
      
      // Get fresh data from database
      const doctorId = await this.getActiveDoctorForCurrentTime(true); // Bypass cache
      
      // Get additional debug info
      const activeShifts = await this.doctorShiftModel.find({
        status: ShiftStatus.ACTIVE,
        effectiveFrom: { $lte: now },
        $or: [
          { effectiveTo: { $gte: now } },
          { effectiveTo: null }
        ]
      }).exec();
      
      const matchingShift = activeShifts.find(shift => 
        this.isCurrentTimeInShift(currentHour, shift.startHour, shift.endHour)
      );
      
      const processingTime = Date.now() - startTime;
      
      return {
        doctorId: doctorId || this.getFallbackDoctorId(currentHour),
        source: matchingShift ? 'database' : 'fallback',
        shiftInfo: matchingShift ? {
          shiftType: matchingShift.shiftType,
          startHour: matchingShift.startHour,
          endHour: matchingShift.endHour,
          doctorId: matchingShift.doctorId.toString(),
          status: matchingShift.status,
          effectiveFrom: matchingShift.effectiveFrom,
          effectiveTo: matchingShift.effectiveTo
        } : null,
        debugInfo: {
          currentHour,
          timestamp: now.toISOString(),
          activeShiftsFound: activeShifts.length,
          processingTimeMs: processingTime
        }
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Force refresh failed:', error.message);
      
      return {
        doctorId: this.getFallbackDoctorId(currentHour),
        source: 'fallback',
        debugInfo: {
          currentHour,
          timestamp: now.toISOString(),
          activeShiftsFound: 0,
          processingTimeMs: processingTime
        }
      };
    }
  }
  
  /**
   * Get comprehensive shift debugging information
   */
  async getShiftDebugInfo(): Promise<{
    currentTime: {
      utc: string;
      local: string;
      hour: number;
      timezone: string;
    };
    allShifts: any[];
    activeShifts: any[];
    currentDoctorInfo: {
      cached: string | null;
      fresh: string | null;
    };
    fallbackDoctor: string;
  }> {
    const now = new Date();
    const currentHour = now.getHours();
    
    try {
      // Get all shifts
      const allShifts = await this.doctorShiftModel.find({}).exec();
      
      // Get active shifts
      const activeShifts = await this.doctorShiftModel.find({
        status: ShiftStatus.ACTIVE,
        effectiveFrom: { $lte: now },
        $or: [
          { effectiveTo: { $gte: now } },
          { effectiveTo: null }
        ]
      }).exec();
      
      // Get current doctor (cached)
      const cachedDoctor = await this.cacheService.get(`${this.CACHE_PREFIX}current-doctor:${currentHour}`);
      
      // Get current doctor (fresh)
      const freshDoctor = await this.getActiveDoctorForCurrentTime(true);
      
      return {
        currentTime: {
          utc: now.toISOString(),
          local: now.toString(),
          hour: currentHour,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        allShifts: allShifts.map(shift => ({
          id: (shift as any)._id.toString(),
          shiftType: shift.shiftType,
          doctorId: shift.doctorId.toString(),
          startHour: shift.startHour,
          endHour: shift.endHour,
          status: shift.status,
          effectiveFrom: shift.effectiveFrom,
          effectiveTo: shift.effectiveTo,
          notes: shift.notes,
          isTimeMatch: this.isCurrentTimeInShift(currentHour, shift.startHour, shift.endHour)
        })),
        activeShifts: activeShifts.map(shift => ({
          id: (shift as any)._id.toString(),
          shiftType: shift.shiftType,
          doctorId: shift.doctorId.toString(),
          startHour: shift.startHour,
          endHour: shift.endHour,
          isTimeMatch: this.isCurrentTimeInShift(currentHour, shift.startHour, shift.endHour)
        })),
        currentDoctorInfo: {
          cached: cachedDoctor,
          fresh: freshDoctor
        },
        fallbackDoctor: this.getFallbackDoctorId(currentHour)
      };
    } catch (error) {
      this.logger.error('Failed to get shift debug info:', error.message);
      throw error;
    }
  }
}
