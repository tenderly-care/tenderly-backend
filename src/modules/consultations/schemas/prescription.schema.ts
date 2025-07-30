import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export type PrescriptionDocument = Prescription & Document;

export enum PrescriptionStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  DISPENSED = 'dispensed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

@Schema({ timestamps: true, collection: 'prescriptions' })
export class Prescription {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Consultation', index: true })
  consultationId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  patientId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  doctorId: Types.ObjectId;

  // Prescription Details
  @Prop({ type: [Object], required: true })
  @Encrypt()
  medications: {
    name: string;
    genericName?: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    instructions: string;
    route: 'oral' | 'topical' | 'injection' | 'other';
    sideEffects?: string[];
    contraindications?: string[];
    interactions?: string[];
    isControlledSubstance?: boolean;
    refillsAllowed?: number;
    refillsRemaining?: number;
  }[];

  // Medical Context
  @Prop({ type: Object })
  @Encrypt()
  clinicalContext: {
    diagnosis: string;
    symptoms: string[];
    vitalSigns?: {
      bloodPressure?: string;
      heartRate?: number;
      temperature?: number;
      weight?: number;
    };
    labResults?: string[];
    allergyAlerts?: string[];
  };

  // Prescription Metadata
  @Prop({ required: true })
  prescriptionNumber: string; // Unique prescription number

  @Prop({ type: String, enum: PrescriptionStatus, default: PrescriptionStatus.DRAFT })
  status: PrescriptionStatus;

  @Prop({ required: true })
  issuedAt: Date;

  @Prop()
  validUntil: Date; // Prescription validity period

  @Prop()
  dispensedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  dispensedBy: Types.ObjectId; // Pharmacist ID

  // Digital Signature and Security
  @Prop({ required: true })
  digitalSignature: string;

  @Prop()
  signatureTimestamp: Date;

  @Prop()
  qrCode: string; // For verification

  @Prop()
  encryptionHash: string; // For tamper detection

  // PDF and Document Management
  @Prop({ required: true })
  pdfDownloadUrl: string;

  @Prop()
  pdfGeneratedAt: Date;

  @Prop({ default: 0 })
  downloadCount: number;

  @Prop({ type: [Object] })
  downloadHistory: {
    downloadedAt: Date;
    downloadedBy: Types.ObjectId;
    ipAddress: string;
    userAgent: string;
  }[];

  // Legal and Compliance
  @Prop({ type: Object })
  @Encrypt()
  legalInfo: {
    doctorLicenseNumber: string;
    clinicRegistrationNumber?: string;
    prescriptionAuthority?: string;
    regulatoryCompliance: {
      fda?: boolean;
      indianDrugAct?: boolean;
      narcoticsControl?: boolean;
    };
  };

  // Instructions and Notes
  @Prop({ type: Object })
  @Encrypt()
  additionalInstructions: {
    generalInstructions?: string;
    dietaryRestrictions?: string[];
    followUpInstructions?: string;
    warningSignsToWatch?: string[];
    emergencyContactInfo?: string;
  };

  // Audit and Tracking
  @Prop({ type: [Object] })
  statusHistory: {
    status: PrescriptionStatus;
    changedAt: Date;
    changedBy: Types.ObjectId;
    reason?: string;
    notes?: string;
  }[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy: Types.ObjectId;

  // Metadata
  @Prop({ type: Object })
  metadata: {
    pharmacyInfo?: {
      pharmacyId?: string;
      pharmacyName?: string;
      pharmacyLocation?: string;
    };
    insuranceInfo?: {
      provider?: string;
      policyNumber?: string;
      copayAmount?: number;
    };
    costInfo?: {
      totalCost?: number;
      copayAmount?: number;
      discountApplied?: number;
    };
  };
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);

// Indexes for performance
PrescriptionSchema.index({ consultationId: 1 });
PrescriptionSchema.index({ patientId: 1, createdAt: -1 });
PrescriptionSchema.index({ doctorId: 1, createdAt: -1 });
PrescriptionSchema.index({ prescriptionNumber: 1 }, { unique: true });
PrescriptionSchema.index({ status: 1 });
PrescriptionSchema.index({ issuedAt: -1 });
PrescriptionSchema.index({ validUntil: 1 });
PrescriptionSchema.index({ 'medications.name': 'text' });

// Pre-save middleware for prescription number generation
PrescriptionSchema.pre('save', function(this: PrescriptionDocument) {
  if (this.isNew && !this.prescriptionNumber) {
    // Generate unique prescription number
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.prescriptionNumber = `RX-${date}-${random}`;
  }

  if (this.isNew) {
    this.issuedAt = new Date();
    this.signatureTimestamp = new Date();
    // Set validity to 30 days from issue date
    this.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  // Update status history
  if (this.isModified('status')) {
    if (!this.statusHistory) this.statusHistory = [];
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      changedBy: this.doctorId, // Default to doctor, can be overridden
    });
  }
});

// Auto-expire prescriptions
PrescriptionSchema.methods.checkExpiry = function(): boolean {
  if (this.validUntil && this.validUntil < new Date()) {
    this.status = PrescriptionStatus.EXPIRED;
    return true;
  }
  return false;
};
