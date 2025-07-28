import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export type ConsultationDocument = Consultation & Document;

export enum ConsultationStatus {
  PENDING = 'pending',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  CLINICAL_ASSESSMENT_PENDING = 'clinical_assessment_pending',
  CLINICAL_ASSESSMENT_COMPLETE = 'clinical_assessment_complete',
  DOCTOR_REVIEW_PENDING = 'doctor_review_pending',
  DOCTOR_ASSIGNED = 'doctor_assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum ConsultationType {
  CHAT = 'chat',
  VIDEO = 'video',
  TELE = 'tele',
  EMERGENCY = 'emergency',
  FOLLOW_UP = 'follow_up',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency',
}

export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
  EMERGENCY = 5,
}

@Schema({ timestamps: true, collection: 'consultations' })
export class Consultation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true, type: String, unique: true, index: true })
  consultationId: string; // Changed from sessionId to consultationId - unique consultation identifier

  @Prop({ 
    type: String, 
    enum: ConsultationStatus, 
    default: ConsultationStatus.PENDING,
    index: true
  })
  status: ConsultationStatus;

  @Prop({ 
    type: String, 
    enum: ConsultationType, 
    required: true 
  })
  consultationType: ConsultationType;

  // Detailed symptoms matching tenderly-ai-agent JSON schema
  @Prop({ type: Object })
  @Encrypt()
  detailedSymptoms: {
    patient_profile: {
      age: number;
      request_id: string; // patient_id
      timestamp: string;
    };
    primary_complaint: {
      main_symptom: string;
      duration: string;
      severity: 'mild' | 'moderate' | 'severe';
      onset: string;
      progression: string;
    };
    symptom_specific_details: {
      symptom_characteristics: Record<string, any>;
    };
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
    associated_symptoms: {
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
    medical_context: {
      current_medications: string[];
      recent_medications: string[];
      medical_conditions: string[];
      previous_gynecological_issues: string[];
      allergies: string[];
      family_history: string[];
    };
    healthcare_interaction: {
      previous_consultation: boolean;
      consultation_outcome: string;
      investigations_done: boolean;
      current_treatment: string;
    };
    patient_concerns: {
      main_worry: string;
      impact_on_life: string;
      additional_notes: string;
    };
  };

  // AI diagnosis - stores raw response from tenderly-ai-agent
  @Prop({ type: Object })
  @Encrypt()
  aiDiagnosis: any; // Raw response from tenderly-ai-agent

  // Structured diagnosis - stores comprehensive structured diagnosis response
  @Prop({ type: Object })
  @Encrypt()
  structuredDiagnosis: {
    request_id: string;
    patient_age: number;
    primary_symptom: string;
    possible_diagnoses: Array<{
      name: string;
      confidence_score: number;
      description?: string;
    }>;
    clinical_reasoning: string;
    differential_considerations: string[];
    safety_assessment: {
      allergy_considerations: {
        allergic_medications: string[];
        safe_alternatives: string[];
        contraindicated_drugs: string[];
      };
      condition_interactions: string[];
      safety_warnings: string[];
    };
    risk_assessment: {
      urgency_level: 'low' | 'moderate' | 'high' | 'urgent';
      red_flags: string[];
      when_to_seek_emergency_care: string[];
    };
    recommended_investigations: Array<{
      name: string;
      priority: 'low' | 'medium' | 'high';
      reason: string;
    }>;
    treatment_recommendations: {
      primary_treatment?: string;
      safe_medications: Array<{
        name: string;
        dosage: string;
        frequency: string;
        duration: string;
        reason: string;
        notes?: string;
      }>;
      lifestyle_modifications: string[];
      dietary_advice: string[];
      follow_up_timeline: string;
    };
    patient_education: string[];
    warning_signs: string[];
    confidence_score: number;
    processing_notes: string[];
    disclaimer: string;
    timestamp: string;
  };

  // Reference to separate prescription documents
  @Prop({ type: [Types.ObjectId], ref: 'Prescription', default: [] })
  prescriptionIds: Types.ObjectId[];

  @Prop()
  prescriptionPdfUrl: string;

  // Enhanced chat history
  @Prop({ type: [Object], default: [] })
  @Encrypt()
  chatHistory: {
    senderId: Types.ObjectId;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
  }[];

  // Enhanced payment information
  @Prop({ type: Object })
  @Encrypt()
  paymentInfo: {
    paymentId: Types.ObjectId | string; // Allow both ObjectId and string for mock payments
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: 'pending' | 'completed' | 'failed';
    transactionId?: string;
    paymentDate: Date;
  };

  // Status tracking with history
  @Prop({ type: [Object], default: [] })
  statusHistory: {
    status: ConsultationStatus;
    changedAt: Date;
    changedBy: Types.ObjectId;
    reason?: string;
  }[];

  // Consultation timing
  @Prop({ type: Date })
  consultationStartTime: Date;

  @Prop({ type: Date })
  consultationEndTime: Date;

  // Metadata for tracking
  @Prop({ type: Object })
  metadata: {
    consultationId: string;
    patientId: Types.ObjectId;
    doctorId?: Types.ObjectId;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    deviceInfo?: string;
  };

  // Follow-up management
  @Prop({ type: Number, default: 0 })
  followUpNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  parentConsultationId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Consultation', default: [] })
  followUpConsultations: Types.ObjectId[];

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy: Types.ObjectId;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

// Indexes for performance
ConsultationSchema.index({ patientId: 1, status: 1 });
ConsultationSchema.index({ consultationId: 1 }, { unique: true });
ConsultationSchema.index({ doctorId: 1, status: 1 });
ConsultationSchema.index({ createdAt: -1 });
ConsultationSchema.index({ updatedAt: -1 });
