# Tenderly Consultation Workflow - Detailed Guide

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Detailed Workflow Steps](#detailed-workflow-steps)
3. [Data Flow and State Management](#data-flow-and-state-management)
4. [API Endpoints Documentation](#api-endpoints-documentation)
5. [Postman Collection](#postman-collection)
6. [Testing Scenarios](#testing-scenarios)
7. [Error Handling](#error-handling)

## System Architecture Overview

### Key Components
- **Authentication Module**: Handles user registration, login, and JWT token management
- **Consultation Module**: Manages the entire consultation workflow
- **AI Agent Service**: Provides AI-powered diagnosis and recommendations
- **Payment Service**: Handles payment processing (mock implementation)
- **Doctor Shift Service**: Manages doctor availability and assignment
- **Cache Service**: Redis-based caching for performance
- **Audit Service**: Comprehensive logging and monitoring

### Data Storage
- **MongoDB**: Permanent storage for consultations, users, and doctor shifts
- **Redis**: Temporary storage for session data, caching, and payment states
- **Temporary Storage**: Session-based data with TTL for workflow progression

## Detailed Workflow Steps

### Phase 1: User Authentication and Setup

#### Step 1.1: User Registration
**Endpoint**: `POST /api/v1/auth/register`

**Flow**:
1. User provides registration details (email, password, role, etc.)
2. System validates input and checks for existing users
3. Password is hashed using bcrypt
4. User account is created in MongoDB
5. JWT tokens are generated
6. MFA is set up if required for healthcare providers

**Key Data**:
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "roles": ["patient"]
}
```

#### Step 1.2: User Login
**Endpoint**: `POST /api/v1/auth/login`

**Flow**:
1. User submits credentials
2. System validates email/password
3. MFA verification if required
4. JWT access token (15 min) and refresh token (7 days) generated
5. Session created in Redis with unique session ID
6. User profile and permissions loaded

### Phase 2: Symptom Collection and AI Analysis

#### Step 2.1: Symptom Collection
**Endpoint**: `POST /api/v1/consultations/symptoms/collect`

**Flow**:
1. **Input Validation**: Patient submits symptoms using `SymptomInputDto`
2. **Session Creation**: Unique session ID generated (`symptoms_{patientId}_{timestamp}`)
3. **Temporary Storage**: Symptoms stored in Redis with 1-hour TTL
4. **AI Processing**: Symptoms sent to AI Agent Service for analysis
5. **AI Diagnosis**: AI returns diagnosis, severity, and consultation recommendation
6. **Pricing Calculation**: Payment service calculates consultation cost
7. **Audit Logging**: All actions logged for compliance
8. **Response Generation**: Client receives session ID and recommendations

**Session Data Structure**:
```json
{
  "sessionId": "symptoms_userId_1642683943000",
  "patientId": "userId",
  "symptoms": {
    "primarySymptom": ["headache", "nausea"],
    "duration": "2 days",
    "severity": "moderate",
    "additionalSymptoms": ["fatigue"],
    "triggers": ["stress"],
    "previousTreatments": ["rest"],
    "medicalHistory": {
      "allergies": ["penicillin"],
      "currentMedications": ["ibuprofen"],
      "chronicConditions": [],
      "previousSurgeries": [],
      "familyHistory": ["diabetes"]
    }
  },
  "collectedAt": "2024-01-20T10:32:23.000Z"
}
```

**AI Diagnosis Process**:
1. **Symptom Analysis**: AI analyzes symptoms using medical knowledge base
2. **Risk Assessment**: Determines severity (low/medium/high/critical)
3. **Recommendation Engine**: Suggests consultation type (chat/video/emergency)
4. **Confidence Scoring**: Provides confidence level (0-1)
5. **Caching**: Results cached for 1 hour to prevent duplicate processing

**Response Structure**:
```json
{
  "sessionId": "symptoms_userId_1642683943000",
  "diagnosis": "Tension headache with associated symptoms",
  "severity": "medium",
  "recommendedConsultationType": "video",
  "consultationPricing": {
    "amount": 499,
    "currency": "INR"
  },
  "message": "Symptoms collected and diagnosis generated successfully"
}
```

### Phase 3: Consultation Selection and Payment

#### Step 3.1: Consultation Type Selection
**Endpoint**: `POST /api/v1/consultations/select-consultation`

**Flow**:
1. **Session Retrieval**: System fetches stored symptom data using session ID
2. **Validation**: Verifies patient identity and session validity
3. **Type Selection**: Patient selects consultation type (chat/video/emergency)
4. **Payment Order Creation**: Payment service creates order with pricing
5. **Extended Storage**: Updated session data stored with payment details
6. **Payment Response**: Client receives payment URL and order details

**Payment Order Process**:
1. **Pricing Lookup**: Consultation type mapped to pricing (₹299/₹499/₹799)
2. **Payment ID Generation**: Unique payment ID created
3. **Payment URL**: Mock payment gateway URL generated
4. **Expiry Setting**: 15-minute expiry for payment completion
5. **Cache Storage**: Payment details cached in Redis
6. **Audit Logging**: Payment creation logged

**Extended Session Data**:
```json
{
  "sessionId": "symptoms_userId_1642683943000",
  "patientId": "userId",
  "symptoms": {...},
  "aiDiagnosis": {...},
  "selectedConsultationType": "video",
  "paymentDetails": {
    "paymentId": "mock_pay_1642683943000_abc123",
    "paymentUrl": "http://localhost:3000/mock-payment/mock_pay_1642683943000_abc123",
    "amount": 499,
    "currency": "INR",
    "status": "pending",
    "expiresAt": "2024-01-20T11:47:23.000Z"
  },
  "selectedAt": "2024-01-20T10:32:23.000Z"
}
```

#### Step 3.2: Payment Processing
**Endpoint**: `POST /api/v1/consultations/confirm-payment`

**Flow**:
1. **Payment Verification**: System verifies payment status with gateway
2. **Session Validation**: Ensures payment matches session data
3. **Status Check**: Confirms payment completion
4. **Doctor Assignment**: Active doctor assigned based on shift schedule
5. **Consultation Creation**: Permanent consultation record created in MongoDB
6. **Cleanup**: Temporary session data cleared from Redis
7. **Confirmation**: Client receives consultation details

**Doctor Assignment Logic**:
1. **Shift Lookup**: Current time matched against doctor shifts
2. **Availability Check**: Active doctor found for current hour
3. **Fallback Assignment**: Default doctors assigned if no active shift
4. **Caching**: Doctor assignment cached for 30 minutes

**Consultation Creation Data**:
```json
{
  "patientId": "userId",
  "sessionId": "symptoms_userId_1642683943000",
  "consultationType": "video",
  "doctorId": "doctorId",
  "status": "doctor_assigned",
  "initialSymptoms": {...},
  "aiDiagnosis": {...},
  "paymentInfo": {
    "amount": 499,
    "currency": "INR",
    "paymentId": "mock_pay_1642683943000_abc123",
    "status": "payment_completed",
    "paidAt": "2024-01-20T10:47:23.000Z"
  },
  "metadata": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "location": "Mumbai, India",
    "deviceInfo": "Chrome on Windows"
  }
}
```

### Phase 4: Doctor Interaction and Diagnosis

#### Step 4.1: Doctor Reviews Case
**Endpoint**: `GET /api/v1/consultations/:id`

**Flow**:
1. **Access Control**: Doctor's identity verified against assigned consultation
2. **Case Retrieval**: Full consultation details fetched from MongoDB
3. **Patient History**: Previous consultations and medical history loaded
4. **AI Insights**: Preliminary AI diagnosis and recommendations displayed

#### Step 4.2: Doctor Adds Investigations
**Endpoint**: `PATCH /api/v1/consultations/:id/investigations`

**Flow**:
1. **Authorization**: Doctor's assignment to consultation verified
2. **Investigation Input**: Doctor adds clinical observations and assessments
3. **Status Updates**: Consultation status updated based on progress
4. **Final Diagnosis**: Complete diagnosis and treatment plan recorded
5. **Completion**: Consultation marked as completed if diagnosis is final

**Investigation Data Structure**:
```json
{
  "investigations": [
    {
      "testName": "Blood Pressure Check",
      "testType": "vitals",
      "instructions": "Check BP in sitting position",
      "urgency": "normal",
      "orderedAt": "2024-01-20T11:00:00.000Z"
    }
  ],
  "clinicalNotes": {
    "observations": "Patient presents with classic tension headache symptoms",
    "assessment": "Tension headache likely due to stress and poor sleep",
    "plan": "Recommend rest, stress management, and follow-up in 1 week",
    "followUpInstructions": "Return if symptoms worsen or persist beyond 1 week",
    "doctorId": "doctorId",
    "updatedAt": "2024-01-20T11:00:00.000Z"
  }
}
```

### Phase 5: Completion and Follow-up

#### Step 5.1: Consultation Completion
**Flow**:
1. **Final Diagnosis**: Doctor provides complete diagnosis and treatment plan
2. **Prescription Generation**: Medications and dosages specified
3. **Follow-up Scheduling**: Next appointment scheduled if required
4. **Status Update**: Consultation marked as completed
5. **Notifications**: Patient notified of completion
6. **Billing**: Final billing processed and recorded

#### Step 5.2: Follow-up Management
**Flow**:
1. **Follow-up Creation**: New consultation linked to parent consultation
2. **History Transfer**: Previous consultation data referenced
3. **Continuity**: Seamless care continuation maintained

## Data Flow and State Management

### Session State Progression
```
1. symptoms_collection -> Temporary storage (1 hour TTL)
2. consultation_selection -> Extended storage with payment
3. payment_confirmation -> Permanent consultation creation
4. doctor_assignment -> Active consultation
5. investigation_phase -> Ongoing treatment
6. completion -> Archived consultation
```

### Cache Management
- **Symptom Sessions**: 1-hour TTL for symptom collection
- **Payment Sessions**: 24-hour TTL for payment processing
- **Doctor Assignments**: 30-minute TTL for active doctor caching
- **Consultation Cache**: 10-minute TTL for frequently accessed consultations

### Database Schema
- **Users**: Patient and doctor profiles
- **Consultations**: Complete consultation records
- **DoctorShifts**: Doctor availability schedules
- **AuditLogs**: Comprehensive activity logging

## API Endpoints Documentation

### Authentication Endpoints
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Token refresh
- `GET /auth/me` - User profile

### Consultation Endpoints
- `POST /consultations/symptoms/collect` - Collect symptoms
- `POST /consultations/select-consultation` - Select consultation type
- `POST /consultations/confirm-payment` - Confirm payment
- `POST /consultations/mock-payment/:sessionId` - Mock payment (testing)
- `GET /consultations/:id` - Get consultation details
- `PATCH /consultations/:id/investigations` - Add investigations
- `GET /consultations/patient/:patientId` - Get patient consultations

### Doctor Shift Endpoints
- `GET /doctor-shifts/current-doctor` - Get current active doctor
- `POST /doctor-shifts` - Create/update shift
- `GET /doctor-shifts` - List all shifts

## Postman Collection

### Environment Variables
```json
{
  "baseUrl": "http://localhost:3000/api/v1",
  "accessToken": "",
  "refreshToken": "",
  "sessionId": "",
  "paymentId": "",
  "consultationId": "",
  "patientId": "",
  "doctorId": ""
}
```

### Pre-request Script (for token management)
```javascript
// Auto-save tokens from login/register responses
pm.test("Save authentication tokens", function () {
    const responseJson = pm.response.json();
    if (responseJson.accessToken) {
        pm.environment.set("accessToken", responseJson.accessToken);
    }
    if (responseJson.refreshToken) {
        pm.environment.set("refreshToken", responseJson.refreshToken);
    }
    if (responseJson.user && responseJson.user.id) {
        pm.environment.set("patientId", responseJson.user.id);
    }
});

// Auto-save session data
pm.test("Save session data", function () {
    const responseJson = pm.response.json();
    if (responseJson.sessionId) {
        pm.environment.set("sessionId", responseJson.sessionId);
    }
    if (responseJson.paymentDetails && responseJson.paymentDetails.paymentId) {
        pm.environment.set("paymentId", responseJson.paymentDetails.paymentId);
    }
    if (responseJson.consultation && responseJson.consultation._id) {
        pm.environment.set("consultationId", responseJson.consultation._id);
    }
});
```

### Test Scripts
```javascript
// Standard response validation
pm.test("Status code is 200 or 201", function () {
    pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

pm.test("Response time is less than 2000ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});

pm.test("Response has no errors", function () {
    const responseJson = pm.response.json();
    pm.expect(responseJson.error).to.be.undefined;
});
```

## Complete Postman Collection JSON

```json
{
  "info": {
    "name": "Tenderly Consultation Workflow",
    "description": "Complete workflow testing for Tenderly consultation system",
    "version": "1.0.0"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api/v1",
      "type": "string"
    },
    {
      "key": "accessToken",
      "value": "",
      "type": "string"
    },
    {
      "key": "refreshToken",
      "value": "",
      "type": "string"
    },
    {
      "key": "sessionId",
      "value": "",
      "type": "string"
    },
    {
      "key": "paymentId",
      "value": "",
      "type": "string"
    },
    {
      "key": "consultationId",
      "value": "",
      "type": "string"
    },
    {
      "key": "patientId",
      "value": "",
      "type": "string"
    },
    {
      "key": "doctorId",
      "value": "",
      "type": "string"
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{accessToken}}",
        "type": "string"
      }
    ]
  },
  "item": [
    {
      "name": "1. Authentication",
      "item": [
        {
          "name": "Register Patient",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "",
                  "pm.test(\"Save authentication tokens\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.accessToken) {",
                  "        pm.environment.set(\"accessToken\", responseJson.accessToken);",
                  "    }",
                  "    if (responseJson.refreshToken) {",
                  "        pm.environment.set(\"refreshToken\", responseJson.refreshToken);",
                  "    }",
                  "    if (responseJson.user && responseJson.user.id) {",
                  "        pm.environment.set(\"patientId\", responseJson.user.id);",
                  "    }",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"patient@example.com\",\n  \"password\": \"SecurePass123!\",\n  \"firstName\": \"John\",\n  \"lastName\": \"Doe\",\n  \"phone\": \"+1234567890\",\n  \"roles\": [\"patient\"]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/auth/register",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "auth",
                "register"
              ]
            }
          }
        },
        {
          "name": "Login Patient",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Save authentication tokens\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.accessToken) {",
                  "        pm.environment.set(\"accessToken\", responseJson.accessToken);",
                  "    }",
                  "    if (responseJson.refreshToken) {",
                  "        pm.environment.set(\"refreshToken\", responseJson.refreshToken);",
                  "    }",
                  "    if (responseJson.user && responseJson.user.id) {",
                  "        pm.environment.set(\"patientId\", responseJson.user.id);",
                  "    }",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"patient@example.com\",\n  \"password\": \"SecurePass123!\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/auth/login",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "auth",
                "login"
              ]
            }
          }
        },
        {
          "name": "Get User Profile",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"User profile retrieved\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('email');",
                  "    pm.expect(responseJson).to.have.property('firstName');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/auth/me",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "auth",
                "me"
              ]
            }
          }
        }
      ]
    },
    {
      "name": "2. Consultation Workflow",
      "item": [
        {
          "name": "Collect Symptoms",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "",
                  "pm.test(\"Save session data\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.sessionId) {",
                  "        pm.environment.set(\"sessionId\", responseJson.sessionId);",
                  "    }",
                  "});",
                  "",
                  "pm.test(\"Response contains required fields\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('sessionId');",
                  "    pm.expect(responseJson).to.have.property('diagnosis');",
                  "    pm.expect(responseJson).to.have.property('severity');",
                  "    pm.expect(responseJson).to.have.property('consultationPricing');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"primarySymptom\": [\"headache\", \"nausea\"],\n  \"duration\": \"2 days\",\n  \"severity\": \"moderate\",\n  \"additionalSymptoms\": [\"fatigue\"],\n  \"triggers\": [\"stress\", \"lack of sleep\"],\n  \"previousTreatments\": [\"rest\", \"over-the-counter pain relievers\"],\n  \"medicalHistory\": {\n    \"allergies\": [\"penicillin\"],\n    \"currentMedications\": [\"ibuprofen\"],\n    \"chronicConditions\": [],\n    \"previousSurgeries\": [],\n    \"familyHistory\": [\"diabetes\", \"hypertension\"]\n  }\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/consultations/symptoms/collect",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "consultations",
                "symptoms",
                "collect"
              ]
            }
          }
        },
        {
          "name": "Select Consultation Type",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "",
                  "pm.test(\"Save payment data\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.paymentDetails && responseJson.paymentDetails.paymentId) {",
                  "        pm.environment.set(\"paymentId\", responseJson.paymentDetails.paymentId);",
                  "    }",
                  "});",
                  "",
                  "pm.test(\"Response contains payment details\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('paymentDetails');",
                  "    pm.expect(responseJson.paymentDetails).to.have.property('paymentId');",
                  "    pm.expect(responseJson.paymentDetails).to.have.property('paymentUrl');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"sessionId\": \"{{sessionId}}\",\n  \"selectedConsultationType\": \"video\",\n  \"preferences\": {\n    \"urgency\": \"normal\",\n    \"additionalNotes\": \"Prefer evening appointment\"\n  }\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/consultations/select-consultation",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "consultations",
                "select-consultation"
              ]
            }
          }
        },
        {
          "name": "Mock Payment Completion",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "",
                  "pm.test(\"Save consultation data\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.consultation && responseJson.consultation._id) {",
                  "        pm.environment.set(\"consultationId\", responseJson.consultation._id);",
                  "    }",
                  "});",
                  "",
                  "pm.test(\"Payment completed successfully\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('success');",
                  "    pm.expect(responseJson.success).to.be.true;",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"success\": true\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/consultations/mock-payment/{{sessionId}}",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "consultations",
                "mock-payment",
                "{{sessionId}}"
              ]
            }
          }
        },
        {
          "name": "Get Consultation Details",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Consultation details retrieved\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('_id');",
                  "    pm.expect(responseJson).to.have.property('patientId');",
                  "    pm.expect(responseJson).to.have.property('status');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/consultations/{{consultationId}}",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "consultations",
                "{{consultationId}}"
              ]
            }
          }
        }
      ]
    },
    {
      "name": "3. Doctor Workflow",
      "item": [
        {
          "name": "Register Doctor",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200 or 201\", function () {",
                  "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
                  "});",
                  "",
                  "pm.test(\"Save doctor tokens\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.accessToken) {",
                  "        pm.environment.set(\"doctorAccessToken\", responseJson.accessToken);",
                  "    }",
                  "    if (responseJson.user && responseJson.user.id) {",
                  "        pm.environment.set(\"doctorId\", responseJson.user.id);",
                  "    }",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"doctor@example.com\",\n  \"password\": \"SecurePass123!\",\n  \"firstName\": \"Dr. Sarah\",\n  \"lastName\": \"Smith\",\n  \"phone\": \"+1234567891\",\n  \"roles\": [\"healthcare_provider\"],\n  \"professionalInfo\": {\n    \"medicalLicenseNumber\": \"MED123456\",\n    \"specialization\": [\"gynecology\", \"obstetrics\"],\n    \"experience\": \"10 years\",\n    \"hospitalAffiliation\": \"City General Hospital\"\n  }\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/auth/register",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "auth",
                "register"
              ]
            }
          }
        },
        {
          "name": "Login Doctor",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Save doctor tokens\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    if (responseJson.accessToken) {",
                  "        pm.environment.set(\"doctorAccessToken\", responseJson.accessToken);",
                  "    }",
                  "    if (responseJson.user && responseJson.user.id) {",
                  "        pm.environment.set(\"doctorId\", responseJson.user.id);",
                  "    }",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"doctor@example.com\",\n  \"password\": \"SecurePass123!\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/auth/login",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "auth",
                "login"
              ]
            }
          }
        },
        {
          "name": "Add Doctor Investigations",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Investigation added successfully\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('consultation');",
                  "    pm.expect(responseJson).to.have.property('message');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "PATCH",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{doctorAccessToken}}",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"investigations\": [\n    {\n      \"testName\": \"Blood Pressure Check\",\n      \"testType\": \"vitals\",\n      \"instructions\": \"Check BP in sitting position after 5 minutes rest\",\n      \"urgency\": \"normal\",\n      \"orderedAt\": \"2024-01-20T11:00:00.000Z\",\n      \"expectedResults\": \"Normal range 120/80 mmHg\"\n    },\n    {\n      \"testName\": \"Complete Blood Count\",\n      \"testType\": \"blood\",\n      \"instructions\": \"Fasting not required\",\n      \"urgency\": \"normal\",\n      \"orderedAt\": \"2024-01-20T11:00:00.000Z\"\n    }\n  ],\n  \"clinicalNotes\": {\n    \"observations\": \"Patient presents with classic tension headache symptoms. Vital signs stable. No neurological deficits observed.\",\n    \"assessment\": \"Tension headache likely due to stress and inadequate sleep. No signs of secondary headache.\",\n    \"plan\": \"1. Recommend stress management techniques\\n2. Ensure adequate sleep (7-8 hours)\\n3. Regular exercise\\n4. Acetaminophen 500mg as needed for pain\\n5. Follow-up in 1 week if symptoms persist\",\n    \"followUpInstructions\": \"Return immediately if experiencing severe headache, vision changes, or neurological symptoms. Otherwise, schedule follow-up in 1 week if symptoms do not improve.\",\n    \"doctorId\": \"{{doctorId}}\",\n    \"updatedAt\": \"2024-01-20T11:00:00.000Z\"\n  }\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/consultations/{{consultationId}}/investigations",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "consultations",
                "{{consultationId}}",
                "investigations"
              ]
            }
          }
        }
      ]
    },
    {
      "name": "4. System Health",
      "item": [
        {
          "name": "General Health Check",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"System is healthy\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('status');",
                  "    pm.expect(responseJson.status).to.equal('ok');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [],
            "url": {
              "raw": "{{baseUrl}}/health",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "health"
              ]
            }
          }
        },
        {
          "name": "Doctor Shifts Health",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Service is healthy\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('status');",
                  "    pm.expect(responseJson.status).to.equal('healthy');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/doctor-shifts/health",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "doctor-shifts",
                "health"
              ]
            }
          }
        },
        {
          "name": "Get Current Doctor",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Status code is 200\", function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "pm.test(\"Active doctor found\", function () {",
                  "    const responseJson = pm.response.json();",
                  "    pm.expect(responseJson).to.have.property('activeDoctorId');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}",
                "type": "text"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/doctor-shifts/current-doctor",
              "host": [
                "{{baseUrl}}"
              ],
              "path": [
                "doctor-shifts",
                "current-doctor"
              ]
            }
          }
        }
      ]
    }
  ]
}
```

## Testing Scenarios

### Happy Path Testing
1. **Complete Patient Journey**:
   - Register patient → Login → Collect symptoms → Select consultation → Pay → Doctor reviews → Complete

2. **Doctor Workflow**:
   - Register doctor → Login → Review assigned consultation → Add investigations → Complete consultation

### Error Scenarios
1. **Invalid Authentication**: Test with expired/invalid tokens
2. **Session Expiry**: Test with expired session IDs
3. **Payment Failures**: Test payment verification failures
4. **Doctor Unavailability**: Test when no doctor is available
5. **Invalid Symptoms**: Test with malformed symptom data

### Load Testing
- **Concurrent Users**: Multiple patients collecting symptoms simultaneously
- **Doctor Assignment**: Multiple consultations requiring doctor assignment
- **Cache Performance**: Test Redis cache under load

## Error Handling

### Common Error Responses
```json
{
  "statusCode": 400,
  "message": "Invalid session or patient mismatch",
  "error": "Bad Request"
}
```

### Error Categories
1. **Authentication Errors**: 401 Unauthorized
2. **Authorization Errors**: 403 Forbidden
3. **Validation Errors**: 400 Bad Request
4. **Not Found Errors**: 404 Not Found
5. **Server Errors**: 500 Internal Server Error

### Retry Logic
- **Payment Verification**: Automatic retry with exponential backoff
- **Doctor Assignment**: Fallback to default doctors
- **AI Diagnosis**: Fallback to simple rule-based diagnosis

This comprehensive guide provides everything needed to understand and test the Tenderly consultation workflow. The Postman collection includes all necessary requests with proper authentication, error handling, and response validation.
