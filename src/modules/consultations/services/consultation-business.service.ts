import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Consultation, ConsultationStatus, ConsultationType, ConsultationPriority } from '../schemas/consultation.schema';

@Injectable()
export class ConsultationBusinessService {
  private readonly logger = new Logger(ConsultationBusinessService.name);

  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>
  ) {}

  /**
   * Validate if patient ID is a valid ObjectId
   */
  private validatePatientId(patientId: string): void {
    if (!patientId || typeof patientId !== 'string') {
      throw new BadRequestException('Patient ID is required and must be a string');
    }
    
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID format');
    }
  }

  /**
   * Check if patient has an active consultation
   */
  async hasActiveConsultation(patientId: string): Promise<boolean> {
    try {
      this.logger.log(`Checking active consultation for patient: ${patientId}`);
      
      // Validate patient ID format
      this.validatePatientId(patientId);
      
      const activeConsultation = await this.consultationModel.findOne({
        patientId: new Types.ObjectId(patientId),
        isActive: true,
        isDeleted: false,
        status: {
          $in: [
            ConsultationStatus.PAYMENT_CONFIRMED,
            ConsultationStatus.CLINICAL_ASSESSMENT_PENDING,
            ConsultationStatus.ACTIVE,
            ConsultationStatus.DOCTOR_REVIEW_PENDING,
            ConsultationStatus.DOCTOR_ASSIGNED,
            ConsultationStatus.IN_PROGRESS,
            ConsultationStatus.ON_HOLD
          ]
        }
      });

      const hasActive = !!activeConsultation;
      this.logger.log(`Patient ${patientId} has active consultation: ${hasActive}`);
      return hasActive;
    } catch (error) {
      this.logger.error(`Error checking active consultation for patient ${patientId}:`, error.message);
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Wrap unknown errors in InternalServerErrorException
      throw new InternalServerErrorException(`Failed to check active consultation: ${error.message}`);
    }
  }

  /**
   * Get active consultation for patient
   */
  async getActiveConsultation(patientId: string): Promise<Consultation | null> {
    try {
      this.logger.log(`Getting active consultation for patient: ${patientId}`);
      
      // Validate patient ID format
      this.validatePatientId(patientId);
      
      const result = await this.consultationModel.findOne({
        patientId: new Types.ObjectId(patientId),
        isActive: true,
        isDeleted: false,
        status: {
          $in: [
            ConsultationStatus.PAYMENT_CONFIRMED,
            ConsultationStatus.CLINICAL_ASSESSMENT_PENDING,
            ConsultationStatus.ACTIVE,
            ConsultationStatus.DOCTOR_REVIEW_PENDING,
            ConsultationStatus.DOCTOR_ASSIGNED,
            ConsultationStatus.IN_PROGRESS,
            ConsultationStatus.ON_HOLD
          ]
        }
      });
      
      this.logger.log(`Found active consultation: ${result ? 'yes' : 'no'}`);
      return result;
    } catch (error) {
      this.logger.error(`Error getting active consultation for patient ${patientId}:`, error.message);
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Wrap unknown errors in InternalServerErrorException
      throw new InternalServerErrorException(`Failed to get active consultation: ${error.message}`);
    }
  }

  /**
   * Validate if patient can create a new consultation
   */
  async validateNewConsultation(patientId: string): Promise<void> {
    const hasActive = await this.hasActiveConsultation(patientId);
    
    if (hasActive) {
      const activeConsultation = await this.getActiveConsultation(patientId);
      throw new ConflictException(
        `Patient already has an active consultation (ID: ${activeConsultation?.consultationId}, Status: ${activeConsultation?.status}). Please complete or cancel the existing consultation before creating a new one.`
      );
    }
  }

  /**
   * Activate a consultation (deactivate others first)
   */
  async activateConsultation(consultationId: string, patientId: string, reason?: string): Promise<void> {
    // Validate IDs
    this.validatePatientId(patientId);
    if (!consultationId || !Types.ObjectId.isValid(consultationId)) {
      throw new BadRequestException('Invalid consultation ID format');
    }
    
    // Deactivate all other consultations for this patient
    await this.consultationModel.updateMany(
      {
        patientId: new Types.ObjectId(patientId),
        _id: { $ne: new Types.ObjectId(consultationId) },
        isActive: true,
        isDeleted: false
      },
      {
        $set: {
          isActive: false,
          status: ConsultationStatus.CANCELLED,
          cancelledAt: new Date()
        },
        $push: {
          statusHistory: {
            status: ConsultationStatus.CANCELLED,
            changedAt: new Date(),
            changedBy: new Types.ObjectId(patientId),
            reason: 'Deactivated due to new active consultation',
            previousStatus: '$status',
            metadata: {
              source: 'system',
              trigger: 'consultation_activation',
              notes: 'Automatically cancelled due to new active consultation'
            }
          }
        }
      }
    );

    // Activate the target consultation
    await this.consultationModel.findByIdAndUpdate(
      consultationId,
      {
        $set: {
          isActive: true,
          activatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: ConsultationStatus.PAYMENT_CONFIRMED,
            changedAt: new Date(),
            changedBy: new Types.ObjectId(patientId),
            reason: reason || 'Consultation activated',
            metadata: {
              source: 'system',
              trigger: 'consultation_activation',
              notes: 'Consultation activated as primary active consultation'
            }
          }
        }
      }
    );

    this.logger.log(`Consultation ${consultationId} activated for patient ${patientId}`);
  }

  /**
   * Update consultation status with proper business logic
   */
  async updateConsultationStatus(
    consultationId: string,
    newStatus: ConsultationStatus,
    changedBy: string,
    reason?: string,
    metadata?: any
  ): Promise<void> {
    // Validate IDs
    if (!consultationId || !Types.ObjectId.isValid(consultationId)) {
      throw new BadRequestException('Invalid consultation ID format');
    }
    if (!changedBy || !Types.ObjectId.isValid(changedBy)) {
      throw new BadRequestException('Invalid user ID format');
    }
    
    const consultation = await this.consultationModel.findById(consultationId);
    
    if (!consultation) {
      throw new BadRequestException('Consultation not found');
    }

    const previousStatus = consultation.status;
    const now = new Date();

    // Business logic for status transitions
    await this.validateStatusTransition(consultation, newStatus);

    // Update consultation
    const updateData: any = {
      status: newStatus,
      $push: {
        statusHistory: {
          status: newStatus,
          changedAt: now,
          changedBy: new Types.ObjectId(changedBy),
          reason,
          previousStatus,
          metadata: {
            source: metadata?.source || 'system',
            trigger: metadata?.trigger || 'status_update',
            notes: metadata?.notes
          }
        }
      }
    };

    // Set specific timestamps based on status
    switch (newStatus) {
      case ConsultationStatus.COMPLETED:
        updateData.completedAt = now;
        updateData.isActive = false;
        break;
      case ConsultationStatus.CANCELLED:
        updateData.cancelledAt = now;
        updateData.isActive = false;
        break;
      case ConsultationStatus.IN_PROGRESS:
        updateData.activatedAt = now;
        updateData.isActive = true;
        break;
    }

    await this.consultationModel.findByIdAndUpdate(consultationId, updateData);

    this.logger.log(`Consultation ${consultationId} status updated from ${previousStatus} to ${newStatus}`);
  }

  /**
   * Validate status transitions
   */
  private async validateStatusTransition(consultation: Consultation, newStatus: ConsultationStatus): Promise<void> {
    const validTransitions = {
      [ConsultationStatus.DRAFT]: [
        ConsultationStatus.PENDING,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.PENDING]: [
        ConsultationStatus.PAYMENT_PENDING,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.PAYMENT_PENDING]: [
        ConsultationStatus.PAYMENT_CONFIRMED,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.PAYMENT_CONFIRMED]: [
        ConsultationStatus.CLINICAL_ASSESSMENT_PENDING,
        ConsultationStatus.ACTIVE,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.CLINICAL_ASSESSMENT_PENDING]: [
        ConsultationStatus.ACTIVE,
        ConsultationStatus.DOCTOR_REVIEW_PENDING,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.ACTIVE]: [
        ConsultationStatus.DOCTOR_REVIEW_PENDING,
        ConsultationStatus.DOCTOR_ASSIGNED,
        ConsultationStatus.COMPLETED,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.DOCTOR_REVIEW_PENDING]: [
        ConsultationStatus.DOCTOR_ASSIGNED,
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.DOCTOR_ASSIGNED]: [
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.IN_PROGRESS]: [
        ConsultationStatus.COMPLETED,
        ConsultationStatus.ON_HOLD,
        ConsultationStatus.CANCELLED
      ],
      [ConsultationStatus.ON_HOLD]: [
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.CANCELLED
      ]
    };

    const allowedTransitions = validTransitions[consultation.status] || [];
    
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${consultation.status} to ${newStatus}. Allowed transitions: ${allowedTransitions.join(', ')}`
      );
    }
  }

  /**
   * Get consultation statistics for patient
   */
  async getPatientConsultationStats(patientId: string): Promise<any> {
    try {
      this.logger.log(`Getting consultation stats for patient: ${patientId}`);
      
      // Validate patient ID format
      this.validatePatientId(patientId);
      
      const stats = await this.consultationModel.aggregate([
        {
          $match: {
            patientId: new Types.ObjectId(patientId),
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalConsultations: { $sum: 1 },
            activeConsultations: {
              $sum: {
                $cond: [
                  { $eq: ['$isActive', true] },
                  1,
                  0
                ]
              }
            },
            completedConsultations: {
              $sum: {
                $cond: [
                  { $eq: ['$status', ConsultationStatus.COMPLETED] },
                  1,
                  0
                ]
              }
            },
            cancelledConsultations: {
              $sum: {
                $cond: [
                  { $eq: ['$status', ConsultationStatus.CANCELLED] },
                  1,
                  0
                ]
              }
            },
            totalAmount: { $sum: '$paymentInfo.amount' },
            averageSatisfaction: { $avg: '$patientSatisfactionRating' }
          }
        }
      ]);

      const result = stats[0] || {
        totalConsultations: 0,
        activeConsultations: 0,
        completedConsultations: 0,
        cancelledConsultations: 0,
        totalAmount: 0,
        averageSatisfaction: 0
      };
      
      this.logger.log(`Stats for patient ${patientId}:`, result);
      return result;
    } catch (error) {
      this.logger.error(`Error getting consultation stats for patient ${patientId}:`, error.message);
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Wrap unknown errors in InternalServerErrorException
      throw new InternalServerErrorException(`Failed to get consultation stats: ${error.message}`);
    }
  }

  /**
   * Check for consultation conflicts
   */
  async checkConsultationConflicts(patientId: string): Promise<any> {
    try {
      this.logger.log(`Checking consultation conflicts for patient: ${patientId}`);
      
      // Validate patient ID format
      this.validatePatientId(patientId);
      
      const conflicts: {
        hasActiveConsultation: boolean;
        hasPendingPayment: boolean;
        hasExpiredConsultation: boolean;
        activeConsultation: any;
        pendingPaymentConsultation: any;
        expiredConsultation: any;
      } = {
        hasActiveConsultation: false,
        hasPendingPayment: false,
        hasExpiredConsultation: false,
        activeConsultation: null,
        pendingPaymentConsultation: null,
        expiredConsultation: null
      };

      // Check for active consultation
      const activeConsultation = await this.getActiveConsultation(patientId);
      if (activeConsultation) {
        conflicts.hasActiveConsultation = true;
        conflicts.activeConsultation = {
          consultationId: activeConsultation.consultationId,
          status: activeConsultation.status,
          createdAt: activeConsultation.createdAt
        };
      }

      // Check for pending payment
      const pendingPayment = await this.consultationModel.findOne({
        patientId: new Types.ObjectId(patientId),
        'paymentInfo.paymentStatus': 'pending',
        isDeleted: false
      });
      if (pendingPayment) {
        conflicts.hasPendingPayment = true;
        conflicts.pendingPaymentConsultation = {
          consultationId: pendingPayment.consultationId,
          status: pendingPayment.status,
          createdAt: pendingPayment.createdAt
        };
      }

      // Check for expired consultation
      const expiredConsultation = await this.consultationModel.findOne({
        patientId: new Types.ObjectId(patientId),
        expiresAt: { $lt: new Date() },
        status: { $nin: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED] },
        isDeleted: false
      });
      if (expiredConsultation) {
        conflicts.hasExpiredConsultation = true;
        conflicts.expiredConsultation = {
          consultationId: expiredConsultation.consultationId,
          status: expiredConsultation.status,
          expiresAt: expiredConsultation.expiresAt
        };
      }

      this.logger.log(`Conflicts found for patient ${patientId}:`, conflicts);
      return conflicts;
    } catch (error) {
      this.logger.error(`Error checking consultation conflicts for patient ${patientId}:`, error.message);
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      // Wrap unknown errors in InternalServerErrorException
      throw new InternalServerErrorException(`Failed to check consultation conflicts: ${error.message}`);
    }
  }

  /**
   * Auto-expire consultations
   */
  async expireConsultations(): Promise<number> {
    const result = await this.consultationModel.updateMany(
      {
        expiresAt: { $lt: new Date() },
        status: {
          $nin: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED, ConsultationStatus.EXPIRED]
        },
        isDeleted: false
      },
      {
        $set: {
          status: ConsultationStatus.EXPIRED,
          isActive: false
        },
        $push: {
          statusHistory: {
            status: ConsultationStatus.EXPIRED,
            changedAt: new Date(),
            changedBy: new Types.ObjectId('000000000000000000000000'), // System user
            reason: 'Consultation expired automatically',
            metadata: {
              source: 'system',
              trigger: 'auto_expiry',
              notes: 'Consultation expired due to timeout'
            }
          }
        }
      }
    );

    this.logger.log(`Expired ${result.modifiedCount} consultations`);
    return result.modifiedCount;
  }
} 