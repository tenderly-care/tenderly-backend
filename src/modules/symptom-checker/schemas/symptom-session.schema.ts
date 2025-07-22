import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SymptomSessionDocument = SymptomSession & Document;

export enum SessionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  PAID = 'paid',
  EXPIRED = 'expired',
}

export enum ConsultationType {
  CHAT = 'chat',
  VIDEO = 'video',
  EMERGENCY = 'emergency',
}

@Schema({ timestamps: true })
export class SymptomSession {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ 
    type: String, 
    enum: SessionStatus, 
    default: SessionStatus.PENDING 
  })
  status: SessionStatus;

  @Prop({ type: Object })
  symptoms: {
    primarySymptom: string;
    duration: string;
    severity: number; // 1-10 scale
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

  @Prop({ type: Object })
  aiDiagnosis: {
    primaryDiagnosis: string;
    differentialDiagnosis: string[];
    recommendedTests: string[];
    urgencyLevel: string;
    confidence: number;
    generatedAt: Date;
  };

  @Prop({ 
    type: String, 
    enum: ConsultationType 
  })
  consultationType: ConsultationType;

  @Prop({ type: Object })
  paymentInfo: {
    amount: number;
    currency: string;
    paymentId: string;
    status: string;
    paidAt: Date;
  };

  @Prop({ type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) })
  expiresAt: Date;

  @Prop({ type: Object })
  metadata: {
    ipAddress: string;
    userAgent: string;
    location: string;
    deviceInfo: string;
  };
}

export const SymptomSessionSchema = SchemaFactory.createForClass(SymptomSession);

// Index for efficient queries
SymptomSessionSchema.index({ patientId: 1, createdAt: -1 });
SymptomSessionSchema.index({ sessionId: 1 }, { unique: true });
SymptomSessionSchema.index({ status: 1 });
SymptomSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
