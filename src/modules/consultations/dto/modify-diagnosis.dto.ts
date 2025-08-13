import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

// Detailed medication object structure
class MedicationDto {
  @ApiPropertyOptional({ description: 'Name of the medication' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Dosage of the medication (e.g., "500mg", "1 tablet")' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequency of administration (e.g., "twice daily", "every 8 hours")' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duration of treatment (e.g., "7 days", "2 weeks")' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Reason for prescribing this medication' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Additional notes, warnings, or instructions' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// Simple structure for recommended investigations
class RecommendedInvestigationDto {
  @ApiPropertyOptional({ description: 'Name of the investigation test' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Priority level of the test' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ description: 'Reason for the test' })
  @IsOptional()
  @IsString()
  reason?: string;
}

class TreatmentRecommendationsDto {
  @ApiPropertyOptional({ description: 'Primary treatment recommendation' })
  @IsOptional()
  @IsString()
  primary_treatment?: string;

  @ApiPropertyOptional({ 
    type: [MedicationDto], 
    description: 'List of safe medications with detailed information',
    example: [
      {
        name: 'Paracetamol',
        dosage: '500mg',
        frequency: 'twice daily',
        duration: '7 days',
        reason: 'Pain relief and fever reduction',
        notes: 'Take after meals to avoid stomach irritation'
      }
    ]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  safe_medications?: MedicationDto[];

  @ApiPropertyOptional({ type: [String], description: 'Lifestyle modification recommendations' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyle_modifications?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Dietary advice recommendations' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary_advice?: string[];

  @ApiPropertyOptional({ description: 'Follow-up timeline recommendation' })
  @IsOptional()
  @IsString()
  follow_up_timeline?: string;
}

/**
 * DTO for modifying doctor diagnosis - matches the exact structure of doctorDiagnosis
 */
export class ModifyDiagnosisDto {
  @ApiPropertyOptional({ type: [String], description: 'List of possible diagnoses' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  possible_diagnoses?: string[];

  @ApiPropertyOptional({ description: 'Clinical reasoning for the diagnosis' })
  @IsOptional()
  @IsString()
  clinical_reasoning?: string;

  @ApiPropertyOptional({ type: [RecommendedInvestigationDto], description: 'Recommended investigations' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedInvestigationDto)
  recommended_investigations?: RecommendedInvestigationDto[];

  @ApiPropertyOptional({ type: TreatmentRecommendationsDto, description: 'Treatment recommendations' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TreatmentRecommendationsDto)
  treatment_recommendations?: TreatmentRecommendationsDto;

  @ApiPropertyOptional({ type: [String], description: 'Patient education points' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patient_education?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Warning signs to watch for' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warning_signs?: string[];

  @ApiPropertyOptional({ description: 'Confidence score (0-1)' })
  @IsOptional()
  @IsNumber()
  confidence_score?: number;

  @ApiPropertyOptional({ description: 'Processing notes' })
  @IsOptional()
  @IsString()
  processing_notes?: string;

  @ApiPropertyOptional({ description: 'Medical disclaimer' })
  @IsOptional()
  @IsString()
  disclaimer?: string;

  // Additional metadata fields that can be modified
  @ApiPropertyOptional({ description: 'Notes about the modifications made' })
  @IsOptional()
  @IsString()
  modificationNotes?: string;
}

