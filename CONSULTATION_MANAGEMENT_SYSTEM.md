# Consultation Management System - Comprehensive Documentation

## Overview

The Tenderly consultation management system is a comprehensive healthcare platform that manages the entire patient consultation lifecycle from symptom collection to diagnosis, payment, and doctor consultation. It integrates AI-powered preliminary diagnosis, payment processing, doctor assignment, and real-time consultation features.

## System Architecture

### Core Components

1. **Consultation Service** - Main orchestrator
2. **AI Agent Service** - AI-powered diagnosis
3. **Payment Service** - Payment processing and verification
4. **Doctor Shift Service** - Doctor availability management
5. **AI Token Service** - Service-to-service authentication
6. **Cache Service** - Performance optimization
7. **Audit Service** - Security and compliance logging

### Database Schema

#### Consultation Collection (MongoDB)
```typescript
interface Consultation {
  // Core identifiers
  patientId: ObjectId;           // Reference to User
  doctorId: ObjectId;            // Reference to Doctor
  sessionId: string;             // Unique session identifier
  
  // Status and type
  status: ConsultationStatus;    // Workflow state
  consultationType: ConsultationType; // chat, video, emergency, follow_up
  
  // Medical data (encrypted)
  initialSymptoms: {
    primarySymptom: string;
    duration: string;
    severity: number;
    additionalSymptoms: string[];
    triggers: string[];
    previousTreatments: string[];
  };
  
  medicalHistory: {
    allergies: string[];
    currentMedications: string[];
    chronicConditions: string[];
    previousSurgeries: string[];
    familyHistory: string[];
  };
  
  // AI diagnosis
  aiDiagnosis: {
    primaryDiagnosis: string;
    differentialDiagnosis: string[];
    recommendedTests: string[];
    urgencyLevel: string;
    confidence: number;
    generatedAt: Date;
  };
  
  // Doctor's final diagnosis
  finalDiagnosis: {
    diagnosis: string;
    notes: string;
    treatmentPlan: string;
    followUpRequired: boolean;
    followUpDate: Date;
    doctorId: ObjectId;
    diagnosedAt: Date;
  };
  
  // Prescriptions
  prescriptions: Array<{
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    prescribedAt: Date;
  }>;
  
  // Chat history
  chatHistory: Array<{
    senderId: ObjectId;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
  }>;
  
  // Payment information
  paymentInfo: {
    amount: number;
    currency: string;
    paymentId: string;
    status: string;
    paidAt: Date;
  };
  
  // Follow-up tracking
  followUpNumber: number;
  parentConsultationId: ObjectId;
  followUpConsultations: ObjectId[];
  
  // Timing
  consultationStartTime: Date;
  consultationEndTime: Date;
  
  // Metadata
  metadata: {
    ipAddress: string;
    userAgent: string;
    location: string;
    deviceInfo: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

#### Status Workflow
```typescript
enum ConsultationStatus {
  PENDING = 'pending',                    // Initial state
  PAYMENT_PENDING = 'payment_pending',    // After symptom collection
  PAYMENT_CONFIRMED = 'payment_confirmed', // After successful payment
  DOCTOR_ASSIGNED = 'doctor_assigned',    // Doctor assigned to consultation
  IN_PROGRESS = 'in_progress',           // Active consultation
  COMPLETED = 'completed',               // Consultation finished
  CANCELLED = 'cancelled',               // Cancelled by patient/doctor
  REFUNDED = 'refunded'                  // Payment refunded
}
```

## Complete Consultation Workflow

### Phase 1: Symptom Collection and AI Diagnosis

#### Endpoint: `POST /api/v1/consultations/symptoms/collect`
- **Purpose**: Collect patient symptoms and get AI-powered preliminary diagnosis
- **Authentication**: JWT Bearer token (Patient role only)
- **Input**: Symptom data compatible with AI agent schema
- **Process**:
  1. Validate patient authentication and role
  2. Validate symptom data (1-3 symptoms, age 12-100, valid severity level)
  3. Transform data for AI agent compatibility
  4. Call AI agent service for diagnosis
  5. Cache diagnosis results (1 hour TTL)
  6. Log audit trail
  7. Return comprehensive diagnosis with recommendations

**Sample Request**:
```json
{
  "diagnosis_request": {
    "symptoms": ["urinary infection", "burn during urination"],
    "patient_age": 34,
    "severity_level": "severe",
    "duration": "3 days",
    "onset": "sudden",
    "progression": "stable"
  }
}
```

**Sample Response**:
```json
{
  "diagnosis": "Urinary Tract Infection (UTI)",
  "severity": "medium",
  "recommendedConsultationType": "video",
  "recommendedTests": ["Urinalysis"],
  "confidence": 0.85,
  "fullDiagnosis": {
    "diagnosis": "Urinary Tract Infection (UTI)",
    "confidence_score": 0.85,
    "suggested_investigations": [
      {
        "name": "Urinalysis",
        "priority": "high",
        "reason": "To confirm infection"
      }
    ],
    "recommended_medications": [
      {
        "name": "Antibiotics (e.g., Ciprofloxacin)",
        "dosage": "500mg",
        "frequency": "Twice daily",
        "duration": "7 days"
      }
    ],
    "lifestyle_advice": [
      "Drink plenty of water",
      "Avoid irritants like caffeine"
    ],
    "follow_up_recommendations": "Follow-up if symptoms persist",
    "disclaimer": "AI-generated diagnosis - consult healthcare provider"
  }
}
```

### Phase 2: Consultation Type Selection and Payment

#### Endpoint: `POST /api/v1/consultations/select-consultation`
- **Purpose**: Patient selects consultation type and initiates payment
- **Process**:
  1. Validate AI diagnosis session
  2. Calculate pricing based on consultation type
  3. Create payment order (mock payment gateway)
  4. Generate temporary session data
  5. Return payment details and URL

**Consultation Types and Pricing**:
- **Chat**: ₹299 - Text-based consultation
- **Video**: ₹499 - Video call consultation  
- **Emergency**: ₹799 - Priority urgent consultation

### Phase 3: Payment Confirmation

#### Endpoint: `POST /api/v1/consultations/confirm-payment`
- **Purpose**: Confirm payment completion and create consultation record
- **Process**:
  1. Verify payment status with payment gateway
  2. Create permanent consultation record in database
  3. Assign appropriate doctor based on current time/shift
  4. Update status to `PAYMENT_CONFIRMED` → `DOCTOR_ASSIGNED`
  5. Cache consultation data for quick access
  6. Send notifications (future: SMS/WhatsApp to patient and doctor)

### Phase 4: Doctor Assignment and Consultation

#### Doctor Shift Management
- **Morning Shift**: 7 AM - 4 PM (Dr. Test Madam)
- **Evening Shift**: 4 PM - 12 AM (Dr. Sarah Ashar)
- **Automatic Assignment**: Based on current time
- **Fallback Mechanism**: Default doctors if no active shifts

#### Real-time Consultation
- **Chat Interface**: Text messages, image sharing, file attachments
- **Video Consultation**: Integration with video calling platforms
- **Doctor Actions**:
  - Review AI diagnosis and patient symptoms
  - Conduct consultation via chat/video
  - Add investigations and notes
  - Prescribe medications
  - Provide final diagnosis
  - Set follow-up requirements

### Phase 5: Completion and Follow-up

#### Endpoint: `PATCH /api/v1/consultations/:id/investigations`
- **Purpose**: Doctor adds final diagnosis, prescriptions, and investigations
- **Process**:
  1. Validate doctor permissions
  2. Update consultation with final medical information
  3. Generate prescription documents
  4. Set follow-up appointments if needed
  5. Mark consultation as `COMPLETED`
  6. Trigger post-consultation workflows (prescriptions, follow-up reminders)

## AI Integration Architecture

### AI Agent Service Integration
- **Service URL**: `http://localhost:8000` (configurable)
- **Authentication**: Hybrid model (API Key + JWT Token)
- **Request Format**: Compatible with tenderly-ai-agent schema
- **Response Processing**: Structured medical recommendations
- **Caching**: 1-hour cache for repeated symptom patterns
- **Fallback**: Local diagnosis rules when AI service unavailable

### AI Authentication Flow
```typescript
// Primary: API Key authentication
headers: {
  'Authorization': `Bearer ${jwtToken}`,
  'X-API-Key': apiKey,
  'Content-Type': 'application/json'
}

// JWT Token generation for service-to-service auth
const token = jwt.sign({
  sub: serviceName,
  iat: Date.now(),
  exp: Date.now() + tokenExpiry,
  aud: 'tenderly-ai-agent',
  iss: 'tenderly-backend'
}, secretKey);
```

## Data Storage and Security

### Data Encryption
- **Medical Data**: Encrypted at field level using `@Encrypt()` decorator
- **Encryption Key**: 32-character key from environment variables
- **Algorithm**: AES-256-GCM for sensitive medical information

### Database Indexes
```typescript
// Performance optimization indexes
consultationSchema.index({ patientId: 1, createdAt: -1 });
consultationSchema.index({ doctorId: 1, createdAt: -1 });
consultationSchema.index({ sessionId: 1 }, { unique: true });
consultationSchema.index({ status: 1 });
consultationSchema.index({ parentConsultationId: 1 });
```

### Caching Strategy
- **Consultation Data**: 5-minute cache for patient consultations
- **AI Diagnosis**: 1-hour cache for symptom patterns
- **Doctor Assignments**: 30-minute cache for active doctor lookup
- **Payment Status**: 15-minute cache for payment verification

### Audit Logging
- **User Actions**: Every consultation creation, update, completion
- **AI Requests**: All symptom collections and diagnosis requests
- **Payment Events**: Payment creation, completion, failure
- **Data Access**: Patient data viewing, medical record access
- **System Events**: Doctor assignments, shift changes

## API Endpoints Summary

### Public Endpoints
- `GET /api/v1/consultations/health` - Service health check
- `GET /api/v1/consultations/ai-service/health` - AI service health check

### Patient Endpoints (JWT Required, Patient Role)
- `POST /api/v1/consultations/symptoms/collect` - AI symptom collection
- `POST /api/v1/consultations/symptoms/collect_detailed_symptoms` - Detailed symptom collection
- `POST /api/v1/consultations/select-consultation` - Select consultation type
- `POST /api/v1/consultations/confirm-payment` - Confirm payment
- `POST /api/v1/consultations/mock-payment/:sessionId` - Mock payment (testing)
- `GET /api/v1/consultations/patient/:patientId` - Patient's consultations
- `GET /api/v1/consultations/:id` - Specific consultation details

### Doctor/Admin Endpoints (Healthcare Provider Role)
- `POST /api/v1/consultations` - Create consultation
- `PATCH /api/v1/consultations/:id` - Update consultation
- `DELETE /api/v1/consultations/:id` - Cancel consultation
- `PATCH /api/v1/consultations/:id/investigations` - Add doctor investigations

### Doctor Shift Management
- `POST /api/v1/doctor-shifts` - Create/update shifts
- `GET /api/v1/doctor-shifts` - Get all shifts
- `GET /api/v1/doctor-shifts/current-doctor` - Get current active doctor
- `PATCH /api/v1/doctor-shifts/:shiftType/status` - Update shift status

## Configuration

### Environment Variables
```bash
# AI Diagnosis Service
AI_DIAGNOSIS_URL=http://localhost:8000
AI_DIAGNOSIS_API_KEY=your-api-key-here
AI_DIAGNOSIS_SECRET_KEY=shared-jwt-secret-key
AI_SERVICE_NAME=tenderly-backend
AI_DIAGNOSIS_TIMEOUT=30000
AI_DIAGNOSIS_TOKEN_EXPIRY=3600

# Database
MONGODB_URI=mongodb://localhost:27017/tenderly

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_KEY_PREFIX=tenderly:

# Security
JWT_SECRET=your-super-secret-jwt-key
DATA_ENCRYPTION_KEY=your-32-character-encryption-key

# Features
FEATURE_AI_DIAGNOSIS=true
FEATURE_VIDEO_CONSULTATION=true
```

## Performance Characteristics

### Response Times
- **Symptom Collection**: ~2-5 seconds (including AI processing)
- **Payment Processing**: ~500ms (mock gateway)
- **Consultation Creation**: ~300ms (with caching)
- **Doctor Assignment**: ~100ms (cached lookup)

### Scalability Features
- **Horizontal Scaling**: Stateless service design
- **Database Scaling**: MongoDB with proper indexing
- **Cache Layer**: Redis for frequently accessed data
- **AI Service**: External microservice for AI processing
- **Load Balancing**: Ready for multiple instance deployment

## Monitoring and Observability

### Health Checks
- **Service Health**: `/api/v1/consultations/health`
- **AI Service Health**: `/api/v1/consultations/ai-service/health`
- **Database Connectivity**: MongoDB connection status
- **Cache Status**: Redis connectivity and performance

### Metrics Tracked
- **Consultation Volume**: Daily/hourly consultation counts
- **AI Performance**: Response times and success rates
- **Payment Success**: Payment completion rates
- **Doctor Utilization**: Consultation load per doctor
- **System Performance**: API response times and error rates

## Security Features

### Authentication & Authorization
- **JWT-based Authentication**: Secure user sessions
- **Role-based Access Control**: Patient, Doctor, Admin roles
- **API Rate Limiting**: Throttling for DoS protection
- **Session Management**: Secure session tracking

### Data Protection
- **Field-level Encryption**: Medical data encryption
- **Audit Trails**: Comprehensive logging
- **Data Retention**: Configurable retention policies
- **GDPR Compliance**: Privacy controls and data portability

### Network Security
- **CORS Configuration**: Controlled cross-origin access
- **API Validation**: Input validation and sanitization
- **Service-to-Service Auth**: JWT tokens for AI service
- **TLS/SSL**: Encrypted communication (production)

## Future Enhancements

### Planned Features
1. **Real-time Chat**: WebSocket integration for live messaging
2. **Video Calling**: WebRTC integration for video consultations  
3. **Prescription Management**: Digital prescription generation
4. **Payment Gateway**: Real payment processor integration
5. **SMS/WhatsApp**: Notification integration
6. **Mobile App**: React Native mobile application
7. **Telemedicine**: Advanced telehealth features
8. **ML Improvements**: Enhanced AI diagnosis accuracy

### Technical Improvements
1. **Microservices**: Split into dedicated services
2. **Event Sourcing**: Event-driven architecture
3. **Advanced Caching**: Multi-level caching strategy
4. **Real-time Analytics**: Live monitoring dashboard
5. **Auto-scaling**: Kubernetes deployment
6. **API Gateway**: Centralized API management
7. **Service Mesh**: Inter-service communication
8. **Data Warehousing**: Analytics and reporting

## Testing Strategy

### Unit Testing
- Service method testing with mocks
- DTO validation testing
- Database operation testing
- Cache layer testing

### Integration Testing
- End-to-end workflow testing
- AI service integration testing
- Payment flow testing
- Authentication testing

### Load Testing
- High-volume consultation simulation
- Concurrent user testing
- Database performance testing
- Cache performance testing

This comprehensive system provides a robust foundation for modern telehealth consultations with AI-powered diagnosis, secure payment processing, and efficient doctor-patient communication.
