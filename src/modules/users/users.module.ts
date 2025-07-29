import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './services/users.service';
import { DoctorProfileController } from './controllers/doctor-profile.controller';
import { AuditService } from '../../security/audit/audit.service';
import { AuditLog, AuditLogSchema } from '../../security/audit/schemas/audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [DoctorProfileController],
  providers: [UsersService, AuditService],
  exports: [UsersService],
})
export class UsersModule {}
