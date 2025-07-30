import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  resourceType: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @Prop({ type: Object })
  oldValue?: any;

  @Prop({ type: Object })
  newValue?: any;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ enum: ['low', 'medium', 'high', 'critical'], required: true })
  severity: 'low' | 'medium' | 'high' | 'critical';

  @Prop({
    enum: [
      'authentication',
      'data_access',
      'administration',
      'security',
      'system',
    ],
    required: true,
  })
  category:
    | 'authentication'
    | 'data_access'
    | 'administration'
    | 'security'
    | 'system';

  @Prop({ required: true })
  success: boolean;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Object })
  additionalData?: Record<string, any>;

  @Prop()
  sessionId?: string;

  @Prop()
  requestId?: string;

  @Prop({ required: true })
  fingerprint: string;

  @Prop({
    type: {
      ndhm: { type: Boolean, default: false },
      gdpr: { type: Boolean, default: false },
      hipaa: { type: Boolean, default: false },
    },
    required: true,
  })
  complianceFlags: {
    ndhm: boolean;
    gdpr: boolean;
    hipaa: boolean;
  };

  @Prop({ required: true })
  retentionDate: Date;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop()
  location?: string;

  @Prop()
  deviceFingerprint?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes for performance
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, action: 1 });
AuditLogSchema.index({ category: 1, severity: 1 });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ retentionDate: 1 });
AuditLogSchema.index({ 'complianceFlags.ndhm': 1 });
AuditLogSchema.index({ 'complianceFlags.gdpr': 1 });
AuditLogSchema.index({ fingerprint: 1 }, { unique: true });
AuditLogSchema.index({ ipAddress: 1, timestamp: -1 });

// TTL index for automatic cleanup
AuditLogSchema.index({ retentionDate: 1 }, { expireAfterSeconds: 0 });
