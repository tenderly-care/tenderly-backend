import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

export type PatientProfileDocument = PatientProfile & Document;

@Schema({ timestamps: true, collection: 'patient-profiles' })
export class PatientProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  @Encrypt()
  demographicData: {
    age: number;
    name: string;
    location: string;
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
    dateOfBirth?: Date;
    contactInfo?: {
      email: string;
      phone: string;
      emergencyContact?: {
        name: string;
        phone: string;
        relationship: string;
      };
    };
  };

  @Prop({ type: [String], default: [] })
  @Encrypt()
  allergies: string[];

  @Prop({ type: Object })
  @Encrypt()
  menstrualHistory: {
    cycleFrequency: number; // days
    menarcheAge: number; // age at first menstruation
    periodDuration: number; // days
    lastPeriodDate?: Date;
    isRegular?: boolean;
    flowIntensity?: 'light' | 'normal' | 'heavy';
    painLevel?: number; // 1-10 scale
  };

  @Prop({ type: [String], default: [] })
  @Encrypt()
  currentMedications: string[];

  @Prop({ type: [String], default: [] })
  @Encrypt()
  medical_conditions: string[];

  @Prop({ type: [String], default: [] })
  @Encrypt()
  familyMedicalHistory: string[];

  @Prop({ type: Object })
  @Encrypt()
  lifestyleFactors: {
    smokingStatus?: 'never' | 'former' | 'current';
    alcoholConsumption?: 'none' | 'occasional' | 'regular' | 'heavy';
    exerciseFrequency?: 'none' | 'light' | 'moderate' | 'intense';
    dietaryRestrictions?: string[];
    sleepPattern?: {
      averageHours: number;
      quality: 'poor' | 'fair' | 'good' | 'excellent';
    };
    stressLevel?: number; // 1-10 scale
  };

  @Prop({ type: Object })
  @Encrypt()
  reproductiveHistory: {
    pregnancies?: number;
    liveBirths?: number;
    miscarriages?: number;
    abortions?: number;
    lastPregnancyDate?: Date;
    contraceptionMethods?: string[];
    sexuallyActive?: boolean;
    partnerCount?: number;
  };

  @Prop({ type: Object })
  @Encrypt()
  healthInsurance: {
    provider?: string;
    policyNumber?: string;
    coverage?: string[];
    validUntil?: Date;
  };

  // Profile completeness and verification
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  profileCompleteness: number;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  verifiedBy: Types.ObjectId;

  // GDPR and Compliance
  @Prop({ default: false })
  dataProcessingConsent: boolean;

  @Prop()
  consentDate: Date;

  @Prop({ default: false })
  marketingConsent: boolean;

  // Audit and metadata
  @Prop()
  lastUpdated: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;
}

export const PatientProfileSchema = SchemaFactory.createForClass(PatientProfile);

// Indexes for performance
PatientProfileSchema.index({ patientId: 1 }, { unique: true });
PatientProfileSchema.index({ 'demographicData.age': 1 });
PatientProfileSchema.index({ isVerified: 1 });
PatientProfileSchema.index({ isDeleted: 1 });
PatientProfileSchema.index({ createdAt: -1 });

// Auto-calculate profile completeness
PatientProfileSchema.pre('save', function(this: PatientProfileDocument) {
  const profile = this.toObject();
  let completedFields = 0;
  let totalFields = 0;

  // Check required demographic data
  totalFields += 4; // age, name, location, dateOfBirth
  if (profile.demographicData?.age) completedFields++;
  if (profile.demographicData?.name) completedFields++;
  if (profile.demographicData?.location) completedFields++;
  if (profile.demographicData?.dateOfBirth) completedFields++;

  // Check medical information
  totalFields += 5; // allergies, medications, conditions, family history, menstrual
  if (profile.allergies?.length > 0) completedFields++;
  if (profile.currentMedications?.length > 0) completedFields++;
  if (profile.medical_conditions?.length > 0) completedFields++;
  if (profile.familyMedicalHistory?.length > 0) completedFields++;
  if (profile.menstrualHistory?.cycleFrequency) completedFields++;

  // Check lifestyle factors
  totalFields += 3;
  if (profile.lifestyleFactors?.smokingStatus) completedFields++;
  if (profile.lifestyleFactors?.exerciseFrequency) completedFields++;
  if (profile.lifestyleFactors?.sleepPattern) completedFields++;

  this.profileCompleteness = Math.round((completedFields / totalFields) * 100);
  this.lastUpdated = new Date();
});
