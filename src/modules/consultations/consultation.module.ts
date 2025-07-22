import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { ConsultationController } from './controllers/consultation.controller';
import { DoctorShiftController } from './controllers/doctor-shift.controller';
import { ConsultationService } from './services/consultation.service';
import { DoctorShiftService } from './services/doctor-shift.service';
import { AIAgentService } from './services/ai-agent.service';
import { AITokenService } from './services/ai-token.service';
import { PaymentService } from './services/payment.service';
import { Consultation, ConsultationSchema } from './schemas/consultation.schema';
import { DoctorShift, DoctorShiftSchema } from './schemas/doctor-shift.schema';
import { CacheModule } from '../../core/cache/cache.module';
import { AuditService } from '../../security/audit/audit.service';
import { AuditLog, AuditLogSchema } from '../../security/audit/schemas/audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Consultation.name, schema: ConsultationSchema },
      { name: DoctorShift.name, schema: DoctorShiftSchema },
      { name: 'AuditLog', schema: AuditLogSchema }
    ]),
    CacheModule,
    HttpModule,
    ThrottlerModule.forRoot([
      {
        name: 'consultation-requests',
        ttl: 60000, // 1 minute
        limit: 20, // 20 requests per minute for consultation endpoints
      },
    ]),
  ],
  controllers: [ConsultationController, DoctorShiftController],
  providers: [ConsultationService, DoctorShiftService, AIAgentService, AITokenService, PaymentService, AuditService],
  exports: [ConsultationService, DoctorShiftService],
})
export class ConsultationModule {}
