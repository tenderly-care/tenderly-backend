import { 
  Injectable, 
  UnauthorizedException, 
  BadRequestException, 
  ConflictException,
  Logger 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { User, UserDocument, UserRole, AccountStatus } from '../../modules/users/schemas/user.schema';
import { EncryptionService } from '../encryption/encryption.service';
import { CacheService } from '../../core/cache/cache.service';
import { AuditService } from '../audit/audit.service';
import { MFAService } from './services/mfa.service';

import { 
  RegisterDto, 
  LoginDto, 
  AuthResponseDto, 
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto
} from './dto/auth.dto';

import { JwtPayload, RefreshTokenPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private cacheService: CacheService,
    private auditService: AuditService,
    private mfaService: MFAService,
  ) {}

  /**
   * User registration with role-based requirements
   */
  async register(registerDto: RegisterDto, ipAddress: string, userAgent: string): Promise<AuthResponseDto> {
    const { email, phone, password, role = UserRole.PATIENT, medicalLicenseNumber, specializations } = registerDto;

    // Check if user already exists
    const existingUser = await this.userModel.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone already exists');
    }

    // Validate healthcare provider requirements
    if (role === UserRole.HEALTHCARE_PROVIDER) {
      if (!medicalLicenseNumber) {
        throw new BadRequestException('Medical license number is required for healthcare providers');
      }
      if (!specializations || specializations.length === 0) {
        throw new BadRequestException('At least one specialization is required for healthcare providers');
      }
    }

    try {
      // Create user with encrypted PII
      const user = new this.userModel({
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        email,
        phone,
        password, // Will be hashed by pre-save middleware
        roles: [role],
        accountStatus: AccountStatus.PENDING_VERIFICATION,
        professionalInfo: role === UserRole.HEALTHCARE_PROVIDER ? {
          medicalLicenseNumber,
          specialization: specializations,
        } : undefined,
      });

      await user.save();

      // Generate email verification token
      const verificationToken = this.encryptionService.generateSecureToken();
      await this.cacheService.set(
        `email_verification:${user._id}`,
        { token: verificationToken, email },
        24 * 60 * 60 // 24 hours
      );

      // Send verification email (TODO: implement email service)
      this.logger.log(`Verification email should be sent to ${email} with token: ${verificationToken}`);

      // Log registration
      await this.auditService.logAuthEvent(
        (user._id as string).toString(),
        'register',
        ipAddress,
        userAgent,
        true
      );

      // For healthcare providers, redirect to MFA setup
      if (user.requiresMFA()) {
        user.accountStatus = AccountStatus.PENDING_MFA_SETUP;
        await user.save();
      }

      return this.generateAuthResponse(user, ipAddress, userAgent, registerDto.deviceFingerprint || undefined);
    } catch (error) {
      this.logger.error('Registration failed:', error);
      throw new BadRequestException('Registration failed');
    }
  }

  /**
   * User login with MFA support
   */
  async login(loginDto: LoginDto, ipAddress: string, userAgent: string): Promise<AuthResponseDto> {
    const { email, password, mfaCode, rememberDevice, deviceFingerprint } = loginDto;

    const user = await this.userModel.findOne({ email }).select('+password');
    if (!user) {
      await this.auditService.logAuthEvent(
        'unknown',
        'failed_login',
        ipAddress,
        userAgent,
        false,
        'User not found'
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user can login
    const loginCheck = user.canLogin();
    if (!loginCheck.canLogin) {
      await this.auditService.logAuthEvent(
        (user._id as string).toString(),
        'failed_login',
        ipAddress,
        userAgent,
        false,
        loginCheck.reason
      );
      throw new UnauthorizedException(loginCheck.reason);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await user.incrementFailedLogin();
      await this.auditService.logAuthEvent(
        (user._id as string).toString(),
        'failed_login',
        ipAddress,
        userAgent,
        false,
        'Invalid password'
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed login attempts on successful password verification
    if (user.failedLoginAttempts > 0) {
      await user.resetFailedLogin();
    }

    // Check MFA requirements
    let mfaVerified = false;
    if (user.requiresMFA() && user.isMFAEnabled) {
      if (!mfaCode) {
        // First step of login for MFA users - password verified, now need MFA
        await this.auditService.logAuthEvent(
          (user._id as string).toString(),
          'login_partial',
          ipAddress,
          userAgent,
          true,
          'Password verified, MFA required'
        );

        return {
          accessToken: null,
          refreshToken: null,
          expiresIn: 0,
          user: {
            id: (user._id as string).toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles,
            accountStatus: user.accountStatus,
            isEmailVerified: user.isEmailVerified,
            isMFAEnabled: user.isMFAEnabled,
            requiresMFA: user.requiresMFA(),
          },
          requiresMFA: true,
          mfaMethods: user.mfaSettings?.enabledMethods || ['authenticator'],
        };
      }

      // Verify MFA code
      mfaVerified = await this.mfaService.verifyLoginMFA((user._id as string).toString(), mfaCode);
      if (!mfaVerified) {
        await this.auditService.logAuthEvent(
          (user._id as string).toString(),
          'failed_login',
          ipAddress,
          userAgent,
          false,
          'Invalid MFA code'
        );
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    // Add to login history
    user.addLoginHistory(ipAddress, userAgent, true, mfaVerified, loginDto.location);

    // Handle device trust
    if (deviceFingerprint) {
      if (rememberDevice && mfaVerified) {
        user.addTrustedDevice(
          this.generateDeviceId(),
          this.extractDeviceName(userAgent),
          deviceFingerprint,
          loginDto.location
        );
      }
    }

    await user.save();

    // Log successful login
    await this.auditService.logAuthEvent(
      (user._id as string).toString(),
      'login',
      ipAddress,
      userAgent,
      true,
      mfaVerified ? 'Login with MFA' : 'Login without MFA'
    );

    return this.generateAuthResponse(user, ipAddress, userAgent, deviceFingerprint);
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto, ipAddress: string): Promise<AuthResponseDto> {
    const { refreshToken, deviceFingerprint } = refreshTokenDto;

    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('security.jwt.secret'),
      }) as RefreshTokenPayload;

      // Check if token is blacklisted
      const isBlacklisted = await this.cacheService.get(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token is blacklisted');
      }

      // Check if session is still valid (same validation as JWT strategy)
      if (payload.sessionId) {
        const sessionData = await this.cacheService.get(`session:${payload.sessionId}`);
        if (!sessionData) {
          throw new UnauthorizedException('Session expired or invalid');
        }
      }

      // Check if there's a token version mismatch (global logout)
      const tokenVersion = await this.cacheService.get(`token_version:${payload.sub}`);
      if (tokenVersion && payload.iat * 1000 < tokenVersion) {
        throw new UnauthorizedException('Token invalidated');
      }

      // Get user
      const user = await this.userModel.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Validate device fingerprint if provided
      if (deviceFingerprint && payload.deviceFingerprint !== deviceFingerprint) {
        await this.auditService.logSecurityEvent(
          'suspicious_activity',
          { reason: 'Device fingerprint mismatch during token refresh' },
          (user._id as string).toString(),
          ipAddress
        );
        throw new UnauthorizedException('Invalid device');
      }

      // Blacklist old refresh token
      await this.cacheService.set(
        `blacklist:${refreshToken}`,
        true,
        (this.configService.get<number>('security.jwt.refreshTokenExpiry') || 7) * 24 * 60 * 60 // Convert days to seconds
      );

      // Generate new tokens
      return this.generateAuthResponse(user, ipAddress, '', deviceFingerprint);
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  async logout(userId: string, refreshToken?: string, allDevices: boolean = false, accessToken?: string): Promise<void> {
    try {
      // If we have an access token, decode it to get the session ID
      if (accessToken) {
        const decoded = this.jwtService.decode(accessToken) as any;
        if (decoded && decoded.sessionId) {
          // Invalidate the current session
          await this.cacheService.delete(`session:${decoded.sessionId}`);
          this.logger.debug(`Invalidated session: ${decoded.sessionId}`);
        }
      }

      if (refreshToken) {
        // Blacklist specific refresh token
        await this.cacheService.set(
          `blacklist:${refreshToken}`,
          true,
          (this.configService.get<number>('security.jwt.refreshTokenExpiry') || 7) * 24 * 60 * 60
        );
        this.logger.debug(`Blacklisted refresh token`);
      }

      if (allDevices) {
        // Blacklist all tokens for user by incrementing token version
        await this.cacheService.set(`token_version:${userId}`, Date.now(), 7 * 24 * 60 * 60);
        this.logger.debug(`Invalidated all tokens for user: ${userId}`);
      }

      await this.auditService.logAuthEvent(
        userId,
        'logout',
        'unknown',
        'unknown',
        true,
        allDevices ? 'Logout from all devices' : 'Logout from current device'
      );
    } catch (error) {
      this.logger.error('Error during logout:', error);
      // Still log the logout event even if there was an error
      await this.auditService.logAuthEvent(
        userId,
        'logout',
        'unknown',
        'unknown',
        true,
        'Logout completed with errors'
      );
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<{ message: string }> {
    const { token } = verifyEmailDto;

    // Find verification data
    const verificationData = await this.findVerificationData(token);
    if (!verificationData) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const user = await this.userModel.findById(verificationData.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify email
    user.isEmailVerified = true;
    if (user.accountStatus === AccountStatus.PENDING_VERIFICATION) {
      if (user.requiresMFA()) {
        user.accountStatus = AccountStatus.PENDING_MFA_SETUP;
      } else {
        user.accountStatus = AccountStatus.ACTIVE;
      }
    }

    await user.save();

    // Clear verification cache
    await this.cacheService.delete(`email_verification:${user._id}`);

    await this.auditService.logAuthEvent(
      (user._id as string).toString(),
      'email_verified',
      'unknown',
      'unknown',
      true
    );

    return { message: 'Email verified successfully' };
  }

  /**
   * Send password reset email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    const user = await this.userModel.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Generate reset token
    const resetToken = this.encryptionService.generateSecureToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save();

    // TODO: Send reset email
    this.logger.log(`Password reset email should be sent to ${email} with token: ${resetToken}`);

    await this.auditService.logAuthEvent(
      (user._id as string).toString(),
      'password_reset_requested',
      'unknown',
      'unknown',
      true
    );

    return { message: 'If the email exists, a reset link has been sent' };
  }

  /**
   * Reset password using token
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Check if new password is different from recent passwords
    const isPasswordReused = await this.checkPasswordReuse(user, newPassword);
    if (isPasswordReused) {
      throw new BadRequestException('Cannot reuse recent passwords');
    }

    user.password = newPassword; // Will be hashed by pre-save middleware
    user.passwordResetToken = null as any;
    user.passwordResetExpires = null as any;
    await user.save();

    // Terminate all active sessions after password reset for security
    await this.logout((user._id as string).toString(), undefined, true);
    this.logger.log(`All sessions terminated for user ${user.email} after password reset`);

    await this.auditService.logAuthEvent(
      (user._id as string).toString(),
      'password_reset',
      'unknown',
      'unknown',
      true
    );

    return { message: 'Password reset successfully. Please log in again with your new password.' };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string, 
    changePasswordDto: ChangePasswordDto
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.userModel.findById(userId).select('+password');
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Check if new password is different from recent passwords
    const isPasswordReused = await this.checkPasswordReuse(user, newPassword);
    if (isPasswordReused) {
      throw new BadRequestException('Cannot reuse recent passwords');
    }

    user.password = newPassword; // Will be hashed by pre-save middleware
    await user.save();

    // Terminate all active sessions after password change for security
    await this.logout(userId, undefined, true);
    this.logger.log(`All sessions terminated for user ${user.email} after password change`);

    await this.auditService.logAuthEvent(
      userId,
      'password_change',
      'unknown',
      'unknown',
      true
    );

    return { message: 'Password changed successfully. Please log in again with your new password.' };
  }

  /**
   * Generate authentication response with tokens
   */
  private async generateAuthResponse(
    user: UserDocument,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint?: string
  ): Promise<AuthResponseDto> {
    try {
      const sessionId = this.encryptionService.generateSecureToken();

      // Create JWT payload (let JWT service handle exp/iat)
      const payload = {
        sub: (user._id as string).toString(),
        email: user.email,
        roles: user.roles,
        sessionId,
        deviceFingerprint,
      };

      // Create refresh token payload with longer expiry
      const refreshPayload = {
        sub: (user._id as string).toString(),
        sessionId,
        deviceFingerprint,
        tokenVersion: await this.getTokenVersion((user._id as string).toString()),
        type: 'refresh',
      };

      // Generate tokens
      this.logger.debug('Generating JWT tokens with payload:', { ...payload, exp: undefined, iat: undefined });
      const accessToken = this.jwtService.sign(payload);
      this.logger.debug('Access token generated successfully');
      
      const refreshToken = this.jwtService.sign(refreshPayload);
      this.logger.debug('Refresh token generated successfully');

      // Store session info
      await this.cacheService.set(
        `session:${sessionId}`,
        {
          userId: (user._id as string).toString(),
          ipAddress,
          userAgent,
          deviceFingerprint,
          createdAt: new Date(),
        },
        7 * 24 * 60 * 60 // 7 days
      );

      return {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
        user: {
          id: (user._id as string).toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
          accountStatus: user.accountStatus,
          isEmailVerified: user.isEmailVerified,
          isMFAEnabled: user.isMFAEnabled,
          requiresMFA: user.requiresMFA(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate auth response:', error);
      throw new BadRequestException('Failed to generate authentication response');
    }
  }

  /**
   * Helper methods
   */
  private async findVerificationData(token: string): Promise<any> {
    // Search through all user verification cache entries
    // This is a simplified implementation - in production, you'd want a more efficient lookup
    const users = await this.userModel.find({ isEmailVerified: false });
    
    for (const user of users) {
      const verificationData = await this.cacheService.get(`email_verification:${user._id}`);
      if (verificationData && verificationData.token === token) {
        return {
          userId: user._id,
          email: verificationData.email,
          token: verificationData.token
        };
      }
    }
    
    return null;
  }

  private async checkPasswordReuse(user: UserDocument, newPassword: string): Promise<boolean> {
    if (!user.passwordHistory) return false;

    for (const oldPasswordHash of user.passwordHistory) {
      const isMatch = await bcrypt.compare(newPassword, oldPasswordHash);
      if (isMatch) return true;
    }
    return false;
  }

  private async getTokenVersion(userId: string): Promise<number> {
    const version = await this.cacheService.get(`token_version:${userId}`);
    return version || 0;
  }

  private generateDeviceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private extractDeviceName(userAgent: string): string {
    // Simple device name extraction from user agent
    if (userAgent.includes('Mobile')) return 'Mobile Device';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Mac')) return 'Mac';
    return 'Unknown Device';
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    try {
      interface SessionData {
        sessionId: string;
        ipAddress: string;
        userAgent: string;
        deviceFingerprint: string;
        createdAt: Date;
        lastActivity?: Date;
        deviceName: string;
      }

      const sessions: SessionData[] = [];
      const keyPrefix = this.configService.get<string>('database.redis.keyPrefix') || '';
      const pattern = `${keyPrefix}session:*`;
      
      // Get all session keys - we need to access the Redis client directly
      const keys = await this.cacheService['client'].keys(pattern);
      
      for (const key of keys) {
        // Remove the prefix and get the actual key to use with cacheService
        const sessionKey = key.replace(keyPrefix, '');
        const sessionData = await this.cacheService.get(sessionKey);
        if (sessionData && sessionData.userId === userId) {
          const sessionId = sessionKey.replace('session:', '');
          sessions.push({
            sessionId,
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
            deviceFingerprint: sessionData.deviceFingerprint,
            createdAt: new Date(sessionData.createdAt),
            lastActivity: sessionData.lastActivity ? new Date(sessionData.lastActivity) : new Date(sessionData.createdAt),
            deviceName: this.extractDeviceName(sessionData.userAgent),
          });
        }
      }
      
      return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      this.logger.error('Failed to get active sessions:', error);
      return [];
    }
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(userId: string, sessionId: string): Promise<void> {
    try {
      this.logger.debug(`Attempting to terminate session ${sessionId} for user ${userId}`);
      
      // First, verify the session exists and belongs to the user
      // Check all sessions for this user to find the matching one
      const keyPrefix = this.configService.get<string>('database.redis.keyPrefix') || '';
      const pattern = `${keyPrefix}session:*`;
      
      this.logger.debug(`Using key prefix: '${keyPrefix}' and pattern: '${pattern}'`);
      
      // Get all session keys - we need to access the Redis client directly
      const keys = await this.cacheService['client'].keys(pattern);
      this.logger.debug(`Found ${keys.length} session keys: ${JSON.stringify(keys)}`);
      
      let sessionFound = false;
      let sessionData: any = null;
      
      for (const key of keys) {
        // Remove the prefix and get the actual key to use with cacheService
        const sessionKey = key.replace(keyPrefix, '');
        const currentSessionId = sessionKey.replace('session:', '');
        
        this.logger.debug(`Checking key: '${key}' -> sessionKey: '${sessionKey}' -> currentSessionId: '${currentSessionId}'`);
        
        if (currentSessionId === sessionId) {
          this.logger.debug(`Found matching session ID, getting session data...`);
          sessionData = await this.cacheService.get(sessionKey);
          this.logger.debug(`Session data: ${JSON.stringify(sessionData)}`);
          
          if (sessionData && sessionData.userId === userId) {
            this.logger.debug(`Session belongs to user, deleting...`);
            sessionFound = true;
            // Delete the session using the correct key
            await this.cacheService.delete(sessionKey);
            this.logger.debug(`Session deleted successfully`);
            break;
          } else {
            this.logger.debug(`Session does not belong to user. Expected: ${userId}, Found: ${sessionData?.userId}`);
          }
        }
      }
      
      if (!sessionFound) {
        this.logger.error(`Session ${sessionId} not found or does not belong to user ${userId}`);
        throw new UnauthorizedException('Session not found or does not belong to user');
      }
      
      // Log the session termination
      await this.auditService.logAuthEvent(
        userId,
        'logout',
        sessionData.ipAddress || 'unknown',
        sessionData.userAgent || 'unknown',
        true,
        'Session terminated by user'
      );
      
      this.logger.log(`Session ${sessionId} terminated for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to terminate session:', error);
      throw error;
    }
  }
}
