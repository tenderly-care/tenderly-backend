# Structured Gynecological Assessment Endpoint

## Overview

The `/consultations/symptoms/collect-structured` endpoint provides a comprehensive gynecological assessment system that collects detailed patient information and generates AI-powered structured diagnoses. This endpoint is designed to work with the tenderly-ai-agent service for advanced medical analysis.

## Endpoint Details

**URL**: `POST /api/v1/consultations/symptoms/collect-structured`  
**Authentication**: JWT Bearer token (Patient role only)  
**Content-Type**: `application/json`  
**Timeout**: 30 seconds

## Request Schema

The endpoint accepts a `GynecologicalAssessmentDto` that matches the tenderly-ai-agent schema exactly:

```typescript
{
  patient_profile: {
    age: number;           // 10-100 years
    request_id: string;    // Patient identifier
    timestamp: string;     // ISO 8601 format
  };
  primary_complaint: {
    main_symptom: string;
    duration: string;
    severity: 'mild' | 'moderate' | 'severe';
    onset: string;
    progression: string;
  };
  symptom_specific_details: {
    symptom_characteristics: Record<string, any>;
  };
  reproductive_history: {
    pregnancy_status: {
      could_be_pregnant: boolean;
      pregnancy_test_result: string;
    };
    sexual_activity: {
      sexually_active: boolean;
      contraception_method: string;
    };
    menstrual_history: {
      menarche_age: number;      // 8-20 years
      cycle_frequency: number;   // Days
      period_duration: number;   // Days
    };
  };
  associated_symptoms: {
    pain: {
      pelvic_pain?: string;
      vulvar_irritation?: string;
    };
    systemic: {
      fatigue?: string;
      nausea?: boolean;
      fever?: boolean;
    };
  };
  medical_context: {
    current_medications: string[];
    recent_medications: string[];
    medical_conditions: string[];
    previous_gynecological_issues: string[];
    allergies: string[];
    family_history: string[];
  };
  healthcare_interaction: {
    previous_consultation: boolean;
    consultation_outcome: string;
    investigations_done: boolean;
    current_treatment: string;
  };
  patient_concerns: {
    main_worry: string;
    impact_on_life: string;
    additional_notes: string;
  };
}
```

## Example Request

```json
{
  "patient_profile": {
    "age": 25,
    "request_id": "patient_123",
    "timestamp": "2025-01-28T10:30:00Z"
  },
  "primary_complaint": {
    "main_symptom": "irregular periods",
    "duration": "3 months",
    "severity": "moderate",
    "onset": "gradual",
    "progression": "stable"
  },
  "symptom_specific_details": {
    "symptom_characteristics": {
      "cycle_length_range": "21–45 days",
      "bleeding_duration_variability": "2–10 days",
      "bleeding_intensity": "sometimes heavy",
      "bleeding_between_periods": true,
      "skipped_periods": "twice in last 6 months",
      "associated_symptoms": [
        "severe cramps",
        "fatigue",
        "mood swings"
      ],
      "recent_weight_changes": false,
      "known_causes": "none identified"
    }
  },
  "reproductive_history": {
    "pregnancy_status": {
      "could_be_pregnant": false,
      "pregnancy_test_result": "negative"
    },
    "sexual_activity": {
      "sexually_active": true,
      "contraception_method": "condoms"
    },
    "menstrual_history": {
      "menarche_age": 12,
      "cycle_frequency": 28,
      "period_duration": 5
    }
  },
  "associated_symptoms": {
    "pain": {
      "pelvic_pain": "mild",
      "vulvar_irritation": "none"
    },
    "systemic": {
      "fatigue": "moderate",
      "nausea": false,
      "fever": false
    }
  },
  "medical_context": {
    "current_medications": [],
    "recent_medications": [],
    "medical_conditions": ["diabetes"],
    "previous_gynecological_issues": [],
    "allergies": ["penicillin"],
    "family_history": []
  },
  "healthcare_interaction": {
    "previous_consultation": true,
    "consultation_outcome": "inconclusive",
    "investigations_done": false,
    "current_treatment": "none"
  },
  "patient_concerns": {
    "main_worry": "fertility issues due to irregular periods",
    "impact_on_life": "moderate",
    "additional_notes": "Concerned about ability to conceive"
  }
}
```

## Response Schema

The endpoint returns a `StructuredDiagnosisResponseDto` with comprehensive medical analysis:

```typescript
{
  request_id: string;
  patient_age: number;
  primary_symptom: string;
  possible_diagnoses: Array<{
    name: string;
    confidence_score: number;
    description?: string;
  }>;
  clinical_reasoning: string;
  differential_considerations: string[];
  safety_assessment: {
    allergy_considerations: {
      allergic_medications: string[];
      safe_alternatives: string[];
      contraindicated_drugs: string[];
    };
    condition_interactions: string[];
    safety_warnings: string[];
  };
  risk_assessment: {
    urgency_level: 'low' | 'moderate' | 'high' | 'urgent';
    red_flags: string[];
    when_to_seek_emergency_care: string[];
  };
  recommended_investigations: Array<{
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }>;
  treatment_recommendations: {
    primary_treatment?: string;
    safe_medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      reason: string;
      notes?: string;
    }>;
    lifestyle_modifications: string[];
    dietary_advice: string[];
    follow_up_timeline: string;
  };
  patient_education: string[];
  warning_signs: string[];
  confidence_score: number;
  processing_notes: string[];
  disclaimer: string;
  timestamp: string;
  sessionId: string;
  consultationPricing: {
    amount: number;
    currency: string;
  };
}
```

## Example Response

```json
{
  "request_id": "patient_123",
  "patient_age": 25,
  "primary_symptom": "irregular periods",
  "possible_diagnoses": [
    {
      "name": "Polycystic Ovary Syndrome (PCOS)",
      "confidence_score": 0.75,
      "description": "Based on irregular periods, associated symptoms, and medical history"
    },
    {
      "name": "Hormonal imbalance",
      "confidence_score": 0.65,
      "description": "Secondary consideration given symptoms and age"
    }
  ],
  "clinical_reasoning": "The patient presents with irregular periods lasting 3 months, with associated symptoms including severe cramps, fatigue, and mood swings. The menstrual history shows variable cycle lengths (21-45 days) and the patient has diabetes, which can affect hormonal regulation. These findings suggest possible PCOS or hormonal imbalance.",
  "differential_considerations": [
    "Polycystic Ovary Syndrome (PCOS)",
    "Hormonal imbalance",
    "Thyroid disorders",
    "Stress-related amenorrhea",
    "Early perimenopause"
  ],
  "safety_assessment": {
    "allergy_considerations": {
      "allergic_medications": ["penicillin"],
      "safe_alternatives": ["metformin", "spironolactone"],
      "contraindicated_drugs": ["penicillin-based antibiotics"]
    },
    "condition_interactions": [
      "Diabetes may affect hormonal regulation",
      "Consider blood sugar monitoring with hormonal treatments"
    ],
    "safety_warnings": [
      "Avoid self-medication without medical supervision",
      "Monitor blood sugar if hormonal treatment is prescribed"
    ]
  },
  "risk_assessment": {
    "urgency_level": "moderate",
    "red_flags": [
      "Severe pelvic pain",
      "Heavy bleeding",
      "Fever with symptoms"
    ],
    "when_to_seek_emergency_care": [
      "Severe pain that doesn't improve",
      "Heavy bleeding with dizziness",
      "Fever above 100.4°F with symptoms"
    ]
  },
  "recommended_investigations": [
    {
      "name": "Hormonal profile (FSH, LH, Testosterone)",
      "priority": "high",
      "reason": "To assess hormonal balance and rule out PCOS"
    },
    {
      "name": "Pelvic ultrasound",
      "priority": "medium",
      "reason": "To evaluate ovarian structure and rule out other conditions"
    },
    {
      "name": "Thyroid function tests",
      "priority": "medium",
      "reason": "To rule out thyroid disorders affecting menstrual cycle"
    }
  ],
  "treatment_recommendations": {
    "primary_treatment": "Hormonal regulation and lifestyle modifications",
    "safe_medications": [
      {
        "name": "Metformin",
        "dosage": "500mg",
        "frequency": "twice daily",
        "duration": "3-6 months",
        "reason": "To improve insulin sensitivity and regulate hormones",
        "notes": "Monitor blood sugar closely due to diabetes"
      }
    ],
    "lifestyle_modifications": [
      "Regular exercise (30 minutes daily)",
      "Balanced diet with low glycemic index foods",
      "Stress management techniques",
      "Maintain healthy weight"
    ],
    "dietary_advice": [
      "Increase fiber intake",
      "Reduce refined carbohydrates",
      "Include omega-3 rich foods",
      "Stay hydrated"
    ],
    "follow_up_timeline": "2-3 months for reassessment"
  },
  "patient_education": [
    "PCOS is a common hormonal disorder affecting 1 in 10 women",
    "Lifestyle changes can significantly improve symptoms",
    "Regular monitoring is important for long-term health",
    "Fertility can be managed with proper treatment"
  ],
  "warning_signs": [
    "Severe pain that doesn't improve with rest",
    "Heavy bleeding requiring pad change every hour",
    "Fever above 100.4°F",
    "Dizziness or fainting",
    "Symptoms worsening despite treatment"
  ],
  "confidence_score": 0.75,
  "processing_notes": [
    "Analysis based on comprehensive symptom assessment",
    "Considered patient's medical history and allergies",
    "Recommendations tailored to individual risk factors"
  ],
  "disclaimer": "This is an AI-generated preliminary assessment. Please consult with a healthcare provider for proper medical care. This assessment is based on the information provided and should not replace professional medical advice.",
  "timestamp": "2025-01-28T10:30:00Z",
  "sessionId": "structured_patient123_1703824567890",
  "consultationPricing": {
    "amount": 399,
    "currency": "INR"
  }
}
```

## Workflow

### 1. Request Validation
- Validates patient age (10-100 years)
- Ensures all required fields are present
- Validates data types and formats
- Checks for required nested objects

### 2. Session Management
- Creates a new consultation session
- Generates unique session ID
- Stores session data with 1-hour TTL

### 3. AI Agent Communication
- Transforms request to match AI agent schema
- Sends request to `/api/v1/diagnosis/structure/` endpoint
- Uses JWT authentication with retry logic
- Handles rate limiting and authentication failures

### 4. Response Processing
- Validates AI agent response structure
- Caches response for 1 hour
- Logs audit trail for compliance

### 5. Session Update
- Updates session with diagnosis and pricing
- Stores structured assessment data
- Prepares for next consultation phase

## Error Handling

### Validation Errors (400 Bad Request)
```json
{
  "statusCode": 400,
  "message": "Valid patient age (10-100) is required",
  "error": "Bad Request"
}
```

### Authentication Errors (401 Unauthorized)
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### Service Unavailable (503 Service Unavailable)
```json
{
  "statusCode": 503,
  "message": "Structured diagnosis service temporarily unavailable. Please try again later.",
  "error": "Service Unavailable"
}
```

## Security Features

### Authentication
- JWT Bearer token required
- Patient role validation
- Token expiration handling

### Data Protection
- All medical data encrypted at field level
- Audit logging for compliance
- Session-based data isolation

### Rate Limiting
- 100 requests per minute per user
- Exponential backoff for retries
- Graceful degradation on overload

## Caching Strategy

### Response Caching
- Cache key: `structured-diagnosis:{hash}`
- TTL: 1 hour (3600 seconds)
- Hash based on structured request data

### Session Caching
- Cache key: `consultation_session:{sessionId}`
- TTL: 1 hour
- Stores session state and data

## Database Schema Updates

### Consultation Schema
Added `structuredDiagnosis` field to store comprehensive diagnosis:

```typescript
structuredDiagnosis: {
  request_id: string;
  patient_age: number;
  primary_symptom: string;
  possible_diagnoses: Array<{
    name: string;
    confidence_score: number;
    description?: string;
  }>;
  clinical_reasoning: string;
  differential_considerations: string[];
  safety_assessment: {
    allergy_considerations: {
      allergic_medications: string[];
      safe_alternatives: string[];
      contraindicated_drugs: string[];
    };
    condition_interactions: string[];
    safety_warnings: string[];
  };
  risk_assessment: {
    urgency_level: 'low' | 'moderate' | 'high' | 'urgent';
    red_flags: string[];
    when_to_seek_emergency_care: string[];
  };
  recommended_investigations: Array<{
    name: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }>;
  treatment_recommendations: {
    primary_treatment?: string;
    safe_medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      reason: string;
      notes?: string;
    }>;
    lifestyle_modifications: string[];
    dietary_advice: string[];
    follow_up_timeline: string;
  };
  patient_education: string[];
  warning_signs: string[];
  confidence_score: number;
  processing_notes: string[];
  disclaimer: string;
  timestamp: string;
};
```

## Testing

### Manual Testing
Use the provided test script:

```bash
node test-structured-assessment.js
```

### API Testing
Test with Postman or curl:

```bash
curl -X POST http://localhost:3000/api/v1/consultations/symptoms/collect-structured \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

## Monitoring

### Health Checks
- Endpoint: `GET /api/v1/consultations/ai-service/health`
- Checks AI agent connectivity
- Validates JWT token generation
- Tests authentication flow

### Logging
- Request/response logging
- Error tracking
- Performance metrics
- Audit trail for compliance

## Performance Considerations

### Optimization
- Response caching (1 hour TTL)
- Connection pooling
- Request compression
- Async processing

### Scalability
- Horizontal scaling support
- Load balancing ready
- Database indexing
- Redis caching

## Compliance

### Data Protection
- HIPAA compliance
- GDPR compliance
- NDHM compliance
- Data encryption at rest

### Audit Trail
- All requests logged
- Data access tracking
- User action monitoring
- Compliance reporting

## Integration Points

### AI Agent Service
- Endpoint: `http://localhost:8000/api/v1/diagnosis/structure/`
- Authentication: JWT + API Key
- Timeout: 30 seconds
- Retry: 3 attempts with exponential backoff

### Session Management
- Redis-based session storage
- TTL: 1 hour
- Stateful consultation flow
- Data persistence

### Payment Integration
- Dynamic pricing based on urgency
- Session-based payment flow
- Multiple currency support

## Future Enhancements

### Planned Features
- Multi-language support
- Advanced symptom analysis
- Integration with lab results
- Telemedicine integration
- Mobile app support

### Technical Improvements
- GraphQL API
- Real-time notifications
- Advanced caching strategies
- Machine learning optimization 