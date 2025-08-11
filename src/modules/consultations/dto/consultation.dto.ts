import { IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray, IsString, IsObject, IsIn, Min, Max, MaxLength, ValidateNested, IsBoolean, IsDateString, IsInt, IsDate } from 'class-validator';
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

// Detailed symptom collection DTO for comprehensive diagnosis - matches tenderly-ai-agent schema
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

  @IsNotEmpty()
  @IsObject()
  readonly symptom_specific_details: {
    symptom_characteristics: Record<string, any>;
  };

  @IsNotEmpty()
  @IsObject()
  readonly reproductive_history: {
    pregnancy_status: {
      could_be_pregnant: boolean;
      pregnancy_test_result: string;
    };
    sexual_activity: {
      sexually_active: boolean;
      contraception_method: string;
    };
    menstrual_history: {
      menarche_age: number;
      cycle_frequency: number;
      period_duration: number;
    };
  };

  @IsNotEmpty()
  @IsObject()
  readonly associated_symptoms: {
    pain: {
      pelvic_pain: string;
      vulvar_irritation: string;
    };
    systemic: {
      fatigue: string;
      nausea: boolean;
      fever: boolean;
    };
  };

  @IsNotEmpty()
  @IsObject()
  readonly medical_context: {
    current_medications: string[];
    recent_medications: string[];
    medical_conditions: string[];
    previous_gynecological_issues: string[];
    allergies: string[];
    family_history: string[];
  };

  @IsNotEmpty()
  @IsObject()
  readonly healthcare_interaction: {
    previous_consultation: boolean;
    consultation_outcome: string;
    investigations_done: boolean;
    current_treatment: string;
  };

  @IsNotEmpty()
  @IsObject()
  readonly patient_concerns: {
    main_worry: string;
    impact_on_life: string;
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

// ========== NEW: Exact Tenderly-AI-Agent Schema DTOs ==========

// Patient Profile DTO - matches AI agent schema
export class AIPatientProfileDto {
  @IsNotEmpty()
  @IsInt()
  @Min(10)
  @Max(100)
  age: number;

  @IsNotEmpty()
  @IsString()
  request_id: string;

  @IsNotEmpty()
  @IsString()
  timestamp: string;
}

// Primary Complaint DTO - matches AI agent schema
export class AIPrimaryComplaintDto {
  @IsNotEmpty()
  @IsString()
  main_symptom: string;

  @IsNotEmpty()
  @IsString()
  duration: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['mild', 'moderate', 'severe'])
  severity: 'mild' | 'moderate' | 'severe';

  @IsNotEmpty()
  @IsString()
  onset: string;

  @IsNotEmpty()
  @IsString()
  progression: string;
}

// Symptom Specific Details DTO - matches AI agent schema
export class AISymptomSpecificDetailsDto {
  @IsNotEmpty()
  @IsObject()
  symptom_characteristics: Record<string, any>;
}

// Pregnancy Status DTO - matches AI agent schema
export class AIPregnancyStatusDto {
  @IsNotEmpty()
  @IsBoolean()
  could_be_pregnant: boolean;

  @IsNotEmpty()
  @IsString()
  pregnancy_test_result: string;
}

// Sexual Activity DTO - matches AI agent schema
export class AISexualActivityDto {
  @IsNotEmpty()
  @IsBoolean()
  sexually_active: boolean;

  @IsNotEmpty()
  @IsString()
  contraception_method: string;
}

// Menstrual History DTO - matches AI agent schema
export class AIMenstrualHistoryDto {
  @IsNotEmpty()
  @IsInt()
  @Min(8)
  @Max(20)
  menarche_age: number;

  @IsNotEmpty()
  @IsInt()
  cycle_frequency: number;

  @IsNotEmpty()
  @IsInt()
  period_duration: number;
}

// Reproductive History DTO - matches AI agent schema
export class AIReproductiveHistoryDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIPregnancyStatusDto)
  pregnancy_status: AIPregnancyStatusDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AISexualActivityDto)
  sexual_activity: AISexualActivityDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIMenstrualHistoryDto)
  menstrual_history: AIMenstrualHistoryDto;
}

// Pain DTO - matches AI agent schema
export class AIPainDto {
  @IsOptional()
  @IsString()
  pelvic_pain?: string;

  @IsOptional()
  @IsString()
  vulvar_irritation?: string;
}

// Systemic Symptoms DTO - matches AI agent schema
export class AISystemicDto {
  @IsOptional()
  @IsString()
  fatigue?: string;

  @IsOptional()
  @IsBoolean()
  nausea?: boolean;

  @IsOptional()
  @IsBoolean()
  fever?: boolean;
}

// Associated Symptoms DTO - matches AI agent schema
export class AIAssociatedSymptomsDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIPainDto)
  pain: AIPainDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AISystemicDto)
  systemic: AISystemicDto;
}

// Medical Context DTO - matches AI agent schema
export class AIMedicalContextDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  current_medications: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  recent_medications: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  medical_conditions: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  previous_gynecological_issues: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  allergies: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  family_history: string[];
}

// Healthcare Interaction DTO - matches AI agent schema
export class AIHealthcareInteractionDto {
  @IsNotEmpty()
  @IsBoolean()
  previous_consultation: boolean;

  @IsNotEmpty()
  @IsString()
  consultation_outcome: string;

  @IsNotEmpty()
  @IsBoolean()
  investigations_done: boolean;

  @IsNotEmpty()
  @IsString()
  current_treatment: string;
}

// Patient Concerns DTO - matches AI agent schema
export class AIPatientConcernsDto {
  @IsNotEmpty()
  @IsString()
  main_worry: string;

  @IsNotEmpty()
  @IsString()
  impact_on_life: string;

  @IsNotEmpty()
  @IsString()
  additional_notes: string;
}

// Main DTO that matches the exact tenderly-ai-agent JSON schema
export class TenderlyAIAgentRequestDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIPatientProfileDto)
  @ApiProperty({
    description: 'Patient profile information',
    example: {
      age: 25,
      request_id: 'patient_123',
      timestamp: '2025-01-28T10:30:00Z'
    }
  })
  patient_profile: AIPatientProfileDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIPrimaryComplaintDto)
  @ApiProperty({
    description: 'Primary complaint details',
    example: {
      main_symptom: 'Irregular menstrual bleeding',
      duration: '3 weeks',
      severity: 'moderate',
      onset: 'gradual',
      progression: 'worsening'
    }
  })
  primary_complaint: AIPrimaryComplaintDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AISymptomSpecificDetailsDto)
  @ApiProperty({
    description: 'Symptom-specific characteristics',
    example: {
      symptom_characteristics: {
        bleeding_pattern: 'irregular',
        flow_intensity: 'heavy',
        color: 'bright red',
        clots: true
      }
    }
  })
  symptom_specific_details: AISymptomSpecificDetailsDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIReproductiveHistoryDto)
  @ApiProperty({
    description: 'Reproductive history details',
    example: {
      pregnancy_status: {
        could_be_pregnant: false,
        pregnancy_test_result: 'negative'
      },
      sexual_activity: {
        sexually_active: true,
        contraception_method: 'condoms'
      },
      menstrual_history: {
        menarche_age: 13,
        cycle_frequency: 28,
        period_duration: 5
      }
    }
  })
  reproductive_history: AIReproductiveHistoryDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIAssociatedSymptomsDto)
  @ApiProperty({
    description: 'Associated symptoms',
    example: {
      pain: {
        pelvic_pain: 'intermittent',
        vulvar_irritation: 'none'
      },
      systemic: {
        fatigue: 'moderate',
        nausea: false,
        fever: false
      }
    }
  })
  associated_symptoms: AIAssociatedSymptomsDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIMedicalContextDto)
  @ApiProperty({
    description: 'Medical context and history',
    example: {
      current_medications: [],
      recent_medications: [],
      medical_conditions: [],
      previous_gynecological_issues: ['PCOS'],
      allergies: [],
      family_history: ['diabetes', 'hypertension']
    }
  })
  medical_context: AIMedicalContextDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIHealthcareInteractionDto)
  @ApiProperty({
    description: 'Healthcare interaction history',
    example: {
      previous_consultation: false,
      consultation_outcome: 'none',
      investigations_done: false,
      current_treatment: 'none'
    }
  })
  healthcare_interaction: AIHealthcareInteractionDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => AIPatientConcernsDto)
  @ApiProperty({
    description: 'Patient concerns and impact',
    example: {
      main_worry: 'Fertility issues due to irregular periods',
      impact_on_life: 'moderate',
      additional_notes: 'Concerned about ability to conceive'
    }
  })
  patient_concerns: AIPatientConcernsDto;
}

// Response DTO for the pure AI agent response
export class PureAIAgentResponseDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'AI-generated diagnosis' })
  diagnosis: string;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @IsArray()
  @ApiProperty({ description: 'Suggested medical investigations' })
  suggested_investigations: {
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }[];

  @IsArray()
  @ApiProperty({ description: 'Recommended medications' })
  recommended_medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    reason: string;
    notes?: string;
  }[];

  @IsArray()
  @ApiProperty({ description: 'Lifestyle advice' })
  lifestyle_advice: string[];

  @IsString()
  @ApiProperty({ description: 'Follow-up recommendations' })
  follow_up_recommendations: string;

  @IsString()
  @ApiProperty({ description: 'Medical disclaimer' })
  disclaimer: string;

  @IsString()
  @ApiProperty({ description: 'Response timestamp' })
  timestamp: string;

  // Additional fields that might be returned by the AI agent
  @IsOptional()
  @ApiProperty({ description: 'Clinical reasoning', required: false })
  clinical_reasoning?: string;

  @IsOptional()
  @ApiProperty({ description: 'Risk assessment', required: false })
  risk_assessment?: any;

  @IsOptional()
  @ApiProperty({ description: 'Safety assessment', required: false })
  safety_assessment?: any;

  @IsOptional()
  @ApiProperty({ description: 'Patient education points', required: false })
  patient_education?: string[];

  @IsOptional()
  @ApiProperty({ description: 'Warning signs to watch for', required: false })
  warning_signs?: string[];
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

// AI Agent Detailed Symptoms DTOs (for new endpoint)
export class AIAgentDetailedSymptomsDto {
  @IsObject()
  patient_profile: {
    age: number;
    request_id: string;
    timestamp: string;
  };

  @IsObject()
  primary_complaint: {
    main_symptom: string;
    duration: string;
    severity: 'mild' | 'moderate' | 'severe';
    onset: string;
    progression: string;
  };

  @IsObject()
  symptom_specific_details: {
    symptom_characteristics: Record<string, any>;
  };

  @IsObject()
  reproductive_history: {
    pregnancy_status: {
      could_be_pregnant: boolean;
      pregnancy_test_result: string;
    };
    sexual_activity: {
      sexually_active: boolean;
      contraception_method: string;
    };
    menstrual_history: {
      menarche_age: number;
      cycle_frequency: number;
      period_duration: number;
    };
  };

  @IsObject()
  associated_symptoms: {
    pain: {
      pelvic_pain?: string;
      vulvar_irritation?: string;
    };
    systemic: {
      fatigue?: string;
      nausea?: boolean;
      fever?: boolean;
    };
  };

  @IsObject()
  medical_context: {
    current_medications: string[];
    recent_medications: string[];
    medical_conditions: string[];
    previous_gynecological_issues: string[];
    allergies: string[];
    family_history: string[];
  };

  @IsObject()
  healthcare_interaction: {
    previous_consultation: boolean;
    consultation_outcome: string;
    investigations_done: boolean;
    current_treatment: string;
  };

  @IsObject()
  patient_concerns: {
    main_worry: string;
    impact_on_life: string;
    additional_notes: string;
  };


}

export class AIAgentDetailedSymptomsResponseDto {
  @IsString()
  consultationId: string;

  @IsString()
  clinicalSessionId: string;

  @IsString()
  diagnosis: string;

  @IsNumber()
  confidence_score: number;

  @IsArray()
  @IsString({ each: true })
  recommended_tests: string[];

  @IsArray()
  @IsString({ each: true })
  treatment_recommendations: string[];

  @IsString()
  urgency_level: string;

  @IsBoolean()
  follow_up_required: boolean;

  @IsString()
  message: string;

  @IsDate()
  timestamp: Date;
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



export class GynecologicalPatientProfileDto {
  @ApiProperty({ description: 'Patient age', minimum: 10, maximum: 100 })
  @IsInt()
  @Min(10)
  @Max(100)
  age: number;

  @ApiProperty({ description: 'Patient request ID' })
  @IsString()
  @IsNotEmpty()
  request_id: string;

  @ApiProperty({ description: 'Timestamp of assessment' })
  @IsDateString()
  timestamp: string;
}

export class GynecologicalPrimaryComplaintDto {
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

  @ApiProperty({ description: 'Onset type' })
  @IsString()
  @IsNotEmpty()
  onset: string;

  @ApiProperty({ description: 'Progression pattern' })
  @IsString()
  @IsNotEmpty()
  progression: string;
}

export class GynecologicalSymptomSpecificDetailsDto {
  @ApiProperty({ 
    description: 'Symptom characteristics', 
    type: 'object',
    additionalProperties: true
  })
  @IsObject()
  symptom_characteristics: Record<string, any>;
}

export class GynecologicalPregnancyStatusDto {
  @ApiProperty({ description: 'Could be pregnant' })
  @IsBoolean()
  could_be_pregnant: boolean;

  @ApiProperty({ description: 'Pregnancy test result' })
  @IsString()
  @IsNotEmpty()
  pregnancy_test_result: string;
}

export class GynecologicalSexualActivityDto {
  @ApiProperty({ description: 'Sexually active' })
  @IsBoolean()
  sexually_active: boolean;

  @ApiProperty({ description: 'Contraception method' })
  @IsString()
  @IsNotEmpty()
  contraception_method: string;
}

export class GynecologicalMenstrualHistoryDto {
  @ApiProperty({ description: 'Age at menarche', minimum: 8, maximum: 20 })
  @IsInt()
  @Min(8)
  @Max(20)
  menarche_age: number;

  @ApiProperty({ description: 'Cycle frequency in days' })
  @IsInt()
  cycle_frequency: number;

  @ApiProperty({ description: 'Period duration in days' })
  @IsInt()
  period_duration: number;
}

export class GynecologicalReproductiveHistoryDto {
  @ApiProperty({ description: 'Pregnancy status' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalPregnancyStatusDto)
  pregnancy_status: GynecologicalPregnancyStatusDto;

  @ApiProperty({ description: 'Sexual activity' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalSexualActivityDto)
  sexual_activity: GynecologicalSexualActivityDto;

  @ApiProperty({ description: 'Menstrual history' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalMenstrualHistoryDto)
  menstrual_history: GynecologicalMenstrualHistoryDto;
}

export class GynecologicalPainDto {
  @ApiProperty({ description: 'Pelvic pain', required: false })
  @IsOptional()
  @IsString()
  pelvic_pain?: string;

  @ApiProperty({ description: 'Vulvar irritation', required: false })
  @IsOptional()
  @IsString()
  vulvar_irritation?: string;
}

export class GynecologicalSystemicDto {
  @ApiProperty({ description: 'Fatigue level', required: false })
  @IsOptional()
  @IsString()
  fatigue?: string;

  @ApiProperty({ description: 'Nausea', required: false })
  @IsOptional()
  @IsBoolean()
  nausea?: boolean;

  @ApiProperty({ description: 'Fever', required: false })
  @IsOptional()
  @IsBoolean()
  fever?: boolean;
}

export class GynecologicalAssociatedSymptomsDto {
  @ApiProperty({ description: 'Pain-related symptoms' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalPainDto)
  pain: GynecologicalPainDto;

  @ApiProperty({ description: 'Systemic symptoms' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalSystemicDto)
  systemic: GynecologicalSystemicDto;
}

export class GynecologicalMedicalContextDto {
  @ApiProperty({ description: 'Current medications', type: [String] })
  @IsArray()
  @IsString({ each: true })
  current_medications: string[];

  @ApiProperty({ description: 'Recent medications', type: [String] })
  @IsArray()
  @IsString({ each: true })
  recent_medications: string[];

  @ApiProperty({ description: 'Medical conditions', type: [String] })
  @IsArray()
  @IsString({ each: true })
  medical_conditions: string[];

  @ApiProperty({ description: 'Previous gynecological issues', type: [String] })
  @IsArray()
  @IsString({ each: true })
  previous_gynecological_issues: string[];

  @ApiProperty({ description: 'Allergies', type: [String] })
  @IsArray()
  @IsString({ each: true })
  allergies: string[];

  @ApiProperty({ description: 'Family history', type: [String] })
  @IsArray()
  @IsString({ each: true })
  family_history: string[];
}

export class GynecologicalHealthcareInteractionDto {
  @ApiProperty({ description: 'Previous consultation for similar issue' })
  @IsBoolean()
  previous_consultation: boolean;

  @ApiProperty({ description: 'Previous consultation outcome' })
  @IsString()
  @IsNotEmpty()
  consultation_outcome: string;

  @ApiProperty({ description: 'Investigations done' })
  @IsBoolean()
  investigations_done: boolean;

  @ApiProperty({ description: 'Current treatment' })
  @IsString()
  @IsNotEmpty()
  current_treatment: string;
}

export class GynecologicalPatientConcernsDto {
  @ApiProperty({ description: 'Main worry or concern' })
  @IsString()
  @IsNotEmpty()
  main_worry: string;

  @ApiProperty({ description: 'Impact on daily life' })
  @IsString()
  @IsNotEmpty()
  impact_on_life: string;

  @ApiProperty({ description: 'Additional notes' })
  @IsString()
  @IsNotEmpty()
  additional_notes: string;
}

export class GynecologicalAssessmentDto {
  @ApiProperty({ description: 'Patient profile information' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalPatientProfileDto)
  patient_profile: GynecologicalPatientProfileDto;

  @ApiProperty({ description: 'Primary complaint details' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalPrimaryComplaintDto)
  primary_complaint: GynecologicalPrimaryComplaintDto;

  @ApiProperty({ description: 'Symptom-specific characteristics' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalSymptomSpecificDetailsDto)
  symptom_specific_details: GynecologicalSymptomSpecificDetailsDto;

  @ApiProperty({ description: 'Reproductive history' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalReproductiveHistoryDto)
  reproductive_history: GynecologicalReproductiveHistoryDto;

  @ApiProperty({ description: 'Associated symptoms' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalAssociatedSymptomsDto)
  associated_symptoms: GynecologicalAssociatedSymptomsDto;

  @ApiProperty({ description: 'Medical context and history' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalMedicalContextDto)
  medical_context: GynecologicalMedicalContextDto;

  @ApiProperty({ description: 'Healthcare interaction history' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalHealthcareInteractionDto)
  healthcare_interaction: GynecologicalHealthcareInteractionDto;

  @ApiProperty({ description: 'Patient concerns and impact' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => GynecologicalPatientConcernsDto)
  patient_concerns: GynecologicalPatientConcernsDto;
}



// Response DTO for AI agent structured diagnosis (different from controller version)
export class AIStructuredDiagnosisResponseDto {
  @ApiProperty({ description: 'Request ID' })
  @IsString()
  request_id: string;

  @ApiProperty({ description: 'Patient age' })
  @IsInt()
  patient_age: number;

  @ApiProperty({ description: 'Primary symptom' })
  @IsString()
  primary_symptom: string;

  @ApiProperty({ description: 'Possible diagnoses', type: [Object] })
  @IsArray()
  possible_diagnoses: {
    name: string;
    confidence_score: number;
    description?: string;
  }[];

  @ApiProperty({ description: 'Clinical reasoning' })
  @IsString()
  clinical_reasoning: string;

  @ApiProperty({ description: 'Differential considerations', type: [String] })
  @IsArray()
  @IsString({ each: true })
  differential_considerations: string[];

  @ApiProperty({ description: 'Safety assessment' })
  @IsObject()
  safety_assessment: {
    allergy_considerations: {
      allergic_medications: string[];
      safe_alternatives: string[];
      contraindicated_drugs: string[];
    };
    condition_interactions: string[];
    safety_warnings: string[];
  };

  @ApiProperty({ description: 'Risk assessment' })
  @IsObject()
  risk_assessment: {
    urgency_level: 'low' | 'moderate' | 'high' | 'urgent';
    red_flags: string[];
    when_to_seek_emergency_care: string[];
  };

  @ApiProperty({ description: 'Recommended investigations', type: [Object] })
  @IsArray()
  recommended_investigations: {
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }[];

  @ApiProperty({ description: 'Treatment recommendations' })
  @IsObject()
  treatment_recommendations: {
    primary_treatment?: string;
    safe_medications: {
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      reason: string;
      notes?: string;
    }[];
    lifestyle_modifications: string[];
    dietary_advice: string[];
    follow_up_timeline: string;
  };

  @ApiProperty({ description: 'Patient education points', type: [String] })
  @IsArray()
  @IsString({ each: true })
  patient_education: string[];

  @ApiProperty({ description: 'Warning signs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  warning_signs: string[];

  @ApiProperty({ description: 'Confidence score', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence_score: number;

  @ApiProperty({ description: 'Processing notes', type: [String] })
  @IsArray()
  @IsString({ each: true })
  processing_notes: string[];

  @ApiProperty({ description: 'Medical disclaimer' })
  @IsString()
  disclaimer: string;

  @ApiProperty({ description: 'Timestamp' })
  @IsDateString()
  timestamp: string;
}
