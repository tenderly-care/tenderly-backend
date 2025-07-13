import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MFAService } from './services/mfa.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { User, UserSchema } from '../../modules/users/schemas/user.schema';
import { AuditLog, AuditLogSchema } from '../audit/schemas/audit-log.schema';

import { EncryptionService } from '../encryption/encryption.service';
import { CacheModule } from '../../core/cache/cache.module';
import { AuditService } from '../audit/audit.service';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('security.jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('security.jwt.accessTokenExpiry'),
          issuer: configService.get<string>('security.jwt.issuer'),
          audience: configService.get<string>('security.jwt.audience'),
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MFAService,
    JwtStrategy,
    EncryptionService,
    AuditService,
  ],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
