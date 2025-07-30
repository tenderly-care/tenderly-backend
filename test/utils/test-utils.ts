import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from '../../src/modules/users/schemas/user.schema';
import { AuditLog } from '../../src/security/audit/schemas/audit-log.schema';

export class TestUtils {
  /**
   * Create a test user in the database
   */
  static async createTestUser(
    userModel: Model<User>,
    userData: Partial<User> = {},
  ): Promise<User> {
    const defaultUser = {
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      firstName: 'Test',
      lastName: 'User',
      roles: ['patient'],
      isEmailVerified: true,
      isMFAEnabled: false,
      accountStatus: 'active',
      ...userData,
    };

    const user = new userModel(defaultUser);
    return await user.save();
  }

  /**
   * Create a healthcare provider test user
   */
  static async createTestHealthcareProvider(
    userModel: Model<User>,
    userData: Partial<User> = {},
  ): Promise<User> {
    const defaultProvider = {
      email: 'doctor@example.com',
      password: await bcrypt.hash('password123', 10),
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
      ...userData,
    };

    const user = new userModel(defaultProvider);
    return await user.save();
  }

  /**
   * Generate a JWT token for testing
   */
  static generateTestToken(
    jwtService: JwtService,
    payload: any,
    options: any = {},
  ): string {
    return jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'test-secret',
      expiresIn: '1h',
      ...options,
    });
  }

  /**
   * Create a test JWT payload
   */
  static createTestJwtPayload(user: User, sessionId: string = 'test-session-id') {
    return {
      userId: (user as any)._id || 'test-user-id',
      email: user.email,
      roles: user.roles,
      sessionId,
      deviceId: 'test-device-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  /**
   * Clean up test database
   */
  static async cleanupDatabase(models: { [key: string]: Model<any> }) {
    for (const model of Object.values(models)) {
      await model.deleteMany({});
    }
  }

  /**
   * Create a mock request object
   */
  static createMockRequest(user: any = global.testUser, additionalData: any = {}) {
    return {
      user,
      headers: {
        'user-agent': 'test-agent',
        'x-forwarded-for': '127.0.0.1',
      },
      ip: '127.0.0.1',
      ...additionalData,
    };
  }

  /**
   * Create a mock response object
   */
  static createMockResponse() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };
  }

  /**
   * Wait for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a mock model with common methods
   */
  static createMockModel(data: any[] = []) {
    return {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(data),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(data[0] || null),
        populate: jest.fn().mockReturnThis(),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(data[0] || null),
        populate: jest.fn().mockReturnThis(),
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue(data[0] || null),
      findByIdAndDelete: jest.fn().mockResolvedValue(data[0] || null),
      create: jest.fn().mockImplementation((doc) => Promise.resolve({
        ...doc,
        _id: 'generated-id',
        save: jest.fn().mockResolvedValue(doc),
      })),
      save: jest.fn().mockResolvedValue(data[0] || null),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: data.length }),
      countDocuments: jest.fn().mockResolvedValue(data.length),
      aggregate: jest.fn().mockResolvedValue([]),
    };
  }

  /**
   * Create test module with common providers
   */
  static async createTestModule(
    imports: any[] = [],
    providers: any[] = [],
    controllers: any[] = [],
  ): Promise<TestingModule> {
    return await Test.createTestingModule({
      imports,
      providers: [
        ...providers,
        {
          provide: getModelToken(User.name),
          useValue: TestUtils.createMockModel(),
        },
        {
          provide: getModelToken(AuditLog.name),
          useValue: TestUtils.createMockModel(),
        },
      ],
      controllers,
    }).compile();
  }

  /**
   * Create a full test application
   */
  static async createTestApp(module: TestingModule): Promise<INestApplication> {
    const app = module.createNestApplication();
    
    // Add any global pipes, filters, or interceptors here
    // app.useGlobalPipes(new ValidationPipe());
    
    await app.init();
    return app;
  }

  /**
   * Assert that an error was thrown with specific message
   */
  static async expectToThrow(
    fn: () => Promise<any>,
    expectedError: string | RegExp,
  ): Promise<void> {
    try {
      await fn();
      throw new Error('Expected function to throw');
    } catch (error) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError);
      } else {
        expect(error.message).toMatch(expectedError);
      }
    }
  }

  /**
   * Create test data factories
   */
  static factories = {
    user: (overrides: Partial<User> = {}) => ({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: 'hashedPassword123',
      roles: ['patient'],
      isEmailVerified: true,
      isMFAEnabled: false,
      accountStatus: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }),

    auditLog: (overrides: Partial<AuditLog> = {}) => ({
      userId: 'test-user-id',
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      timestamp: new Date(),
      details: {},
      ...overrides,
    }),

  };
}
