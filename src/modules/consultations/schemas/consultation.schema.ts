import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export type ConsultationDocument = Consultation & Document;

export enum ConsultationStatus {
  // Core simplified statuses for production
  ACTIVE = 'active',                         // Consultation is active and available
  COMPLETED = 'completed',                   // Consultation finished successfully
  IN_PROGRESS = 'in_progress',               // Currently ongoing with doctor
  CANCELLED = 'cancelled',                   // Cancelled by patient/doctor
  EXPIRED = 'expired',                       // Consultation expired (timeout)
  REFUNDED = 'refunded',                     // Payment refunded
  
  // Additional detailed statuses for workflow management
  DRAFT = 'draft',                           // Initial draft state
  PENDING = 'pending',                       // Awaiting action
  PAYMENT_PENDING = 'payment_pending',       // Payment not yet completed
  PAYMENT_CONFIRMED = 'payment_confirmed',   // Payment completed successfully
  CLINICAL_ASSESSMENT_PENDING = 'clinical_assessment_pending',  // Awaiting clinical assessment
  CLINICAL_ASSESSMENT_COMPLETE = 'clinical_assessment_complete', // Clinical assessment done
  DOCTOR_REVIEW_PENDING = 'doctor_review_pending',  // Awaiting doctor review
  DOCTOR_ASSIGNED = 'doctor_assigned',       // Doctor has been assigned
  ON_HOLD = 'on_hold'                       // Consultation temporarily on hold
}

export enum ConsultationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
  EMERGENCY = 'emergency'
}

export enum ConsultationType {
  CHAT = 'chat',
  VIDEO = 'video',
  TELE = 'tele',
  EMERGENCY = 'emergency',
  FOLLOW_UP = 'follow_up'
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

  // Doctor Information (populated for faster access)
  @Prop({ type: Object })
  @Encrypt()
  doctorInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialization?: string;
    assignedAt: Date;
    assignedBy: 'system' | 'admin' | 'shift_rotation';
  };

  @Prop({ required: true, type: String, unique: true, index: true })
  consultationId: string;

  @Prop({ required: true, type: String, unique: true, index: true })
  clinicalSessionId: string;

  @Prop({ type: String, enum: ConsultationStatus, default: ConsultationStatus.ACTIVE, index: true })
  status: ConsultationStatus;

  @Prop({ type: String, enum: ConsultationType, required: true, index: true })
  consultationType: ConsultationType;

  @Prop({ type: String, enum: ConsultationPriority, default: ConsultationPriority.NORMAL, index: true })
  priority: ConsultationPriority;

  // Business Logic Fields
  @Prop({ type: Boolean, default: false, index: true })
  isActive: boolean; // Only one consultation can be active per patient

  @Prop({ type: Date })
  activatedAt?: Date; // When consultation became active

  @Prop({ type: Date })
  completedAt?: Date; // When consultation was completed

  @Prop({ type: Date })
  cancelledAt?: Date; // When consultation was cancelled

  @Prop({ type: Date })
  expiresAt?: Date; // Consultation expiry time

  @Prop({ type: Number, default: 0 })
  sessionCount: number; // Number of sessions/visits

  @Prop({ type: Number, default: 0 })
  messageCount: number; // Number of messages exchanged

  // Payment Information
  @Prop({ type: Object })
  @Encrypt()
  paymentInfo: {
    paymentId: string;
    paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
    amount: number;
    currency: string;
    paidAt?: Date;
    transactionId?: string;
    paymentMethod?: string;
    gatewayResponse?: any;
    refundAmount?: number;
    refundReason?: string;
    refundedAt?: Date;
  };

  // Assessment Data
  @Prop({ type: Object })
  @Encrypt()
  structuredAssessmentInput: any; // GynecologicalAssessmentDto

  @Prop({ type: Object })
  @Encrypt()
  aiAgentOutput: any; // StructuredDiagnosisResponseDto

  // Prescription Management
  @Prop({ type: String, enum: ['pending', 'sent'], default: 'pending' })
  prescriptionStatus: 'pending' | 'sent';

  @Prop({ type: String })
  sentPrescriptionPdfUrl?: string;

  // Communication History
  @Prop({ type: [Object], default: [] })
  @Encrypt()
  chatHistory: Array<{
    senderId: Types.ObjectId;
    senderType: 'patient' | 'doctor' | 'system';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file' | 'system';
    attachments?: string[];
    isRead: boolean;
  }>;

  // Status History with Enhanced Tracking
  @Prop({ type: [Object], default: [] })
  statusHistory: Array<{
    status: ConsultationStatus;
    changedAt: Date;
    changedBy: Types.ObjectId;
    reason?: string;
    previousStatus?: ConsultationStatus;
    metadata?: {
      source?: 'patient' | 'doctor' | 'system' | 'payment' | 'timeout';
      trigger?: string;
      notes?: string;
    };
  }>;

  // Business Rules and Constraints
  @Prop({ type: [String], default: [] })
  businessRules: string[]; // Applied business rules

  @Prop({ type: Boolean, default: false })
  requiresFollowUp: boolean;

  @Prop({ type: String })
  followUpReason?: string;

  @Prop({ type: Date })
  followUpDate?: Date;

  // Quality and Compliance
  @Prop({ type: Boolean, default: false })
  isQualityReviewed: boolean;

  @Prop({ type: Date })
  qualityReviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  qualityReviewedBy?: Types.ObjectId;

  @Prop({ type: Number, min: 1, max: 5 })
  patientSatisfactionRating?: number;

  @Prop({ type: String })
  patientFeedback?: string;

  // Metadata and Audit
  @Prop({ type: Object })
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    deviceInfo?: string;
    source?: 'web' | 'mobile' | 'api';
    referralSource?: string;
    campaignId?: string;
    [key: string]: any;
  };

  // Soft Delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  // Indexes for Performance
  @Prop({ type: Date, index: true })
  createdAt: Date;

  @Prop({ type: Date, index: true })
  updatedAt: Date;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

// Indexes for performance
ConsultationSchema.index({ patientId: 1, status: 1 });
ConsultationSchema.index({ consultationId: 1 }, { unique: true });
ConsultationSchema.index({ doctorId: 1, status: 1 });
ConsultationSchema.index({ createdAt: -1 });
ConsultationSchema.index({ updatedAt: -1 });
