import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { SymptomInputDto, AIDiagnosisResponseDto } from '../dto/consultation.dto';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';
import { AITokenService } from './ai-token.service';

// Basic AI Agent Request for simple symptoms
export interface BasicAIAgentRequest {
  symptoms: string[];
  patient_age: number;
  severity_level: 'mild' | 'moderate' | 'severe';
  duration: string;
  medical_history?: string[];
  additional_notes?: string;
}

// Detailed AI Agent Request for comprehensive diagnosis
export interface DetailedAIAgentRequest {
  patient_profile: {
    age: number;
    request_id: string;
    timestamp: string;
  };
  primary_complaint: {
    main_symptom: string;
    duration: string;
    severity: 'mild' | 'moderate' | 'severe';
    onset: string;
    progression: string;
  };
  symptom_specific_details?: Record<string, any>;
  reproductive_history?: Record<string, any>;
  associated_symptoms?: Record<string, any>;
  medical_context: {
    current_medications: string[];
    recent_medications: string[];
    medical_conditions: string[];
    previous_gynecological_issues?: string[];
    allergies: string[];
    family_history: string[];
  };
  healthcare_interaction: {
    previous_consultation: boolean;
    consultation_outcome?: string;
    investigations_done: boolean;
    investigation_results?: string;
    current_treatment: string;
  };
  patient_concerns: {
    main_worry: string;
    impact_on_life: 'minimal' | 'mild' | 'moderate' | 'significant' | 'severe';
    additional_notes?: string;
  };
}

// Legacy interface for backward compatibility
export interface AIAgentRequest {
  diagnosis_request: {
    symptoms: string[];
    patient_age?: number;
    medical_history: string[];
    severity_level: 'mild' | 'moderate' | 'severe';
    duration: string;
    additional_notes?: string;
  };
}

export interface AIAgentResponse {
  diagnosis: string;
  confidence_score: number;
  suggested_investigations: {
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }[];
  recommended_medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    reason: string;
    notes?: string;
  }[];
  lifestyle_advice: string[];
  follow_up_recommendations: string;
  disclaimer: string;
  timestamp: string;
}

@Injectable()
export class AIAgentService {
  private readonly logger = new Logger(AIAgentService.name);
  private readonly aiAgentUrl: string;
  private readonly requestTimeout: number = 30000; // 30 seconds
  private readonly maxRetries: number = 3;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly auditService: AuditService,
    private readonly aiTokenService: AITokenService,
  ) {
    this.aiAgentUrl = this.configService.get<string>('ai.diagnosis.baseUrl') || 'http://localhost:8000';
  }

  /**
   * Send symptoms to AI agent for diagnosis
   */
  async getDiagnosis(
    patientId: string,
    symptoms: SymptomInputDto,
    sessionId: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<AIDiagnosisResponseDto> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Requesting AI diagnosis for patient: ${patientId}, session: ${sessionId}`);
      
      // Validate input
      this.validateSymptoms(symptoms);
      
      // Check cache first
      const cacheKey = `ai-diagnosis:${this.generateSymptomsHash(symptoms)}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.logger.debug(`Cache hit for AI diagnosis: ${sessionId}`);
        await this.logAIRequest(patientId, sessionId, symptoms, cachedResult, true, requestMetadata);
        return this.formatAIResponse(cachedResult);
      }
      
      // Prepare request payload to match AI service format
      const requestPayload: AIAgentRequest = {
        diagnosis_request: {
          symptoms: [...symptoms.primarySymptom, ...(symptoms.additionalSymptoms || [])],
          patient_age: 25, // You might want to get this from patient data
          medical_history: [
            ...symptoms.medicalHistory.allergies,
            ...symptoms.medicalHistory.currentMedications,
            ...symptoms.medicalHistory.chronicConditions,
            ...symptoms.medicalHistory.previousSurgeries,
            ...symptoms.medicalHistory.familyHistory
          ].filter(item => item && item.trim() !== ''),
          severity_level: symptoms.severity,
          duration: symptoms.duration,
          additional_notes: symptoms.triggers?.join(', ') || ''
        }
      };
      
      // Make request to AI agent with retry logic
      const aiResponse = await this.makeAIRequest(requestPayload, sessionId, patientId);
      
      // Validate AI response
      this.validateAIResponse(aiResponse);
      
      // Cache the response for 1 hour
      await this.cacheService.set(cacheKey, aiResponse, 3600);
      
      // Log successful request
      await this.logAIRequest(patientId, sessionId, symptoms, aiResponse, false, requestMetadata);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`AI diagnosis completed in ${processingTime}ms for session: ${sessionId}`);
      
      return this.formatAIResponse(aiResponse);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`AI diagnosis failed after ${processingTime}ms for session ${sessionId}: ${error.message}`, error.stack);
      
      // Log failed request
      await this.logAIRequest(patientId, sessionId, symptoms, null, false, requestMetadata, error.message);
      
      // Check if we should provide fallback diagnosis
      if (this.shouldProvideFallback(error)) {
        return this.getFallbackDiagnosis(symptoms);
      }
      
      throw new InternalServerErrorException(
        'AI diagnosis service temporarily unavailable. Please try again later.'
      );
    }
  }

  /**
   * Make HTTP request to AI agent with retry logic
   */
  private async makeAIRequest(payload: AIAgentRequest, sessionId?: string, patientId?: string): Promise<AIAgentResponse> {
    let lastError: Error = new Error('Failed to make AI request');
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`AI request attempt ${attempt}/${this.maxRetries} for session: ${sessionId}`);
        
        // Get a valid token for the request
        const token = await this.aiTokenService.getValidToken();
        
        const response: AxiosResponse<AIAgentResponse> = await firstValueFrom(
          this.httpService.post<AIAgentResponse>(`${this.aiAgentUrl}/api/v1/diagnosis/`, payload, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(sessionId && { 'X-Session-ID': sessionId }),
              ...(patientId && { 'X-Patient-ID': patientId }),
            },
            timeout: this.requestTimeout,
          })
        );
        
        if (response.status === 200 && response.data) {
          this.logger.debug(`AI request successful on attempt ${attempt} for session: ${sessionId}`);
          return response.data;
        }
        
        throw new Error(`Invalid response from AI agent: ${response.status}`);
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`AI request attempt ${attempt} failed for session ${sessionId}: ${error.message}`);
        
        // If we get a 401 (unauthorized), try to refresh the token
        if (error.response?.status === 401 && attempt < this.maxRetries) {
          this.logger.log('Received 401, refreshing AI service token');
          try {
            await this.aiTokenService.refreshToken();
            continue; // Retry immediately with new token
          } catch (tokenError) {
            this.logger.error('Failed to refresh AI service token:', tokenError);
          }
        }
        
        // Don't retry on client errors (4xx) except for rate limiting and unauthorized
        if (error.response?.status >= 400 && error.response?.status < 500 && 
            error.response?.status !== 429 && error.response?.status !== 401) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Validate symptoms input
   */
  private validateSymptoms(symptoms: SymptomInputDto): void {
    if (!symptoms.primarySymptom || symptoms.primarySymptom.length === 0) {
      throw new BadRequestException('Primary symptoms are required');
    }
    
    if (!symptoms.duration || symptoms.duration.trim() === '') {
      throw new BadRequestException('Symptom duration is required');
    }
    
    if (!['mild', 'moderate', 'severe'].includes(symptoms.severity)) {
      throw new BadRequestException('Invalid severity level');
    }
    
    if (!symptoms.medicalHistory) {
      throw new BadRequestException('Medical history is required');
    }
  }

  /**
   * Validate AI response
   */
  private validateAIResponse(response: AIAgentResponse): void {
    if (!response.diagnosis || response.diagnosis.trim() === '') {
      throw new Error('AI agent returned empty diagnosis');
    }
    
    if (typeof response.confidence_score !== 'number' || response.confidence_score < 0 || response.confidence_score > 1) {
      throw new Error('AI agent returned invalid confidence score');
    }
    
    if (!response.suggested_investigations || !Array.isArray(response.suggested_investigations)) {
      throw new Error('AI agent returned invalid suggested investigations');
    }
    
    if (!response.recommended_medications || !Array.isArray(response.recommended_medications)) {
      throw new Error('AI agent returned invalid recommended medications');
    }
  }

  /**
   * Format AI response for client consumption
   */
  private formatAIResponse(aiResponse: AIAgentResponse): AIDiagnosisResponseDto {
    // Map confidence score to determine severity
    const severity = this.mapConfidenceToSeverity(aiResponse.confidence_score);
    
    // Map suggested investigations to recommended tests
    const recommendedTests = aiResponse.suggested_investigations.map(inv => inv.name);
    
    // Determine consultation type based on severity and investigation priorities
    const consultationType = this.determineConsultationType(severity, aiResponse.suggested_investigations);
    
    return {
      diagnosis: aiResponse.diagnosis,
      severity,
      recommendedConsultationType: consultationType,
      recommendedTests,
      confidence: aiResponse.confidence_score,
      fullDiagnosis: aiResponse, // Store full response temporarily
    };
  }
  
  /**
   * Map confidence score to severity level
   */
  private mapConfidenceToSeverity(confidenceScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (confidenceScore >= 0.9) return 'high';
    if (confidenceScore >= 0.7) return 'medium';
    if (confidenceScore >= 0.5) return 'low';
    return 'critical'; // Low confidence might indicate serious condition
  }
  
  /**
   * Determine consultation type based on severity and investigations
   */
  private determineConsultationType(
    severity: 'low' | 'medium' | 'high' | 'critical',
    investigations: { priority: 'low' | 'medium' | 'high' }[]
  ): 'chat' | 'video' | 'emergency' {
    if (severity === 'critical') return 'emergency';
    
    const hasHighPriorityInvestigation = investigations.some(inv => inv.priority === 'high');
    if (severity === 'high' || hasHighPriorityInvestigation) return 'video';
    
    return 'chat';
  }

  /**
   * Generate hash for symptoms to use as cache key
   */
  private generateSymptomsHash(symptoms: SymptomInputDto): string {
    const crypto = require('crypto');
    const symptomsString = JSON.stringify({
      primarySymptom: symptoms.primarySymptom.sort(),
      duration: symptoms.duration,
      severity: symptoms.severity,
      additionalSymptoms: symptoms.additionalSymptoms?.sort() || [],
      triggers: symptoms.triggers?.sort() || [],
      previousTreatments: symptoms.previousTreatments?.sort() || [],
      medicalHistory: {
        allergies: symptoms.medicalHistory.allergies.sort(),
        currentMedications: symptoms.medicalHistory.currentMedications.sort(),
        chronicConditions: symptoms.medicalHistory.chronicConditions.sort(),
        previousSurgeries: symptoms.medicalHistory.previousSurgeries.sort(),
        familyHistory: symptoms.medicalHistory.familyHistory.sort(),
      },
    });
    
    return crypto.createHash('sha256').update(symptomsString).digest('hex');
  }

  /**
   * Log AI request for audit purposes
   */
  private async logAIRequest(
    patientId: string,
    sessionId: string,
    symptoms: SymptomInputDto,
    response: AIAgentResponse | null,
    fromCache: boolean,
    requestMetadata?: { ipAddress: string; userAgent: string },
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.auditService.logDataAccess(
        patientId,
        'ai-diagnosis',
        'create',
        sessionId,
        undefined,
        {
          symptoms: this.sanitizeSymptoms(symptoms),
          response: response ? this.sanitizeAIResponse(response) : null,
          fromCache,
          success: !errorMessage,
          errorMessage,
        },
        requestMetadata
      );
    } catch (error) {
      this.logger.error('Failed to log AI request audit:', error);
    }
  }

  /**
   * Sanitize symptoms for audit logging
   */
  private sanitizeSymptoms(symptoms: SymptomInputDto): any {
    return {
      primarySymptomCount: symptoms.primarySymptom.length,
      duration: symptoms.duration,
      severity: symptoms.severity,
      additionalSymptomsCount: symptoms.additionalSymptoms?.length || 0,
      triggersCount: symptoms.triggers?.length || 0,
      previousTreatmentsCount: symptoms.previousTreatments?.length || 0,
      medicalHistoryPresent: !!symptoms.medicalHistory,
    };
  }

  /**
   * Sanitize AI response for audit logging
   */
  private sanitizeAIResponse(response: AIAgentResponse): any {
    return {
      diagnosisLength: response.diagnosis.length,
      confidence_score: response.confidence_score,
      suggested_investigations_count: response.suggested_investigations?.length || 0,
      recommended_medications_count: response.recommended_medications?.length || 0,
      lifestyle_advice_count: response.lifestyle_advice?.length || 0,
      has_follow_up_recommendations: !!response.follow_up_recommendations,
      has_disclaimer: !!response.disclaimer,
      timestamp: response.timestamp,
    };
  }

  /**
   * Check if fallback diagnosis should be provided
   */
  private shouldProvideFallback(error: any): boolean {
    // Provide fallback for network errors but not for validation errors
    return !error.response || error.response.status >= 500;
  }

  /**
   * Provide fallback diagnosis when AI agent is unavailable
   */
  private getFallbackDiagnosis(symptoms: SymptomInputDto): AIDiagnosisResponseDto {
    this.logger.warn('Providing fallback diagnosis due to AI agent unavailability');
    
    // Simple rule-based fallback
    const severity = this.determineFallbackSeverity(symptoms);
    const consultationType = severity === 'critical' ? 'emergency' : 'chat';
    
    return {
      diagnosis: 'Preliminary assessment requires medical consultation',
      severity,
      recommendedConsultationType: consultationType,
      recommendedTests: [],
      confidence: 0.5,
      fullDiagnosis: {
        diagnosis: 'Preliminary assessment requires medical consultation',
        severity,
        recommendedConsultationType: consultationType,
        confidence: 0.5,
        reasoning: 'AI agent temporarily unavailable - fallback diagnosis provided',
        isFallback: true,
      },
    };
  }

  /**
   * Determine severity for fallback diagnosis
   */
  private determineFallbackSeverity(symptoms: SymptomInputDto): 'low' | 'medium' | 'high' | 'critical' {
    // Simple rule-based severity assessment
    const emergencySymptoms = [
      'chest pain',
      'difficulty breathing',
      'severe abdominal pain',
      'loss of consciousness',
      'severe bleeding',
      'stroke symptoms',
    ];
    
    const highSeveritySymptoms = [
      'high fever',
      'severe headache',
      'persistent vomiting',
      'severe pain',
    ];
    
    const primarySymptomsLower = symptoms.primarySymptom.map(s => s.toLowerCase());
    
    if (emergencySymptoms.some(symptom => 
      primarySymptomsLower.some(ps => ps.includes(symptom))
    )) {
      return 'critical';
    }
    
    if (symptoms.severity === 'severe' || 
        highSeveritySymptoms.some(symptom => 
          primarySymptomsLower.some(ps => ps.includes(symptom))
        )) {
      return 'high';
    }
    
    if (symptoms.severity === 'moderate') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for AI agent
   */
  async healthCheck(): Promise<{ status: string; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Get a valid token for health check
      const token = await this.aiTokenService.getValidToken();
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiAgentUrl}/health`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          timeout: 5000,
        })
      );
      
      const latency = Date.now() - startTime;
      
      return {
        status: (response as any).status === 200 ? 'healthy' : 'unhealthy',
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'unhealthy',
        latency,
        error: (error as Error).message,
      };
    }
  }
}
