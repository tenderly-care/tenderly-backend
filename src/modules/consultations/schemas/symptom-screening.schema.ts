import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SymptomScreeningDocument = SymptomScreening & Document;

@Schema({ timestamps: true, collection: 'symptom-screenings' })
export class SymptomScreening {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PatientProfile', index: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, unique: true })
  session_id: Types.ObjectId;

  @Prop({ type: Object, required: true })
  initialSymptoms: {
    primary_symptoms: string[];
    patient_age: number;
    severity_level: number;
    duration: string;
    onset: string;
    progression: string;
  };

  @Prop({ type: Object })
  aiScreening: {
    session_id: Types.ObjectId;
    patientId: Types.ObjectId;
    initialDiagnosis: {
      diagnosis: string[];
      confidenceScore: number;
      suggested_investigations: string[];
      recommended_medications: string[];
      lifestyle_advice: string[];
      follow_up_recommendations: string[];
      disclaimer: string;
      timestamp: Date;
      severity_level: number;
    }
  };

  @Prop({ type: Object })
  metadata: {
    sessionId: Types.ObjectId;
    patientId: Types.ObjectId;
  };

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;
}

export const SymptomScreeningSchema = SchemaFactory.createForClass(SymptomScreening);

SymptomScreeningSchema.index({ patientId: 1, createdAt: -1 });
SymptomScreeningSchema.index({ session_id: 1 }, { unique: true });
SymptomScreeningSchema.index({ 'initialDiagnosis.diagnosis': 1 }, { sparse: true });
SymptomScreeningSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
