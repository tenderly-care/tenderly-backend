import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  IsEnum,
  Min,
  Max,
  ValidateNested,
  IsNotEmpty,
  ArrayMinSize,
  IsObject,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Enums for better type safety
export enum Specialization {
  GENERAL_MEDICINE = 'general_medicine',
  CARDIOLOGY = 'cardiology',
  DERMATOLOGY = 'dermatology',
  ENDOCRINOLOGY = 'endocrinology',
  GASTROENTEROLOGY = 'gastroenterology',
  GYNECOLOGY = 'gynecology',
  NEUROLOGY = 'neurology',
  ORTHOPEDICS = 'orthopedics',
  PEDIATRICS = 'pediatrics',
  PSYCHIATRY = 'psychiatry',
  PULMONOLOGY = 'pulmonology',
  RADIOLOGY = 'radiology',
  UROLOGY = 'urology',
  ONCOLOGY = 'oncology',
  OPHTHALMOLOGY = 'ophthalmology',
  ENT = 'ent',
  ANESTHESIOLOGY = 'anesthesiology',
  EMERGENCY_MEDICINE = 'emergency_medicine',
}

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

export enum LicenseVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// Nested DTOs
export class AvailabilitySlotDto {
  @ApiProperty({
    example: 'monday',
    enum: DayOfWeek,
    description: 'Day of the week',
  })
  @IsEnum(DayOfWeek)
  day: DayOfWeek;

  @ApiProperty({
    example: '09:00',
    description: 'Start time in HH:MM format (24-hour)',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:MM format (24-hour)',
  })
  startTime: string;

  @ApiProperty({
    example: '17:00',
    description: 'End time in HH:MM format (24-hour)',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:MM format (24-hour)',
  })
  endTime: string;
}

export class QualificationDto {
  @ApiProperty({
    example: 'MBBS',
    description: 'Qualification name',
  })
  @IsString()
  @IsNotEmpty()
  degree: string;

  @ApiProperty({
    example: 'All India Institute of Medical Sciences',
    description: 'Institution name',
  })
  @IsString()
  @IsNotEmpty()
  institution: string;

  @ApiProperty({
    example: 2015,
    description: 'Year of completion',
  })
  @IsNumber()
  @Min(1950)
  @Max(new Date().getFullYear())
  year: number;
}

// Main DTOs
export class GetDoctorProfileDto {
  @ApiProperty({ description: 'Doctor user ID' })
  @IsString()
  @IsNotEmpty()
  doctorId: string;
}

export class UpdateDoctorProfessionalInfoDto {
  @ApiProperty({
    example: ['general_medicine', 'cardiology'],
    enum: Specialization,
    isArray: true,
    description: 'Medical specializations',
  })
  @IsArray()
  @IsEnum(Specialization, { each: true })
  @ArrayMinSize(1)
  @IsOptional()
  specialization?: Specialization[];

  @ApiProperty({
    example: 8,
    description: 'Years of medical experience',
  })
  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  experience?: number;

  @ApiProperty({
    example: [
      {
        degree: 'MBBS',
        institution: 'All India Institute of Medical Sciences',
        year: 2015,
      },
    ],
    type: [QualificationDto],
    description: 'Educational qualifications',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualificationDto)
  @IsOptional()
  qualification?: QualificationDto[];

  @ApiProperty({
    example: 'Apollo Hospital, Delhi',
    description: 'Primary work location',
  })
  @IsString()
  @IsOptional()
  workLocation?: string;

  @ApiProperty({
    example: 'Cardiology Department',
    description: 'Department or unit',
  })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({
    example: 'Senior Consultant',
    description: 'Professional designation',
  })
  @IsString()
  @IsOptional()
  designation?: string;

  @ApiProperty({
    example: 1500,
    description: 'Consultation fee in INR',
  })
  @IsNumber()
  @Min(100)
  @Max(10000)
  @IsOptional()
  consultationFee?: number;

  @ApiProperty({
    example: [
      {
        day: 'monday',
        startTime: '09:00',
        endTime: '17:00',
      },
    ],
    type: [AvailabilitySlotDto],
    description: 'Available consultation slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  @IsOptional()
  availableSlots?: AvailabilitySlotDto[];

  @ApiProperty({
    example: '+919876543210',
    description: 'Professional contact number',
  })
  @IsPhoneNumber('IN')
  @IsOptional()
  professionalPhone?: string;

  @ApiProperty({
    example: 'dr.john@hospital.com',
    description: 'Professional email address',
  })
  @IsEmail()
  @IsOptional()
  professionalEmail?: string;

  @ApiProperty({
    example: 'Brief about doctor specialization and approach to patient care',
    description: 'Professional biography',
  })
  @IsString()
  @IsOptional()
  biography?: string;

  @ApiProperty({
    example: ['English', 'Hindi', 'Bengali'],
    description: 'Languages spoken',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languagesSpoken?: string[];
}

export class UpdateMedicalLicenseDto {
  @ApiProperty({
    example: 'MCI/12345/2015',
    description: 'Medical license number',
  })
  @IsString()
  @IsNotEmpty()
  medicalLicenseNumber: string;

  @ApiProperty({
    example: 'Medical Council of India',
    description: 'Issuing authority',
  })
  @IsString()
  @IsNotEmpty()
  issuingAuthority: string;

  @ApiProperty({
    example: '2025-12-31',
    description: 'License expiry date (YYYY-MM-DD)',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Expiry date must be in YYYY-MM-DD format',
  })
  @IsOptional()
  expiryDate?: string;

  @ApiProperty({
    example: 'Karnataka',
    description: 'State/region of license validity',
  })
  @IsString()
  @IsNotEmpty()
  stateOfPractice: string;
}

export class UpdateAvailabilityDto {
  @ApiProperty({
    example: [
      {
        day: 'monday',
        startTime: '09:00',
        endTime: '17:00',
      },
      {
        day: 'tuesday',
        startTime: '10:00',
        endTime: '18:00',
      },
    ],
    type: [AvailabilitySlotDto],
    description: 'Available consultation slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  @ArrayMinSize(1)
  availableSlots: AvailabilitySlotDto[];
}

export class ValidateLicenseDto {
  @ApiProperty({
    example: 'MCI/12345/2015',
    description: 'Medical license number to validate',
  })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiProperty({
    example: 'Medical Council of India',
    description: 'Issuing authority',
  })
  @IsString()
  @IsNotEmpty()
  issuingAuthority: string;
}

// Response DTOs
export class DoctorProfessionalInfoResponseDto {
  @ApiProperty({ description: 'Doctor ID' })
  id: string;

  @ApiProperty({ description: 'Basic user information' })
  basicInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    profilePicture?: string;
  };

  @ApiProperty({ description: 'Professional information' })
  professionalInfo: {
    medicalLicenseNumber?: string;
    licenseVerificationStatus: LicenseVerificationStatus;
    licenseVerifiedAt?: Date;
    licenseVerifiedBy?: string;
    specialization?: Specialization[];
    experience?: number;
    qualification?: QualificationDto[];
    workLocation?: string;
    department?: string;
    designation?: string;
    consultationFee?: number;
    availableSlots?: AvailabilitySlotDto[];
    professionalPhone?: string;
    professionalEmail?: string;
    biography?: string;
    languagesSpoken?: string[];
    profileCompletionPercentage: number;
    lastUpdated: Date;
  };

  @ApiProperty({ description: 'Verification status' })
  verificationStatus: {
    isProfileComplete: boolean;
    isLicenseVerified: boolean;
    canAcceptConsultations: boolean;
    verificationNotes?: string;
  };
}

export class LicenseValidationResponseDto {
  @ApiProperty({ description: 'Whether the license is valid' })
  isValid: boolean;

  @ApiProperty({ description: 'Validation status' })
  status: LicenseVerificationStatus;

  @ApiProperty({ description: 'Validation message' })
  message: string;

  @ApiProperty({ description: 'License details if valid' })
  licenseDetails?: {
    licenseNumber: string;
    doctorName: string;
    issuingAuthority: string;
    issueDate: string;
    expiryDate: string;
    status: string;
  };
}

export class ProfileCompletionStatusDto {
  @ApiProperty({ description: 'Overall completion percentage' })
  completionPercentage: number;

  @ApiProperty({ description: 'Missing required fields' })
  missingFields: string[];

  @ApiProperty({ description: 'Optional fields that can be added' })
  optionalFields: string[];

  @ApiProperty({ description: 'Whether profile is complete enough for consultations' })
  canAcceptConsultations: boolean;
}
