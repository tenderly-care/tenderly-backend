import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CacheService } from '../../../core/cache/cache.service';
import { Types } from 'mongoose';

export interface ConsultationSession {
  sessionId: string;
  patientId: string;
  currentPhase: 'symptom_collection' | 'consultation_selection' | 'payment_pending' | 'payment_confirmed' | 'detailed_collection' | 'consultation_created';
  data: {
    initialSymptoms?: any;
    aiDiagnosis?: any;
    selectedConsultationType?: string;
    paymentDetails?: any;
    detailedSymptoms?: any;
    consultationId?: string;
    consultationPricing?: any;
    preferences?: any;
    paymentConfirmed?: boolean;
    completedAt?: Date;
    clinicalSessionId?: string;
    finalConsultation?: {
      id: string;
      type: string;
      status: string;
    };
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  };
  expiresAt: Date;
}

export interface ClinicalSession {
  clinicalSessionId: string;
  consultationId: string;
  patientId: string;
  currentPhase: 'detailed_assessment' | 'symptoms_collected' | 'doctor_review' | 'treatment_planning' | 'completed';
  data: {
    detailedSymptoms?: any;
    clinicalDiagnosis?: any;
    doctorNotes?: any;
    treatmentPlan?: any;
    prescriptions?: any;
    structuredDiagnosis?: any;
    consultationPricing?: any;
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  };
  expiresAt: Date; // Valid until consultation completion or cancellation
}

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly CLINICAL_SESSION_TTL = 86400; // 24 hours for clinical sessions
  private readonly SESSION_PREFIX = 'consultation_session:';
  private readonly CLINICAL_SESSION_PREFIX = 'clinical_session:';

  constructor(private cacheService: CacheService) {}

  /**
   * Create a new consultation session
   */
  async createSession(patientId: string, metadata?: any): Promise<string> {
    const sessionId = this.generateSessionId();
    const session: ConsultationSession = {
      sessionId,
      patientId,
      currentPhase: 'symptom_collection',
      data: {},
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        ...metadata
      },
      expiresAt: new Date(Date.now() + this.SESSION_TTL * 1000)
    };

    await this.storeSession(sessionId, session);
    this.logger.log(`Created consultation session: ${sessionId} for patient: ${patientId}`);
    return sessionId;
  }

  /**
   * Update session with new data and phase
   */
  async updateSession(
    sessionId: string, 
    phase: ConsultationSession['currentPhase'], 
    data: Partial<ConsultationSession['data']>,
    patientId?: string
  ): Promise<ConsultationSession> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new BadRequestException('Session not found or expired');
    }

    if (patientId && session.patientId !== patientId) {
      throw new BadRequestException('Patient ID mismatch');
    }

    session.currentPhase = phase;
    session.data = { ...session.data, ...data };
    session.metadata.updatedAt = new Date();

    await this.storeSession(sessionId, session);
    this.logger.log(`Updated session ${sessionId} to phase: ${phase}`);
    
    return session;
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<ConsultationSession | null> {
    try {
      const cacheKey = `${this.SESSION_PREFIX}${sessionId}`;
      const session = await this.cacheService.get(cacheKey) as ConsultationSession;
      
      if (session && new Date() > session.expiresAt) {
        await this.destroySession(sessionId);
        return null;
      }
      
      return session;
    } catch (error) {
      this.logger.error(`Failed to get session ${sessionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate session for specific phase
   */
  async validateSessionPhase(
    sessionId: string, 
    expectedPhase: ConsultationSession['currentPhase'],
    patientId?: string
  ): Promise<ConsultationSession> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new BadRequestException('Session not found or expired');
    }

    if (patientId && session.patientId !== patientId) {
      throw new BadRequestException('Patient ID mismatch');
    }

    if (session.currentPhase !== expectedPhase) {
      throw new BadRequestException(`Invalid session phase. Expected: ${expectedPhase}, Current: ${session.currentPhase}`);
    }

    return session;
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<void> {
    try {
      const cacheKey = `${this.SESSION_PREFIX}${sessionId}`;
      await this.cacheService.delete(cacheKey);
      this.logger.log(`Destroyed session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to destroy session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    // This would be implemented based on your cache service capabilities
    this.logger.log('Cleaning up expired sessions');
  }

  // ========== CLINICAL SESSION METHODS ==========

  /**
   * Create a new clinical session for detailed assessment after payment
   */
  async createClinicalSession(
    consultationId: string, 
    patientId: string, 
    metadata?: any
  ): Promise<string> {
    const clinicalSessionId = this.generateClinicalSessionId();
    const clinicalSession: ClinicalSession = {
      clinicalSessionId,
      consultationId,
      patientId,
      currentPhase: 'detailed_assessment',
      data: {},
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        ...metadata
      },
      expiresAt: new Date(Date.now() + this.CLINICAL_SESSION_TTL * 1000)
    };

    await this.storeClinicalSession(clinicalSessionId, clinicalSession);
    this.logger.log(`Created clinical session: ${clinicalSessionId} for consultation: ${consultationId}`);
    return clinicalSessionId;
  }

  /**
   * Update clinical session with new data and phase
   */
  async updateClinicalSession(
    clinicalSessionId: string,
    phase: ClinicalSession['currentPhase'],
    data: Partial<ClinicalSession['data']>,
    patientId?: string
  ): Promise<ClinicalSession> {
    const session = await this.getClinicalSession(clinicalSessionId);
    
    if (!session) {
      throw new BadRequestException('Clinical session not found or expired');
    }

    if (patientId && session.patientId !== patientId) {
      throw new BadRequestException('Patient ID mismatch');
    }

    session.currentPhase = phase;
    session.data = { ...session.data, ...data };
    session.metadata.updatedAt = new Date();

    await this.storeClinicalSession(clinicalSessionId, session);
    this.logger.log(`Updated clinical session ${clinicalSessionId} to phase: ${phase}`);
    
    return session;
  }

  /**
   * Get clinical session data
   */
  async getClinicalSession(clinicalSessionId: string): Promise<ClinicalSession | null> {
    try {
      const cacheKey = `${this.CLINICAL_SESSION_PREFIX}${clinicalSessionId}`;
      const session = await this.cacheService.get(cacheKey) as ClinicalSession;
      
      if (session && new Date() > session.expiresAt) {
        await this.destroyClinicalSession(clinicalSessionId);
        return null;
      }
      
      return session;
    } catch (error) {
      this.logger.error(`Failed to get clinical session ${clinicalSessionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get payment session for a patient
   */
  async getPaymentSession(patientId: string): Promise<{
    sessionId: string;
    patientId: string;
    paymentStatus: 'pending' | 'confirmed' | 'failed';
    clinicalSessionId?: string;
    paymentDetails?: any;
  } | null> {
    try {
      // Search for sessions with payment_confirmed status for this patient
      // This is a simplified implementation - in production you might want to store payment sessions separately
      const sessions = await this.getAllSessionsForPatient(patientId);
      
      for (const session of sessions) {
        if (session.currentPhase === 'payment_confirmed' && session.data.paymentConfirmed) {
          return {
            sessionId: session.sessionId,
            patientId: session.patientId,
            paymentStatus: 'confirmed',
            clinicalSessionId: session.data.clinicalSessionId,
            paymentDetails: session.data.paymentDetails
          };
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to get payment session for patient ${patientId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all sessions for a patient (helper method)
   */
  private async getAllSessionsForPatient(patientId: string): Promise<ConsultationSession[]> {
    try {
      // This is a simplified implementation
      // In production, you might want to maintain a separate index of sessions by patient
      const sessions: ConsultationSession[] = [];
      
      // For now, we'll return an empty array as this is a complex operation
      // In a real implementation, you'd query your cache service for sessions by patient
      this.logger.debug(`Getting sessions for patient: ${patientId} (simplified implementation)`);
      
      return sessions;
    } catch (error) {
      this.logger.error(`Failed to get sessions for patient ${patientId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Validate clinical session for specific phase and consultation
   */
  async validateClinicalSession(
    clinicalSessionId: string,
    consultationId: string,
    patientId?: string
  ): Promise<ClinicalSession> {
    const session = await this.getClinicalSession(clinicalSessionId);
    
    if (!session) {
      throw new BadRequestException('Clinical session not found or expired');
    }

    if (session.consultationId !== consultationId) {
      throw new BadRequestException('Clinical session does not belong to this consultation');
    }

    if (patientId && session.patientId !== patientId) {
      throw new BadRequestException('Patient ID mismatch');
    }

    return session;
  }

  /**
   * Clear initial screening data after payment confirmation
   */
  async clearInitialScreeningData(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        // Clear only screening-specific data, keep consultation metadata
        const clearedData = {
          ...session.data,
          initialSymptoms: undefined,
          aiDiagnosis: undefined,
          paymentDetails: undefined,
          consultationPricing: undefined
        };
        
        await this.updateSession(sessionId, session.currentPhase, clearedData);
        this.logger.log(`Cleared initial screening data for session: ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to clear screening data for session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Destroy clinical session
   */
  async destroyClinicalSession(clinicalSessionId: string): Promise<void> {
    try {
      const cacheKey = `${this.CLINICAL_SESSION_PREFIX}${clinicalSessionId}`;
      await this.cacheService.delete(cacheKey);
      this.logger.log(`Destroyed clinical session: ${clinicalSessionId}`);
    } catch (error) {
      this.logger.error(`Failed to destroy clinical session ${clinicalSessionId}: ${error.message}`);
    }
  }

  // ========== PRIVATE HELPER METHODS ==========

  async storeSession(sessionId: string, session: ConsultationSession): Promise<void> {
    const cacheKey = `${this.SESSION_PREFIX}${sessionId}`;
    await this.cacheService.set(cacheKey, session, this.SESSION_TTL);
  }

  private async storeClinicalSession(clinicalSessionId: string, session: ClinicalSession): Promise<void> {
    const cacheKey = `${this.CLINICAL_SESSION_PREFIX}${clinicalSessionId}`;
    await this.cacheService.set(cacheKey, session, this.CLINICAL_SESSION_TTL);
  }

  private generateSessionId(): string {
    return `session_${new Types.ObjectId().toString()}_${Date.now()}`;
  }

  private generateClinicalSessionId(): string {
    return `clinical_${new Types.ObjectId().toString()}_${Date.now()}`;
  }
}
