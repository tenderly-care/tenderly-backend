import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PaymentConfirmationDto } from '../dto/consultation.dto';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../../security/audit/audit.service';

export interface PaymentRequest {
  sessionId: string;
  patientId: string;
  consultationType: 'chat' | 'tele' | 'video' | 'emergency';
  amount: number;
  currency: string;
  metadata?: {
    diagnosis: string;
    severity: string;
  };
}

export interface PaymentResponse {
  paymentId: string;
  paymentUrl: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  currency: string;
  expiresAt: Date;
  metadata?: any;
}

export interface PaymentStatus {
  paymentId: string;
  status: 'payment_pending' | 'payment_completed' | 'payment_failed' | 'payment_expired';
  amount: number;
  currency: string;
  paidAt?: Date;
  failureReason?: string;
  transactionId?: string;
  gatewayResponse?: any;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  
  // Mock consultation pricing
  private readonly consultationPricing = {
    chat: { amount: 150, currency: 'INR' },
    tele: { amount: 200, currency: 'INR' },
    video: { amount: 250, currency: 'INR' },
    emergency: { amount: 300, currency: 'INR' },
  };

  constructor(
    private readonly cacheService: CacheService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create mock payment order for consultation
   */
  async createPaymentOrder(
    sessionId: string,
    patientId: string,
    consultationType: 'chat' | 'tele' | 'video' | 'emergency',
    diagnosis: string,
    severity: string,
    requestMetadata?: { ipAddress: string; userAgent: string }
  ): Promise<PaymentResponse> {
    try {
      this.logger.log(`Creating mock payment order for session: ${sessionId}, type: ${consultationType}`);
      
      // Get pricing for consultation type
      const pricing = this.consultationPricing[consultationType];
      if (!pricing) {
        throw new BadRequestException('Invalid consultation type');
      }

      // Check if payment already exists for this session
      const existingPayment = await this.getPaymentBySessionId(sessionId);
      if (existingPayment && existingPayment.status === 'payment_pending') {
        this.logger.debug(`Returning existing payment for session: ${sessionId}`);
        return this.formatPaymentResponse(existingPayment);
      }

      // Generate mock payment ID
      const paymentId = `mock_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create mock payment response
      const paymentResponse: PaymentResponse = {
        paymentId,
        paymentUrl: `http://localhost:3000/mock-payment/${paymentId}`,
        status: 'pending',
        amount: pricing.amount,
        currency: pricing.currency,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
        metadata: {
          mockGateway: true,
          sessionId,
          consultationType,
          diagnosis,
          severity,
        },
      };
      
      // Store payment details temporarily
      this.logger.log(`Storing payment details for session: ${sessionId}`);
      await this.storePaymentDetails(sessionId, paymentResponse);
      
      // Log audit event
      try {
        this.logger.log(`Logging audit event for payment: ${paymentId}`);
        await this.auditService.logDataAccess(
          patientId,
          'payment',
          'create',
          paymentId,
          undefined,
          {
            sessionId,
            consultationType,
            amount: pricing.amount,
            currency: pricing.currency,
            paymentId,
            mockPayment: true,
          },
          requestMetadata
        );
        this.logger.log(`Audit event logged successfully for payment: ${paymentId}`);
      } catch (auditError) {
        this.logger.warn(`Failed to log audit event for payment ${paymentId}: ${auditError.message}`);
        // Don't fail the payment creation if audit logging fails
      }

      this.logger.log(`Mock payment order created successfully for session: ${sessionId}, paymentId: ${paymentId}`);
      
      return paymentResponse;
      
    } catch (error) {
      this.logger.error(`Failed to create mock payment order for session ${sessionId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create payment order');
    }
  }

  /**
   * Mock payment completion (for testing)
   */
  async mockCompletePayment(
    sessionId: string,
    paymentId: string,
    success: boolean = true
  ): Promise<PaymentStatus> {
    try {
      this.logger.log(`Mock completing payment for session: ${sessionId}, paymentId: ${paymentId}, success: ${success}`);
      
      // Get payment details from cache
      const cachedPayment = await this.getPaymentBySessionId(sessionId);
      if (!cachedPayment) {
        throw new BadRequestException('Payment session not found');
      }

      // Create mock payment status
      const paymentStatus: PaymentStatus = {
        paymentId,
        status: success ? 'payment_completed' : 'payment_failed',
        amount: cachedPayment.amount,
        currency: cachedPayment.currency,
        paidAt: success ? new Date() : undefined,
        failureReason: success ? undefined : 'Mock payment failure for testing',
        transactionId: `mock_txn_${Date.now()}`,
        gatewayResponse: {
          mockGateway: true,
          success,
          processedAt: new Date(),
        },
      };

      // Update cached payment status
      await this.updatePaymentStatus(sessionId, paymentStatus);
      
      // Log audit event
      await this.auditService.logDataAccess(
        'system',
        'payment',
        'update',
        paymentId,
        cachedPayment,
        paymentStatus
      );

      this.logger.log(`Mock payment completion processed for session: ${sessionId}, status: ${paymentStatus.status}`);
      
      return paymentStatus;
      
    } catch (error) {
      this.logger.error(`Failed to mock complete payment for session ${sessionId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to complete mock payment');
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(paymentConfirmation: PaymentConfirmationDto): Promise<PaymentStatus> {
    try {
      this.logger.log(`Verifying payment for session: ${paymentConfirmation.sessionId}, paymentId: ${paymentConfirmation.paymentId}`);
      
      // Get payment details from cache
      const cachedPayment = await this.getPaymentBySessionId(paymentConfirmation.sessionId);
      if (!cachedPayment) {
        this.logger.error(`Payment session not found for sessionId: ${paymentConfirmation.sessionId}`);
        throw new BadRequestException(`Payment session not found for session: ${paymentConfirmation.sessionId}. Please ensure the payment was created and the session is still valid.`);
      }

      // Verify payment ID matches
      if (cachedPayment.paymentId !== paymentConfirmation.paymentId) {
        this.logger.error(`Payment ID mismatch for session: ${paymentConfirmation.sessionId}. Expected: ${cachedPayment.paymentId}, Received: ${paymentConfirmation.paymentId}`);
        throw new BadRequestException(`Payment ID mismatch. Expected: ${cachedPayment.paymentId}, Received: ${paymentConfirmation.paymentId}`);
      }

      // For production, this would verify with actual payment gateway
      // For now, check if payment is already completed or simulate completion
      let updatedPaymentStatus: PaymentStatus;
      
      if (cachedPayment.status === 'payment_completed') {
        // Payment already completed, return cached status
        updatedPaymentStatus = cachedPayment;
        this.logger.log(`Payment already completed for session: ${paymentConfirmation.sessionId}`);
      } else {
        // Simulate payment completion for testing
        updatedPaymentStatus = {
          ...cachedPayment,
          status: 'payment_completed',
          paidAt: new Date(),
          transactionId: paymentConfirmation.gatewayTransactionId || `mock_txn_${Date.now()}`,
          gatewayResponse: {
            mockGateway: true,
            success: true,
            processedAt: new Date(),
            paymentMethod: paymentConfirmation.paymentMethod || 'mock',
            metadata: paymentConfirmation.paymentMetadata,
          },
        };
        
        // Update payment status in cache
        await this.updatePaymentStatus(paymentConfirmation.sessionId, updatedPaymentStatus);
        
        this.logger.log(`Payment verified and marked as completed for session: ${paymentConfirmation.sessionId}`);
      }
      
      // Log audit event for payment verification
      try {
        await this.auditService.logDataAccess(
          'system',
          'payment',
          'update',
          paymentConfirmation.paymentId,
          cachedPayment,
          updatedPaymentStatus
        );
      } catch (auditError) {
        this.logger.warn(`Failed to log audit event for payment verification: ${auditError.message}`);
        // Don't fail the payment verification if audit logging fails
      }

      this.logger.log(`Payment verification completed for session: ${paymentConfirmation.sessionId}, status: ${updatedPaymentStatus.status}`);
      
      return updatedPaymentStatus;
      
    } catch (error) {
      this.logger.error(`Failed to verify payment for session ${paymentConfirmation.sessionId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Log additional context for debugging
      this.logger.error(`Payment verification failed with context:`, {
        sessionId: paymentConfirmation.sessionId,
        paymentId: paymentConfirmation.paymentId,
        error: error.message,
        stack: error.stack
      });
      
      throw new InternalServerErrorException('Failed to verify payment. Please try again or contact support if the issue persists.');
    }
  }

  /**
   * Get payment details by session ID
   */
  async getPaymentBySessionId(sessionId: string): Promise<PaymentStatus | null> {
    try {
      const cacheKey = `payment:${sessionId}`;
      const paymentData = await this.cacheService.get(cacheKey);
      return paymentData || null;
    } catch (error) {
      this.logger.error(`Failed to get payment for session ${sessionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get consultation pricing
   */
  getConsultationPricing(consultationType: 'chat' | 'tele' | 'video' | 'emergency'): { amount: number; currency: string } {
    return this.consultationPricing[consultationType];
  }

  /**
   * Store payment details in cache
   */
  private async storePaymentDetails(sessionId: string, paymentResponse: PaymentResponse): Promise<void> {
    try {
      this.logger.log(`Storing payment details for session: ${sessionId}, paymentId: ${paymentResponse.paymentId}`);
      
      const cacheKey = `payment:${sessionId}`;
      const paymentData: PaymentStatus = {
        paymentId: paymentResponse.paymentId,
        status: 'payment_pending',
        amount: paymentResponse.amount,
        currency: paymentResponse.currency,
      };

      await this.cacheService.set(cacheKey, paymentData, 24 * 60 * 60); // 24 hours
      
      // Also store reverse mapping for webhook processing
      const reverseKey = `payment:id:${paymentResponse.paymentId}`;
      await this.cacheService.set(reverseKey, { sessionId }, 24 * 60 * 60);
      
      this.logger.log(`Payment details stored successfully for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to store payment details for session ${sessionId}: ${error.message}`);
      throw new Error(`Failed to store payment details: ${error.message}`);
    }
  }

  /**
   * Update payment status in cache
   */
  private async updatePaymentStatus(sessionId: string, paymentStatus: PaymentStatus): Promise<void> {
    const cacheKey = `payment:${sessionId}`;
    await this.cacheService.set(cacheKey, paymentStatus, 24 * 60 * 60); // 24 hours
  }

  /**
   * Format payment response
   */
  private formatPaymentResponse(paymentStatus: PaymentStatus): PaymentResponse {
    return {
      paymentId: paymentStatus.paymentId,
      paymentUrl: `http://localhost:3000/mock-payment/${paymentStatus.paymentId}`,
      status: paymentStatus.status === 'payment_pending' ? 'pending' : 'completed',
      amount: paymentStatus.amount,
      currency: paymentStatus.currency,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      metadata: paymentStatus.gatewayResponse,
    };
  }

  /**
   * Get payment statistics (mock)
   */
  async getPaymentStats(startDate: Date, endDate: Date): Promise<any> {
    return {
      totalPayments: 0,
      totalAmount: 0,
      successfulPayments: 0,
      failedPayments: 0,
      averageAmount: 0,
      paymentsByType: {
        chat: 0,
        video: 0,
        emergency: 0,
      },
      mockData: true,
    };
  }
}
