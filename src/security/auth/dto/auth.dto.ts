import { IsEmail, IsString, IsEnum, IsOptional, IsBoolean, MinLength, MaxLength, Matches, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../modules/users/schemas/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+919876543210', description: 'Phone number in E.164 format' })
  @IsPhoneNumber('IN')
  phone: string;

  @ApiProperty({ 
    example: 'SecurePass123!', 
    description: 'Password (min 8 chars, must include uppercase, lowercase, number, special char)' 
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' }
  )
  password: string;

  @ApiProperty({ example: 'patient', enum: UserRole, description: 'User role' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ example: 'MED123456', description: 'Medical license number (required for healthcare providers)' })
  @IsString()
  @IsOptional()
  medicalLicenseNumber?: string;

  @ApiProperty({ example: ['gynecology', 'obstetrics'], description: 'Specializations (for healthcare providers)' })
  @IsOptional()
  specializations?: string[];

  // Device information for fingerprinting
  @ApiProperty({ example: 'Mozilla/5.0...', description: 'User agent' })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiProperty({ example: 'fingerprint123', description: 'Device fingerprint' })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'Password' })
  @IsString()
  password: string;

  @ApiProperty({ example: '123456', description: 'MFA code (if enabled)' })
  @IsString()
  @IsOptional()
  mfaCode?: string;

  @ApiProperty({ example: true, description: 'Remember this device' })
  @IsBoolean()
  @IsOptional()
  rememberDevice?: boolean;

  // Device and location information
  @ApiProperty({ example: 'Mozilla/5.0...', description: 'User agent' })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiProperty({ example: 'fingerprint123', description: 'Device fingerprint' })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @ApiProperty({ example: 'Mumbai, India', description: 'Login location' })
  @IsString()
  @IsOptional()
  location?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh_token_here', description: 'Refresh token' })
  @IsString()
  refreshToken: string;

  @ApiProperty({ example: 'fingerprint123', description: 'Device fingerprint' })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset_token_here', description: 'Password reset token' })
  @IsString()
  token: string;

  @ApiProperty({ 
    example: 'NewSecurePass123!', 
    description: 'New password' 
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' }
  )
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPass123!', description: 'Current password' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ 
    example: 'NewSecurePass123!', 
    description: 'New password' 
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' }
  )
  newPassword: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'verification_token_here', description: 'Email verification token' })
  @IsString()
  token: string;
}

export class SetupMFADto {
  @ApiProperty({ example: 'authenticator', enum: ['sms', 'email', 'authenticator'], description: 'MFA method' })
  @IsEnum(['sms', 'email', 'authenticator'])
  method: 'sms' | 'email' | 'authenticator';
}

export class VerifyMFASetupDto {
  @ApiProperty({ example: '123456', description: 'MFA verification code (6 digits for TOTP/SMS/Email, 8 characters for backup codes)' })
  @IsString()
  @MinLength(6)
  @MaxLength(8)
  code: string;

  @ApiProperty({ example: 'authenticator', description: 'MFA method being verified' })
  @IsEnum(['sms', 'email', 'authenticator'])
  method: 'sms' | 'email' | 'authenticator';
}

export class DisableMFADto {
  @ApiProperty({ example: 'CurrentPass123!', description: 'Current password for confirmation' })
  @IsString()
  password: string;

  @ApiProperty({ example: '123456', description: 'MFA code for verification' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  mfaCode: string;
}

// Response DTOs
export class AuthResponseDto {
  @ApiProperty({ description: 'Access token (null if MFA required)' })
  accessToken: string | null;

  @ApiProperty({ description: 'Refresh token (null if MFA required)' })
  refreshToken: string | null;

  @ApiProperty({ description: 'Token expiry time' })
  expiresIn: number;

  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    accountStatus: string;
    isEmailVerified: boolean;
    isMFAEnabled: boolean;
    requiresMFA: boolean;
  };

  @ApiProperty({ description: 'Whether MFA is required for next step' })
  requiresMFA?: boolean;

  @ApiProperty({ description: 'Available MFA methods' })
  mfaMethods?: string[];
}

export class MFASetupResponseDto {
  @ApiProperty({ description: 'QR code for authenticator setup' })
  qrCode?: string;

  @ApiProperty({ description: 'Secret key for manual entry' })
  secret?: string;

  @ApiProperty({ description: 'Backup codes' })
  backupCodes?: string[];

  @ApiProperty({ description: 'Setup instructions' })
  instructions: string;
}
