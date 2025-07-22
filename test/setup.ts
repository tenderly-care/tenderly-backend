import 'reflect-metadata';

// Global test configuration
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MONGODB_URI = 'mongodb://localhost:27017/tenderly-test';

// Set longer timeout for async operations
jest.setTimeout(30000);

// Mock console methods in test environment
global.console = {
  ...console,
  // Uncomment to suppress console output during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUser: any;
      testHealthcareProvider: any;
      testPatient: any;
    }
  }
}

// Mock user data for tests
global.testUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  roles: ['patient'],
  isEmailVerified: true,
  isMFAEnabled: false,
  accountStatus: 'active',
};

global.testHealthcareProvider = {
  id: '507f1f77bcf86cd799439012',
  email: 'doctor@example.com',
  firstName: 'Dr. Test',
  lastName: 'Doctor',
  roles: ['healthcare_provider'],
  isEmailVerified: true,
  isMFAEnabled: true,
  accountStatus: 'active',
  professionalInfo: {
    medicalLicenseNumber: 'MED123456',
    specialization: ['gynecology', 'obstetrics'],
  },
};

global.testPatient = {
  id: '507f1f77bcf86cd799439013',
  email: 'patient@example.com',
  firstName: 'Test',
  lastName: 'Patient',
  roles: ['patient'],
  isEmailVerified: true,
  isMFAEnabled: false,
  accountStatus: 'active',
};
