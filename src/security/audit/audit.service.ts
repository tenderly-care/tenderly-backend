import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

export interface AuditEventData {
  userId?: string;
  resourceType: string;
  action: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category:
    | 'authentication'
    | 'data_access'
    | 'administration'
    | 'security'
    | 'system';
  success: boolean;
  errorMessage?: string;
  additionalData?: Record<string, any>;
}

export interface AuditLog extends AuditEventData {
  _id?: string;
  sessionId?: string;
  requestId?: string;
  fingerprint: string;
  complianceFlags: {
    ndhm: boolean;
    gdpr: boolean;
    hipaa: boolean;
  };
  retentionDate: Date;
  isArchived: boolean;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(
    @InjectModel('AuditLog') private auditLogModel: Model<AuditLog>,
    private configService: ConfigService,
  ) {}

  /**
   * Logs authentication events
   */
  async logAuthEvent(
    userId: string,
    action:
      | 'login'
      | 'logout'
      | 'failed_login'
      | 'password_change'
      | 'mfa_enabled'
      | 'mfa_disabled'
      | 'register'
      | 'login_partial'
      | 'email_verified'
      | 'password_reset_requested'
      | 'password_reset'
      | 'mfa_setup_init'
      | 'mfa_setup_failed'
      | 'mfa_failed'
      | 'mfa_success',
    ipAddress: string,
    userAgent: string,
    success: boolean = true,
    errorMessage?: string,
  ): Promise<void> {
    const auditData: AuditEventData = {
      userId,
      resourceType: 'authentication',
      action,
      ipAddress,
      userAgent,
      severity: success ? 'low' : 'medium',
      category: 'authentication',
      success,
      errorMessage,
    };

    await this.createAuditLog(auditData);

    // Real-time alerting for failed authentication attempts
    if (!success && action === 'failed_login') {
      await this.checkFailedLoginAttempts(userId, ipAddress);
    }
  }

  /**
   * Logs data access events
   */
  async logDataAccess(
    userId: string,
    resourceType: string,
    action: 'create' | 'read' | 'update' | 'delete' | 'export',
    resourceId?: string,
    oldValue?: any,
    newValue?: any,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const severity = this.determineSeverity(resourceType, action);

    const auditData: AuditEventData = {
      userId,
      resourceType,
      action,
      resourceId,
      oldValue: this.sanitizeData(oldValue),
      newValue: this.sanitizeData(newValue),
      severity,
      category: 'data_access',
      success: true,
      additionalData: metadata,
    };

    await this.createAuditLog(auditData);

    // Alert on sensitive data access
    if (severity === 'critical') {
      await this.sendSecurityAlert(auditData);
    }
  }

  /**
   * Logs security events
   */
  async logSecurityEvent(
    eventType:
      | 'suspicious_activity'
      | 'security_violation'
      | 'unauthorized_access'
      | 'data_breach',
    details: Record<string, any>,
    userId?: string,
    ipAddress?: string,
  ): Promise<void> {
    const auditData: AuditEventData = {
      userId,
      resourceType: 'security_event',
      action: eventType,
      ipAddress,
      severity: 'critical',
      category: 'security',
      success: false,
      additionalData: details,
    };

    await this.createAuditLog(auditData);
    await this.sendSecurityAlert(auditData);
  }

  /**
   * Logs administrative actions
   */
  async logAdminAction(
    adminUserId: string,
    action: string,
    targetUserId?: string,
    details?: Record<string, any>,
    ipAddress?: string,
  ): Promise<void> {
    const auditData: AuditEventData = {
      userId: adminUserId,
      resourceType: 'admin_action',
      action,
      resourceId: targetUserId,
      ipAddress,
      severity: 'high',
      category: 'administration',
      success: true,
      additionalData: details,
    };

    await this.createAuditLog(auditData);
  }

  /**
   * Creates an audit log entry
   */
  private async createAuditLog(auditData: AuditEventData): Promise<void> {
    try {
      const retentionDays = this.getRetentionPeriod(auditData.category);
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() + retentionDays);

      const auditLog: Partial<AuditLog> = {
        ...auditData,
        timestamp: new Date(),
        fingerprint: this.generateFingerprint(auditData),
        complianceFlags: {
          ndhm: this.isNDHMRelevant(auditData),
          gdpr: this.isGDPRRelevant(auditData),
          hipaa: this.isHIPAARelevant(auditData),
        },
        retentionDate,
        isArchived: false,
      };

      await this.auditLogModel.create(auditLog);

      this.logger.log(
        `Audit log created: ${auditData.action} by ${auditData.userId || 'system'}`,
      );
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      // Don't throw error to avoid disrupting main application flow
    }
  }

  /**
   * Generates a unique fingerprint for audit log integrity
   */
  private generateFingerprint(auditData: AuditEventData): string {
    const crypto = require('crypto');
    const data = JSON.stringify({
      ...auditData,
      timestamp: auditData.timestamp || new Date(),
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Determines severity based on resource type and action
   */
  private determineSeverity(
    resourceType: string,
    action: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const sensitiveResources = [
      'patient_data',
      'medical_records',
      'prescriptions',
      'payment_info',
    ];
    const criticalActions = ['delete', 'export'];

    if (
      sensitiveResources.includes(resourceType) &&
      criticalActions.includes(action)
    ) {
      return 'critical';
    }
    if (sensitiveResources.includes(resourceType)) {
      return 'high';
    }
    if (criticalActions.includes(action)) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Sanitizes sensitive data for audit logs
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'ssn',
      'creditCard',
    ];
    const sanitized = JSON.parse(JSON.stringify(data));

    function sanitizeObject(obj: any): any {
      for (const key in obj) {
        if (
          sensitiveFields.some((field) => key.toLowerCase().includes(field))
        ) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
      return obj;
    }

    return sanitizeObject(sanitized);
  }

  /**
   * Gets retention period based on audit category
   */
  private getRetentionPeriod(category: string): number {
    const retentionConfig = this.configService.get('audit.retention');
    switch (category) {
      case 'authentication':
        return retentionConfig.authEvents;
      case 'data_access':
        return retentionConfig.dataAccess;
      case 'administration':
      case 'security':
        return retentionConfig.systemEvents;
      default:
        return retentionConfig.systemEvents;
    }
  }

  /**
   * Checks if audit event is relevant for NDHM compliance
   */
  private isNDHMRelevant(auditData: AuditEventData): boolean {
    const ndhmRelevantResources = [
      'patient_data',
      'health_records',
      'consultations',
      'prescriptions',
    ];
    return ndhmRelevantResources.includes(auditData.resourceType);
  }

  /**
   * Checks if audit event is relevant for GDPR compliance
   */
  private isGDPRRelevant(auditData: AuditEventData): boolean {
    const gdprRelevantActions = [
      'create',
      'read',
      'update',
      'delete',
      'export',
    ];
    const gdprRelevantResources = ['user_data', 'personal_information'];
    return (
      gdprRelevantActions.includes(auditData.action) ||
      gdprRelevantResources.includes(auditData.resourceType)
    );
  }

  /**
   * Checks if audit event is relevant for HIPAA compliance
   */
  private isHIPAARelevant(auditData: AuditEventData): boolean {
    const hipaaRelevantResources = ['patient_data', 'medical_records', 'phi'];
    return hipaaRelevantResources.includes(auditData.resourceType);
  }

  /**
   * Checks for suspicious failed login patterns
   */
  private async checkFailedLoginAttempts(
    userId: string,
    ipAddress: string,
  ): Promise<void> {
    const last15Minutes = new Date(Date.now() - 15 * 60 * 1000);

    const recentFailures = await this.auditLogModel.countDocuments({
      $or: [{ userId }, { ipAddress }],
      action: 'failed_login',
      timestamp: { $gte: last15Minutes },
      success: false,
    });

    if (recentFailures >= 5) {
      await this.logSecurityEvent(
        'suspicious_activity',
        {
          reason: 'Multiple failed login attempts',
          attempts: recentFailures,
          userId,
          ipAddress,
        },
        userId,
        ipAddress,
      );
    }
  }

  /**
   * Sends security alerts for critical events
   */
  private async sendSecurityAlert(auditData: AuditEventData): Promise<void> {
    if (!this.configService.get('audit.alerting.enabled')) {
      return;
    }

    try {
      // Implementation would integrate with alerting service (email, Slack, PagerDuty, etc.)
      this.logger.warn(
        `SECURITY ALERT: ${auditData.action} - ${JSON.stringify(auditData)}`,
      );

      // TODO: Implement actual alerting mechanism
      // await this.notificationService.sendSecurityAlert(auditData);
    } catch (error) {
      this.logger.error('Failed to send security alert:', error);
    }
  }

  /**
   * Archives old audit logs based on retention policy
   */
  async archiveOldLogs(): Promise<void> {
    const now = new Date();

    try {
      const result = await this.auditLogModel.updateMany(
        { retentionDate: { $lt: now }, isArchived: false },
        { isArchived: true },
      );

      this.logger.log(`Archived ${result.modifiedCount} audit logs`);
    } catch (error) {
      this.logger.error('Failed to archive audit logs:', error);
    }
  }

  /**
   * Gets audit logs for compliance reporting
   */
  async getComplianceReport(
    startDate: Date,
    endDate: Date,
    complianceType: 'ndhm' | 'gdpr' | 'hipaa',
  ): Promise<AuditLog[]> {
    const filter: any = {
      timestamp: { $gte: startDate, $lte: endDate },
      [`complianceFlags.${complianceType}`]: true,
    };

    return this.auditLogModel.find(filter).sort({ timestamp: -1 });
  }

  /**
   * Retrieves audit logs for a specific user
   */
  async getUserAuditLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    category?: string,
    action?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    try {
      const query: any = { userId };

      if (category) {
        query.category = category;
      }

      if (action) {
        query.action = action;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      const [logs, total] = await Promise.all([
        this.auditLogModel
          .find(query)
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit)
          .select('-oldValue -newValue -additionalData') // Exclude sensitive data
          .lean()
          .exec(),
        this.auditLogModel.countDocuments(query).exec(),
      ]);

      return { logs, total };
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs:', error);
      return { logs: [], total: 0 };
    }
  }

  /**
   * Retrieves recent audit logs for a user
   */
  async getRecentUserAuditLogs(
    userId: string,
    limit: number = 20,
  ): Promise<AuditLog[]> {
    try {
      return await this.auditLogModel
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('-oldValue -newValue -additionalData') // Exclude sensitive data
        .lean()
        .exec();
    } catch (error) {
      this.logger.error('Failed to retrieve recent audit logs:', error);
      return [];
    }
  }
}
