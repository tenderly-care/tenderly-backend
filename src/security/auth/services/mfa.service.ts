import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { User, UserDocument, AccountStatus } from '../../../modules/users/schemas/user.schema';
import { CacheService } from '../../../core/cache/cache.service';
import { AuditService } from '../../audit/audit.service';

export interface MFASetupResult {
  secret?: string;
  qrCode?: string;
  backupCodes?: string[];
  instructions: string;
}

@Injectable()
export class MFAService {
  private readonly logger = new Logger('MFAService');

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private cacheService: CacheService,
    private auditService: AuditService,
  ) {}

  /**
   * Initialize MFA setup for a user
   */
  async initializeMFASetup(
    userId: string,
    method: 'sms' | 'email' | 'authenticator'
  ): Promise<MFASetupResult> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.requiresMFA()) {
      throw new BadRequestException('MFA is not required for this user role');
    }

    try {
      switch (method) {
        case 'authenticator':
          return await this.setupAuthenticatorMFA(user);
        case 'sms':
          return await this.setupSMSMFA(user);
        case 'email':
          return await this.setupEmailMFA(user);
        default:
          throw new BadRequestException('Invalid MFA method');
      }
    } catch (error) {
      this.logger.error(`MFA setup failed for user ${userId}:`, error);
      throw new BadRequestException('Failed to setup MFA');
    }
  }

  /**
   * Setup authenticator-based MFA (TOTP)
   */
  private async setupAuthenticatorMFA(user: UserDocument): Promise<MFASetupResult> {
    // Generate secret for TOTP
    const secret = speakeasy.generateSecret({
      name: `Tenderly (${user.email})`,
      issuer: 'Tenderly Care',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store encrypted secret temporarily (will be confirmed after verification)
    await this.cacheService.set(
      `mfa_setup:${user._id}:authenticator`,
      {
        secret: secret.base32,
        backupCodes,
        method: 'authenticator',
      },
      300 // 5 minutes
    );

    await this.auditService.logAuthEvent(
      (user._id as string).toString(),
      'mfa_setup_init',
      'unknown',
      'MFA setup initialized',
      true
    );

    return {
      secret: secret.base32,
      qrCode: qrCode,
      backupCodes,
      instructions: `
        1. Install an authenticator app (Google Authenticator, Authy, etc.)
        2. Scan the QR code or manually enter the secret key
        3. Enter the 6-digit code from your app to complete setup
        4. Save the backup codes in a secure location
      `,
    };
  }

  /**
   * Setup SMS-based MFA
   */
  private async setupSMSMFA(user: UserDocument): Promise<MFASetupResult> {
    // Generate and send SMS verification code
    const code = this.generateSMSCode();
    
    // Store code temporarily
    await this.cacheService.set(
      `mfa_setup:${user._id}:sms`,
      {
        code,
        phone: user.phone,
        method: 'sms',
      },
      300 // 5 minutes
    );

    // TODO: Integrate with SMS service (Twilio)
    // await this.smsService.sendMFA(user.phone, code);

    this.logger.log(`SMS MFA code sent to ${user.phone}: ${code}`); // Remove in production

    return {
      instructions: `
        1. We've sent a 6-digit verification code to your phone ${user.phone}
        2. Enter the code to complete MFA setup
        3. SMS codes will be sent to this number for future logins
      `,
    };
  }

  /**
   * Setup email-based MFA
   */
  private async setupEmailMFA(user: UserDocument): Promise<MFASetupResult> {
    // Generate and send email verification code
    const code = this.generateEmailCode();
    
    // Store code temporarily
    await this.cacheService.set(
      `mfa_setup:${user._id}:email`,
      {
        code,
        email: user.email,
        method: 'email',
      },
      300 // 5 minutes
    );

    // TODO: Integrate with email service
    // await this.emailService.sendMFACode(user.email, code);

    this.logger.log(`Email MFA code sent to ${user.email}: ${code}`); // Remove in production

    return {
      instructions: `
        1. We've sent a 6-digit verification code to your email ${user.email}
        2. Enter the code to complete MFA setup
        3. Email codes will be sent to this address for future logins
      `,
    };
  }

  /**
   * Verify MFA setup and enable it
   */
  async verifyMFASetup(
    userId: string,
    method: 'sms' | 'email' | 'authenticator',
    code: string
  ): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const setupData = await this.cacheService.get(`mfa_setup:${userId}:${method}`);
    if (!setupData) {
      throw new BadRequestException('MFA setup session expired. Please restart setup.');
    }

    let isValid = false;

    try {
      switch (method) {
        case 'authenticator':
          isValid = this.verifyTOTPCode(setupData.secret, code);
          if (isValid) {
            // Store the secret and backup codes
            user.mfaSecret = setupData.secret;
            user.mfaBackupCodes = setupData.backupCodes;
          }
          break;
        case 'sms':
          isValid = setupData.code === code;
          break;
        case 'email':
          isValid = setupData.code === code;
          break;
      }

      if (isValid) {
        // Enable MFA
        user.isMFAEnabled = true;
        user.accountStatus = AccountStatus.ACTIVE;
        
        if (!user.mfaSettings) {
          user.mfaSettings = {} as any;
        }
        
        user.mfaSettings.preferredMethod = method;
        user.mfaSettings.enabledMethods = [method];
        user.mfaSettings.setupCompletedAt = new Date();

        await user.save();

        // Clear setup cache
        await this.cacheService.delete(`mfa_setup:${userId}:${method}`);

        await this.auditService.logAuthEvent(
          userId,
          'mfa_enabled',
          'unknown',
          `MFA enabled with method: ${method}`,
          true
        );

        this.logger.log(`MFA enabled for user ${userId} with method: ${method}`);
        return true;
      } else {
        await this.auditService.logAuthEvent(
          userId,
          'mfa_setup_failed',
          'unknown',
          `Invalid MFA code during setup: ${method}`,
          false
        );
        throw new BadRequestException('Invalid verification code');
      }
    } catch (error) {
      this.logger.error(`MFA verification failed for user ${userId}:`, error);
      throw new BadRequestException('MFA verification failed');
    }
  }

  /**
   * Generate MFA code for login
   */
  async generateLoginMFA(userId: string, method: 'sms' | 'email'): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isMFAEnabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    const code = method === 'sms' ? this.generateSMSCode() : this.generateEmailCode();
    
    // Store code for verification
    await this.cacheService.set(
      `mfa_login:${userId}:${method}`,
      {
        code,
        attempts: 0,
        generatedAt: new Date(),
      },
      300 // 5 minutes
    );

    if (method === 'sms') {
      // TODO: Send SMS
      this.logger.log(`Login MFA SMS sent to ${user.phone}: ${code}`);
    } else {
      // TODO: Send Email
      this.logger.log(`Login MFA email sent to ${user.email}: ${code}`);
    }
  }

  /**
   * Verify MFA code during login
   */
  async verifyLoginMFA(
    userId: string,
    code: string,
    method?: 'sms' | 'email' | 'authenticator'
  ): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isMFAEnabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    // Try authenticator first if no method specified
    if (!method || method === 'authenticator') {
      if (user.mfaSecret && this.verifyTOTPCode(user.mfaSecret, code)) {
        await this.recordMFASuccess(userId, 'authenticator');
        return true;
      }
    }

    // Check backup codes
    if (user.mfaBackupCodes && user.mfaBackupCodes.includes(code)) {
      // Remove used backup code
      user.mfaBackupCodes = user.mfaBackupCodes.filter(backupCode => backupCode !== code);
      await user.save();
      
      await this.recordMFASuccess(userId, 'backup_code');
      this.logger.warn(`Backup code used for user ${userId}`);
      return true;
    }

    // Check SMS/Email codes
    for (const mfaMethod of ['sms', 'email']) {
      if (!method || method === mfaMethod) {
        const loginData = await this.cacheService.get(`mfa_login:${userId}:${mfaMethod}`);
        if (loginData && loginData.code === code) {
          await this.cacheService.delete(`mfa_login:${userId}:${mfaMethod}`);
          await this.recordMFASuccess(userId, mfaMethod);
          return true;
        }
      }
    }

    // Record failed attempt
    await this.auditService.logAuthEvent(
      userId,
      'mfa_failed',
      'unknown',
      'Invalid MFA code during login',
      false
    );

    return false;
  }

  /**
   * Disable MFA for a user
   */
  async disableMFA(userId: string, password: string, mfaCode: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid password');
    }

    // Verify MFA code
    const isMFAValid = await this.verifyLoginMFA(userId, mfaCode);
    if (!isMFAValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    // Disable MFA
    user.isMFAEnabled = false;
    user.mfaSecret = null as any;
    user.isMFAEnabled = false;
    user.mfaSettings = null as any;

    await user.save();

    await this.auditService.logAuthEvent(
      userId,
      'mfa_disabled',
      'unknown',
      'MFA disabled by user',
      true
    );

    this.logger.log(`MFA disabled for user ${userId}`);
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Generate SMS verification code
   */
  private generateSMSCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate email verification code
   */
  private generateEmailCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verify TOTP code
   */
  private verifyTOTPCode(secret: string, code: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps (60 seconds) tolerance
    });
  }

  /**
   * Record successful MFA verification
   */
  private async recordMFASuccess(userId: string, method: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (user && user.mfaSettings) {
      user.mfaSettings.lastUsedMethod = method;
      user.mfaSettings.lastMFAAt = new Date();
      await user.save();
    }

    await this.auditService.logAuthEvent(
      userId,
      'mfa_success',
      'unknown',
      `MFA verified with method: ${method}`,
      true
    );
  }
}
