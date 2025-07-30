import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DoctorShiftDocument = DoctorShift & Document;

export enum ShiftType {
  MORNING = 'morning',
  EVENING = 'evening'
}

export enum ShiftStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

@Schema({ timestamps: true })
export class DoctorShift {
  @Prop({ 
    type: String, 
    enum: ShiftType, 
    required: true,
    unique: true 
  })
  shiftType: ShiftType;

  @Prop({ 
    required: true, 
    type: Types.ObjectId, 
    ref: 'User' 
  })
  doctorId: Types.ObjectId;

  @Prop({ 
    required: true,
    validate: {
      validator: function(v: number) {
        return v >= 0 && v <= 23;
      },
      message: 'Start hour must be between 0 and 23'
    }
  })
  startHour: number;

  @Prop({ 
    required: true,
    validate: {
      validator: function(v: number) {
        return v >= 0 && v <= 23;
      },
      message: 'End hour must be between 0 and 23'
    }
  })
  endHour: number;

  @Prop({ 
    type: String, 
    enum: ShiftStatus, 
    default: ShiftStatus.ACTIVE 
  })
  status: ShiftStatus;

  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User',
    required: true 
  })
  createdBy: Types.ObjectId;

  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User' 
  })
  updatedBy: Types.ObjectId;

  @Prop({ type: Date })
  effectiveFrom: Date;

  @Prop({ type: Date })
  effectiveTo: Date;

  @Prop({ type: String })
  notes: string;
}

export const DoctorShiftSchema = SchemaFactory.createForClass(DoctorShift);

// Indexes for performance
DoctorShiftSchema.index({ shiftType: 1, status: 1 });
DoctorShiftSchema.index({ doctorId: 1 });
DoctorShiftSchema.index({ effectiveFrom: 1, effectiveTo: 1 });

// Validation middleware
DoctorShiftSchema.pre('save', function(next) {
  if (this.startHour >= this.endHour) {
    next(new Error('Start hour must be less than end hour'));
  }
  next();
});
