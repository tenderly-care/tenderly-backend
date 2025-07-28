import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { SymptomInputDto, AIDiagnosisResponseDto, TenderlyAIAgentRequestDto, PureAIAgentResponseDto, StructuredDiagnosisResponseDto } from '../dto/consultation.dto';
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
    this.aiAgentUrl = this.configService.get<string>('AI_DIAGNOSIS_URL') || 'http://localhost:8000';
    this.apiKey = this.configService.get<string>('AI_DIAGNOSIS_API_KEY') || '';
    this.serviceName = this.configService.get<string>('AI_SERVICE_NAME') || 'tenderly-backend';
    this.requestTimeout = this.configService.get<number>('AI_DIAGNOSIS_TIMEOUT') || 30000;
    
    this.logger.log(`AI Agent Service initialized with URL: ${this.aiAgentUrl}, API Key: ${this.apiKey ? 'configured' : 'not configured'}, Service Name: ${this.serviceName}`);
    
    if (!this.apiKey) {
this.logger.error('AI diagnosis API key not configured - service will not work without it');
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
  async getStructuredDiagnosis(
    patientId: string,
    structuredData: any,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<StructuredDiagnosisResponseDto> {
    const startTime = Date.now();
    const sessionId = `structured_${patientId}_${Date.now()}`;
    
    try {
      this.logger.log(`Requesting structured diagnosis for patient: ${patientId}`);
      
      // Validate structured data
      this.validateStructuredInput(structuredData);
      
      // Check cache first using structured data hash
      const cacheKey = `structured-diagnosis:${this.generateStructuredHash(structuredData)}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.logger.debug(`Cache hit for structured diagnosis: ${sessionId}`);
        await this.logStructuredRequest(patientId, sessionId, structuredData, cachedResult, true, requestMetadata);
        return cachedResult;
      }
      
      // Make request to AI agent for structured diagnosis
      const aiResponse = await this.makeStructuredRequest(structuredData, sessionId, patientId);
      
      // Validate AI response
      this.validateStructuredResponse(aiResponse);
      
      // Cache the response for 1 hour
      await this.cacheService.set(cacheKey, aiResponse, 3600);
      
      // Log successful request
      await this.logStructuredRequest(patientId, sessionId, structuredData, aiResponse, false, requestMetadata);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Structured diagnosis completed in ${processingTime}ms for session: ${sessionId}`);
      
      return aiResponse;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Structured diagnosis failed after ${processingTime}ms for session ${sessionId}: ${error.message}`, error.stack);
      
      // Log failed request
      await this.logStructuredRequest(patientId, sessionId, structuredData, null, false, requestMetadata, error.message);
      
      // Check if we should provide fallback diagnosis
      if (this.shouldProvideFallback(error)) {
        return this.getStructuredFallbackDiagnosis(structuredData);
      }
      
      throw new InternalServerErrorException(
        'Structured diagnosis service temporarily unavailable. Please try again later.'
      );
    }
  }

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
        this.httpService.get(`${this.aiAgentUrl}/api/v1/health/`, {
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

  /**
   * Get token information for debugging (delegates to AI token service)
   */
  async getTokenInfo(): Promise<any> {
    try {
      this.logger.debug('🔍 [DEBUG] AI Agent Service: Getting token info from AI token service...');
      return await this.aiTokenService.getTokenInfo();
    } catch (error) {
      this.logger.error('❌ [ERROR] AI Agent Service: Failed to get token info:', error.message);
      return null;
    }
  }


  /**
   * Make detailed AI request to external AI agent
   */
  private async makeDetailedAIRequest(
    payload: any,
    clinicalSessionId: string,
    patientId: string
  ): Promise<any> {
    const sessionId = `detailed_ai_${clinicalSessionId}_${Date.now()}`;
    let lastError: Error = new Error('Failed to make detailed AI request');
    let currentToken: string | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(`[${sessionId}] Detailed AI request attempt ${attempt}/${this.maxRetries}`);
        this.logger.debug(`Detailed AI request attempt ${attempt}/${this.maxRetries} for session: ${sessionId}`);
        
        // Get or refresh JWT token for authentication
        try {
          if (!currentToken || attempt > 1) {
            currentToken = await this.aiTokenService.getValidToken();
            this.logger.debug(`Retrieved AI service token for detailed request attempt ${attempt}`);
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
          'X-Session-ID': sessionId,
          'X-Patient-ID': patientId,
          'X-Clinical-Session-ID': clinicalSessionId
        };
        
        // Add API key as fallback authentication method
        if (this.apiKey) {
          headers['X-API-Key'] = this.apiKey;
          this.logger.debug('Added API key as fallback authentication for detailed request');
        }
        
        // Log request details for debugging
        this.logger.debug(`Making detailed AI request to ${this.aiAgentUrl}/api/v1/diagnosis/structure`, {
          attempt,
          sessionId,
          hasToken: !!currentToken,
          hasApiKey: !!this.apiKey,
          payloadSize: JSON.stringify(payload).length
        });
        
        // Log the actual token being used (first 50 chars for security)
        this.logger.debug(`Using JWT token: ${currentToken ? currentToken.substring(0, 50) + '...' : 'NO TOKEN'}`);
        this.logger.debug(`Using API Key: ${this.apiKey ? 'CONFIGURED' : 'NOT CONFIGURED'}`);

        const response = await firstValueFrom(
          this.httpService.post(`${this.aiAgentUrl}/api/v1/diagnosis/structure`, payload, {
            headers,
            timeout: this.requestTimeout,
          })
        );

        if (response.status === 200 && response.data) {
          this.logger.debug(`Detailed AI request successful on attempt ${attempt} for session: ${sessionId}`);
          
          // Log successful authentication method
          const authMethod = currentToken ? 'JWT' : (this.apiKey ? 'API_KEY' : 'NONE');
          this.logger.log(`Detailed AI agent authenticated successfully using ${authMethod} for session: ${sessionId}`);
          
          return response.data;
        }
        
        throw new Error(`Invalid response from AI agent: ${response.status}`);
        
              } catch (error) {
          lastError = error as Error;
          this.logger.warn(`Detailed AI request attempt ${attempt} failed for session ${sessionId}: ${error.message}`);
          
          // Log detailed error information
          if (error.response) {
            this.logger.error(`HTTP Error Status: ${error.response.status}`);
            this.logger.error(`HTTP Error Data: ${JSON.stringify(error.response.data)}`);
          }
          if (error.request) {
            this.logger.error(`Request Error: ${error.request}`);
          }
        
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
    this.logger.error(`Error stack: ${lastError.stack}`);
    
    // Check if we should provide fallback
    if (this.shouldProvideFallback(lastError)) {
      this.logger.warn(`Providing fallback diagnosis for session: ${sessionId}`);
      return null; // Signal to use fallback
    }
    
    throw lastError;
  }

  /**
   * Validate detailed symptoms input structure (supports both camelCase and snake_case)
   */
  private validateDetailedSymptomsInput(detailedSymptoms: any): void {
    if (!detailedSymptoms) {
      throw new BadRequestException('Detailed symptoms data is required');
    }

    // Support both camelCase and snake_case field names
    const requiredFieldsMap = {
      'patientProfile': 'patient_profile',
      'primaryComplaint': 'primary_complaint', 
      'symptomSpecificDetails': 'symptom_specific_details',
      'reproductiveHistory': 'reproductive_history',
      'associatedSymptoms': 'associated_symptoms',
      'medicalContext': 'medical_context',
      'healthcareInteraction': 'healthcare_interaction',
      'patientConcerns': 'patient_concerns'
    };

    for (const [camelCase, snakeCase] of Object.entries(requiredFieldsMap)) {
      if (!detailedSymptoms[camelCase] && !detailedSymptoms[snakeCase]) {
        throw new BadRequestException(`Missing required field: ${camelCase} (or ${snakeCase})`);
      }
    }

    // Get patient profile (support both formats)
    const patientProfile = detailedSymptoms.patientProfile || detailedSymptoms.patient_profile;
    if (!patientProfile) {
      throw new BadRequestException('Patient profile is required');
    }

    // Validate patient profile (support both camelCase and snake_case)
    const age = patientProfile.age;
    const requestId = patientProfile.requestId || patientProfile.request_id;
    const timestamp = patientProfile.timestamp;
    
    if (!age || !requestId || !timestamp) {
      throw new BadRequestException('Invalid patient profile structure - missing age, requestId, or timestamp');
    }

    // Get primary complaint (support both formats)
    const primaryComplaint = detailedSymptoms.primaryComplaint || detailedSymptoms.primary_complaint;
    if (!primaryComplaint) {
      throw new BadRequestException('Primary complaint is required');
    }

    // Validate primary complaint (support both camelCase and snake_case)
    const mainSymptom = primaryComplaint.mainSymptom || primaryComplaint.main_symptom;
    const duration = primaryComplaint.duration;
    const severity = primaryComplaint.severity;
    
    if (!mainSymptom || !duration || !severity) {
      throw new BadRequestException('Invalid primary complaint structure - missing mainSymptom, duration, or severity');
    }
  }

  /**
   * Generate hash for detailed symptoms for caching
   */
  private generateDetailedSymptomsHash(detailedSymptoms: any): string {
    const sanitizedData = this.sanitizeDetailedSymptoms(detailedSymptoms);
    const dataString = JSON.stringify(sanitizedData);
    return require('crypto').createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Sanitize detailed symptoms data for logging
   */
  private sanitizeDetailedSymptoms(detailedSymptoms: any): any {
    const sanitized = { ...detailedSymptoms };
    
    // Remove sensitive fields if any
    if (sanitized.patient_profile) {
      delete sanitized.patient_profile.request_id;
    }
    
    return sanitized;
  }

  /**
   * Log detailed diagnosis request
   */
  private async logDetailedDiagnosisRequest(
    patientId: string,
    clinicalSessionId: string,
    detailedSymptoms: any,
    response: any | null,
    fromCache: boolean,
    requestMetadata?: { ipAddress: string; userAgent: string },
    errorMessage?: string
  ): Promise<void> {
    try {
      const sanitizedSymptoms = this.sanitizeDetailedSymptoms(detailedSymptoms);
      const sanitizedResponse = response ? this.sanitizeDetailedSymptoms(response) : null;

      await this.auditService.logDataAccess(
        patientId,
        'detailed-ai-diagnosis',
        'read',
        clinicalSessionId,
        undefined,
        {
          symptoms: sanitizedSymptoms,
          response: sanitizedResponse,
          fromCache,
          errorMessage
        },
        requestMetadata
      );
    } catch (error) {
      this.logger.warn(`Failed to log detailed diagnosis request: ${error.message}`);
    }
  }

  /**
   * Transform AI agent response to match expected backend format
   */
  private transformDetailedAIResponse(aiResponse: any): any {
    const primaryDiagnosis = aiResponse.possible_diagnoses?.[0]?.name || 'Assessment completed';
    const confidenceScore = aiResponse.confidence_score || 0.5;
    const urgencyLevel = aiResponse.risk_assessment?.urgency_level || 'routine';
    const followUpRequired = aiResponse.treatment_recommendations?.follow_up_timeline ? true : false;
    
    // Extract recommended tests from investigations
    const recommendedTests: string[] = aiResponse.recommended_investigations?.map((inv: any) => inv.name) || [];
    
    // Extract treatment recommendations
    const treatmentRecommendations: string[] = [];
    if (aiResponse.treatment_recommendations?.primary_treatment) {
      treatmentRecommendations.push(aiResponse.treatment_recommendations.primary_treatment);
    }
    if (aiResponse.treatment_recommendations?.safe_medications) {
      aiResponse.treatment_recommendations.safe_medications.forEach((med: any) => {
        treatmentRecommendations.push(`${med.name} - ${med.dosage} ${med.frequency}`);
      });
    }
    
    return {
      diagnosis: primaryDiagnosis,
      confidence_score: confidenceScore,
      recommended_tests: recommendedTests,
      treatment_recommendations: treatmentRecommendations,
      urgency_level: urgencyLevel,
      follow_up_required: followUpRequired,
      message: 'Detailed symptoms collected successfully. Doctor will review shortly.',
      timestamp: new Date(),
      // Include additional AI response data for comprehensive information
      clinical_reasoning: aiResponse.clinical_reasoning,
      possible_diagnoses: aiResponse.possible_diagnoses,
      safety_assessment: aiResponse.safety_assessment,
      patient_education: aiResponse.patient_education,
      warning_signs: aiResponse.warning_signs,
      disclaimer: aiResponse.disclaimer
    };
  }

  /**
   * Get fallback detailed diagnosis when AI agent is unavailable
   */
  private getDetailedFallbackDiagnosis(detailedSymptoms: any): any {
    const mainSymptom = detailedSymptoms.primary_complaint?.main_symptom || 'Unknown symptom';
    const severity = detailedSymptoms.primary_complaint?.severity || 'moderate';
    
    return {
      diagnosis: `Based on the symptoms described (${mainSymptom}), a comprehensive evaluation is recommended.`,
      confidence_score: 0.3,
      recommended_tests: ['Complete blood count', 'Pelvic ultrasound', 'Hormonal profile'],
      treatment_recommendations: ['Consult with gynecologist', 'Maintain symptom diary', 'Avoid self-medication'],
      urgency_level: severity === 'severe' ? 'urgent' : 'routine',
      follow_up_required: true,
      message: 'AI assessment temporarily unavailable. Please consult with a healthcare provider for proper evaluation.',
      timestamp: new Date(),
      disclaimer: 'This is a fallback assessment. Professional medical evaluation is required for accurate diagnosis.'
    };
  }

  /**
   * Format symptom specific details for AI agent
   */
  private formatSymptomSpecificDetails(details: any): any {
    return {
      symptom_characteristics: {
        type: details?.symptom_characteristics?.type || 'general_discomfort',
        location: details?.symptom_characteristics?.location || 'pelvic_region',
        radiation: details?.symptom_characteristics?.radiation || 'none',
        triggers: details?.symptom_characteristics?.triggers || [],
        relieving_factors: details?.symptom_characteristics?.relieving_factors || []
      }
    };
  }

  /**
   * Format reproductive history for AI agent
   */
  private formatReproductiveHistory(history: any): any {
    return {
      pregnancy_status: {
        current_status: history?.pregnancy_status?.current_status || 'not_pregnant',
        pregnancy_history: history?.pregnancy_status?.pregnancy_history || 'no_previous_pregnancies',
        last_pregnancy_outcome: history?.pregnancy_status?.last_pregnancy_outcome || 'none',
        could_be_pregnant: history?.pregnancy_status?.could_be_pregnant || false,
        pregnancy_test_result: history?.pregnancy_status?.pregnancy_test_result || 'not_taken'
      },
      sexual_activity: {
        active: history?.sexual_activity?.active !== false,
        sexually_active: history?.sexual_activity?.sexually_active !== false,
        recent_changes: history?.sexual_activity?.recent_changes || 'none',
        contraceptive_use: history?.sexual_activity?.contraceptive_use || 'none',
        contraception_method: history?.sexual_activity?.contraception_method || 'none'
      },
      menstrual_history: {
        menarche_age: history?.menstrual_history?.menarche_age || 13,
        cycle_frequency: history?.menstrual_history?.cycle_frequency || 28,
        cycle_regularity: history?.menstrual_history?.cycle_regularity || 'regular',
        last_menstrual_period: history?.menstrual_history?.last_menstrual_period || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        period_duration: history?.menstrual_history?.period_duration || 5,
        flow_characteristics: history?.menstrual_history?.flow_characteristics || 'normal'
      }
    };
  }

  /**
   * Format associated symptoms for AI agent
   */
  private formatAssociatedSymptoms(symptoms: any): any {
    return {
      pain: {
        pelvic_pain: symptoms?.pain?.pelvic_pain || 'none',
        abdominal_pain: symptoms?.pain?.abdominal_pain || 'none',
        back_pain: symptoms?.pain?.back_pain || 'none',
        breast_tenderness: symptoms?.pain?.breast_tenderness || 'none'
      },
      systemic: {
        fever: symptoms?.systemic?.fever === true || symptoms?.systemic?.fever === 'present',
        fatigue: symptoms?.systemic?.fatigue === true || symptoms?.systemic?.fatigue === 'present',
        nausea: symptoms?.systemic?.nausea === true || symptoms?.systemic?.nausea === 'present',
        headache: symptoms?.systemic?.headache === true || symptoms?.systemic?.headache === 'present',
        mood_changes: symptoms?.systemic?.mood_changes === true || symptoms?.systemic?.mood_changes === 'present'
      },
      gynecological: {
        vaginal_discharge: symptoms?.gynecological?.vaginal_discharge || 'none',
        vaginal_bleeding: symptoms?.gynecological?.vaginal_bleeding || 'none',
        vulvar_symptoms: symptoms?.gynecological?.vulvar_symptoms || 'none',
        urinary_symptoms: symptoms?.gynecological?.urinary_symptoms || 'none'
      }
    };
  }

  /**
   * Format medical context for AI agent
   */
  private formatMedicalContext(context: any): any {
    return {
      current_medications: context?.current_medications || [],
      recent_medications: context?.recent_medications || [],
      medical_conditions: context?.medical_conditions || [],
      previous_gynecological_issues: context?.previous_gynecological_issues || [],
      allergies: context?.allergies || [],
      family_history: context?.family_history || []
    };
  }

  /**
   * Format healthcare interaction for AI agent
   */
  private formatHealthcareInteraction(interaction: any): any {
    return {
      previous_consultation: interaction?.previous_consultation === true,
      consultation_outcome: interaction?.consultation_outcome || (interaction?.previous_consultation ? 'pending_follow_up' : 'none'),
      investigations_done: interaction?.investigations_done === true,
      investigation_results: interaction?.investigation_results || 'none',
      current_treatment: interaction?.current_treatment || 'none'
    };
  }

  /**
   * Transform camelCase object keys to snake_case for AI agent compatibility
   */
  private transformCamelCaseToSnakeCase(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.transformCamelCaseToSnakeCase(item));
    }

    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Convert camelCase to snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = this.transformCamelCaseToSnakeCase(value);
    }

    return result;
  }

  // Structured diagnosis helper methods
  private validateStructuredInput(structuredData: any): void {
    if (!structuredData.structured_request) {
      throw new BadRequestException('structured_request is required');
    }
    
    const request = structuredData.structured_request;
    
    if (!request.patient_profile?.age || request.patient_profile.age < 10 || request.patient_profile.age > 100) {
      throw new BadRequestException('Valid patient age (10-100) is required');
    }
    
    if (!request.primary_complaint?.main_symptom) {
      throw new BadRequestException('Primary complaint main symptom is required');
    }
    
    if (!request.reproductive_history) {
      throw new BadRequestException('Reproductive history is required');
    }
    
    if (!request.medical_context) {
      throw new BadRequestException('Medical context is required');
    }
  }

  private generateStructuredHash(structuredData: any): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify(structuredData.structured_request);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  private async makeStructuredRequest(
    structuredData: any,
    sessionId: string,
    patientId: string
  ): Promise<StructuredDiagnosisResponseDto> {
    let lastError: Error = new Error('Failed to make structured request');
    let currentToken: string | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`Structured request attempt ${attempt}/${this.maxRetries} for session: ${sessionId}`);
        
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
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
          'X-API-Key': this.apiKey,
          'X-Service-Name': this.serviceName,
        };
        
        // Add optional headers
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        if (patientId) {
          headers['X-Patient-ID'] = patientId;
        }
        
        // Log request details for debugging
        this.logger.debug(`Making structured request to ${this.aiAgentUrl}/api/v1/diagnosis/structure`, {
          attempt,
          sessionId,
          hasToken: !!currentToken,
          hasApiKey: !!this.apiKey,
          payloadSize: JSON.stringify(structuredData).length
        });
        
        const response: AxiosResponse<StructuredDiagnosisResponseDto> = await firstValueFrom(
          this.httpService.post<StructuredDiagnosisResponseDto>(`${this.aiAgentUrl}/api/v1/diagnosis/structure`, structuredData, {
            headers,
            timeout: this.requestTimeout,
          })
        );
        
        if (response.status === 200 && response.data) {
          this.logger.debug(`Structured request successful on attempt ${attempt} for session: ${sessionId}`);
          
          // Log successful authentication method
          const authMethod = currentToken ? 'JWT' : (this.apiKey ? 'API_KEY' : 'NONE');
          this.logger.log(`AI agent authenticated successfully using ${authMethod} for session: ${sessionId}`);
          
          return response.data;
        }
        
        throw new Error(`Invalid response from AI agent: ${response.status}`);
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Structured request attempt ${attempt} failed for session ${sessionId}: ${error.message}`);
        
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

  private validateStructuredResponse(response: StructuredDiagnosisResponseDto): void {
    if (!response.request_id) {
      throw new Error('Invalid response: request_id is missing');
    }
    
    if (!response.possible_diagnoses || !Array.isArray(response.possible_diagnoses)) {
      throw new Error('Invalid response: possible_diagnoses array is missing');
    }
    
    if (!response.confidence_score || typeof response.confidence_score !== 'number') {
      throw new Error('Invalid response: confidence_score is missing or invalid');
    }
    
    if (!response.risk_assessment?.urgency_level) {
      throw new Error('Invalid response: risk_assessment.urgency_level is missing');
    }
  }

  private async logStructuredRequest(
    patientId: string,
    sessionId: string,
    structuredData: any,
    response: StructuredDiagnosisResponseDto | null,
    fromCache: boolean,
    requestMetadata?: { ipAddress: string; userAgent: string },
    errorMessage?: string
  ): Promise<void> {
    try {
      const auditData = {
        patientId,
        sessionId,
        structuredData: this.sanitizeStructuredData(structuredData),
        response: response ? this.sanitizeStructuredResponse(response) : null,
        fromCache,
        errorMessage,
        requestMetadata
      };

      await this.auditService.logDataAccess(
        patientId,
        'structured-diagnosis-request',
        'create',
        sessionId,
        undefined,
        auditData,
        requestMetadata
      );
    } catch (auditError) {
      this.logger.error('Failed to log structured request audit:', auditError);
    }
  }

  private sanitizeStructuredData(structuredData: any): any {
    if (!structuredData) return null;
    
    return {
      patientProfile: {
        age: structuredData.structured_request?.patient_profile?.age,
        requestId: structuredData.structured_request?.patient_profile?.request_id
      },
      primaryComplaint: {
        mainSymptom: structuredData.structured_request?.primary_complaint?.main_symptom,
        severity: structuredData.structured_request?.primary_complaint?.severity
      },
      hasReproductiveHistory: !!structuredData.structured_request?.reproductive_history,
      hasMedicalContext: !!structuredData.structured_request?.medical_context
    };
  }

  private sanitizeStructuredResponse(response: StructuredDiagnosisResponseDto): any {
    if (!response) return null;
    
    return {
      requestId: response.request_id,
      possibleDiagnosesCount: response.possible_diagnoses?.length || 0,
      confidenceScore: response.confidence_score,
      urgencyLevel: response.risk_assessment?.urgency_level,
      hasSafetyAssessment: !!response.safety_assessment,
      hasRiskAssessment: !!response.risk_assessment,
      hasTreatmentRecommendations: !!response.treatment_recommendations
    };
  }

  private getStructuredFallbackDiagnosis(structuredData: any): StructuredDiagnosisResponseDto {
    const mainSymptom = structuredData.structured_request?.primary_complaint?.main_symptom || 'General symptoms';
    const patientAge = structuredData.structured_request?.patient_profile?.age || 25;
    
    return {
      request_id: structuredData.structured_request?.patient_profile?.request_id || 'fallback_request',
      patient_age: patientAge,
      primary_symptom: mainSymptom,
      possible_diagnoses: [
        {
          name: 'Gynecological consultation recommended',
          confidence_score: 0.5,
          description: 'Based on symptoms, professional medical evaluation is recommended'
        }
      ],
      clinical_reasoning: 'Fallback diagnosis generated due to AI service unavailability. Professional medical consultation is recommended for proper diagnosis.',
      differential_considerations: ['Requires professional medical evaluation'],
      safety_assessment: {
        allergy_considerations: {
          allergic_medications: [],
          safe_alternatives: [],
          contraindicated_drugs: []
        },
        condition_interactions: [],
        safety_warnings: ['Consult healthcare provider before taking any medications']
      },
      risk_assessment: {
        urgency_level: 'moderate',
        red_flags: [],
        when_to_seek_emergency_care: ['Severe pain', 'Heavy bleeding', 'Fever with symptoms']
      },
      recommended_investigations: [
        {
          name: 'Gynecological consultation',
          priority: 'high',
          reason: 'Professional medical evaluation required'
        }
      ],
      treatment_recommendations: {
        primary_treatment: 'Consult healthcare provider',
        safe_medications: [],
        lifestyle_modifications: ['Maintain good hygiene', 'Avoid self-medication'],
        dietary_advice: ['Maintain balanced diet'],
        follow_up_timeline: 'Within 1 week'
      },
      patient_education: [
        'This is a fallback assessment',
        'Professional medical consultation is recommended',
        'Do not self-diagnose or self-treat'
      ],
      warning_signs: [
        'Severe pain',
        'Heavy bleeding',
        'Fever with symptoms',
        'Worsening symptoms'
      ],
      confidence_score: 0.5,
      processing_notes: ['Fallback diagnosis generated due to AI service unavailability'],
      disclaimer: 'This is a fallback assessment generated due to AI service unavailability. Please consult with a healthcare provider for proper medical care.',
      timestamp: new Date().toISOString()
    };
  }
}
