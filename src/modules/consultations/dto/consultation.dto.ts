import { IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray, IsString, IsObject, IsIn, Min, Max, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsNotEmpty()
  @IsString()
  readonly diagnosis: string;

  @IsNotEmpty()
  @IsString()
  readonly severity: 'low' | 'medium' | 'high' | 'critical';

  @IsNotEmpty()
  @IsString()
  readonly recommendedConsultationType: 'chat' | 'video' | 'emergency';

  @IsOptional()
  @IsArray()
  readonly recommendedTests?: string[];

  @IsOptional()
  @IsNumber()
  readonly confidence?: number;

  @IsOptional()
  @IsObject()
  readonly fullDiagnosis?: any; // Full AI response stored temporarily
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
