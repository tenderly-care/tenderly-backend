import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('Enhanced Consultation Endpoints (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let jwtService: JwtService;
  let patientToken: string;
  let doctorToken: string;

  // Mock AI Agent Response
  const mockAIResponse = {
    diagnosis: "Primary medical diagnosis based on symptoms",
    confidence_score: 0.85,
    suggested_investigations: [
      {
        name: "Complete Blood Count (CBC)",
        priority: "high",
        reason: "To check for infection or blood disorders"
      },
      {
        name: "Urine Analysis",
        priority: "medium", 
        reason: "To rule out urinary tract infections"
      }
    ],
    recommended_medications: [
      {
        name: "Ibuprofen Alternative",
        dosage: "400mg",
        frequency: "Twice daily",
        duration: "5 days",
        reason: "Pain relief and anti-inflammatory",
        notes: "⚠️ ALLERGY SUBSTITUTION: Replaced ibuprofen with safe alternative due to patient allergy"
      }
    ],
    lifestyle_advice: [
      "Maintain adequate hydration",
      "Get plenty of rest",
      "Avoid strenuous activities"
    ],
    follow_up_recommendations: "Follow up in 1-2 weeks if symptoms persist",
    disclaimer: "This is an AI-generated preliminary assessment. Please consult with a healthcare provider for proper medical care.",
    timestamp: new Date().toISOString()
  };

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    // Override the database configuration for testing
    process.env.MONGODB_URI = uri;
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider('AI_AGENT_SERVICE')
    .useValue({
      getDiagnosis: jest.fn().mockResolvedValue({
        diagnosis: mockAIResponse.diagnosis,
        severity: 'medium',
        recommendedConsultationType: 'chat',
        recommendedTests: mockAIResponse.suggested_investigations.map(inv => inv.name),
        confidence: mockAIResponse.confidence_score,
        fullDiagnosis: mockAIResponse,
      }),
      healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
    })
    .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test tokens
    patientToken = jwtService.sign({ 
      sub: 'patient123', 
      roles: ['patient'],
      email: 'patient@test.com'
    });
    
    doctorToken = jwtService.sign({
      sub: 'doctor123',
      roles: ['healthcare_provider'],
      email: 'doctor@test.com'
    });
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
    await app.close();
  });

  afterEach(async () => {
    // Clean up database after each test
    const collections = connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  });

  describe('POST /consultations/symptoms/enhanced-collect', () => {
    const validEnhancedSymptoms = {
      patient_profile: {
        age: 28,
        gender: 'female',
        weight: 65,
        height: 165
      },
      symptoms: {
        primary_complaint: "Severe abdominal pain in lower right quadrant",
        onset: "sudden",
        duration: "6 hours", 
        severity: "severe",
        character: "sharp, stabbing pain",
        associated_symptoms: ["nausea", "vomiting", "fever"],
        aggravating_factors: ["movement", "coughing"],
        relieving_factors: ["lying still"],
        previous_episodes: false
      },
      medical_context: {
        current_medications: [],
        recent_medications: [],
        medical_conditions: [],
        previous_gynecological_issues: [],
        allergies: ["ibuprofen", "penicillin", "sulfa"],
        family_history: ["diabetes", "hypertension"]
      },
      healthcare_interaction: {
        previous_consultation: true,
        consultation_outcome: "unclear",
        investigations_done: true,
        investigation_results: "pending",
        current_treatment: "none"
      },
      patient_concerns: {
        main_worry: "severe pain",
        impact_on_life: "significant",
        additional_notes: "Pain is getting worse and I'm very concerned"
      }
    };

    it('should successfully process enhanced symptom collection', async () => {
      const response = await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(validEnhancedSymptoms)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('diagnosis');
      expect(response.body).toHaveProperty('severity');
      expect(response.body).toHaveProperty('recommendedConsultationType');
      expect(response.body).toHaveProperty('confidence');
      expect(response.body.diagnosis).toBe(mockAIResponse.diagnosis);
      expect(response.body.severity).toBe('medium');
    });

    it('should return 401 when no auth token provided', async () => {
      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .send(validEnhancedSymptoms)
        .expect(401);
    });

    it('should return 403 when doctor token is used (patient-only endpoint)', async () => {
      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validEnhancedSymptoms)
        .expect(403);
    });

    it('should return 400 for missing required patient_profile', async () => {
      const invalidData = { ...validEnhancedSymptoms };
      delete (invalidData as any).patient_profile;

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for missing required symptoms', async () => {
      const invalidData = { ...validEnhancedSymptoms };
      delete (invalidData as any).symptoms;

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for missing required medical_context', async () => {
      const invalidData = { ...validEnhancedSymptoms };
      delete (invalidData as any).medical_context;

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for missing required healthcare_interaction', async () => {
      const invalidData = { ...validEnhancedSymptoms };
      delete (invalidData as any).healthcare_interaction;

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for missing required patient_concerns', async () => {
      const invalidData = { ...validEnhancedSymptoms };
      delete (invalidData as any).patient_concerns;

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for invalid gender value', async () => {
      const invalidData = { 
        ...validEnhancedSymptoms,
        patient_profile: {
          ...validEnhancedSymptoms.patient_profile,
          gender: 'invalid'
        }
      };

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for invalid severity value', async () => {
      const invalidData = { 
        ...validEnhancedSymptoms,
        symptoms: {
          ...validEnhancedSymptoms.symptoms,
          severity: 'invalid'
        }
      };

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for invalid impact_on_life value', async () => {
      const invalidData = { 
        ...validEnhancedSymptoms,
        patient_concerns: {
          ...validEnhancedSymptoms.patient_concerns,
          impact_on_life: 'invalid'
        }
      };

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should handle allergy information correctly', async () => {
      const response = await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(validEnhancedSymptoms)
        .expect(200);

      // Check that AI response acknowledges allergies in medication recommendations
      expect(response.body.fullDiagnosis.recommended_medications[0].notes)
        .toContain('ALLERGY SUBSTITUTION');
    });

    it('should process minimal valid payload', async () => {
      const minimalData = {
        patient_profile: {
          age: 25,
          gender: 'male'
        },
        symptoms: {
          primary_complaint: "Headache",
          onset: "gradual",
          duration: "2 days",
          severity: "mild",
          character: "dull ache",
          associated_symptoms: [],
          aggravating_factors: [],
          relieving_factors: [],
          previous_episodes: false
        },
        medical_context: {
          current_medications: [],
          recent_medications: [],
          medical_conditions: [],
          allergies: [],
          family_history: []
        },
        healthcare_interaction: {
          previous_consultation: false,
          investigations_done: false,
          current_treatment: "none"
        },
        patient_concerns: {
          main_worry: "persistent headache",
          impact_on_life: "mild"
        }
      };

      await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(minimalData)
        .expect(200);
    });

    it('should handle arrays correctly in medical context', async () => {
      const dataWithArrays = {
        ...validEnhancedSymptoms,
        medical_context: {
          ...validEnhancedSymptoms.medical_context,
          current_medications: ["metformin", "lisinopril"],
          recent_medications: ["amoxicillin"],
          medical_conditions: ["type 2 diabetes", "hypertension"],
          allergies: ["penicillin", "shellfish"],
          family_history: ["heart disease", "cancer", "diabetes"]
        }
      };

      const response = await request(app.getHttpServer())
        .post('/consultations/symptoms/enhanced-collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(dataWithArrays)
        .expect(200);

      expect(response.body).toHaveProperty('diagnosis');
    });
  });

  describe('Integration with existing endpoints', () => {
    it('should be compatible with legacy symptom collection endpoint', async () => {
      const legacySymptoms = {
        primarySymptom: ["headache", "nausea"],
        duration: "2 days",
        severity: "moderate",
        additionalSymptoms: ["dizziness"],
        triggers: ["stress"],
        previousTreatments: ["rest"],
        medicalHistory: {
          allergies: ["penicillin"],
          currentMedications: [],
          chronicConditions: [],
          previousSurgeries: [],
          familyHistory: ["diabetes"]
        }
      };

      await request(app.getHttpServer())
        .post('/consultations/symptoms/collect')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(legacySymptoms)
        .expect(200);
    });
  });

  describe('Health check endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/consultations/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'consultation-service');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '1.0.0');
    });
  });
});
