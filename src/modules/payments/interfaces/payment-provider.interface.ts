export interface IPaymentProvider {
  createOrder(request: PaymentOrderRequest): Promise<PaymentOrderResponse>;
  verifyPayment(paymentId: string, signature?: string, orderId?: string): Promise<PaymentVerificationResponse>;
  refundPayment(paymentId: string, amount?: number, reason?: string): Promise<RefundResponse>;
  getPaymentDetails(paymentId: string): Promise<PaymentDetails>;
  getProviderName(): string;
}

export interface PaymentOrderRequest {
  amount: number;                    // Amount in smallest currency unit (paise for INR)
  currency: string;                  // 'INR'
  orderId: string;                   // Internal order ID
  description: string;               // Order description
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  metadata: Record<string, any>;     // Custom metadata
  notifyUrl?: string;               // Webhook URL
}

export interface PaymentOrderResponse {
  gatewayOrderId: string;           // Gateway-specific order ID (e.g., Razorpay order_id)
  gatewayPaymentId?: string;        // Gateway-specific payment ID (for successful payments)
  amount: number;                   // Amount in smallest currency unit
  currency: string;                 // Currency code
  status: PaymentOrderStatus;       // Order status
  paymentUrl?: string;              // Hosted checkout URL or frontend URL with payment details
  expiresAt?: Date;                // Order expiration time
  gatewayResponse: any;             // Raw gateway response for debugging
}

export interface PaymentVerificationResponse {
  paymentId: string;                // Gateway payment ID
  orderId: string;                  // Gateway order ID
  amount: number;                   // Payment amount
  currency: string;                 // Currency code
  status: PaymentStatus;            // Payment status
  method?: string;                  // Payment method (card, netbanking, etc.)
  paidAt?: Date;                   // Payment completion timestamp
  gatewayResponse: any;             // Raw gateway response
}

export interface RefundResponse {
  refundId: string;                 // Gateway refund ID
  paymentId: string;                // Original payment ID
  amount: number;                   // Refund amount
  currency: string;                 // Currency code
  status: RefundStatus;             // Refund status
  reason?: string;                  // Refund reason
  processedAt?: Date;              // Refund processing timestamp
  gatewayResponse: any;             // Raw gateway response
}

export interface PaymentDetails {
  paymentId: string;                // Gateway payment ID
  orderId: string;                  // Gateway order ID
  amount: number;                   // Payment amount
  currency: string;                 // Currency code
  status: PaymentStatus;            // Current payment status
  method?: string;                  // Payment method
  createdAt: Date;                 // Payment creation timestamp
  paidAt?: Date;                   // Payment completion timestamp
  gatewayResponse: any;             // Raw gateway response
}

// Payment status enums
export enum PaymentOrderStatus {
  CREATED = 'created',
  ATTEMPTED = 'attempted',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  CANCELLED = 'cancelled',
}

export enum RefundStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Payment provider types
export enum PaymentProviderType {
  MOCK = 'mock',
  RAZORPAY = 'razorpay',
}

// Enhanced payment status for internal use
export interface EnhancedPaymentStatus {
  internalOrderId: string;          // Internal order ID
  gatewayOrderId: string;           // Gateway order ID
  gatewayPaymentId?: string;        // Gateway payment ID
  sessionId: string;                // Consultation session ID
  patientId: string;                // Patient ID
  amount: number;                   // Amount in rupees (not paise)
  currency: string;                 // Currency code
  status: PaymentInternalStatus;    // Internal payment status
  provider: string;                 // Payment provider name
  consultationType: string;         // Type of consultation
  createdAt: Date;                 // Creation timestamp
  updatedAt?: Date;                // Last update timestamp
  paidAt?: Date;                   // Payment completion timestamp
  expiresAt: Date;                 // Payment expiration timestamp
  transactionId?: string;           // Transaction ID from gateway
  paymentMethod?: string;           // Payment method used
  failureReason?: string;           // Failure reason if failed
  gatewayResponse?: any;            // Raw gateway response
  metadata?: Record<string, any>;   // Additional metadata
}

export enum PaymentInternalStatus {
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_EXPIRED = 'payment_expired',
  PAYMENT_REFUNDED = 'payment_refunded',
  PAYMENT_CANCELLED = 'payment_cancelled',
}
