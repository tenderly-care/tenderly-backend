import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminConsultationService } from './services/admin-consultation.service';
import { AdminUserService } from './services/admin-user.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminReportService } from './services/admin-report.service';
import { AdminSystemService } from './services/admin-system.service';

// Import existing schemas
import { User, UserSchema } from '../users/schemas/user.schema';
import { Consultation, ConsultationSchema } from '../consultations/schemas/consultation.schema';
import { DoctorShift, DoctorShiftSchema } from '../consultations/schemas/doctor-shift.schema';
import { AuditLog, AuditLogSchema } from '../../security/audit/schemas/audit-log.schema';

// Import required services
import { CacheModule } from '../../core/cache/cache.module';
import { AuditService } from '../../security/audit/audit.service';
import { ConsultationService } from '../consultations/services/consultation.service';
import { DoctorShiftService } from '../consultations/services/doctor-shift.service';

@Module({
  imports: [
    CacheModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: DoctorShift.name, schema: DoctorShiftSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminDashboardService,
    AdminConsultationService,
    AdminUserService,
    AdminAuditService,
    AdminReportService,
    AdminSystemService,
    AuditService,
    ConsultationService,
    DoctorShiftService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
