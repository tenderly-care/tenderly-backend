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

  @Prop({ required: true, type: Types.ObjectId, unique: true, index: true })
  sessionId: Types.ObjectId;

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

  // Detailed symptoms following new flexible structure
  @Prop({ type: Object })
  @Encrypt()
  detailedSymptoms: {
    primary_complaint: {
      main_symptom: string;
      duration: string;
      severity: string;
      onset: string;
      progression: string;
    };
    symptom_specific_details: {
      symptom_characteristics: Record<string, any>;
      filled_by: Types.ObjectId;
      filled_at: Date;
      schema_version?: string;
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

  // Enhanced AI diagnosis with comprehensive details
  @Prop({ type: Object })
  @Encrypt()
  aiDiagnosis: {
    possible_diagnoses: string[];
    clinical_reasoning: string;
    recommended_investigations: string[];
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
    timestamp: Date;
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

  // Enhanced metadata
  @Prop({ type: Object })
  metadata: {
    sessionId: Types.ObjectId;
    patientId: Types.ObjectId;
    doctorId: Types.ObjectId;
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

  // Audit and compliance
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy: Types.ObjectId;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

// Indexes for efficient queries
ConsultationSchema.index({ patientId: 1, createdAt: -1 });
ConsultationSchema.index({ doctorId: 1, createdAt: -1 });
ConsultationSchema.index({ sessionId: 1 }, { unique: true });
ConsultationSchema.index({ status: 1 });
ConsultationSchema.index({ parentConsultationId: 1 });
ConsultationSchema.index({ consultationType: 1 });
ConsultationSchema.index({ 'detailedSymptoms.primary_complaint.main_symptom': 'text' });
ConsultationSchema.index({ 'aiDiagnosis.possible_diagnoses': 1 });
ConsultationSchema.index({ consultationStartTime: -1 });
ConsultationSchema.index({ isDeleted: 1 });

// Pre-save middleware to handle status history
ConsultationSchema.pre('save', function(this: ConsultationDocument) {
  // Track status changes
  if (this.isModified('status')) {
    if (!this.statusHistory) this.statusHistory = [];
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      changedBy: this.doctorId || this.patientId, // Default to appropriate user
    });
  }
  
  // Ensure metadata consistency
  if (!this.metadata) {
    this.metadata = {
      sessionId: this.sessionId,
      patientId: this.patientId,
      doctorId: this.doctorId,
    };
  }
});
