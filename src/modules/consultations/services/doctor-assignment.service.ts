import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  InternalServerErrorException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DoctorShiftService } from './doctor-shift.service';
import { CacheService } from '../../../core/cache/cache.service';
import { User, UserDocument, UserRole } from '../../users/schemas/user.schema';

export interface DoctorAssignmentResult {
  doctorId: string;
  doctorInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialization?: string;
    assignedAt: Date;
    assignedBy: 'system' | 'admin' | 'shift_rotation';
  };
  assignmentMetadata: {
    shiftType?: string;
    fallbackUsed: boolean;
    assignmentReason: string;
  };
}

@Injectable()
export class DoctorAssignmentService {
  private readonly logger = new Logger(DoctorAssignmentService.name);
  private readonly CACHE_PREFIX = 'doctor-assignment:';

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private doctorShiftService: DoctorShiftService,
    private cacheService: CacheService,
  ) {}

  /**
   * Assign doctor to consultation based on current shift
   */
  async assignDoctorToConsultation(
    consultationType: string,
    priority: string = 'normal'
  ): Promise<DoctorAssignmentResult> {
    try {
      this.logger.log(`Assigning doctor for consultation type: ${consultationType}, priority: ${priority}`);

      // Get current active doctor from shift system
      const doctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();
      
      if (!doctorId) {
        throw new NotFoundException('No active doctor found for current time');
      }

      // Get doctor information
      const doctorInfo = await this.getDoctorInfo(doctorId);
      
      if (!doctorInfo) {
        throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
      }

      const assignmentResult: DoctorAssignmentResult = {
        doctorId,
        doctorInfo: {
          firstName: doctorInfo.firstName,
          lastName: doctorInfo.lastName,
          email: doctorInfo.email,
          phone: doctorInfo.phone,
          specialization: doctorInfo.specialization || 'General Medicine',
          assignedAt: new Date(),
          assignedBy: 'shift_rotation'
        },
        assignmentMetadata: {
          shiftType: await this.getCurrentShiftType(),
          fallbackUsed: false,
          assignmentReason: 'Assigned based on current doctor shift schedule'
        }
      };

      this.logger.log(`Doctor assigned successfully: ${doctorInfo.firstName} ${doctorInfo.lastName} (${doctorId})`);
      
      return assignmentResult;

    } catch (error) {
      this.logger.error(`Failed to assign doctor: ${error.message}`);
      
      // Fallback to default doctor assignment
      return await this.getFallbackDoctorAssignment(consultationType, priority, error.message);
    }
  }

  /**
   * Get doctor information from database
   */
  private async getDoctorInfo(doctorId: string): Promise<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialization?: string;
  } | null> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}doctor-info:${doctorId}`;
      let cachedInfo = await this.cacheService.get(cacheKey);
      
      if (cachedInfo) {
        return cachedInfo;
      }

      // Query database
      const doctor = await this.userModel
        .findOne({
          _id: new Types.ObjectId(doctorId),
          roles: { $in: [UserRole.HEALTHCARE_PROVIDER] },
          isDeleted: { $ne: true }
        })
        .select('firstName lastName email phone kycDocuments')
        .exec();

      if (!doctor) {
        return null;
      }

      const doctorInfo = {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        email: doctor.email,
        phone: doctor.phone,
        specialization: doctor.kycDocuments?.medicalLicense ? 'Gynecology & Obstetrics' : 'General Medicine'
      };

      // Cache for 1 hour
      await this.cacheService.set(cacheKey, doctorInfo, 3600);
      
      return doctorInfo;

    } catch (error) {
      this.logger.error(`Failed to get doctor info for ${doctorId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get current shift type for metadata
   */
  private async getCurrentShiftType(): Promise<string> {
    try {
      const currentHour = new Date().getHours();
      if (currentHour >= 7 && currentHour < 16) {
        return 'morning';
      } else if (currentHour >= 16 && currentHour <= 23) {
        return 'evening';
      } else {
        return 'night'; // 24-7 hours (currently no night shift configured)
      }
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Fallback doctor assignment when primary assignment fails
   */
  private async getFallbackDoctorAssignment(
    consultationType: string,
    priority: string,
    originalError: string
  ): Promise<DoctorAssignmentResult> {
    try {
      this.logger.warn(`Using fallback doctor assignment due to: ${originalError}`);

      // Default fallback doctors based on time
      const currentHour = new Date().getHours();
      const fallbackDoctorId = currentHour >= 7 && currentHour < 16 
        ? '687664ac2478464bb482b84a' // Dr. Test Madam (Morning)
        : '687656c3e69fa2e8923dbc2c'; // Dr. Sarah Ashar (Evening)

      const doctorInfo = await this.getDoctorInfo(fallbackDoctorId);
      
      if (!doctorInfo) {
        throw new InternalServerErrorException('No fallback doctor available');
      }

      return {
        doctorId: fallbackDoctorId,
        doctorInfo: {
          firstName: doctorInfo.firstName,
          lastName: doctorInfo.lastName,
          email: doctorInfo.email,
          phone: doctorInfo.phone,
          specialization: doctorInfo.specialization || 'General Medicine',
          assignedAt: new Date(),
          assignedBy: 'system'
        },
        assignmentMetadata: {
          shiftType: await this.getCurrentShiftType(),
          fallbackUsed: true,
          assignmentReason: `Fallback assignment used due to: ${originalError}`
        }
      };

    } catch (error) {
      this.logger.error(`Fallback doctor assignment also failed: ${error.message}`);
      throw new InternalServerErrorException('Unable to assign any doctor to consultation');
    }
  }

  /**
   * Validate doctor assignment (for admin override scenarios)
   */
  async validateDoctorAssignment(doctorId: string): Promise<boolean> {
    try {
      const doctor = await this.userModel
        .findOne({
          _id: new Types.ObjectId(doctorId),
          roles: { $in: [UserRole.HEALTHCARE_PROVIDER] },
          accountStatus: 'active',
          isDeleted: { $ne: true }
        })
        .select('_id')
        .exec();

      return !!doctor;
    } catch (error) {
      this.logger.error(`Failed to validate doctor assignment: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all available doctors for manual assignment
   */
  async getAvailableDoctors(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    specialization: string;
    isCurrentlyOnShift: boolean;
  }>> {
    try {
      const doctors = await this.userModel
        .find({
          roles: { $in: [UserRole.HEALTHCARE_PROVIDER] },
          accountStatus: 'active',
          isDeleted: { $ne: true }
        })
        .select('firstName lastName email kycDocuments')
        .exec();

      const currentDoctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();

      return doctors.map(doctor => ({
        id: (doctor._id as any).toString(),
        name: `${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialization: doctor.kycDocuments?.medicalLicense ? 'Gynecology & Obstetrics' : 'General Medicine',
        isCurrentlyOnShift: (doctor._id as any).toString() === currentDoctorId
      }));

    } catch (error) {
      this.logger.error(`Failed to get available doctors: ${error.message}`);
      return [];
    }
  }

  /**
   * Clear doctor assignment cache
   */
  async clearDoctorCache(doctorId?: string): Promise<void> {
    try {
      if (doctorId) {
        const cacheKey = `${this.CACHE_PREFIX}doctor-info:${doctorId}`;
        await this.cacheService.delete(cacheKey);
      } else {
        // Clear all doctor assignment cache - this would need implementation based on your cache service
        this.logger.log('Clearing all doctor assignment cache');
      }
    } catch (error) {
      this.logger.error(`Failed to clear doctor cache: ${error.message}`);
    }
  }
}
