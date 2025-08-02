import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
const Razorpay = require('razorpay');

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
export class RazorpayProvider implements IPaymentProvider {
  private readonly logger = new Logger(RazorpayProvider.name);
  private razorpayInstance: any;
  private readonly webhookSecret: string;

  constructor(private configService: ConfigService) {
    this.initializeRazorpay();
  }

  private initializeRazorpay(): void {
    const keyId = this.configService.get<string>('payment.razorpay.keyId');
    const keySecret = this.configService.get<string>('payment.razorpay.keySecret');
    const webhookSecret = this.configService.get<string>('payment.razorpay.webhookSecret');
    const environment = this.configService.get<string>('payment.razorpay.environment');
    
    // Debug logging
    this.logger.debug(`Razorpay Configuration Debug:`);
    this.logger.debug(`Environment: ${environment}`);
    this.logger.debug(`Key ID: ${keyId ? keyId.substring(0, 10) + '...' : 'NOT SET'}`);
    this.logger.debug(`Key Secret: ${keySecret ? keySecret.substring(0, 5) + '...' : 'NOT SET'}`);
    this.logger.debug(`Webhook Secret: ${webhookSecret ? 'SET' : 'NOT SET'}`);
    
    // Use object assignment to bypass readonly restrictions during initialization
    (this as any).webhookSecret = webhookSecret;

    if (!keyId || !keySecret) {
      this.logger.error('Razorpay credentials not configured');
      this.logger.error(`KeyId: ${keyId}, KeySecret: ${keySecret}`);
      throw new Error('Razorpay credentials not configured');
    }

    this.razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    this.logger.log(`Razorpay provider initialized for ${environment} environment`);
  }

  getProviderName(): string {
    return 'razorpay';
  }

  async createOrder(request: PaymentOrderRequest): Promise<PaymentOrderResponse> {
    try {
      this.logger.log(`Creating Razorpay order for amount: ${request.amount} ${request.currency}`);

      const razorpayOrderRequest = {
        amount: request.amount, // Amount should already be in paise
        currency: request.currency,
        receipt: request.orderId,
        notes: {
          ...request.metadata,
          customerEmail: request.customerDetails.email,
          customerPhone: request.customerDetails.phone,
          customerName: request.customerDetails.name,
        },
      };

      const razorpayOrder = await this.razorpayInstance.orders.create(razorpayOrderRequest);

      this.logger.log(`Razorpay order created successfully: ${razorpayOrder.id}`);

      return {
        gatewayOrderId: razorpayOrder.id,
        amount: Number(razorpayOrder.amount),
        currency: razorpayOrder.currency,
        status: this.mapRazorpayOrderStatus(razorpayOrder.status),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
        gatewayResponse: razorpayOrder,
      };
    } catch (error) {
      this.logger.error('Razorpay order creation failed:', error);
      
      // Handle specific Razorpay errors
      if (error.statusCode) {
        const errorMessage = error.error?.description || error.message || 'Razorpay order creation failed';
        throw new BadRequestException(`Payment order creation failed: ${errorMessage}`);
      }
      
      throw new InternalServerErrorException('Payment order creation failed');
    }
  }

  async verifyPayment(
    paymentId: string, 
    signature?: string, 
    orderId?: string
  ): Promise<PaymentVerificationResponse> {
    try {
      this.logger.log(`Verifying Razorpay payment: ${paymentId}`);

      // Fetch payment details from Razorpay
      const payment = await this.razorpayInstance.payments.fetch(paymentId);

      // Verify signature if provided (for frontend verification)
      if (signature && orderId) {
        const isValidSignature = this.verifyPaymentSignature(orderId, paymentId, signature);
        if (!isValidSignature) {
          this.logger.warn(`Invalid payment signature for payment: ${paymentId}`);
          throw new BadRequestException('Invalid payment signature');
        }
      }

      this.logger.log(`Payment verification successful: ${paymentId}, status: ${payment.status}`);

      return {
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: this.mapRazorpayPaymentStatus(payment.status),
        method: payment.method,
        paidAt: payment.created_at ? new Date(payment.created_at * 1000) : undefined,
        gatewayResponse: payment,
      };
    } catch (error) {
      this.logger.error('Payment verification failed:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.statusCode === 404) {
        throw new BadRequestException('Payment not found');
      }
      
      throw new InternalServerErrorException('Payment verification failed');
    }
  }

  async refundPayment(
    paymentId: string, 
    amount?: number, 
    reason?: string
  ): Promise<RefundResponse> {
    try {
      this.logger.log(`Creating refund for payment: ${paymentId}, amount: ${amount || 'full'}`);

      const refundRequest: any = {
        ...(amount && { amount }), // Partial refund if amount specified
        ...(reason && { notes: { reason } }),
      };

      const refund = await this.razorpayInstance.payments.refund(paymentId, refundRequest);

      this.logger.log(`Refund created successfully: ${refund.id}`);

      return {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount || 0,
        currency: refund.currency,
        status: this.mapRazorpayRefundStatus(refund.status),
        reason,
        processedAt: refund.created_at ? new Date(refund.created_at * 1000) : undefined,
        gatewayResponse: refund,
      };
    } catch (error) {
      this.logger.error('Refund creation failed:', error);
      
      if (error.statusCode) {
        const errorMessage = error.error?.description || error.message || 'Refund creation failed';
        throw new BadRequestException(`Refund failed: ${errorMessage}`);
      }
      
      throw new InternalServerErrorException('Refund creation failed');
    }
  }

  async getPaymentDetails(paymentId: string): Promise<PaymentDetails> {
    try {
      this.logger.log(`Fetching payment details: ${paymentId}`);

      const payment = await this.razorpayInstance.payments.fetch(paymentId);

      return {
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: this.mapRazorpayPaymentStatus(payment.status),
        method: payment.method,
        createdAt: new Date(payment.created_at * 1000),
        paidAt: payment.created_at ? new Date(payment.created_at * 1000) : undefined,
        gatewayResponse: payment,
      };
    } catch (error) {
      this.logger.error('Failed to fetch payment details:', error);
      
      if (error.statusCode === 404) {
        throw new BadRequestException('Payment not found');
      }
      
      throw new InternalServerErrorException('Failed to fetch payment details');
    }
  }

  /**
   * Verify webhook signature from Razorpay
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!this.webhookSecret) {
        this.logger.warn('Webhook secret not configured');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify payment signature for frontend verification
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    try {
      const keySecret = this.configService.get<string>('payment.razorpay.keySecret');
      if (!keySecret) {
        this.logger.warn('Razorpay key secret not configured');
        return false;
      }

      const text = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(text)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error('Payment signature verification failed:', error);
      return false;
    }
  }

  // Status mapping methods
  private mapRazorpayOrderStatus(razorpayStatus: string): PaymentOrderStatus {
    const statusMap: Record<string, PaymentOrderStatus> = {
      'created': PaymentOrderStatus.CREATED,
      'attempted': PaymentOrderStatus.ATTEMPTED,
      'paid': PaymentOrderStatus.PAID,
      'failed': PaymentOrderStatus.FAILED,
    };

    return statusMap[razorpayStatus] || PaymentOrderStatus.FAILED;
  }

  private mapRazorpayPaymentStatus(razorpayStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'created': PaymentStatus.PENDING,
      'authorized': PaymentStatus.PENDING,
      'captured': PaymentStatus.COMPLETED,
      'refunded': PaymentStatus.REFUNDED,
      'failed': PaymentStatus.FAILED,
    };

    return statusMap[razorpayStatus] || PaymentStatus.FAILED;
  }

  private mapRazorpayRefundStatus(razorpayStatus: string): RefundStatus {
    const statusMap: Record<string, RefundStatus> = {
      'pending': RefundStatus.PENDING,
      'processed': RefundStatus.PROCESSED,
      'failed': RefundStatus.FAILED,
    };

    return statusMap[razorpayStatus] || RefundStatus.FAILED;
  }
}
