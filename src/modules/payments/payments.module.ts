import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Providers
import { MockPaymentProvider } from './providers/mock.provider';
import { RazorpayProvider } from './providers/razorpay.provider';

// Factory
import { PaymentProviderFactory } from './factories/payment-provider.factory';

// Controllers

// Import required services directly
import { PaymentService } from '../consultations/services/payment.service';
import { CacheModule } from '../../core/cache/cache.module';
import { AuditService } from '../../security/audit/audit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../../security/audit/schemas/audit-log.schema';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [],
  providers: [
    MockPaymentProvider,
    RazorpayProvider,
    PaymentProviderFactory,
    PaymentService,
    AuditService,
  ],
  exports: [
    PaymentProviderFactory,
    MockPaymentProvider,
    RazorpayProvider,
  ],
})
export class PaymentsModule {}
