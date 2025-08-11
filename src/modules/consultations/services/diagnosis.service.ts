import { Injectable, Logger, InternalServerErrorException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';
import { StructuredDiagnosisRequestDto, DiagnosisApiResponseDto } from '../controllers/diagnosis.controller';

export interface RequestMetadata {
  ipAddress: string;
  userAgent: string;
  userId: string;
  userRole: string;
}

@Injectable()
export class DiagnosisService {
  private readonly logger = new Logger(DiagnosisService.name);
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
  ) {
    this.aiAgentUrl = this.configService.get<string>('ai.diagnosis.baseUrl') || 'http://localhost:8000';
    this.apiKey = this.configService.get<string>('ai.diagnosis.apiKey') || this.configService.get<string>('AI_DIAGNOSIS_API_KEY') || '';
    this.serviceName = this.configService.get<string>('ai.diagnosis.serviceName') || 'tenderly-backend';
    this.requestTimeout = this.configService.get<number>('ai.diagnosis.timeout') || 30000;
    
    this.logger.log(`Diagnosis Service initialized:`);
    this.logger.log(`- AI Agent URL: ${this.aiAgentUrl}`);
    this.logger.log(`- API Key: ${this.apiKey ? 'configured (' + this.apiKey.substring(0, 8) + '...)' : 'NOT CONFIGURED'}`);
    this.logger.log(`- Service Name: ${this.serviceName}`);
    this.logger.log(`- Request Timeout: ${this.requestTimeout}ms`);
    
    if (!this.apiKey) {
      this.logger.error('❌ AI diagnosis API key not configured - service will not work without it');
      this.logger.error('Please set AI_DIAGNOSIS_API_KEY environment variable');
    }

    if (!this.aiAgentUrl.startsWith('http')) {
      this.logger.warn('⚠️ AI Agent URL might be invalid - please check AI_DIAGNOSIS_URL configuration');
    }
  }

  /**
   * Get structured AI diagnosis from tenderly-ai-agent
   */
  async getStructuredDiagnosis(
    diagnosisRequest: StructuredDiagnosisRequestDto,
    requestMetadata: RequestMetadata
  ): Promise<DiagnosisApiResponseDto> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Requesting structured AI diagnosis for user: ${requestMetadata.userId}`);
      
      // Validate input
      this.validateDiagnosisRequest(diagnosisRequest);
      
      // Check cache first
      const cacheKey = `structured-diagnosis:${this.generateRequestHash(diagnosisRequest)}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.logger.debug(`Cache hit for structured diagnosis: ${requestMetadata.userId}`);
        await this.logDiagnosisRequest(diagnosisRequest, cachedResult, true, requestMetadata);
        return cachedResult;
      }
      
      // Make request to tenderly-ai-agent with new authentication format
      const aiResponse = await this.makeStructuredDiagnosisRequest(diagnosisRequest, requestMetadata);
      
      // Validate AI response
      this.validateAIResponse(aiResponse);
      
      // Cache the response for 1 hour
      await this.cacheService.set(cacheKey, aiResponse, 3600);
      
      // Log successful request
      await this.logDiagnosisRequest(diagnosisRequest, aiResponse, false, requestMetadata);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Structured AI diagnosis completed in ${processingTime}ms for user: ${requestMetadata.userId}`);
      
      return aiResponse;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Structured AI diagnosis failed after ${processingTime}ms for user ${requestMetadata.userId}: ${error.message}`, error.stack);
      
      // Log failed request
      await this.logDiagnosisRequest(diagnosisRequest, null, false, requestMetadata, error.message);
      
      // Check if we should provide fallback diagnosis
      if (this.shouldProvideFallback(error)) {
        return this.getFallbackStructuredDiagnosis(diagnosisRequest);
      }
      
      throw new ServiceUnavailableException(
        'AI diagnosis service temporarily unavailable. Please try again later.'
      );
    }
  }

  /**
   * Get simple diagnosis (legacy support)
   */
  async getSimpleDiagnosis(
    diagnosisRequest: any,
    requestMetadata: RequestMetadata
  ): Promise<any> {
    this.logger.log(`Processing simple diagnosis request for user: ${requestMetadata.userId}`);
    
    // Convert simple request to structured format for compatibility
    const structuredRequest: StructuredDiagnosisRequestDto = {
      patient_profile: {
        age: diagnosisRequest.age || 25,
        request_id: `SIMPLE_${requestMetadata.userId}_${Date.now()}`,
        timestamp: new Date().toISOString()
      },
      primary_complaint: {
        main_symptom: diagnosisRequest.symptoms?.[0] || 'General symptoms',
        duration: diagnosisRequest.duration || 'unknown',
        severity: diagnosisRequest.severity || 'moderate'
      },
      medical_context: {
        current_medications: diagnosisRequest.medications || [],
        medical_conditions: diagnosisRequest.medical_history || [],
        allergies: diagnosisRequest.allergies || [],
        family_history: []
      }
    };

    const result = await this.getStructuredDiagnosis(structuredRequest, requestMetadata);
    
    // Convert back to simple format for backward compatibility
    return {
      diagnosis: result.diagnosis,
      confidence: result.confidence_score,
      severity: result.severity_assessment?.level || 'moderate',
      recommendations: result.lifestyle_advice,
      medications: result.recommended_medications,
      followUp: result.follow_up_recommendations?.timeline || 'As needed'
    };
  }

  /**
   * Check service health
   */
  async checkServiceHealth(): Promise<any> {
    try {
      this.logger.log('Checking AI diagnosis service health...');
      
      const healthCheckUrl = `${this.aiAgentUrl}/health`;
      const headers = {
        'X-API-Key': this.apiKey,
        'X-Service-Name': this.serviceName,
        'Content-Type': 'application/json'
      };

      const response: AxiosResponse = await firstValueFrom(
        this.httpService.get(healthCheckUrl, {
          headers,
          timeout: 5000,
        })
      );

      this.logger.log('AI diagnosis service health check successful');
      return {
        status: 'healthy',
        service: 'tenderly-ai-agent',
        url: this.aiAgentUrl,
        response_time: response.headers['response-time'] || 'unknown',
        timestamp: new Date().toISOString(),
        details: response.data
      };

    } catch (error) {
      this.logger.error(`AI diagnosis service health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        service: 'tenderly-ai-agent', 
        url: this.aiAgentUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Make HTTP request to tenderly-ai-agent with proper authentication
   */
  private async makeStructuredDiagnosisRequest(
    payload: StructuredDiagnosisRequestDto,
    requestMetadata: RequestMetadata
  ): Promise<DiagnosisApiResponseDto> {
    let lastError: Error = new Error('Failed to make diagnosis request');
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`AI diagnosis request attempt ${attempt}/${this.maxRetries} for user: ${requestMetadata.userId}`);
        
        // Prepare request headers with updated authentication format
        const headers: Record<string, string> = {
          'X-API-Key': this.apiKey,
          'X-Service-Name': this.serviceName,
          'Content-Type': 'application/json',
          'X-Request-ID': `${requestMetadata.userId}_${Date.now()}_${attempt}`,
          'X-User-ID': requestMetadata.userId,
          'X-User-Role': requestMetadata.userRole
        };
        
        // Log request details for debugging
        this.logger.debug(`Making structured diagnosis request to ${this.aiAgentUrl}/api/v1/diagnosis/structure`, {
          attempt,
          userId: requestMetadata.userId,
          hasApiKey: !!this.apiKey,
          payloadSize: JSON.stringify(payload).length,
          endpoint: '/api/v1/diagnosis/structure'
        });
        
        const response: AxiosResponse<DiagnosisApiResponseDto> = await firstValueFrom(
          this.httpService.post<DiagnosisApiResponseDto>(
            `${this.aiAgentUrl}/api/v1/diagnosis/structure`, 
            payload, 
            {
              headers,
              timeout: this.requestTimeout,
            }
          )
        );
        
        if (response.status === 200 && response.data) {
          this.logger.debug(`AI diagnosis request successful on attempt ${attempt} for user: ${requestMetadata.userId}`);
          
          // Log successful authentication
          this.logger.log(`AI agent authenticated successfully using X-API-Key for user: ${requestMetadata.userId}`);
          
          return response.data;
        }
        
        throw new Error(`Invalid response from AI agent: ${response.status}`);
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`AI diagnosis attempt ${attempt} failed for user ${requestMetadata.userId}: ${error.message}`);
        
        // Handle authentication failures (401)
        if (error.response?.status === 401) {
          this.logger.error(`Authentication failed on attempt ${attempt} for user ${requestMetadata.userId}. Status: 401`);
          this.logger.error('Check API key configuration and tenderly-ai-agent setup');
          
          if (attempt >= this.maxRetries) {
            this.logger.error(`Authentication failed after ${this.maxRetries} attempts. Please verify:
              - AI_DIAGNOSIS_API_KEY is correctly set
              - tenderly-ai-agent accepts X-API-Key header
              - Service name 'tenderly-backend' is authorized`);
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
    this.logger.error(`All ${this.maxRetries} attempts failed for user ${requestMetadata.userId}. Last error: ${lastError.message}`);
    throw lastError;
  }

  /**
   * Validate diagnosis request input
   */
  private validateDiagnosisRequest(request: StructuredDiagnosisRequestDto): void {
    if (!request) {
      throw new BadRequestException('Diagnosis request is required');
    }

    if (!request.primary_complaint?.main_symptom && !request.patient_concerns?.main_worry) {
      throw new BadRequestException('Either primary complaint or patient concerns must be provided');
    }
  }

  /**
   * Validate AI response
   */
  private validateAIResponse(response: DiagnosisApiResponseDto): void {
    if (!response) {
      throw new Error('Empty response from AI agent');
    }

    if (!response.diagnosis) {
      throw new Error('No diagnosis provided in AI response');
    }

    if (typeof response.confidence_score !== 'number' || response.confidence_score < 0 || response.confidence_score > 1) {
      throw new Error('Invalid confidence score in AI response');
    }
  }

  /**
   * Generate hash for request caching
   */
  private generateRequestHash(request: StructuredDiagnosisRequestDto): string {
    const crypto = require('crypto');
    const requestString = JSON.stringify(request);
    return crypto.createHash('sha256').update(requestString).digest('hex');
  }

  /**
   * Log diagnosis request for audit purposes
   */
  private async logDiagnosisRequest(
    request: StructuredDiagnosisRequestDto,
    response: DiagnosisApiResponseDto | null,
    fromCache: boolean,
    requestMetadata: RequestMetadata,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.auditService.logDataAccess(
        requestMetadata.userId,
        'structured-diagnosis',
        'create',
        request.patient_profile?.request_id || 'unknown',
        undefined,
        {
          request: this.sanitizeDiagnosisRequest(request),
          response: response ? this.sanitizeDiagnosisResponse(response) : null,
          fromCache,
          success: !errorMessage,
          errorMessage,
        },
        {
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent
        }
      );
    } catch (error) {
      this.logger.error('Failed to log diagnosis request audit:', error);
    }
  }

  /**
   * Sanitize request for audit logging
   */
  private sanitizeDiagnosisRequest(request: StructuredDiagnosisRequestDto): any {
    return {
      hasPatientProfile: !!request.patient_profile,
      hasPrimaryComplaint: !!request.primary_complaint,
      hasMedicalContext: !!request.medical_context,
      hasPatientConcerns: !!request.patient_concerns,
      requestId: request.patient_profile?.request_id,
      timestamp: request.patient_profile?.timestamp
    };
  }

  /**
   * Sanitize response for audit logging
   */
  private sanitizeDiagnosisResponse(response: DiagnosisApiResponseDto): any {
    return {
      diagnosisLength: response.diagnosis.length,
      confidence_score: response.confidence_score,
      severity_level: response.severity_assessment?.level,
      investigationsCount: response.suggested_investigations?.length || 0,
      medicationsCount: response.recommended_medications?.length || 0,
      lifestyleAdviceCount: response.lifestyle_advice?.length || 0,
      hasFollowUp: !!response.follow_up_recommendations,
      timestamp: response.timestamp,
      processingTime: response.response_metadata?.processing_time_ms
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
   * Provide fallback structured diagnosis when AI agent is unavailable
   */
  private getFallbackStructuredDiagnosis(request: StructuredDiagnosisRequestDto): DiagnosisApiResponseDto {
    this.logger.warn('Providing fallback structured diagnosis due to AI agent unavailability');
    
    const severity = this.determineFallbackSeverity(request);
    
    return {
      diagnosis: 'Comprehensive assessment requires medical consultation due to AI service unavailability',
      confidence_score: 0.5,
      severity_assessment: {
        level: severity,
        reasoning: 'Assessment based on fallback rules due to AI service unavailability'
      },
      suggested_investigations: [
        {
          name: 'Basic physical examination',
          priority: 'medium',
          reason: 'Standard assessment recommended when detailed AI analysis is unavailable'
        }
      ],
      recommended_medications: [],
      lifestyle_advice: [
        'Maintain regular sleep schedule',
        'Stay hydrated',
        'Consult with healthcare provider for detailed assessment'
      ],
      follow_up_recommendations: {
        timeline: 'Within 1-2 weeks',
        specialist_referral: severity === 'critical' || severity === 'high',
        urgency: severity === 'critical' ? 'urgent' : 'medium'
      },
      red_flags: severity === 'critical' ? ['Seek immediate medical attention'] : [],
      disclaimer: 'This is a fallback assessment. AI diagnosis service was temporarily unavailable. Please consult with a healthcare provider for comprehensive evaluation.',
      timestamp: new Date().toISOString(),
      response_metadata: {
        processing_time_ms: 0,
        model_version: 'fallback-v1.0',
        service_name: 'tenderly-backend-fallback'
      }
    };
  }

  /**
   * Determine severity for fallback diagnosis
   */
  private determineFallbackSeverity(request: StructuredDiagnosisRequestDto): 'low' | 'moderate' | 'high' | 'critical' {
    const emergencyKeywords = [
      'chest pain', 'difficulty breathing', 'severe bleeding', 'loss of consciousness', 
      'severe abdominal pain', 'stroke', 'heart attack'
    ];
    
    const highSeverityKeywords = [
      'high fever', 'severe headache', 'persistent vomiting', 'severe pain'
    ];
    
    const mainSymptom = request.primary_complaint?.main_symptom?.toLowerCase() || '';
    const mainWorry = request.patient_concerns?.main_worry?.toLowerCase() || '';
    const severity = request.primary_complaint?.severity || 'moderate';
    
    const allText = `${mainSymptom} ${mainWorry}`.toLowerCase();
    
    if (emergencyKeywords.some(keyword => allText.includes(keyword))) {
      return 'critical';
    }
    
    if (severity === 'severe' || highSeverityKeywords.some(keyword => allText.includes(keyword))) {
      return 'high';
    }
    
    if (severity === 'moderate' || request.patient_concerns?.impact_on_life === 'significant') {
      return 'moderate';
    }
    
    return 'low';
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
