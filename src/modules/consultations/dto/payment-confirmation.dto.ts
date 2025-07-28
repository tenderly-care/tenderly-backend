import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class PaymentConfirmationDto {
  @ApiProperty({
    description: 'Session ID from consultation selection phase',
    example: 'session_6884d739c1ceb202ca8066e8_1753536313472'
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'Payment ID from payment gateway',
    example: 'mock_pay_1753536340355_l88lcvo4n'
  })
  @IsString()
  @IsNotEmpty()
  paymentId: string;

  @ApiProperty({
    description: 'Gateway transaction ID (optional)',
    example: 'txn_1234567890',
    required: false
  })
  @IsString()
  @IsOptional()
  gatewayTransactionId?: string;

  @ApiProperty({
    description: 'Payment method used',
    example: 'card',
    required: false
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiProperty({
    description: 'Additional payment metadata',
    required: false
  })
  @IsObject()
  @IsOptional()
  paymentMetadata?: any;
}

export class PaymentConfirmationResponseDto {
  @ApiProperty({
    description: 'Session ID',
    example: 'session_6884d739c1ceb202ca8066e8_1753536313472'
  })
  sessionId: string;

  @ApiProperty({
    description: 'Payment status',
    example: 'confirmed'
  })
  paymentStatus: 'confirmed' | 'failed';

  @ApiProperty({
    description: 'Payment ID',
    example: 'pay_123'
  })
  paymentId: string;

  @ApiProperty({
    description: 'Clinical session ID for detailed symptom collection',
    example: 'clinical_456'
  })
  clinicalSessionId: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 299
  })
  amount: number;

  @ApiProperty({
    description: 'Payment currency',
    example: 'INR'
  })
  currency: string;

  @ApiProperty({
    description: 'Success message',
    example: 'Payment confirmed. Please proceed to detailed symptom collection.'
  })
  message: string;

  @ApiProperty({
    description: 'Next step information'
  })
  nextStep: {
    endpoint: string;
    clinicalSessionId: string;
  };
}

export class DetailedSymptomCollectionDto {
  @ApiProperty({
    description: 'Clinical session ID from payment confirmation',
    example: 'clinical_456'
  })
  @IsString()
  @IsNotEmpty()
  clinicalSessionId: string;

  @ApiProperty({
    description: 'Patient ID',
    example: '6884d6abc1ceb202ca8066c4'
  })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({
    description: 'Detailed symptom information'
  })
  @IsObject()
  @IsNotEmpty()
  symptoms: any; // Use existing detailed symptom structure

  @ApiProperty({
    description: 'Additional patient concerns or notes',
    required: false
  })
  @IsString()
  @IsOptional()
  additionalNotes?: string;
}

export class DetailedSymptomCollectionResponseDto {
  @ApiProperty({
    description: 'Created consultation ID',
    example: 'consultation_789'
  })
  consultationId: string;

  @ApiProperty({
    description: 'Original session ID',
    example: 'session_123'
  })
  sessionId: string;

  @ApiProperty({
    description: 'Clinical session ID',
    example: 'clinical_456'
  })
  clinicalSessionId: string;

  @ApiProperty({
    description: 'AI diagnosis result'
  })
  aiDiagnosis: any;

  @ApiProperty({
    description: 'Assigned doctor information'
  })
  assignedDoctor: {
    doctorId: string;
    name: string;
    shift: string;
  };

  @ApiProperty({
    description: 'Current consultation status',
    example: 'doctor_review_pending'
  })
  consultationStatus: string;

  @ApiProperty({
    description: 'Success message',
    example: 'Consultation created successfully. Doctor will review shortly.'
  })
  message: string;
}
