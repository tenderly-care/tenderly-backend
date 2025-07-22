import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export type ConsultationDocument = Consultation & Document;

export enum ConsultationStatus {
  PENDING = 'pending',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  DOCTOR_ASSIGNED = 'doctor_assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum ConsultationType {
  CHAT = 'chat',
  VIDEO = 'video',
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

@Schema({ timestamps: true })
export class Consultation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ 
    type: String, 
    enum: ConsultationStatus, 
    default: ConsultationStatus.PENDING 
  })
  status: ConsultationStatus;

  @Prop({ 
    type: String, 
    enum: ConsultationType, 
    required: true 
  })
  consultationType: ConsultationType;

  // Initial symptoms and medical history
  @Prop({ type: Object })
  initialSymptoms: {
    primarySymptom: string;
    duration: string;
    severity: number;
    additionalSymptoms: string[];
    triggers: string[];
    previousTreatments: string[];
  };

  @Prop({ type: Object })
  medicalHistory: {
    allergies: string[];
    currentMedications: string[];
    chronicConditions: string[];
    previousSurgeries: string[];
    familyHistory: string[];
  };

  // AI preliminary diagnosis
  @Prop({ type: Object })
  aiDiagnosis: {
    primaryDiagnosis: string;
    differentialDiagnosis: string[];
    recommendedTests: string[];
    urgencyLevel: string;
    confidence: number;
    generatedAt: Date;
  };

  // Final diagnosis and prescription by doctor
  @Prop({ type: Object })
  finalDiagnosis: {
    diagnosis: string;
    notes: string;
    treatmentPlan: string;
    followUpRequired: boolean;
    followUpDate: Date;
    doctorId: Types.ObjectId;
    diagnosedAt: Date;
  };

  @Prop({ type: [Object] })
  prescriptions: {
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    prescribedAt: Date;
  }[];

  // Chat history
  @Prop({ type: [Object] })
  chatHistory: {
    senderId: Types.ObjectId;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
  }[];

  // Payment information
  @Prop({ type: Object })
  paymentInfo: {
    amount: number;
    currency: string;
    paymentId: string;
    status: string;
    paidAt: Date;
  };

  // Follow-up information
  @Prop({ type: Number, default: 0 })
  followUpNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  parentConsultationId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Consultation' })
  followUpConsultations: Types.ObjectId[];

  // Metadata
  @Prop({ type: Date })
  consultationStartTime: Date;

  @Prop({ type: Date })
  consultationEndTime: Date;

  @Prop({ type: Object })
  metadata: {
    ipAddress: string;
    userAgent: string;
    location: string;
    deviceInfo: string;
  };
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

// Indexes for efficient queries
ConsultationSchema.index({ patientId: 1, createdAt: -1 });
ConsultationSchema.index({ doctorId: 1, createdAt: -1 });
ConsultationSchema.index({ sessionId: 1 }, { unique: true });
ConsultationSchema.index({ status: 1 });
ConsultationSchema.index({ parentConsultationId: 1 });
