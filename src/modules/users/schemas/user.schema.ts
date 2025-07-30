import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Encrypt } from '../../../shared/decorators/encrypt.decorator';

// Define method interfaces
export interface UserMethods {
  requiresMFA(): boolean;
  isAccountLocked(): boolean;
  canLogin(): { canLogin: boolean; reason?: string };
  incrementFailedLogin(): Promise<void>;
  resetFailedLogin(): Promise<void>;
  addLoginHistory(
    ipAddress: string,
    userAgent: string,
    success: boolean,
    mfaUsed?: boolean,
    location?: string,
    riskScore?: number,
  ): void;
  isTrustedDevice(deviceFingerprint: string): boolean;
  addTrustedDevice(
    deviceId: string,
    deviceName: string,
    fingerprint: string,
    location?: string,
  ): void;
  completeMFASetup(): Promise<void>;
}

export type UserDocument = User & Document & UserMethods;

export enum UserRole {
  PATIENT = 'patient',
  HEALTHCARE_PROVIDER = 'healthcare_provider',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  SUPER_DOC = 'super_doc',
  SYSTEM = 'system',
}

export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  LOCKED = 'locked',
  PENDING_MFA_SETUP = 'pending_mfa_setup', // For roles requiring MFA
}

// Roles that require MFA
export const MFA_REQUIRED_ROLES = [
  UserRole.HEALTHCARE_PROVIDER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.SUPER_DOC,
];

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  @Encrypt()
  firstName: string;

  @Prop({ required: true })
  @Encrypt()
  lastName: string;

  @Prop({ required: true, unique: true })
  @Encrypt()
  email: string;

  @Prop({ required: true })
  @Encrypt()
  phone: string;

  @Prop({ required: true })
  password: string; // Will be hashed, not encrypted

  @Prop({ type: [String], enum: UserRole, default: [UserRole.PATIENT] })
  roles: UserRole[];

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.PENDING_VERIFICATION,
  })
  accountStatus: AccountStatus;

  // KYC and Verification
  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ default: false })
  isKYCDone: boolean;

  @Prop({ type: Object })
  kycDocuments: {
    aadhaarNumber?: string;
    panNumber?: string;
    drivingLicense?: string;
    medicalLicense?: string; // For healthcare providers
    verificationStatus: 'pending' | 'verified' | 'rejected';
    verifiedAt?: Date;
    verifiedBy?: string;
    documents?: {
      type: string;
      url: string;
      uploadedAt: Date;
    }[];
  };

  // Multi-Factor Authentication (Only for healthcare providers, admins, super admins)
  @Prop({ default: false })
  isMFAEnabled: boolean;

  @Prop()
  mfaSecret: string; // TOTP secret for authenticator apps

  @Prop({ type: [String] })
  mfaBackupCodes: string[];

  @Prop({ type: Object })
  mfaSettings: {
    preferredMethod: 'sms' | 'email' | 'authenticator' | 'push';
    enabledMethods: string[];
    lastUsedMethod: string;
    setupCompletedAt?: Date;
    lastMFAAt?: Date;
  };

  // NDHM Integration
  @Prop({ type: Object })
  ndhm: {
    healthId?: string;
    abhaNumber?: string;
    abhaAddress?: string;
    verificationStatus: 'pending' | 'verified' | 'rejected';
    consentId?: string;
    linkedFacilities?: string[];
  };

  // Security Settings
  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  accountLockedUntil: Date;

  @Prop({ default: Date.now })
  lastLoginAt: Date;

  @Prop()
  lastLoginIP: string;

  @Prop()
  lastLoginUserAgent: string;

  @Prop({ type: [Object] })
  loginHistory: {
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
    location?: string;
    success: boolean;
    mfaUsed: boolean;
    riskScore?: number;
  }[];

  // Device Management (Enhanced for healthcare providers)
  @Prop({ type: [Object] })
  trustedDevices: {
    deviceId: string;
    deviceName: string;
    fingerprint: string;
    firstSeen: Date;
    lastSeen: Date;
    isActive: boolean;
    location?: string;
    requiresMFA?: boolean; // Based on risk assessment
  }[];

  // Session Management
  @Prop({ type: [Object] })
  activeSessions: {
    sessionId: string;
    deviceId: string;
    ipAddress: string;
    userAgent: string;
    createdAt: Date;
    lastActivity: Date;
    isActive: boolean;
    riskLevel: 'low' | 'medium' | 'high';
  }[];

  @Prop({ default: 3 })
  maxConcurrentSessions: number;

  // Password Management
  @Prop()
  passwordChangedAt: Date;

  @Prop({ type: [String] })
  passwordHistory: string[]; // Store hashes of last 12 passwords

  @Prop()
  passwordResetToken: string;

  @Prop()
  passwordResetExpires: Date;

  // Professional Information (for healthcare providers)
  @Prop({ type: Object })
  professionalInfo: {
    medicalLicenseNumber?: string;
    specialization?: string[];
    experience?: number;
    qualification?: string[];
    workLocation?: string;
    department?: string;
    designation?: string;
    consultationFee?: number;
    availableSlots?: {
      day: string;
      startTime: string;
      endTime: string;
    }[];
  };

  // Profile Information
  @Prop()
  dateOfBirth: Date;

  @Prop({ enum: ['male', 'female', 'other', 'prefer_not_to_say'] })
  gender: string;

  @Prop({ type: Object })
  @Encrypt()
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };

  @Prop()
  profilePicture: string;

  @Prop({ type: Object })
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };

  // Preferences
  @Prop({ type: Object })
  preferences: {
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
      whatsapp: boolean;
    };
    privacy: {
      profileVisibility: 'public' | 'private';
      dataSharing: boolean;
      analyticsOptOut: boolean;
    };
  };

  // Compliance Flags
  @Prop({ default: false })
  gdprConsent: boolean;

  @Prop()
  gdprConsentDate: Date;

  @Prop({ default: false })
  marketingConsent: boolean;

  @Prop({ default: false })
  dataProcessingConsent: boolean;

  // Metadata
  @Prop()
  lastProfileUpdate: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;

  @Prop()
  deletedBy: string;

  @Prop()
  notes: string; // Admin notes
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes for performance and uniqueness
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ 'ndhm.healthId': 1 }, { sparse: true });
UserSchema.index({ 'ndhm.abhaNumber': 1 }, { sparse: true });
UserSchema.index({ roles: 1 });
UserSchema.index({ accountStatus: 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ lastLoginAt: 1 });
UserSchema.index(
  { 'professionalInfo.medicalLicenseNumber': 1 },
  { sparse: true },
);

// Pre-save middleware for password hashing and MFA requirements
UserSchema.pre('save', async function (next) {
  const user = this as any;

  // Hash password if modified
  if (user.isModified('password')) {
    const bcrypt = require('bcryptjs');
    user.password = await bcrypt.hash(user.password, 12);
    user.passwordChangedAt = new Date();

    // Add to password history
    if (!user.passwordHistory) user.passwordHistory = [];
    user.passwordHistory.push(user.password);

    // Keep only last 12 passwords
    if (user.passwordHistory.length > 12) {
      user.passwordHistory = user.passwordHistory.slice(-12);
    }
  }

  // Check if MFA is required for role change
  if (user.isModified('roles')) {
    const requiresMFA = user.roles.some((role) =>
      MFA_REQUIRED_ROLES.includes(role),
    );

    if (requiresMFA && !user.isMFAEnabled) {
      // Set status to require MFA setup
      user.accountStatus = AccountStatus.PENDING_MFA_SETUP;
    }
  }

  // Update profile modification timestamp
  if (user.isModified() && !user.isNew) {
    user.lastProfileUpdate = new Date();
  }

  next();
});

// Virtual for full name
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Method to check if MFA is required for this user
UserSchema.methods.requiresMFA = function (): boolean {
  return this.roles.some((role: UserRole) => MFA_REQUIRED_ROLES.includes(role));
};

// Method to check if account is locked
UserSchema.methods.isAccountLocked = function (): boolean {
  return this.accountLockedUntil && this.accountLockedUntil > new Date();
};

// Method to check if user can login (considering MFA requirements)
UserSchema.methods.canLogin = function (): {
  canLogin: boolean;
  reason?: string;
} {
  if (this.isAccountLocked()) {
    return {
      canLogin: false,
      reason: 'Account is temporarily locked due to failed login attempts',
    };
  }

  if (this.accountStatus === AccountStatus.SUSPENDED) {
    return { canLogin: false, reason: 'Account is suspended' };
  }

  if (this.accountStatus === AccountStatus.INACTIVE) {
    return { canLogin: false, reason: 'Account is inactive' };
  }

  if (!this.isEmailVerified) {
    return { canLogin: false, reason: 'Please verify your email address' };
  }

  // For roles requiring MFA
  if (this.requiresMFA()) {
    if (this.accountStatus === AccountStatus.PENDING_MFA_SETUP) {
      return {
        canLogin: false,
        reason: 'Please complete MFA setup before logging in',
      };
    }

    if (!this.isMFAEnabled) {
      return { canLogin: false, reason: 'MFA is required for your role' };
    }
  }

  return { canLogin: true };
};

// Method to increment failed login attempts
UserSchema.methods.incrementFailedLogin = function (): Promise<void> {
  this.failedLoginAttempts += 1;

  // Progressive lockout based on role
  const isPrivilegedRole = this.requiresMFA();
  const maxAttempts = isPrivilegedRole ? 3 : 5; // Stricter for privileged roles
  const lockoutDuration = isPrivilegedRole ? 60 : 30; // Longer lockout for privileged roles

  if (this.failedLoginAttempts >= maxAttempts) {
    this.accountLockedUntil = new Date(
      Date.now() + lockoutDuration * 60 * 1000,
    );
  }

  return this.save();
};

// Method to reset failed login attempts
UserSchema.methods.resetFailedLogin = function (): Promise<void> {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  return this.save();
};

// Method to add login history with risk scoring
UserSchema.methods.addLoginHistory = function (
  ipAddress: string,
  userAgent: string,
  success: boolean,
  mfaUsed: boolean = false,
  location?: string,
  riskScore?: number,
): void {
  if (!this.loginHistory) this.loginHistory = [];

  this.loginHistory.push({
    timestamp: new Date(),
    ipAddress,
    userAgent,
    location,
    success,
    mfaUsed,
    riskScore,
  });

  // Keep only last 50 login attempts
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50);
  }

  if (success) {
    this.lastLoginAt = new Date();
    this.lastLoginIP = ipAddress;
    this.lastLoginUserAgent = userAgent;
  }
};

// Method to check if device is trusted
UserSchema.methods.isTrustedDevice = function (
  deviceFingerprint: string,
): boolean {
  if (!this.trustedDevices) return false;

  return this.trustedDevices.some(
    (device) => device.fingerprint === deviceFingerprint && device.isActive,
  );
};

// Method to add trusted device
UserSchema.methods.addTrustedDevice = function (
  deviceId: string,
  deviceName: string,
  fingerprint: string,
  location?: string,
): void {
  if (!this.trustedDevices) this.trustedDevices = [];

  // Check if device already exists
  const existingDevice = this.trustedDevices.find(
    (d) => d.fingerprint === fingerprint,
  );

  if (existingDevice) {
    existingDevice.lastSeen = new Date();
    existingDevice.isActive = true;
  } else {
    this.trustedDevices.push({
      deviceId,
      deviceName,
      fingerprint,
      firstSeen: new Date(),
      lastSeen: new Date(),
      isActive: true,
      location,
      requiresMFA: this.requiresMFA(), // MFA required for privileged roles
    });
  }
};

// Method to complete MFA setup
UserSchema.methods.completeMFASetup = function (): Promise<void> {
  this.isMFAEnabled = true;
  this.accountStatus = AccountStatus.ACTIVE;
  if (!this.mfaSettings) this.mfaSettings = {} as any;
  this.mfaSettings.setupCompletedAt = new Date();
  return this.save();
};

// Transform to hide sensitive data when converting to JSON
UserSchema.set('toJSON', {
  transform: function (doc, ret) {
    // Remove sensitive fields safely
    const sensitiveFields = [
      'password',
      'mfaSecret',
      'mfaBackupCodes',
      'passwordHistory',
      'passwordResetToken',
      '__v',
    ];
    sensitiveFields.forEach((field) => {
      if (ret[field] !== undefined) {
        delete ret[field];
      }
    });

    // Hide sensitive KYC data for non-admin users
    if (ret.kycDocuments) {
      const sensitiveKycFields = [
        'aadhaarNumber',
        'panNumber',
        'drivingLicense',
      ];
      sensitiveKycFields.forEach((field) => {
        if (ret.kycDocuments[field] !== undefined) {
          delete ret.kycDocuments[field];
        }
      });
    }

    return ret;
  },
});
