import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  UpdateDoctorProfessionalInfoDto,
  UpdateMedicalLicenseDto,
  UpdateAvailabilityDto,
  DoctorProfessionalInfoResponseDto,
  ProfileCompletionStatusDto,
  ValidateLicenseDto,
  LicenseValidationResponseDto,
  LicenseVerificationStatus,
} from '../dto/doctor-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { AuditService } from '../../../security/audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private auditService: AuditService,
  ) {}

  async getDoctorProfile(id: string): Promise<DoctorProfessionalInfoResponseDto> {
    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('Doctor not found');
    }

    if (!user.roles.includes(UserRole.HEALTHCARE_PROVIDER)) {
      throw new ForbiddenException('User is not a healthcare provider');
    }

    return this.mapToDoctorProfileResponse(user);
  }

  async updateProfessionalInfo(
    userId: string,
    updateDto: UpdateDoctorProfessionalInfoDto,
    adminUserId?: string,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    // Validate ObjectId
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.roles.includes(UserRole.HEALTHCARE_PROVIDER)) {
      throw new ForbiddenException('User is not a healthcare provider');
    }

    // Store old values for audit
    const oldProfessionalInfo = { ...user.professionalInfo };

    // Validate availability slots don't overlap
    if (updateDto.availableSlots) {
      this.validateAvailabilitySlots(updateDto.availableSlots);
    }

    // Update professional info (handle type conversion safely)
    user.professionalInfo = { 
      ...user.professionalInfo, 
      ...updateDto,
      // Convert qualification array properly
      qualification: updateDto.qualification?.map(q => 
        typeof q === 'string' ? q : `${q.degree} from ${q.institution} (${q.year})`
      ) || user.professionalInfo?.qualification,
    } as any;
    user.lastProfileUpdate = new Date();
    await user.save();

    // Create audit log
    await this.auditService.logDataAccess(
      adminUserId || userId,
      'User',
      'update',
      userId,
      oldProfessionalInfo,
      user.professionalInfo,
    );

    return this.mapToDoctorProfileResponse(user);
  }

  async updateAvailability(
    userId: string,
    updateDto: UpdateAvailabilityDto,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    // Validate ObjectId
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.roles.includes(UserRole.HEALTHCARE_PROVIDER)) {
      throw new ForbiddenException('User is not a healthcare provider');
    }

    // Store old values for audit
    const oldAvailability = [...(user.professionalInfo?.availableSlots || [])];

    // Validate availability slots don't overlap
    this.validateAvailabilitySlots(updateDto.availableSlots);

    // Update availability
    if (!user.professionalInfo) {
      user.professionalInfo = {};
    }
    user.professionalInfo.availableSlots = updateDto.availableSlots;
    user.lastProfileUpdate = new Date();
    await user.save();

    // Create audit log
    await this.auditService.logDataAccess(
      userId,
      'User',
      'update',
      userId,
      { availableSlots: oldAvailability },
      { availableSlots: updateDto.availableSlots },
    );

    return this.mapToDoctorProfileResponse(user);
  }

  async updateMedicalLicense(
    userId: string,
    updateDto: UpdateMedicalLicenseDto,
    adminUserId: string,
  ): Promise<DoctorProfessionalInfoResponseDto> {
    // Validate ObjectId
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Doctor not found');
    }

    if (!user.roles.includes(UserRole.HEALTHCARE_PROVIDER)) {
      throw new ForbiddenException('User is not a healthcare provider');
    }

    // Store old values for audit
    const oldKycDocuments = { ...user.kycDocuments };

    // Update medical license
    user.kycDocuments = {
      ...user.kycDocuments,
      medicalLicense: updateDto.medicalLicenseNumber,
      verificationStatus: 'pending' as any,
    };
    
    // Add professional info if updating license details
    if (!user.professionalInfo) {
      user.professionalInfo = {};
    }
    user.professionalInfo.medicalLicenseNumber = updateDto.medicalLicenseNumber;
    
    user.lastProfileUpdate = new Date();
    await user.save();

    // Create audit log
    await this.auditService.logAdminAction(
      adminUserId,
      'UPDATE_MEDICAL_LICENSE',
      userId,
      { 
        oldKycDocuments: oldKycDocuments,
        newKycDocuments: user.kycDocuments,
        medicalLicenseNumber: updateDto.medicalLicenseNumber 
      },
    );

    return this.mapToDoctorProfileResponse(user);
  }

  async validateLicense(
    validateDto: ValidateLicenseDto,
  ): Promise<LicenseValidationResponseDto> {
    const { licenseNumber, issuingAuthority } = validateDto;

    // Placeholder for actual validation logic
    const isValid = true; // Assume always true for demo purposes

    // Find the doctor by license number
    const user = await this.userModel.findOne({
      'kycDocuments.medicalLicense': licenseNumber,
    });
    
    if (!user) {
      throw new NotFoundException('Doctor with this license not found');
    }

    // Update verification status if valid
    if (isValid) {
      const updateData = {
        'kycDocuments.verificationStatus': 'verified',
        'kycDocuments.verifiedAt': new Date(),
      };
      
      const updatedUser = await this.userModel.findOneAndUpdate(
        { 'kycDocuments.medicalLicense': licenseNumber },
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      if (!updatedUser) {
        throw new NotFoundException('Failed to update user - user not found during update');
      }
      
      // Create audit log
      try {
        await this.auditService.logAdminAction(
          'system', // We don't have admin user ID in this context
          'VALIDATE_LICENSE',
          (user._id as any).toString(),
          {
            licenseNumber,
            issuingAuthority,
            verificationStatus: 'verified',
            verifiedAt: new Date()
          },
        );
      } catch (auditError) {
        // Don't fail the main operation if audit fails
        console.log('Audit log failed:', auditError.message);
      }
    }

    return {
      isValid,
      status: isValid
        ? LicenseVerificationStatus.VERIFIED
        : LicenseVerificationStatus.REJECTED,
      message: isValid ? 'License is valid and verified' : 'License is invalid',
    };
  }

  async getProfileCompletionStatus(
    userId: string,
  ): Promise<ProfileCompletionStatusDto> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Doctor not found');

    const completion = this.calculateProfileCompletion(user);
    return completion;
  }

  private mapToDoctorProfileResponse(
    user: UserDocument,
  ): DoctorProfessionalInfoResponseDto {
    const profile: DoctorProfessionalInfoResponseDto = {
      id: (user._id as any).toString(),
      basicInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        profilePicture: user.profilePicture,
      },
      professionalInfo: {
        ...user.professionalInfo,
        // Convert strings to proper enum types
        specialization: user.professionalInfo?.specialization as any,
        licenseVerificationStatus: (user.kycDocuments?.verificationStatus as LicenseVerificationStatus) || LicenseVerificationStatus.PENDING,
        licenseVerifiedAt: user.kycDocuments?.verifiedAt,
        licenseVerifiedBy: user.kycDocuments?.verifiedBy,
        profileCompletionPercentage: this.calculateProfileCompletion(user)
          .completionPercentage,
        lastUpdated: user.lastProfileUpdate || new Date(),
      } as any,
      verificationStatus: {
        isProfileComplete: this.isProfileComplete(user),
        isLicenseVerified:
          user.kycDocuments?.verificationStatus === 'verified',
        canAcceptConsultations: this.isProfileComplete(user),
      },
    };
    return profile;
  }

  private calculateProfileCompletion(
    user: UserDocument,
  ): ProfileCompletionStatusDto {
    const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
    const missingFields = requiredFields.filter((field) => !user[field]);
    const optionalFields = ['specialization', 'experience'];
    const filledOptionalFields = optionalFields.filter(
      (field) => user.professionalInfo[field],
    );
    const completionPercentage =
      ((requiredFields.length - missingFields.length +
        filledOptionalFields.length) /
        (requiredFields.length + optionalFields.length)) *
      100;

    return {
      completionPercentage,
      missingFields,
      optionalFields: optionalFields.filter((field) => !user.professionalInfo[field]),
      canAcceptConsultations: completionPercentage >= 75,
    };
  }

  private isProfileComplete(user: UserDocument): boolean {
    return this.calculateProfileCompletion(user).completionPercentage >= 75;
  }

  private validateAvailabilitySlots(slots: any[]): void {
    const slotsPerDay = new Map<string, { start: string; end: string }[]>();

    // Group slots by day
    slots.forEach((slot) => {
      if (!slotsPerDay.has(slot.day)) {
        slotsPerDay.set(slot.day, []);
      }
      slotsPerDay.get(slot.day)!.push({
        start: slot.startTime,
        end: slot.endTime,
      });
    });

    // Check for overlaps within each day
    slotsPerDay.forEach((daySlots, day) => {
      for (let i = 0; i < daySlots.length; i++) {
        for (let j = i + 1; j < daySlots.length; j++) {
          if (this.slotsOverlap(daySlots[i], daySlots[j])) {
            throw new BadRequestException(
              `Overlapping availability slots found for ${day}`,
            );
          }
        }
      }
    });
  }

  private slotsOverlap(
    slot1: { start: string; end: string },
    slot2: { start: string; end: string },
  ): boolean {
    const start1 = this.timeToMinutes(slot1.start);
    const end1 = this.timeToMinutes(slot1.end);
    const start2 = this.timeToMinutes(slot2.start);
    const end2 = this.timeToMinutes(slot2.end);

    return start1 < end2 && start2 < end1;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

