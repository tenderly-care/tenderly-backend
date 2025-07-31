import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RecommendedInvestigationTestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

class RecommendedInvestigationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [RecommendedInvestigationTestDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedInvestigationTestDto)
  tests?: RecommendedInvestigationTestDto[];
}

class TreatmentRecommendationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primary_treatment?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  safe_medications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyle_modifications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary_advice?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  follow_up_timeline?: string;
}

export class ModifyDiagnosisDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  possible_diagnoses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinical_reasoning?: string;

  @ApiPropertyOptional({ type: [RecommendedInvestigationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedInvestigationDto)
  recommended_investigations?: RecommendedInvestigationDto[];

  @ApiPropertyOptional({ type: TreatmentRecommendationsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TreatmentRecommendationsDto)
  treatment_recommendations?: TreatmentRecommendationsDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patient_education?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warning_signs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confidence_score?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processing_notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disclaimer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  modificationNotes?: string;
}

