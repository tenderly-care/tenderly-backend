import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { ConsultationController } from './controllers/consultation.controller';
import { DoctorShiftController } from './controllers/doctor-shift.controller';
import { PrescriptionController } from './controllers/prescription.controller';
import { ConsultationService } from './services/consultation.service';
import { DoctorShiftService } from './services/doctor-shift.service';
import { AIAgentService } from './services/ai-agent.service';
import { AITokenService } from './services/ai-token.service';
import { PaymentService } from './services/payment.service';
import { SessionManagerService } from './services/session-manager.service';
import { Consultation, ConsultationSchema } from './schemas/consultation.schema';
import { DoctorShift, DoctorShiftSchema } from './schemas/doctor-shift.schema';
import { CacheModule } from '../../core/cache/cache.module';
import { AuditService } from '../../security/audit/audit.service';
import { AuditLog, AuditLogSchema } from '../../security/audit/schemas/audit-log.schema';
import { ConsultationBusinessService } from './services/consultation-business.service';
import { DoctorAssignmentService } from './services/doctor-assignment.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PdfGenerationService } from './services/pdf-generation.service';
import { DigitalSignatureService } from './services/digital-signature.service';
import { FileStorageService } from './services/file-storage.service';
import { PrescriptionService } from './services/prescription.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Consultation.name, schema: ConsultationSchema },
      { name: DoctorShift.name, schema: DoctorShiftSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: User.name, schema: UserSchema }
    ]),
    CacheModule,
    HttpModule,
    PaymentsModule,
    ThrottlerModule.forRoot([
      {
        name: 'consultation-requests',
        ttl: 60000, // 1 minute
        limit: 20, // 20 requests per minute for consultation endpoints
      },
    ]),
  ],
  controllers: [ConsultationController, DoctorShiftController, PrescriptionController],
  providers: [
    ConsultationService,
    ConsultationBusinessService,
    DoctorAssignmentService,
    AIAgentService,
    AITokenService,
    PaymentService,
    SessionManagerService,
    DoctorShiftService,
    AuditService,
    PdfGenerationService,
    DigitalSignatureService,
    FileStorageService,
    PrescriptionService
  ],
  exports: [
    ConsultationService,
    ConsultationBusinessService,
    AIAgentService,
    PaymentService,
    SessionManagerService
  ]
})
export class ConsultationModule {}
