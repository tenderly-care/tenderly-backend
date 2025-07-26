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
  private readonly apiKey: string;
  private readonly serviceName: string;
  private readonly requestTimeout: number;
  private readonly maxRetries: number = 3;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly auditService: AuditService,
    private readonly aiTokenService: AITokenService,
  ) {
    this.aiAgentUrl = this.configService.get<string>('ai.diagnosis.baseUrl') || 'http://localhost:8000';
    this.apiKey = this.configService.get<string>('ai.diagnosis.apiKey') || '';
    this.serviceName = this.configService.get<string>('ai.diagnosis.serviceName') || 'tenderly-backend';
    this.requestTimeout = this.configService.get<number>('ai.diagnosis.timeout') || 30000;
    
    if (!this.apiKey) {
      this.logger.warn('AI diagnosis API key not configured - service may not work properly');
    }
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
   * Make HTTP request to AI agent with JWT authentication and retry logic
   */
  private async makeAIRequest(payload: AIAgentRequest, sessionId?: string, patientId?: string): Promise<AIAgentResponse> {
    let lastError: Error = new Error('Failed to make AI request');
    let currentToken: string | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`AI request attempt ${attempt}/${this.maxRetries} for session: ${sessionId}`);
        
        // Get or refresh JWT token for authentication
        try {
          if (!currentToken || attempt > 1) {
            currentToken = await this.aiTokenService.getValidToken();
            this.logger.debug(`Retrieved AI service token for attempt ${attempt}`);
          }
        } catch (tokenError) {
          this.logger.error(`Failed to get AI service token on attempt ${attempt}:`, tokenError);
          throw new Error(`AI service token generation failed: ${tokenError.message}`);
        }
        
        // Prepare request headers with JWT authentication
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
          'X-Service-Name': this.serviceName,
          'X-Request-ID': `${sessionId}_${attempt}`,
        };
        
        // Add optional headers
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        if (patientId) {
          headers['X-Patient-ID'] = patientId;
        }
        
        // Add API key as fallback authentication method
        if (this.apiKey) {
          headers['X-API-Key'] = this.apiKey;
          this.logger.debug('Added API key as fallback authentication');
        }
        
        // Log request details for debugging
        this.logger.debug(`Making AI request to ${this.aiAgentUrl}/api/v1/diagnosis/`, {
          attempt,
          sessionId,
          hasToken: !!currentToken,
          hasApiKey: !!this.apiKey,
          payloadSize: JSON.stringify(payload).length
        });
        
        const response: AxiosResponse<AIAgentResponse> = await firstValueFrom(
          this.httpService.post<AIAgentResponse>(`${this.aiAgentUrl}/api/v1/diagnosis/`, payload, {
            headers,
            timeout: this.requestTimeout,
          })
        );
        
        if (response.status === 200 && response.data) {
          this.logger.debug(`AI request successful on attempt ${attempt} for session: ${sessionId}`);
          
          // Log successful authentication method
          const authMethod = currentToken ? 'JWT' : (this.apiKey ? 'API_KEY' : 'NONE');
          this.logger.log(`AI agent authenticated successfully using ${authMethod} for session: ${sessionId}`);
          
          return response.data;
        }
        
        throw new Error(`Invalid response from AI agent: ${response.status}`);
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`AI request attempt ${attempt} failed for session ${sessionId}: ${error.message}`);
        
        // Handle authentication failures (401)
        if (error.response?.status === 401) {
          this.logger.warn(`Authentication failed on attempt ${attempt} for session ${sessionId}. Status: 401`);
          
          if (attempt < this.maxRetries) {
            // Force token refresh on auth failure 
            try {
              this.logger.log(`Refreshing AI service token due to 401 error on attempt ${attempt}`);
              currentToken = await this.aiTokenService.refreshToken();
              this.logger.debug(`Token refreshed successfully for retry`);
            } catch (refreshError) {
              this.logger.error(`Token refresh failed on attempt ${attempt}:`, refreshError);
              // Clear token to force new generation on next attempt
              currentToken = null;
            }
          } else {
            this.logger.error(`Authentication failed after ${this.maxRetries} attempts. Check JWT token configuration and AI agent setup.`);
          }
        }
        
        // Handle rate limiting (429)
        else if (error.response?.status === 429) {
          this.logger.warn(`Rate limited on attempt ${attempt}, will retry with exponential backoff`);
        }
        
        // Don't retry on other client errors (4xx)
        else if (error.response?.status >= 400 && error.response?.status < 500 && 
                 error.response?.status !== 429 && error.response?.status !== 401) {
          this.logger.error(`Client error ${error.response?.status} on attempt ${attempt}, not retrying`);
          break;
        }
        
        // Log server errors (5xx) but continue retrying
        else if (error.response?.status >= 500) {
          this.logger.warn(`Server error ${error.response?.status} on attempt ${attempt}, will retry`);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.debug(`Waiting ${delay}ms before attempt ${attempt + 1}`);
          await this.sleep(delay);
        }
      }
    }
    
    // Log final failure
    this.logger.error(`All ${this.maxRetries} attempts failed for session ${sessionId}. Last error: ${lastError.message}`);
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
   * Get diagnosis from AI agent using raw symptom data (AI Agent compatible format)
   */
  async getDiagnosisFromAgent(
    patientId: string,
    symptomData: any,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<AIDiagnosisResponseDto> {
    const startTime = Date.now();
    const sessionId = `ai_agent_${patientId}_${Date.now()}`;
    
    try {
      this.logger.log(`Requesting AI agent diagnosis for patient: ${patientId}`);
      
      // Validate basic symptom data structure
      this.validateAIAgentInput(symptomData);
      
      // Check cache first using symptom data hash
      const cacheKey = `ai-agent-diagnosis:${this.generateAIAgentHash(symptomData)}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.logger.debug(`Cache hit for AI agent diagnosis: ${sessionId}`);
        await this.logAIAgentRequest(patientId, sessionId, symptomData, cachedResult, true, requestMetadata);
        return this.formatAIAgentResponse(cachedResult);
      }
      
      // Prepare request payload in AI agent format
      const requestPayload = {
        diagnosis_request: {
          symptoms: Array.isArray(symptomData.symptoms) ? symptomData.symptoms : [symptomData.symptoms],
          patient_age: symptomData.patient_age,
          severity_level: symptomData.severity_level,
          duration: symptomData.duration,
          medical_history: symptomData.medical_history || [],
          additional_notes: symptomData.additional_notes || ''
        }
      };
      
      // Make request to AI agent with retry logic
      const aiResponse = await this.makeAIRequest(requestPayload, sessionId, patientId);
      
      // Validate AI response
      this.validateAIResponse(aiResponse);
      
      // Cache the response for 1 hour
      await this.cacheService.set(cacheKey, aiResponse, 3600);
      
      // Log successful request
      await this.logAIAgentRequest(patientId, sessionId, symptomData, aiResponse, false, requestMetadata);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`AI agent diagnosis completed in ${processingTime}ms for session: ${sessionId}`);
      
      return this.formatAIAgentResponse(aiResponse);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`AI agent diagnosis failed after ${processingTime}ms for session ${sessionId}: ${error.message}`, error.stack);
      
      // Log failed request
      await this.logAIAgentRequest(patientId, sessionId, symptomData, null, false, requestMetadata, error.message);
      
      // Check if we should provide fallback diagnosis
      if (this.shouldProvideFallback(error)) {
        return this.getAIAgentFallbackDiagnosis(symptomData);
      }
      
      throw new InternalServerErrorException(
        'AI agent diagnosis service temporarily unavailable. Please try again later.'
      );
    }
  }

  /**
   * Validate AI Agent input format
   */
  private validateAIAgentInput(symptomData: any): void {
    if (!symptomData.symptoms) {
      throw new BadRequestException('Symptoms are required');
    }
    
    if (!symptomData.patient_age || symptomData.patient_age < 12 || symptomData.patient_age > 100) {
      throw new BadRequestException('Valid patient age (12-100) is required');
    }
    
    if (!symptomData.severity_level || !['mild', 'moderate', 'severe', 'low', 'medium', 'high'].includes(symptomData.severity_level)) {
      throw new BadRequestException('Valid severity level is required');
    }
    
    if (!symptomData.duration || typeof symptomData.duration !== 'string' || symptomData.duration.trim() === '') {
      throw new BadRequestException('Duration is required');
    }
  }

  /**
   * Generate hash for AI agent symptom data
   */
  private generateAIAgentHash(symptomData: any): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify({
      symptoms: Array.isArray(symptomData.symptoms) ? symptomData.symptoms.sort() : [symptomData.symptoms],
      patient_age: symptomData.patient_age,
      severity_level: symptomData.severity_level,
      duration: symptomData.duration,
      medical_history: (symptomData.medical_history || []).sort(),
      additional_notes: symptomData.additional_notes || ''
    });
    
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Format AI agent response for client consumption
   */
  private formatAIAgentResponse(aiResponse: AIAgentResponse): AIDiagnosisResponseDto {
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
      fullDiagnosis: aiResponse, // Store full response
    };
  }

  /**
   * Log AI agent request for audit purposes
   */
  private async logAIAgentRequest(
    patientId: string,
    sessionId: string,
    symptomData: any,
    response: AIAgentResponse | null,
    fromCache: boolean,
    requestMetadata?: { ipAddress: string; userAgent: string },
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.auditService.logDataAccess(
        patientId,
        'ai-agent-diagnosis',
        'create',
        sessionId,
        undefined,
        {
          symptoms: this.sanitizeAIAgentSymptoms(symptomData),
          response: response ? this.sanitizeAIResponse(response) : null,
          fromCache,
          success: !errorMessage,
          errorMessage,
        },
        requestMetadata
      );
    } catch (error) {
      this.logger.error('Failed to log AI agent request audit:', error);
    }
  }

  /**
   * Sanitize AI agent symptoms for audit logging
   */
  private sanitizeAIAgentSymptoms(symptomData: any): any {
    return {
      symptomCount: Array.isArray(symptomData.symptoms) ? symptomData.symptoms.length : 1,
      patientAge: symptomData.patient_age,
      severityLevel: symptomData.severity_level,
      duration: symptomData.duration,
      medicalHistoryCount: (symptomData.medical_history || []).length,
      hasAdditionalNotes: !!(symptomData.additional_notes && symptomData.additional_notes.trim()),
    };
  }

  /**
   * Provide fallback diagnosis for AI agent format
   */
  private getAIAgentFallbackDiagnosis(symptomData: any): AIDiagnosisResponseDto {
    this.logger.warn('Providing AI agent fallback diagnosis due to service unavailability');
    
    // Simple rule-based fallback based on symptom data
    const severity = this.determineAIAgentFallbackSeverity(symptomData);
    const consultationType = severity === 'critical' ? 'emergency' : 'chat';
    
    return {
      diagnosis: 'Preliminary assessment - medical consultation recommended',
      severity,
      recommendedConsultationType: consultationType,
      recommendedTests: [],
      confidence: 0.4, // Lower confidence for fallback
      fullDiagnosis: {
        diagnosis: 'Preliminary assessment - medical consultation recommended',
        severity,
        recommendedConsultationType: consultationType,
        confidence: 0.4,
        reasoning: 'AI agent temporarily unavailable - fallback diagnosis provided',
        isFallback: true,
      },
    };
  }

  /**
   * Determine severity for AI agent fallback diagnosis
   */
  private determineAIAgentFallbackSeverity(symptomData: any): 'low' | 'medium' | 'high' | 'critical' {
    const symptoms = Array.isArray(symptomData.symptoms) ? symptomData.symptoms : [symptomData.symptoms];
    const severityLevel = symptomData.severity_level;
    
    // Check for emergency symptoms
    const emergencyKeywords = ['severe pain', 'chest pain', 'difficulty breathing', 'bleeding', 'unconscious'];
    const hasEmergencySymptom = symptoms.some(symptom => 
      emergencyKeywords.some(keyword => symptom.toLowerCase().includes(keyword))
    );
    
    if (hasEmergencySymptom || severityLevel === 'severe') {
      return 'critical';
    }
    
    // Map severity levels
    const severityMap = {
      'severe': 'high',
      'high': 'high',
      'moderate': 'medium',
      'medium': 'medium',
      'mild': 'low',
      'low': 'low'
    };
    
    return severityMap[severityLevel] || 'medium';
  }

  /**
   * Health check for AI agent
   */
  async healthCheck(): Promise<{ status: string; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      if (!this.apiKey) {
        throw new Error('AI diagnosis API key not configured');
      }
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiAgentUrl}/health`, {
          headers: {
            'X-API-Key': this.apiKey,
            'X-Service-Name': this.serviceName,
          },
          timeout: 5000,
        })
      );
      
      const latency = Date.now() - startTime;
      
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
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
