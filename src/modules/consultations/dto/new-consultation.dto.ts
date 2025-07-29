import { 
  IsNotEmpty, 
  IsOptional, 
  IsEnum, 
  IsNumber, 
  IsArray, 
  IsString, 
  IsObject, 
  IsBoolean,
  IsDateString,
  ValidateNested,
  Min,
  Max
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationType, ConsultationStatus } from '../schemas/consultation.schema';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

// Patient Profile DTOs
export class DemographicDataDto {
  @ApiProperty({ example: 25, description: 'Patient age' })
  @IsNotEmpty()
  @IsNumber()
  @Min(12)
  @Max(100)
  age: number;

  @ApiProperty({ example: 'Jane Smith', description: 'Patient full name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'New York, NY', description: 'Patient location' })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other', 'prefer_not_to_say'] })
  @IsOptional()
  @IsEnum(['male', 'female', 'other', 'prefer_not_to_say'])
  gender?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: Date;
}

export class MenstrualHistoryDto {
  @ApiProperty({ example: 28, description: 'Cycle frequency in days' })
  @IsNotEmpty()
  @IsNumber()
  @Min(21)
  @Max(35)
  cycleFrequency: number;

  @ApiProperty({ example: 13, description: 'Age at first menstruation' })
  @IsNotEmpty()
  @IsNumber()
  @Min(8)
  @Max(18)
  menarcheAge: number;

  @ApiProperty({ example: 5, description: 'Period duration in days' })
  @IsNotEmpty()
  @IsNumber()
  @Min(2)
  @Max(10)
  periodDuration: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDateString()
  lastPeriodDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRegular?: boolean;

  @ApiPropertyOptional({ enum: ['light', 'normal', 'heavy'] })
  @IsOptional()
  @IsEnum(['light', 'normal', 'heavy'])
  flowIntensity?: string;
}

export class CreatePatientProfileDto {
  @ApiProperty({ type: DemographicDataDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => DemographicDataDto)
  demographicData: DemographicDataDto;

  @ApiPropertyOptional({ type: [String], example: ['penicillin', 'latex'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: MenstrualHistoryDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MenstrualHistoryDto)
  menstrualHistory?: MenstrualHistoryDto;

  @ApiPropertyOptional({ type: [String], example: ['ibuprofen', 'birth control'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ type: [String], example: ['diabetes', 'hypertension'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medical_conditions?: string[];

  @ApiPropertyOptional({ type: [String], example: ['heart disease', 'breast cancer'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  familyMedicalHistory?: string[];
}

// Symptom Screening DTOs
export class InitialSymptomsDto {
  @ApiProperty({ type: [String], example: ['vaginal discharge', 'itching'] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  primary_symptoms: string[];

  @ApiProperty({ example: 25 })
  @IsNotEmpty()
  @IsNumber()
  @Min(12)
  @Max(100)
  patient_age: number;

  @ApiProperty({ example: 3, description: 'Severity level 1-5' })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  severity_level: number;

  @ApiProperty({ example: '3 days' })
  @IsNotEmpty()
  @IsString()
  duration: string;

  @ApiProperty({ example: 'sudden', enum: ['sudden', 'gradual', 'chronic'] })
  @IsNotEmpty()
  @IsEnum(['sudden', 'gradual', 'chronic'])
  onset: string;

  @ApiProperty({ example: 'stable', enum: ['stable', 'improving', 'worsening', 'fluctuating'] })
  @IsNotEmpty()
  @IsEnum(['stable', 'improving', 'worsening', 'fluctuating'])
  progression: string;
}

export class CreateSymptomScreeningDto {
  @ApiProperty({ type: InitialSymptomsDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => InitialSymptomsDto)
  initialSymptoms: InitialSymptomsDto;
}

// Detailed Consultation DTOs
export class PrimaryComplaintDto {
  @ApiProperty({ example: 'vaginal discharge' })
  @IsNotEmpty()
  @IsString()
  main_symptom: string;

  @ApiProperty({ example: '3 days' })
  @IsNotEmpty()
  @IsString()
  duration: string;

  @ApiProperty({ example: 'moderate', enum: ['mild', 'moderate', 'severe'] })
  @IsNotEmpty()
  @IsEnum(['mild', 'moderate', 'severe'])
  severity: string;

  @ApiProperty({ example: 'sudden', enum: ['sudden', 'gradual', 'chronic'] })
  @IsNotEmpty()
  @IsEnum(['sudden', 'gradual', 'chronic'])
  onset: string;

  @ApiProperty({ example: 'stable', enum: ['stable', 'improving', 'worsening', 'fluctuating'] })
  @IsNotEmpty()
  @IsEnum(['stable', 'improving', 'worsening', 'fluctuating'])
  progression: string;
}

export class ReproductiveHistoryDto {
  @ApiProperty({ type: Object })
  @IsNotEmpty()
  @IsObject()
  pregnancy_status: {
    could_be_pregnant: boolean;
    pregnancy_test_result: string;
  };

  @ApiProperty({ type: Object })
  @IsNotEmpty()
  @IsObject()
  sexual_activity: {
    sexually_active: boolean;
    contraception_method: string;
  };

  @ApiProperty({ type: Object })
  @IsNotEmpty()
  @IsObject()
  menstrual_history: {
    menarche_age: number;
    cycle_frequency: number;
    period_duration: number;
  };
}

export class MedicalContextDto {
  @ApiProperty({ type: [String] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  current_medications: string[];

  @ApiProperty({ type: [String] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  recent_medications: string[];

  @ApiProperty({ type: [String] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  medical_conditions: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previous_gynecological_issues?: string[];

  @ApiProperty({ type: [String], description: 'CRITICAL FOR SAFETY' })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  allergies: string[];

  @ApiProperty({ type: [String] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  family_history: string[];
}

export class PatientConcernsDto {
  @ApiProperty({ example: 'Concerned about infection' })
  @IsNotEmpty()
  @IsString()
  main_worry: string;

  @ApiProperty({ example: 'Significant impact on daily activities' })
  @IsNotEmpty()
  @IsString()
  impact_on_life: string;

  @ApiPropertyOptional({ example: 'Additional notes about symptoms' })
  @IsOptional()
  @IsString()
  additional_notes?: string;
}

export class DetailedSymptomsDto {
  @ApiProperty({ type: PrimaryComplaintDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => PrimaryComplaintDto)
  primary_complaint: PrimaryComplaintDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  symptom_specific_details?: {
    symptom_characteristics: Record<string, any>;
    filled_by: string;
    filled_at: Date;
    schema_version?: string;
  };

  @ApiPropertyOptional({ type: ReproductiveHistoryDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReproductiveHistoryDto)
  reproductive_history?: ReproductiveHistoryDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  associated_symptoms?: {
    pain?: {
      pelvic_pain: string;
      vulvar_irritation: string;
    };
    systemic?: {
      fatigue: string;
      nausea: boolean;
      fever: boolean;
    };
  };

  @ApiProperty({ type: MedicalContextDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => MedicalContextDto)
  medical_context: MedicalContextDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  healthcare_interaction?: {
    previous_consultation: boolean;
    consultation_outcome: string;
    investigations_done: boolean;
    current_treatment: string;
  };

  @ApiProperty({ type: PatientConcernsDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => PatientConcernsDto)
  patient_concerns: PatientConcernsDto;
}

export class CreateConsultationDto {
  @ApiProperty({ example: 'patient_id_here' })
  @IsNotEmpty()
  @IsString()
  patientId: string;

  @ApiPropertyOptional({ example: 'doctor_id_here' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ example: 'session_id_here' })
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @ApiProperty({ enum: ConsultationType })
  @IsNotEmpty()
  @IsEnum(ConsultationType)
  consultationType: ConsultationType;

  @ApiPropertyOptional({ type: DetailedSymptomsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DetailedSymptomsDto)
  @Encrypt()
  detailedSymptoms?: DetailedSymptomsDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  paymentInfo?: {
    paymentId: any;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    transactionId: string;
    paymentDate: Date;
    status?: string;
    paidAt?: Date;
  };

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  aiDiagnosis?: any;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: {
    sessionId?: any; 
    patientId?: any;
    doctorId?: any;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    deviceInfo?: string;
  };
}

export class UpdateConsultationStatusDto {
  @ApiProperty({ enum: ConsultationStatus })
  @IsNotEmpty()
  @IsEnum(ConsultationStatus)
  status: ConsultationStatus;

  @ApiPropertyOptional({ example: 'Doctor completed examination' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: 'doctor_id_here' })
  @IsNotEmpty()
  @IsString()
  changedBy: string;

  @ApiPropertyOptional({ example: 'Additional notes about the status change' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// Prescription DTOs
export class MedicationDto {
  @ApiProperty({ example: 'Amoxicillin' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Amoxicillin' })
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiProperty({ example: '500mg' })
  @IsNotEmpty()
  @IsString()
  dosage: string;

  @ApiProperty({ example: 'Three times daily' })
  @IsNotEmpty()
  @IsString()
  frequency: string;

  @ApiProperty({ example: '7 days' })
  @IsNotEmpty()
  @IsString()
  duration: string;

  @ApiProperty({ example: 21 })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 'Take with food' })
  @IsNotEmpty()
  @IsString()
  instructions: string;

  @ApiProperty({ enum: ['oral', 'topical', 'injection', 'other'] })
  @IsNotEmpty()
  @IsEnum(['oral', 'topical', 'injection', 'other'])
  route: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 'consultation_id_here' })
  @IsNotEmpty()
  @IsString()
  consultationId: string;

  @ApiProperty({ type: [MedicationDto] })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications: MedicationDto[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  clinicalContext?: {
    diagnosis: string;
    symptoms: string[];
    allergyAlerts?: string[];
  };

  @ApiProperty({ example: 'Dr. Smith signature' })
  @IsNotEmpty()
  @IsString()
  digitalSignature: string;
}

// Response DTOs
export class ConsultationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty()
  doctorId: string;

  @ApiProperty()
  session_id: string;

  @ApiProperty({ enum: ConsultationStatus })
  status: ConsultationStatus;

  @ApiProperty({ enum: ConsultationType })
  consultationType: ConsultationType;

  @ApiPropertyOptional({ type: Object })
  detailedSymptoms?: any;

  @ApiPropertyOptional({ type: Object })
  aiDiagnosis?: any;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;
}

export class PrescriptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  prescriptionNumber: string;

  @ApiProperty()
  consultationId: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty()
  doctorId: string;

  @ApiProperty({ type: [Object] })
  medications: any[];

  @ApiProperty()
  pdfDownloadUrl: string;

  @ApiProperty({ type: Date })
  issuedAt: Date;

  @ApiProperty({ type: Date })
  validUntil: Date;
}
