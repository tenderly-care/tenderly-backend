import { 
  IsString, 
  IsArray, 
  IsOptional, 
  IsDate, 
  IsNumber, 
  ValidateNested, 
  IsNotEmpty,
  ArrayMinSize,
  Min,
  Max,
  IsEnum
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionStatus, PrescriptionAction } from '../schemas/consultation.schema';

// DTO for updating the doctor's diagnosis based on AI output
export class UpdateDiagnosisDto {
  @ApiProperty({ 
    description: 'Primary diagnosis after doctor review',
    example: 'Polycystic Ovary Syndrome (PCOS)' 
  })
  @IsString()
  @IsNotEmpty()
  primaryDiagnosis: string;

  @ApiProperty({ 
    description: 'List of differential diagnoses',
    example: ['Thyroid dysfunction', 'Insulin resistance'],
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  differentialDiagnosis: string[];

  @ApiProperty({ 
    description: 'Doctor\'s clinical reasoning for the diagnosis',
    example: 'Based on irregular menstrual cycles, elevated androgen levels, and ultrasound findings showing polycystic ovaries.' 
  })
  @IsString()
  @IsNotEmpty()
  clinicalReasoning: string;

  @ApiProperty({ 
    description: 'Doctor\'s confidence score in the diagnosis (0-100)',
    example: 85,
    minimum: 0,
    maximum: 100
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceScore: number;
}

// DTO for individual medication in prescription
export class MedicationDto {
  @ApiProperty({ 
    description: 'Name of the medication',
    example: 'Metformin' 
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ 
    description: 'Dosage of the medication',
    example: '500mg' 
  })
  @IsString()
  @IsNotEmpty()
  dosage: string;

  @ApiProperty({ 
    description: 'Frequency of administration',
    example: 'Twice daily' 
  })
  @IsString()
  @IsNotEmpty()
  frequency: string;

  @ApiProperty({ 
    description: 'Duration of treatment',
    example: '3 months' 
  })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiProperty({ 
    description: 'Special instructions for the medication',
    example: 'Take with food to reduce gastrointestinal side effects' 
  })
  @IsString()
  @IsNotEmpty()
  instructions: string;
}

// DTO for investigation/test recommendations
export class InvestigationDto {
  @ApiProperty({ 
    description: 'Name of the investigation/test',
    example: 'HbA1c test' 
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ 
    description: 'Instructions for the investigation',
    example: 'Fasting not required. Can be done at any time of day.' 
  })
  @IsString()
  @IsNotEmpty()
  instructions: string;
}

// DTO for follow-up recommendations
export class FollowUpDto {
  @ApiProperty({ 
    description: 'Recommended follow-up date',
    example: '2024-03-15T10:00:00Z' 
  })
  @IsDate()
  @Type(() => Date)
  date: Date;

  @ApiProperty({ 
    description: 'Follow-up instructions',
    example: 'Return for weight and glucose level monitoring. Bring recent lab reports.' 
  })
  @IsString()
  @IsNotEmpty()
  instructions: string;
}

// DTO for saving prescription draft
export class SavePrescriptionDraftDto {
  @ApiProperty({ 
    description: 'List of prescribed medications',
    type: [MedicationDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  @ArrayMinSize(0)
  medications: MedicationDto[];

  @ApiProperty({ 
    description: 'List of recommended investigations',
    type: [InvestigationDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvestigationDto)
  @ArrayMinSize(0)
  investigations: InvestigationDto[];

  @ApiProperty({ 
    description: 'Lifestyle advice recommendations',
    example: ['Regular exercise 30 minutes daily', 'Maintain healthy diet with low refined carbs', 'Adequate sleep 7-8 hours nightly'],
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  lifestyleAdvice: string[];

  @ApiProperty({ 
    description: 'Follow-up recommendations',
    type: FollowUpDto
  })
  @ValidateNested()
  @Type(() => FollowUpDto)
  followUp: FollowUpDto;
}

// DTO for signing and sending prescription
export class SignAndSendDto {
  @ApiProperty({ 
    description: 'Doctor\'s password for re-authentication before signing',
    example: 'SecurePassword123!'
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ 
    description: 'Optional MFA code if MFA is enabled for the doctor',
    example: '123456'
  })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}

// Response DTOs

export class PrescriptionWorkspaceResponseDto {
  @ApiProperty({ description: 'Consultation ID' })
  consultationId: string;

  @ApiProperty({ description: 'Patient\'s structured assessment input' })
  structuredAssessmentInput: any;

  @ApiProperty({ description: 'AI agent\'s diagnosis output' })
  aiAgentOutput: any;

  @ApiProperty({ description: "Doctor's modified diagnosis based on AI output", required: false })
  doctorDiagnosis?: {
    possible_diagnoses: string[];
    clinical_reasoning: string;
    recommended_investigations: Array<{
      category: string;
      tests: Array<{ name: string; priority: string; reason: string }>;
    }>;
    treatment_recommendations: {
      primary_treatment: string;
      safe_medications: string[];
      lifestyle_modifications: string[];
      dietary_advice: string[];
      follow_up_timeline: string;
    };
    patient_education: string[];
    warning_signs: string[];
    confidence_score: number;
    processing_notes: string;
    disclaimer: string;
    modifiedAt: Date;
    modifiedBy: string;
    modificationType: string;
    modificationNotes?: string;
    changesFromAI: string[];
    isInitialCopy?: boolean;
  };

  @ApiProperty({ description: 'Current prescription status', enum: PrescriptionStatus })
  prescriptionStatus: PrescriptionStatus;

  @ApiProperty({ description: 'Current prescription data if exists' })
  prescriptionData?: any;

  @ApiProperty({ description: 'Patient information' })
  patientInfo: {
    firstName: string;
    lastName: string;
    age?: number;
    gender?: string;
  };

  @ApiProperty({ description: 'Whether doctor diagnosis exists' })
  hasDoctorDiagnosis: boolean;
}

export class PrescriptionStatusResponseDto {
  @ApiProperty({ description: 'Updated prescription status', enum: PrescriptionStatus })
  prescriptionStatus: PrescriptionStatus;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Timestamp of the update' })
  updatedAt: Date;
}

export class PrescriptionPreviewResponseDto {
  @ApiProperty({ description: 'URL to the draft PDF preview' })
  draftPdfUrl: string;

  @ApiProperty({ description: 'Prescription status after PDF generation', enum: PrescriptionStatus })
  prescriptionStatus: PrescriptionStatus;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'PDF generation timestamp' })
  generatedAt: Date;
}

export class SignedPrescriptionResponseDto {
  @ApiProperty({ description: 'URL to the signed prescription PDF' })
  signedPdfUrl: string;

  @ApiProperty({ description: 'PDF integrity hash for verification' })
  pdfHash: string;

  @ApiProperty({ description: 'Final prescription status', enum: PrescriptionStatus })
  prescriptionStatus: PrescriptionStatus;

  @ApiProperty({ description: 'Digital signature details' })
  digitalSignature: {
    algorithm: string;
    signedAt: Date;
    certificateId: string;
  };

  @ApiProperty({ description: 'Success message' })
  message: string;
}

// DTO for prescription history entries
export class PrescriptionHistoryDto {
  @ApiProperty({ description: 'Action performed', enum: PrescriptionAction })
  action: PrescriptionAction;

  @ApiProperty({ description: 'Timestamp of the action' })
  timestamp: Date;

  @ApiProperty({ description: 'ID of user who performed the action' })
  performedBy: string;

  @ApiProperty({ description: 'Details about the action' })
  details: string;

  @ApiPropertyOptional({ description: 'IP address of the user' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  userAgent?: string;
}
