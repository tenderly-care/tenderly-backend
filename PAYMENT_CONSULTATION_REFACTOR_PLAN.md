# Payment & Consultation Flow Refactor Plan

## Current Issue
The current flow incorrectly creates consultation records during payment confirmation instead of when actual medical consultation begins.

## Production-Level Solution

### Phase 1: Payment Confirmation (Only Payment Tracking)

#### Endpoint: `POST /consultations/confirm-payment`
**What it should do:**
- ✅ Verify payment with payment gateway
- ✅ Update session status from `payment_pending` → `payment_confirmed`
- ✅ Store payment confirmation details
- ✅ Create clinical session ID for Phase 2
- ❌ **REMOVE**: Consultation record creation
- ❌ **REMOVE**: Doctor assignment

**Response should be:**
```json
{
  "sessionId": "session_123",
  "paymentStatus": "confirmed",
  "paymentId": "pay_123",
  "clinicalSessionId": "clinical_456", 
  "amount": 299,
  "currency": "INR",
  "message": "Payment confirmed. Please proceed to detailed symptom collection.",
  "nextStep": {
    "endpoint": "/consultations/symptoms/collect_detailed_symptoms",
    "clinicalSessionId": "clinical_456"
  }
}
```

### Phase 2: Detailed Symptom Collection (Consultation Creation)

#### Endpoint: `POST /consultations/symptoms/collect_detailed_symptoms`
**What it should do:**
- ✅ Validate that payment is confirmed for this patient
- ✅ Collect comprehensive symptom data
- ✅ Get detailed AI diagnosis
- ✅ **CREATE CONSULTATION RECORD** (moved from payment confirmation)
- ✅ Assign doctor based on current shift
- ✅ Set status to `CLINICAL_ASSESSMENT_COMPLETE` → `DOCTOR_REVIEW_PENDING`

**Response should be:**
```json
{
  "consultationId": "consultation_789",
  "sessionId": "session_123",
  "clinicalSessionId": "clinical_456",
  "aiDiagnosis": {
    "possible_diagnoses": ["UTI", "Bladder infection"],
    "confidence_score": 0.85,
    "treatment_recommendations": {...}
  },
  "assignedDoctor": {
    "doctorId": "doctor_001",
    "name": "Dr. Sarah Ashar",
    "shift": "evening"
  },
  "consultationStatus": "doctor_review_pending",
  "message": "Consultation created successfully. Doctor will review shortly."
}
```

## Implementation Plan

### Step 1: Create New Data Models

```typescript
// Session tracking for payment status
interface PaymentSession {
  sessionId: string;
  patientId: string;
  paymentId: string;
  paymentStatus: 'pending' | 'confirmed' | 'failed';
  paymentDetails: {
    amount: number;
    currency: string;
    paidAt?: Date;
    transactionId?: string;
  };
  consultationType: 'chat' | 'video' | 'emergency';
  preliminaryDiagnosis?: any; // From initial symptom collection
  clinicalSessionId?: string; // For Phase 2
  expiresAt: Date;
}

// Clinical session for detailed symptom collection
interface ClinicalSession {
  clinicalSessionId: string;
  sessionId: string; // Link back to payment session
  patientId: string;
  status: 'awaiting_symptoms' | 'symptoms_collected' | 'consultation_created';
  createdAt: Date;
  expiresAt: Date;
}
```

### Step 2: Refactor Payment Confirmation Service

```typescript
// src/modules/consultations/services/consultation.service.ts

async confirmPayment(
  paymentConfirmationDto: PaymentConfirmationDto,
  patientId: string,
  requestMetadata?: { ipAddress: string; userAgent: string }
): Promise<PaymentConfirmationResponse> {
  try {
    // 1. Verify payment with gateway
    const paymentStatus = await this.paymentService.verifyPayment(paymentConfirmationDto);
    
    if (paymentStatus.status !== 'payment_completed') {
      throw new BadRequestException('Payment not completed');
    }

    // 2. Update session status (NOT create consultation)
    const session = await this.sessionManager.validateSessionPhase(
      paymentConfirmationDto.sessionId,
      'payment_pending',
      patientId
    );

    // 3. Create clinical session for Phase 2
    const clinicalSessionId = await this.sessionManager.createClinicalSession(
      paymentConfirmationDto.sessionId,
      patientId,
      requestMetadata
    );

    // 4. Update session to payment confirmed
    await this.sessionManager.updateSession(
      paymentConfirmationDto.sessionId,
      'payment_confirmed',
      {
        paymentConfirmed: true,
        paymentDetails: paymentStatus,
        clinicalSessionId,
        awaitingDetailedSymptoms: true
      },
      patientId
    );

    // 5. Log audit (payment confirmation only)
    await this.auditService.logDataAccess(
      patientId,
      'payment-confirmation',
      'update',
      paymentConfirmationDto.sessionId,
      undefined,
      { paymentId: paymentStatus.paymentId, amount: paymentStatus.amount },
      requestMetadata
    );

    return {
      sessionId: paymentConfirmationDto.sessionId,
      paymentStatus: 'confirmed',
      paymentId: paymentStatus.paymentId,
      clinicalSessionId,
      amount: paymentStatus.amount,
      currency: paymentStatus.currency,
      message: 'Payment confirmed. Please proceed to detailed symptom collection.',
      nextStep: {
        endpoint: '/consultations/symptoms/collect_detailed_symptoms',
        clinicalSessionId
      }
    };

  } catch (error) {
    this.logger.error(`Payment confirmation failed: ${error.message}`);
    throw error;
  }
}
```

### Step 3: Refactor Detailed Symptom Collection

```typescript
// src/modules/consultations/services/consultation.service.ts

async collectDetailedSymptoms(
  patientId: string,
  detailedSymptomInputDto: DetailedSymptomInputDto,
  requestMetadata?: { ipAddress: string; userAgent: string }
): Promise<DetailedDiagnosisResponseDto> {
  try {
    // 1. Validate that payment is confirmed
    const paymentSession = await this.sessionManager.getPaymentSession(patientId);
    
    if (!paymentSession || paymentSession.paymentStatus !== 'confirmed') {
      throw new BadRequestException('Payment not confirmed. Please complete payment first.');
    }

    // 2. Validate clinical session
    const clinicalSession = await this.sessionManager.getClinicalSession(
      detailedSymptomInputDto.clinicalSessionId,
      patientId
    );

    if (!clinicalSession || clinicalSession.status !== 'awaiting_symptoms') {
      throw new BadRequestException('Invalid clinical session or symptoms already collected');
    }

    // 3. Get detailed AI diagnosis
    const aiDiagnosis = await this.aiAgentService.getDetailedDiagnosis(
      patientId,
      detailedSymptomInputDto,
      requestMetadata
    );

    // 4. **NOW CREATE THE CONSULTATION RECORD** (moved from payment confirmation)
    const consultationPayload = {
      patientId,
      sessionId: paymentSession.sessionId,
      consultationType: paymentSession.consultationType,
      detailedSymptoms: detailedSymptomInputDto,
      aiDiagnosis,
      paymentInfo: paymentSession.paymentDetails,
      metadata: requestMetadata
    };

    const consultation = await this.createConsultation(consultationPayload, requestMetadata);

    // 5. Assign doctor based on current shift
    const doctorId = await this.doctorShiftService.getActiveDoctorForCurrentTime();
    
    await this.consultationModel.findByIdAndUpdate(consultation._id, {
      doctorId,
      status: ConsultationStatus.DOCTOR_REVIEW_PENDING
    });

    // 6. Update clinical session status
    await this.sessionManager.updateClinicalSession(
      detailedSymptomInputDto.clinicalSessionId,
      'consultation_created',
      { consultationId: consultation._id.toString() }
    );

    // 7. Log audit for consultation creation
    await this.auditService.logDataAccess(
      patientId,
      'consultation',
      'create',
      consultation._id.toString(),
      undefined,
      consultation,
      requestMetadata
    );

    return {
      consultationId: consultation._id.toString(),
      sessionId: paymentSession.sessionId,
      clinicalSessionId: detailedSymptomInputDto.clinicalSessionId,
      aiDiagnosis,
      assignedDoctor: await this.getDoctorInfo(doctorId),
      consultationStatus: 'doctor_review_pending',
      message: 'Consultation created successfully. Doctor will review shortly.'
    };

  } catch (error) {
    this.logger.error(`Detailed symptom collection failed: ${error.message}`);
    throw error;
  }
}
```

### Step 4: Update API Flow Documentation

**New Flow:**
1. `POST /consultations/symptoms/collect` → Get initial AI diagnosis + session
2. `POST /consultations/select-consultation` → Select type + create payment
3. `POST /consultations/confirm-payment` → **ONLY confirm payment + create clinical session**
4. `POST /consultations/symptoms/collect_detailed_symptoms` → **CREATE consultation + assign doctor**
5. Doctor consultation begins...

## Benefits of This Approach

1. **Logical Separation**: Payment confirmation only handles payment, medical consultation creation happens when medical data is collected
2. **Better Error Handling**: If detailed symptom collection fails, no orphaned consultation records exist
3. **Clearer Audit Trail**: Separate logs for payment vs medical consultation creation
4. **Production Ready**: Follows standard e-commerce patterns where payment ≠ service delivery
5. **Scalability**: Each phase can be optimized independently
6. **Recovery**: Failed consultations can be retried without payment issues

## Migration Strategy

1. **Phase 1**: Update `confirmPayment` to only handle payment (backward compatible)
2. **Phase 2**: Update `collectDetailedSymptoms` to create consultations
3. **Phase 3**: Update frontend to use new flow
4. **Phase 4**: Remove consultation creation from `confirmPayment`

This approach maintains the logical separation between "patient has paid" and "medical consultation has begun" which is crucial for production healthcare systems.
