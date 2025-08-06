import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { MFAService } from './services/mfa.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MFASetupGuard } from '../../shared/guards/mfa-setup.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';

import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  SetupMFADto,
  VerifyMFASetupDto,
  DisableMFADto,
  MFASetupResponseDto,
} from './dto/auth.dto';

import {
  User,
  UserRole,
  UserDocument,
} from '../../modules/users/schemas/user.schema';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MFAService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    return this.authService.register(registerDto, ipAddress, userAgent);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Please complete MFA setup before logging in' })
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Body(ValidationPipe) refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    return this.authService.refreshToken(refreshTokenDto, ipAddress);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  async logout(
    @GetUser() user: UserDocument,
    @Req() req: Request,
    @Body() body?: { refreshToken?: string; allDevices?: boolean },
  ): Promise<void> {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    // If no refresh token in body, we need to invalidate the session (which we're already doing)
    // But we should also invalidate all refresh tokens for this user unless specific one is provided
    await this.authService.logout(
      (user._id as any).toString(),
      body?.refreshToken,
      body?.allDevices || !body?.refreshToken,
      token,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@GetUser() user: UserDocument): Promise<User> {
    return user;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification token' })
  async verifyEmail(
    @Body(ValidationPipe) verifyEmailDto: VerifyEmailDto,
  ): Promise<{ message: string }> {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if user exists' })
  async forgotPassword(
    @Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid reset token' })
  async resetPassword(
    @Body(ValidationPipe) resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  async changePassword(
    @GetUser() user: UserDocument,
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(
      (user._id as any).toString(),
      changePasswordDto,
    );
  }

  // MFA Endpoints
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard, MFASetupGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize MFA setup' })
  @ApiResponse({
    status: 200,
    description: 'MFA setup initialized',
    type: MFASetupResponseDto,
  })
  @ApiResponse({ status: 400, description: 'MFA not required for this user' })
  @ApiResponse({ status: 401, description: 'Requires MFA setup token' })
  async setupMFA(
    @GetUser() user: UserDocument,
    @Body(ValidationPipe) setupMFADto: SetupMFADto,
  ): Promise<MFASetupResponseDto> {
    return this.mfaService.initializeMFASetup(
      (user._id as any).toString(),
      setupMFADto.method,
    );
  }

  @Post('mfa/verify-setup')
  @UseGuards(JwtAuthGuard, MFASetupGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and complete MFA setup' })
  @ApiResponse({ status: 200, description: 'MFA setup completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Requires MFA setup token' })
  async verifyMFASetup(
    @GetUser() user: UserDocument,
    @Body(ValidationPipe) verifyMFASetupDto: VerifyMFASetupDto,
  ): Promise<{ message: string }> {
    const success = await this.mfaService.verifyMFASetup(
      (user._id as any).toString(),
      verifyMFASetupDto.method,
      verifyMFASetupDto.code,
    );

    return {
      message: success
        ? 'MFA setup completed successfully'
        : 'MFA setup failed',
    };
  }

  @Post('mfa/generate-login-code')
  @Public()
  @ApiOperation({ summary: 'Generate MFA code for login (SMS/Email)' })
  @ApiResponse({ status: 200, description: 'MFA code sent' })
  async generateLoginMFA(
    @Body() body: { userId: string; method: 'sms' | 'email' },
  ): Promise<{ message: string }> {
    await this.mfaService.generateLoginMFA(body.userId, body.method);
    return { message: `MFA code sent via ${body.method}` };
  }

  @Delete('mfa')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password or MFA code' })
  async disableMFA(
    @GetUser() user: UserDocument,
    @Body(ValidationPipe) disableMFADto: DisableMFADto,
  ): Promise<{ message: string }> {
    await this.mfaService.disableMFA(
      (user._id as any).toString(),
      disableMFADto.password,
      disableMFADto.mfaCode,
    );
    return { message: 'MFA disabled successfully' };
  }

  // Admin endpoints
  @Get('audit/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my authentication audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
  async getMyAuditLogs(
    @GetUser() user: UserDocument,
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
    @Query('category') category?: string,
    @Query('action') action?: string,
  ): Promise<any> {
    const userId = (user._id as string).toString();
    const result = await this.auditService.getUserAuditLogs(
      userId,
      parseInt(limit),
      parseInt(offset),
      category,
      action,
    );
    return result;
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions' })
  @ApiResponse({ status: 200, description: 'Active sessions retrieved' })
  async getActiveSessions(@GetUser() user: UserDocument): Promise<any[]> {
    const userId = (user._id as string).toString();
    return this.authService.getActiveSessions(userId);
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Terminate specific session' })
  @ApiResponse({ status: 204, description: 'Session terminated' })
  async terminateSession(
    @GetUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    const userId = (user._id as string).toString();
    await this.authService.terminateSession(userId, sessionId);
  }

  @Post('verify-device')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and trust a device' })
  @ApiResponse({ status: 200, description: 'Device verified and trusted' })
  async verifyDevice(
    @GetUser() user: UserDocument,
    @Body() body: { deviceFingerprint: string; deviceName: string },
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    user.addTrustedDevice(
      Math.random().toString(36),
      body.deviceName,
      body.deviceFingerprint,
      ipAddress,
    );

    await user.save();

    return { message: 'Device verified and added to trusted devices' };
  }
}
