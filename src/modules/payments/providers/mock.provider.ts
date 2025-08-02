import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import {
  IPaymentProvider,
  PaymentOrderRequest,
  PaymentOrderResponse,
  PaymentVerificationResponse,
  RefundResponse,
  PaymentDetails,
  PaymentOrderStatus,
  PaymentStatus,
  RefundStatus,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  getProviderName(): string {
    return 'mock';
  }

  async createOrder(request: PaymentOrderRequest): Promise<PaymentOrderResponse> {
    try {
      this.logger.log(`Creating mock payment order for amount: ${request.amount} ${request.currency}`);

      // Generate mock payment ID
      const gatewayOrderId = `mock_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        gatewayOrderId,
        amount: request.amount,
        currency: request.currency,
        status: PaymentOrderStatus.CREATED,
        paymentUrl: `http://localhost:3000/mock-payment/${gatewayOrderId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
        gatewayResponse: {
          mockGateway: true,
          orderId: gatewayOrderId,
          internalOrderId: request.orderId,
          customerDetails: request.customerDetails,
          metadata: request.metadata,
          createdAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Mock payment order creation failed:', error);
      throw new BadRequestException('Mock payment order creation failed');
    }
  }

  async verifyPayment(
    paymentId: string, 
    signature?: string, 
    orderId?: string
  ): Promise<PaymentVerificationResponse> {
    try {
      this.logger.log(`Verifying mock payment: ${paymentId}`);

      // For mock provider, we simulate successful payment
      // In real implementation, this would check the payment status with the gateway
      
      // Generate mock payment details
      const mockPayment = {
        id: paymentId,
        order_id: orderId || `mock_order_${Date.now()}`,
        amount: 29900, // Default amount in paise (₹299)
        currency: 'INR',
        status: 'captured', // Mock successful payment
        method: 'card',
        captured_at: Math.floor(Date.now() / 1000),
        created_at: Math.floor(Date.now() / 1000),
      };

      return {
        paymentId: mockPayment.id,
        orderId: mockPayment.order_id,
        amount: mockPayment.amount,
        currency: mockPayment.currency,
        status: PaymentStatus.COMPLETED,
        method: mockPayment.method,
        paidAt: new Date(mockPayment.captured_at * 1000),
        gatewayResponse: {
          mockGateway: true,
          ...mockPayment,
          verifiedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Mock payment verification failed:', error);
      throw new BadRequestException('Mock payment verification failed');
    }
  }

  async refundPayment(
    paymentId: string, 
    amount?: number, 
    reason?: string
  ): Promise<RefundResponse> {
    try {
      this.logger.log(`Creating mock refund for payment: ${paymentId}, amount: ${amount || 'full'}`);

      const refundId = `mock_refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        refundId,
        paymentId,
        amount: amount || 29900, // Default refund amount
        currency: 'INR',
        status: RefundStatus.PROCESSED,
        reason,
        processedAt: new Date(),
        gatewayResponse: {
          mockGateway: true,
          refundId,
          paymentId,
          amount: amount || 29900,
          reason,
          processedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Mock refund creation failed:', error);
      throw new BadRequestException('Mock refund creation failed');
    }
  }

  async getPaymentDetails(paymentId: string): Promise<PaymentDetails> {
    try {
      this.logger.log(`Fetching mock payment details: ${paymentId}`);

      // Generate mock payment details
      const now = new Date();
      
      return {
        paymentId,
        orderId: `mock_order_${Date.now()}`,
        amount: 29900, // Default amount
        currency: 'INR',
        status: PaymentStatus.COMPLETED,
        method: 'card',
        createdAt: now,
        paidAt: now,
        gatewayResponse: {
          mockGateway: true,
          paymentId,
          status: 'captured',
          method: 'card',
          amount: 29900,
          currency: 'INR',
          fetchedAt: now,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch mock payment details:', error);
      throw new BadRequestException('Failed to fetch mock payment details');
    }
  }

  /**
   * Mock webhook signature verification (always returns true for testing)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    this.logger.log('Mock webhook signature verification - always returns true');
    return true;
  }

  /**
   * Mock payment signature verification (always returns true for testing)
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    this.logger.log('Mock payment signature verification - always returns true');
    return true;
  }
}
