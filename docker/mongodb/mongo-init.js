// MongoDB initialization script for Tenderly Backend
// This script runs when MongoDB container starts for the first time

// Switch to the tenderly database
db = db.getSiblingDB('tenderly');

// Create application user with read/write permissions
db.createUser({
  user: 'tenderly_app',
  pwd: 'tenderly_app_password_123',
  roles: [
    {
      role: 'readWrite',
      db: 'tenderly'
    }
  ]
});

// Create collections with initial indexes for performance
// Users collection
db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ phoneNumber: 1 }, { unique: true, sparse: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ isActive: 1 });
db.users.createIndex({ createdAt: 1 });

// Consultations collection
db.createCollection('consultations');
db.consultations.createIndex({ patientId: 1 });
db.consultations.createIndex({ doctorId: 1 });
db.consultations.createIndex({ status: 1 });
db.consultations.createIndex({ createdAt: 1 });
db.consultations.createIndex({ scheduledAt: 1 });

// Doctor Shifts collection
db.createCollection('doctorshifts');
db.doctorshifts.createIndex({ doctorId: 1 });
db.doctorshifts.createIndex({ date: 1 });
db.doctorshifts.createIndex({ status: 1 });
db.doctorshifts.createIndex({ isActive: 1 });

// Patient Profiles collection
db.createCollection('patientprofiles');
db.patientprofiles.createIndex({ userId: 1 }, { unique: true });
db.patientprofiles.createIndex({ isActive: 1 });

// Symptom Screening collection
db.createCollection('symptomscreenings');
db.symptomscreenings.createIndex({ sessionId: 1 }, { unique: true });
db.symptomscreenings.createIndex({ createdAt: 1 });

// Audit Logs collection
db.createCollection('auditlogs');
db.auditlogs.createIndex({ userId: 1 });
db.auditlogs.createIndex({ action: 1 });
db.auditlogs.createIndex({ category: 1 });
db.auditlogs.createIndex({ timestamp: 1 });
db.auditlogs.createIndex({ ipAddress: 1 });

// Payments collection
db.createCollection('payments');
db.payments.createIndex({ consultationId: 1 });
db.payments.createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true });
db.payments.createIndex({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
db.payments.createIndex({ status: 1 });
db.payments.createIndex({ createdAt: 1 });

// Create TTL indexes for automatic cleanup
// Session cleanup (30 days)
db.auditlogs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

// Symptom screening cleanup (7 days)
db.symptomscreenings.createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 });

print('✅ MongoDB initialization completed for Tenderly Backend');
print('✅ Database: tenderly');
print('✅ Application user: tenderly_app created');
print('✅ Collections and indexes created successfully');
