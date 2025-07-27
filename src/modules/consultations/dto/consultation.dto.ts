import { IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray, IsString, IsObject, IsIn, Min, Max, MaxLength, ValidateNested, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ConsultationType, ConsultationStatus } from '../schemas/consultation.schema';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export class CreateConsultationDto {
  @IsNotEmpty()
  readonly patientId: string;

  @IsOptional()
  readonly doctorId?: string;

  @IsNotEmpty()
  readonly sessionId: string;

  @IsEnum(ConsultationType)
  readonly consultationType: ConsultationType;

  @IsOptional()
  @IsObject()
  @Encrypt()
  readonly initialSymptoms?: {
    primarySymptom: string;
    duration: string;
    severity: number;
    additionalSymptoms: string[];
    triggers: string[];
    previousTreatments: string[];
  };

  @IsOptional()
  @IsObject()
  @Encrypt()
  readonly medicalHistory?: {
    allergies: string[];
    currentMedications: string[];
    chronicConditions: string[];
    previousSurgeries: string[];
    familyHistory: string[];
  };

  @IsOptional()
  @IsObject()
  readonly aiDiagnosis?: {
    primaryDiagnosis: string;
    differentialDiagnosis: string[];
    recommendedTests: string[];
    urgencyLevel: string;
    confidence: number;
    generatedAt: Date;
  };

  @IsOptional()
  @IsObject()
  readonly paymentInfo?: {
    amount: number;
    currency: string;
    paymentId: string;
    status: string;
    paidAt: Date;
  };

  @IsOptional()
  @IsNumber()
  readonly followUpNumber?: number;

  @IsOptional()
  readonly parentConsultationId?: string;

  @IsOptional()
  @IsObject()
  readonly metadata?: {
    ipAddress: string;
    userAgent: string;
    location: string;
    deviceInfo: string;
  };
}

export class UpdateConsultationDto {
  @IsOptional()
  readonly doctorId?: string;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  readonly status?: ConsultationStatus;

  @IsOptional()
  @IsObject()
  @Encrypt()
  readonly initialSymptoms?: {
    primarySymptom: string;
    duration: string;
    severity: number;
    additionalSymptoms: string[];
    triggers: string[];
    previousTreatments: string[];
  };

  @IsOptional()
  @IsObject()
  readonly finalDiagnosis?: {
    diagnosis: string;
    notes: string;
    treatmentPlan: string;
    followUpRequired: boolean;
    followUpDate: Date;
    doctorId: string;
    diagnosedAt: Date;
  };

  @IsOptional()
  @IsArray()
  readonly prescriptions?: {
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    prescribedAt: Date;
  }[];

  @IsOptional()
  @IsArray()
  readonly chatHistory?: {
    senderId: string;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
  }[];

  @IsOptional()
  readonly consultationStartTime?: Date;

  @IsOptional()
  readonly consultationEndTime?: Date;
}

export class SymptomInputDto {
  @IsNotEmpty()
  @IsArray()
  readonly primarySymptom: string[];

  @IsNotEmpty()
  @IsString()
  readonly duration: string;

  @IsNotEmpty()
  @IsString()
  readonly severity: 'mild' | 'moderate' | 'severe';

  @IsOptional()
  @IsArray()
  readonly additionalSymptoms?: string[];

  @IsOptional()
  @IsArray()
  readonly triggers?: string[];

  @IsOptional()
  @IsArray()
  readonly previousTreatments?: string[];

  @IsNotEmpty()
  @IsObject()
  readonly medicalHistory: {
    allergies: string[];
    currentMedications: string[];
    chronicConditions: string[];
    previousSurgeries: string[];
    familyHistory: string[];
  };
}

// Basic symptom collection DTO for simple diagnosis (legacy)
export class BasicSymptomInputDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  readonly symptoms: string[];

  @IsNotEmpty()
  @IsNumber()
  readonly patient_age: number;

  @IsNotEmpty()
  @IsString()
  @IsIn(['mild', 'moderate', 'severe'])
  readonly severity_level: 'mild' | 'moderate' | 'severe';

  @IsNotEmpty()
  @IsString()
  readonly duration: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly medical_history?: string[];

  @IsOptional()
  @IsString()
  readonly additional_notes?: string;
}

// Detailed symptom collection DTO for comprehensive diagnosis
export class DetailedSymptomInputDto {
  @IsNotEmpty()
  @IsObject()
  readonly patient_profile: {
    age: number;
    request_id: string; // patient_id
    timestamp: string;
  };

  @IsNotEmpty()
  @IsObject()
  readonly primary_complaint: {
    main_symptom: string;
    duration: string;
    severity: 'mild' | 'moderate' | 'severe';
    onset: string;
    progression: string;
  };

  @IsOptional()
  @IsObject()
  readonly symptom_specific_details?: {
    pain_characteristics?: any;
    discharge_characteristics?: any;
    bleeding_pattern?: any;
    [key: string]: any; // Dynamic based on main_symptom
  };

  @IsOptional()
  @IsObject()
  readonly reproductive_history?: {
    pregnancy_status?: any;
    sexual_activity?: any;
    menstrual_history?: any;
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  readonly associated_symptoms?: {
    pain?: any;
    systemic?: any;
    [key: string]: any;
  };

  @IsNotEmpty()
  @IsObject()
  readonly medical_context: {
    current_medications: string[];
    recent_medications: string[];
    medical_conditions: string[];
    previous_gynecological_issues?: string[];
    allergies: string[]; // CRITICAL FOR SAFETY
    family_history: string[];
  };

  @IsNotEmpty()
  @IsObject()
  readonly healthcare_interaction: {
    previous_consultation: boolean;
    consultation_outcome?: string;
    investigations_done: boolean;
    investigation_results?: string;
    current_treatment: string;
  };

  @IsNotEmpty()
  @IsObject()
  readonly patient_concerns: {
    main_worry: string;
    impact_on_life: 'minimal' | 'mild' | 'moderate' | 'significant' | 'severe';
    additional_notes?: string;
  };
}

// Core diagnosis request structure (matches tenderly-ai-agent schema exactly)
export class DiagnosisRequestDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  symptoms: string[];

  @IsNotEmpty()
  @IsNumber()
  @Min(12)
  @Max(100)
  patient_age: number;

  @IsOptional()
  @IsString()
  @IsIn(['mild', 'moderate', 'severe'])
  severity_level?: 'mild' | 'moderate' | 'severe' = 'moderate';

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  duration: string;

  @IsOptional()
  @IsString()
  @IsIn(['sudden', 'gradual', 'chronic'])
  onset?: 'sudden' | 'gradual' | 'chronic';

  @IsOptional()
  @IsString()
  @IsIn(['stable', 'improving', 'worsening', 'fluctuating'])
  progression?: 'stable' | 'improving' | 'worsening' | 'fluctuating';
}

// AI Agent Compatible Symptom Collection DTO - Updated to match tenderly-ai-agent schema
export class AIAgentSymptomCollectionDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => DiagnosisRequestDto)
  diagnosis_request: DiagnosisRequestDto;
}

// New structured request DTO for production-level symptom collection
export class StructuredSymptomRequestDto {
  @IsNotEmpty()
  @IsObject()
  readonly structured_request: DetailedSymptomInputDto;
}

// Response DTO for detailed diagnosis
export class DetailedDiagnosisResponseDto {
  @IsNotEmpty()
  @IsString()
  readonly diagnosis: string;

  @IsNotEmpty()
  @IsNumber()
  readonly confidence_score: number;

  @IsArray()
  readonly suggested_investigations: {
    name: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }[];

  @IsArray()
  readonly recommended_medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    reason: string;
    notes?: string;
  }[];

  @IsArray()
  readonly lifestyle_advice: string[];

  @IsString()
  readonly follow_up_recommendations: string;

  @IsString()
  readonly disclaimer: string;

  @IsString()
  readonly timestamp: string;
}

export class AIDiagnosisResponseDto {
  @ApiProperty({ description: 'AI-generated diagnosis' })
  @IsNotEmpty()
  @IsString()
  readonly diagnosis: string;

  @ApiProperty({ description: 'Severity level', enum: ['low', 'medium', 'high', 'critical'] })
  @IsNotEmpty()
  @IsString()
  readonly severity: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ description: 'Recommended consultation type', enum: ['chat', 'video', 'tele', 'emergency'] })
  @IsNotEmpty()
  @IsString()
  readonly recommendedConsultationType: 'chat' | 'video' | 'emergency';

  @ApiProperty({ description: 'Recommended tests', type: [String], required: false })
  @IsOptional()
  @IsArray()
  readonly recommendedTests?: string[];

  @ApiProperty({ description: 'Confidence score (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  readonly confidence?: number;

  @ApiProperty({ description: 'Full AI diagnosis object', required: false })
  @IsOptional()
  @IsObject()
  readonly fullDiagnosis?: any;
}

// ========== PHASE 2: CLINICAL ASSESSMENT DTOs ==========

/**
 * Primary Complaint for detailed clinical assessment
 */
export class ClinicalPrimaryComplaintDto {
  @ApiProperty({ description: 'Main symptom or complaint' })
  @IsString()
  @IsNotEmpty()
  main_symptom: string;

  @ApiProperty({ description: 'Duration of symptoms' })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiProperty({ description: 'Severity level', enum: ['mild', 'moderate', 'severe'] })
  @IsEnum(['mild', 'moderate', 'severe'])
  severity: 'mild' | 'moderate' | 'severe';

  @ApiProperty({ description: 'Onset type', enum: ['sudden', 'gradual', 'chronic'], required: false })
  @IsOptional()
  @IsEnum(['sudden', 'gradual', 'chronic'])
  onset?: 'sudden' | 'gradual' | 'chronic';

  @ApiProperty({ description: 'Progression pattern', enum: ['stable', 'improving', 'worsening', 'fluctuating'], required: false })
  @IsOptional()
  @IsEnum(['stable', 'improving', 'worsening', 'fluctuating'])
  progression?: 'stable' | 'improving' | 'worsening' | 'fluctuating';
}

/**
 * Systemic symptoms sub-DTO
 */
export class SystemicSymptomsDto {
  @ApiProperty({ description: 'Presence of fever', required: false })
  @IsOptional()
  @IsBoolean()
  fever?: boolean;

  @ApiProperty({ description: 'Fatigue level', enum: ['none', 'mild', 'moderate', 'severe'], required: false })
  @IsOptional()
  @IsEnum(['none', 'mild', 'moderate', 'severe'])
  fatigue?: 'none' | 'mild' | 'moderate' | 'severe';

  @ApiProperty({ description: 'Presence of dizziness', required: false })
  @IsOptional()
  @IsBoolean()
  dizziness?: boolean;

  @ApiProperty({ description: 'Nausea or vomiting', required: false })
  @IsOptional()
  @IsBoolean()
  nausea?: boolean;
}

/**
 * Pain symptoms sub-DTO
 */
export class PainSymptomsDto {
  @ApiProperty({ description: 'Pain timing', enum: ['constant', 'intermittent', 'cyclical'], required: false })
  @IsOptional()
  @IsEnum(['constant', 'intermittent', 'cyclical'])
  pain_timing?: 'constant' | 'intermittent' | 'cyclical';

  @ApiProperty({ description: 'Pain location', required: false })
  @IsOptional()
  @IsString()
  pain_location?: string;

  @ApiProperty({ description: 'Pain triggers', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pain_triggers?: string[];
}

/**
 * Gynecological symptoms sub-DTO
 */
export class GynecologicalSymptomsDto {
  @ApiProperty({ description: 'Vaginal discharge present', required: false })
  @IsOptional()
  @IsBoolean()
  discharge?: boolean;

  @ApiProperty({ description: 'Abnormal bleeding', required: false })
  @IsOptional()
  @IsBoolean()
  abnormal_bleeding?: boolean;

  @ApiProperty({ description: 'Urinary symptoms', required: false })
  @IsOptional()
  @IsBoolean()
  urinary_symptoms?: boolean;
}

/**
 * Associated symptoms for clinical assessment (now defined after its dependencies)
 */
export class ClinicalAssociatedSymptomsDto {
  @ApiProperty({ description: 'Systemic symptoms', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SystemicSymptomsDto)
  systemic?: SystemicSymptomsDto;

  @ApiProperty({ description: 'Pain-related symptoms', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PainSymptomsDto)
  pain?: PainSymptomsDto;

  @ApiProperty({ description: 'Gynecological symptoms', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => GynecologicalSymptomsDto)
  gynecological?: GynecologicalSymptomsDto;
}

/**
 * Medical context for clinical assessment
 */
export class ClinicalMedicalContextDto {
  @ApiProperty({ description: 'Current medications', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  current_medications?: string[];

  @ApiProperty({ description: 'Recent medications (within 3 months)', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recent_medications?: string[];

  @ApiProperty({ description: 'Medical conditions', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medical_conditions?: string[];

  @ApiProperty({ description: 'Previous gynecological issues', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previous_gynecological_issues?: string[];

  @ApiProperty({ description: 'Known allergies', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiProperty({ description: 'Family history', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  family_history?: string[];
}

/**
 * Reproductive history for clinical assessment
 */
export class ClinicalReproductiveHistoryDto {
  @ApiProperty({ description: 'Last menstrual period date', required: false })
  @IsOptional()
  @IsDateString()
  last_menstrual_period?: string;

  @ApiProperty({ description: 'Menstrual cycle regularity', enum: ['regular', 'irregular', 'absent'], required: false })
  @IsOptional()
  @IsEnum(['regular', 'irregular', 'absent'])
  cycle_regularity?: 'regular' | 'irregular' | 'absent';

  @ApiProperty({ description: 'Contraceptive use', required: false })
  @IsOptional()
  @IsBoolean()
  contraceptive_use?: boolean;

  @ApiProperty({ description: 'Type of contraception', required: false })
  @IsOptional()
  @IsString()
  contraceptive_type?: string;

  @ApiProperty({ description: 'Pregnancy history', required: false })
  @IsOptional()
  @IsString()
  pregnancy_history?: string;
}

/**
 * Lifestyle factors for clinical assessment
 */
export class ClinicalLifestyleFactorsDto {
  @ApiProperty({ description: 'Smoking status', enum: ['never', 'former', 'current'], required: false })
  @IsOptional()
  @IsEnum(['never', 'former', 'current'])
  smoking_status?: 'never' | 'former' | 'current';

  @ApiProperty({ description: 'Alcohol consumption', enum: ['none', 'occasional', 'moderate', 'heavy'], required: false })
  @IsOptional()
  @IsEnum(['none', 'occasional', 'moderate', 'heavy'])
  alcohol_consumption?: 'none' | 'occasional' | 'moderate' | 'heavy';

  @ApiProperty({ description: 'Exercise frequency', enum: ['none', 'light', 'moderate', 'intense'], required: false })
  @IsOptional()
  @IsEnum(['none', 'light', 'moderate', 'intense'])
  exercise_frequency?: 'none' | 'light' | 'moderate' | 'intense';

  @ApiProperty({ description: 'Stress level', enum: ['low', 'moderate', 'high'], required: false })
  @IsOptional()
  @IsEnum(['low', 'moderate', 'high'])
  stress_level?: 'low' | 'moderate' | 'high';
}

/**
 * Patient concerns for clinical assessment
 */
export class ClinicalPatientConcernsDto {
  @ApiProperty({ description: 'Main worry or concern' })
  @IsString()
  @IsNotEmpty()
  main_worry: string;

  @ApiProperty({ description: 'Impact on daily life', enum: ['minimal', 'moderate', 'significant', 'severe'] })
  @IsEnum(['minimal', 'moderate', 'significant', 'severe'])
  impact_on_life: 'minimal' | 'moderate' | 'significant' | 'severe';

  @ApiProperty({ description: 'Additional notes or concerns', required: false })
  @IsOptional()
  @IsString()
  additional_notes?: string;
}

/**
 * Healthcare interaction history
 */
export class ClinicalHealthcareInteractionDto {
  @ApiProperty({ description: 'Previous consultation for similar issue', required: false })
  @IsOptional()
  @IsBoolean()
  previous_consultation?: boolean;

  @ApiProperty({ description: 'Previous treatments tried', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previous_treatments?: string[];

  @ApiProperty({ description: 'Response to previous treatments', required: false })
  @IsOptional()
  @IsString()
  treatment_response?: string;
}

/**
 * Symptom-specific sub-DTOs (defined first)
 */
export class BleedingPatternDto {
  @ApiProperty({ description: 'Heavy bleeding', required: false })
  @IsOptional()
  @IsBoolean()
  heavy_bleeding?: boolean;

  @ApiProperty({ description: 'Presence of clots', required: false })
  @IsOptional()
  @IsBoolean()
  clots_present?: boolean;

  @ApiProperty({ description: 'Associated pain level', enum: ['none', 'mild', 'moderate', 'severe'], required: false })
  @IsOptional()
  @IsEnum(['none', 'mild', 'moderate', 'severe'])
  associated_pain?: 'none' | 'mild' | 'moderate' | 'severe';
}

export class DischargeCharacteristicsDto {
  @ApiProperty({ description: 'Color of discharge', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ description: 'Odor present', required: false })
  @IsOptional()
  @IsBoolean()
  odor?: boolean;

  @ApiProperty({ description: 'Consistency', enum: ['thin', 'thick', 'chunky'], required: false })
  @IsOptional()
  @IsEnum(['thin', 'thick', 'chunky'])
  consistency?: 'thin' | 'thick' | 'chunky';
}

export class PainCharacteristicsDto {
  @ApiProperty({ description: 'Pain quality', enum: ['sharp', 'dull', 'cramping', 'burning'], required: false })
  @IsOptional()
  @IsEnum(['sharp', 'dull', 'cramping', 'burning'])
  pain_quality?: 'sharp' | 'dull' | 'cramping' | 'burning';

  @ApiProperty({ description: 'Pain radiation', required: false })
  @IsOptional()
  @IsString()
  pain_radiation?: string;

  @ApiProperty({ description: 'Pain relief factors', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relief_factors?: string[];
}

/**
 * Symptom-specific details (now defined after its dependencies)
 */
export class ClinicalSymptomSpecificDetailsDto {
  @ApiProperty({ description: 'Bleeding pattern details', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => BleedingPatternDto)
  bleeding_pattern?: BleedingPatternDto;

  @ApiProperty({ description: 'Discharge characteristics', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DischargeCharacteristicsDto)
  discharge_characteristics?: DischargeCharacteristicsDto;

  @ApiProperty({ description: 'Pain characteristics', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PainCharacteristicsDto)
  pain_characteristics?: PainCharacteristicsDto;
}

/**
 * Main DTO for Phase 2 detailed symptom collection
 */
export class ClinicalDetailedSymptomsDto {
  @ApiProperty({ description: 'Primary complaint details' })
  @ValidateNested()
  @Type(() => ClinicalPrimaryComplaintDto)
  primary_complaint: ClinicalPrimaryComplaintDto;

  @ApiProperty({ description: 'Associated symptoms', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalAssociatedSymptomsDto)
  associated_symptoms?: ClinicalAssociatedSymptomsDto;

  @ApiProperty({ description: 'Medical context and history' })
  @ValidateNested()
  @Type(() => ClinicalMedicalContextDto)
  medical_context: ClinicalMedicalContextDto;

  @ApiProperty({ description: 'Reproductive history', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalReproductiveHistoryDto)
  reproductive_history?: ClinicalReproductiveHistoryDto;

  @ApiProperty({ description: 'Lifestyle factors', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalLifestyleFactorsDto)
  lifestyle_factors?: ClinicalLifestyleFactorsDto;

  @ApiProperty({ description: 'Patient concerns and impact' })
  @ValidateNested()
  @Type(() => ClinicalPatientConcernsDto)
  patient_concerns: ClinicalPatientConcernsDto;

  @ApiProperty({ description: 'Healthcare interaction history', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalHealthcareInteractionDto)
  healthcare_interaction?: ClinicalHealthcareInteractionDto;

  @ApiProperty({ description: 'Symptom-specific details', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalSymptomSpecificDetailsDto)
  symptom_specific_details?: ClinicalSymptomSpecificDetailsDto;
}

/**
 * Response DTO for comprehensive AI diagnosis (Phase 2)
 */
export class ComprehensiveAIDiagnosisResponseDto {
  @ApiProperty({ description: 'Possible diagnoses', type: [String] })
  possible_diagnoses: string[];

  @ApiProperty({ description: 'Clinical reasoning for diagnosis' })
  clinical_reasoning: string;

  @ApiProperty({ description: 'Recommended investigations by category' })
  recommended_investigations: {
    category: string;
    tests: {
      name: string;
      priority: string;
      reason: string;
    }[];
  }[];

  @ApiProperty({ description: 'Treatment recommendations' })
  treatment_recommendations: {
    primary_treatment: string;
    safe_medications: string[];
    lifestyle_modifications: string[];
    dietary_advice: string[];
    follow_up_timeline: string;
  };

  @ApiProperty({ description: 'Patient education points', type: [String] })
  patient_education: string[];

  @ApiProperty({ description: 'Warning signs to watch for', type: [String] })
  warning_signs: string[];

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @ApiProperty({ description: 'Processing notes' })
  processing_notes: string;

  @ApiProperty({ description: 'Medical disclaimer' })
  disclaimer: string;

  @ApiProperty({ description: 'Timestamp of diagnosis generation' })
  timestamp: Date;

  @ApiProperty({ description: 'Consultation context', required: false })
  consultation_context?: {
    consultation_id: string;
    patient_id: string;
    consultation_type: string;
  };
}

/**
 * Response DTO for Phase 2 detailed symptom collection
 */
export class ClinicalDetailedSymptomsResponseDto {
  @ApiProperty({ description: 'Consultation ID' })
  consultationId: string;

  @ApiProperty({ description: 'Clinical session ID' })
  clinicalSessionId: string;

  @ApiProperty({ description: 'Comprehensive AI diagnosis' })
  diagnosis: ComprehensiveAIDiagnosisResponseDto;

  @ApiProperty({ description: 'Current consultation status' })
  status: string;

  @ApiProperty({ description: 'Next steps information' })
  nextSteps: string;

  @ApiProperty({ description: 'Estimated review time' })
  estimatedReviewTime: string;

  @ApiProperty({ description: 'Transaction ID for tracking' })
  transactionId: string;
}

export class ConsultationSelectionDto {
  @IsNotEmpty()
  @IsString()
  readonly sessionId: string;

  @IsNotEmpty()
  @IsEnum(ConsultationType)
  readonly selectedConsultationType: ConsultationType;

  @IsOptional()
  @IsObject()
  readonly preferences?: {
    preferredDoctorId?: string;
    urgency?: 'normal' | 'urgent';
    additionalNotes?: string;
  };
}

export class PaymentConfirmationDto {
  @IsNotEmpty()
  @IsString()
  readonly sessionId: string;

  @IsNotEmpty()
  @IsString()
  readonly paymentId: string;

  @IsOptional()
  @IsString()
  readonly gatewayTransactionId?: string;

  @IsOptional()
  @IsString()
  readonly paymentMethod?: string;

  @IsOptional()
  @IsObject()
  readonly paymentMetadata?: any;
}

export class DoctorInvestigationDto {
  @IsOptional()
  @IsObject()
  @Encrypt()
  readonly updatedSymptoms?: {
    primarySymptom: string[];
    duration: string;
    severity: 'mild' | 'moderate' | 'severe';
    additionalSymptoms: string[];
    triggers: string[];
    previousTreatments: string[];
  };

  @IsOptional()
  @IsArray()
  readonly investigations?: {
    testName: string;
    testType: 'blood' | 'urine' | 'imaging' | 'other';
    instructions: string;
    urgency: 'normal' | 'urgent';
    orderedAt: Date;
    expectedResults?: string;
  }[];

  @IsOptional()
  @IsObject()
  readonly clinicalNotes?: {
    observations: string;
    assessment: string;
    plan: string;
    followUpInstructions: string;
    doctorId: string;
    updatedAt: Date;
  };
}
