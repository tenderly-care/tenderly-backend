# Consultation Management System - Workflow Diagram

## Visual Data Flow

```mermaid
graph TD
    A[Patient Login] --> B[Symptom Collection Form]
    B --> C[POST /symptoms/collect]
    C --> D{Validate Symptoms}
    D -->|Valid| E[Call AI Agent Service]
    D -->|Invalid| F[Return Validation Error]
    E --> G[AI Diagnosis Response]
    G --> H[Cache Diagnosis Result]
    H --> I[Return AI Diagnosis to Patient]
    
    I --> J[Patient Reviews Diagnosis]
    J --> K[POST /select-consultation]
    K --> L{Select Consultation Type}
    L -->|Chat ₹299| M[Create Payment Order]
    L -->|Video ₹499| M
    L -->|Emergency ₹799| M
    
    M --> N[Mock Payment Gateway]
    N --> O[Payment URL Returned]
    O --> P[Patient Completes Payment]
    P --> Q[POST /confirm-payment]
    
    Q --> R{Verify Payment}
    R -->|Success| S[Create Consultation Record]
    R -->|Failed| T[Payment Failed Response]
    
    S --> U[Assign Doctor Based on Shift]
    U --> V[Update Status: DOCTOR_ASSIGNED]
    V --> W[Cache Consultation Data]
    W --> X[Send Notifications]
    
    X --> Y[Doctor Receives Consultation]
    Y --> Z[Doctor Reviews AI Diagnosis]
    Z --> AA[Start Consultation]
    AA --> BB{Consultation Type}
    
    BB -->|Chat| CC[Text Chat Interface]
    BB -->|Video| DD[Video Call Interface]
    BB -->|Emergency| EE[Priority Queue]
    
    CC --> FF[Doctor-Patient Communication]
    DD --> FF
    EE --> FF
    
    FF --> GG[Doctor Analysis]
    GG --> HH[PATCH /investigations]
    HH --> II[Add Final Diagnosis]
    II --> JJ[Prescribe Medications]
    JJ --> KK[Set Follow-up Requirements]
    KK --> LL[Update Status: COMPLETED]
    
    LL --> MM[Generate Prescription]
    MM --> NN[Send Consultation Summary]
    NN --> OO[Schedule Follow-up if Required]
    OO --> PP[Audit Log Complete]
```

## Database State Changes

```mermaid
stateDiagram-v2
    [*] --> PENDING: Patient starts consultation
    PENDING --> PAYMENT_PENDING: Symptoms collected, AI diagnosis done
    PAYMENT_PENDING --> PAYMENT_CONFIRMED: Payment successful
    PAYMENT_PENDING --> CANCELLED: Payment failed/timeout
    PAYMENT_CONFIRMED --> DOCTOR_ASSIGNED: Doctor assigned to consultation
    DOCTOR_ASSIGNED --> IN_PROGRESS: Doctor starts consultation
    IN_PROGRESS --> COMPLETED: Doctor completes diagnosis
    IN_PROGRESS --> CANCELLED: Consultation cancelled
    COMPLETED --> [*]: Consultation finished
    CANCELLED --> REFUNDED: Refund processed
    REFUNDED --> [*]: Process complete
```

## Data Flow Through Services

```mermaid
sequenceDiagram
    participant P as Patient
    participant C as Consultation Controller
    participant CS as Consultation Service
    participant AIS as AI Agent Service
    participant PS as Payment Service
    participant DSS as Doctor Shift Service
    participant DB as MongoDB
    participant R as Redis Cache
    participant AS as Audit Service

    P->>C: POST /symptoms/collect
    C->>CS: collectAIAgentSymptoms()
    CS->>CS: validateAISymptoms()
    CS->>AIS: getDiagnosisFromAgent()
    AIS->>AIS: Call AI Agent API
    AIS->>R: Cache diagnosis result
    AIS-->>CS: Return AI diagnosis
    CS->>AS: Log audit event
    CS-->>C: Return diagnosis response
    C-->>P: AI diagnosis with recommendations

    P->>C: POST /select-consultation
    C->>CS: selectConsultationType()
    CS->>PS: createPaymentOrder()
    PS->>R: Store payment session
    PS-->>CS: Payment order details
    CS-->>C: Payment information
    C-->>P: Payment URL and details

    P->>C: POST /confirm-payment
    C->>CS: confirmPayment()
    CS->>PS: verifyPayment()
    PS->>R: Get payment status
    PS-->>CS: Payment confirmed
    CS->>DSS: getActiveDoctorForCurrentTime()
    DSS->>R: Check cached doctor
    DSS-->>CS: Assigned doctor ID
    CS->>DB: Create consultation record
    CS->>R: Cache consultation
    CS->>AS: Log consultation creation
    CS-->>C: Consultation created
    C-->>P: Consultation confirmed

    Note over P,AS: Doctor consultation phase (chat/video)

    P->>C: Doctor adds final diagnosis
    C->>CS: updateConsultation()
    CS->>DB: Update consultation record
    CS->>R: Update cached data
    CS->>AS: Log completion
    CS-->>C: Consultation completed
    C-->>P: Final diagnosis and prescription
```

## System Architecture Overview

```mermaid
graph LR
    subgraph "Frontend"
        W[Web App]
        M[Mobile App]
    end

    subgraph "API Gateway"
        AG[NestJS Backend]
    end

    subgraph "Core Services"
        CS[Consultation Service]
        AIS[AI Agent Service]
        PS[Payment Service]
        DSS[Doctor Shift Service]
        ATS[AI Token Service]
    end

    subgraph "External Services"
        AI[AI Agent Microservice]
        PG[Payment Gateway]
    end

    subgraph "Data Layer"
        DB[(MongoDB)]
        R[(Redis Cache)]
    end

    subgraph "Security & Monitoring"
        AS[Audit Service]
        L[Logger]
        M[Metrics]
    end

    W --> AG
    M --> AG
    AG --> CS
    CS --> AIS
    CS --> PS
    CS --> DSS
    CS --> ATS
    AIS --> AI
    PS --> PG
    CS --> DB
    CS --> R
    CS --> AS
    AS --> L
    AS --> M
```

## Current Data Storage Structure

### MongoDB Collections

1. **consultations**
   - Primary consultation records
   - Encrypted medical data
   - Status tracking
   - Payment information
   - Chat history

2. **users**
   - Patient and doctor profiles
   - Authentication data
   - Role assignments

3. **doctor-shifts**
   - Doctor availability schedules
   - Shift assignments
   - Status management

4. **audit-logs**
   - User actions
   - Data access logs
   - System events

### Redis Cache Keys

1. **consultation:**
   - `consultation:patient:{patientId}:{limit}:{offset}` - Patient consultations
   - `consultation:id:{consultationId}` - Individual consultation cache

2. **ai-diagnosis:**
   - `ai-diagnosis:{symptomHash}` - Cached AI diagnosis results

3. **doctor-shift:**
   - `doctor-shift:current-doctor:{hour}` - Active doctor lookup

4. **payment:**
   - `payment:session:{sessionId}` - Payment session data

5. **tokens:**
   - `ai-token:current` - AI service JWT token

## Performance Optimization Points

### Current Optimizations
1. **Database Indexes**: Optimized queries for patient, doctor, and status lookups
2. **Redis Caching**: Frequently accessed data cached with appropriate TTLs
3. **AI Diagnosis Caching**: 1-hour cache for repeated symptom patterns
4. **Doctor Assignment Caching**: 30-minute cache for active doctor lookup
5. **Audit Logging**: Asynchronous logging to prevent blocking operations

### Monitoring Metrics
1. **Response Times**: Track API endpoint performance
2. **AI Service Health**: Monitor AI agent connectivity and response times
3. **Cache Hit Rates**: Monitor cache effectiveness
4. **Database Performance**: Query performance and connection pool usage
5. **Payment Success Rates**: Track payment completion rates

This workflow demonstrates how data flows through the system from initial symptom collection to final consultation completion, with proper caching, security, and audit logging at each step.
