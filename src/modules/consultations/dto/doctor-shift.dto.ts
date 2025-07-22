import { IsNotEmpty, IsEnum, IsOptional, IsString, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShiftType, ShiftStatus } from '../schemas/doctor-shift.schema';

export class CreateDoctorShiftDto {
  @ApiProperty({ enum: ShiftType, description: 'Type of shift' })
  @IsEnum(ShiftType)
  readonly shiftType: ShiftType;

  @ApiProperty({ description: 'Doctor ID to assign to this shift' })
  @IsNotEmpty()
  @IsString()
  readonly doctorId: string;

  @ApiProperty({ description: 'Start hour (0-23)', minimum: 0, maximum: 23 })
  @IsNumber()
  @Min(0)
  @Max(23)
  readonly startHour: number;

  @ApiProperty({ description: 'End hour (0-23)', minimum: 0, maximum: 23 })
  @IsNumber()
  @Min(0)
  @Max(23)
  readonly endHour: number;

  @ApiProperty({ description: 'Optional notes about the shift assignment' })
  @IsOptional()
  @IsString()
  readonly notes?: string;

  @ApiProperty({ description: 'Effective from date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  readonly effectiveFrom?: string;

  @ApiProperty({ description: 'Effective to date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  readonly effectiveTo?: string;
}

export class UpdateDoctorShiftDto {
  @ApiProperty({ description: 'Doctor ID to assign to this shift' })
  @IsOptional()
  @IsString()
  readonly doctorId?: string;

  @ApiProperty({ description: 'Start hour (0-23)', minimum: 0, maximum: 23 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  readonly startHour?: number;

  @ApiProperty({ description: 'End hour (0-23)', minimum: 0, maximum: 23 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  readonly endHour?: number;

  @ApiProperty({ enum: ShiftStatus, description: 'Shift status' })
  @IsOptional()
  @IsEnum(ShiftStatus)
  readonly status?: ShiftStatus;

  @ApiProperty({ description: 'Optional notes about the shift assignment' })
  @IsOptional()
  @IsString()
  readonly notes?: string;

  @ApiProperty({ description: 'Effective from date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  readonly effectiveFrom?: string;

  @ApiProperty({ description: 'Effective to date (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  readonly effectiveTo?: string;
}

export class DoctorShiftResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ShiftType })
  shiftType: ShiftType;

  @ApiProperty()
  doctorId: string;

  @ApiProperty()
  startHour: number;

  @ApiProperty()
  endHour: number;

  @ApiProperty({ enum: ShiftStatus })
  status: ShiftStatus;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  updatedBy?: string;

  @ApiProperty()
  effectiveFrom?: Date;

  @ApiProperty()
  effectiveTo?: Date;

  @ApiProperty()
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
